import { htmlToText } from '../lib/text.js';
import { SETUP_URL, WEB_ORIGIN, CLIENT, FOLDERS } from './constants.js';

let session = null; // { dsid, mailUrl, email, name, at }

export class AuthError extends Error {}

function qs(extra = {}) {
  return new URLSearchParams({ ...CLIENT, ...extra }).toString();
}

/** Installs a rule so requests carry the Origin/Referer iCloud expects. */
export async function installHeaderRules() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Origin', operation: 'set', value: WEB_ORIGIN },
          { header: 'Referer', operation: 'set', value: WEB_ORIGIN + '/' }
        ]
      },
      condition: {
        requestDomains: ['icloud.com'],
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: ['xmlhttprequest']
      }
    }]
  });
}

export function parseValidate(json) {
  const mailUrl = json?.webservices?.mail?.url || json?.webservices?.mailws?.url;
  const gw = json?.webservices?.mccgateway?.url;
  const dsid = json?.dsInfo?.dsid;
  if (!mailUrl || !dsid) return null;
  const email = json.dsInfo.appleId || json.dsInfo.primaryEmail || '';
  const name = [json.dsInfo.firstName, json.dsInfo.lastName].filter(Boolean).join(' ');
  return { gateway: gw ? gw.replace(/:443$/, '').replace(/\/$/, '') : '', dsid: String(dsid), mailUrl: mailUrl.replace(/:443$/, '').replace(/\/$/, ''), email, name, at: Date.now() };
}

/** Uses the existing icloud.com browser session (cookies). */
export async function getSession(force = false) {
  if (session && !force && Date.now() - session.at < 30 * 60 * 1000) return session;
  const res = await fetch(`${SETUP_URL}?${qs()}`, { method: 'POST', credentials: 'include', body: '{}' });
  if (res.status === 401 || res.status === 421) { session = null; throw new AuthError('not signed in'); }
  if (!res.ok) throw new Error(`validate ${res.status}`);
  const s = parseValidate(await res.json());
  if (!s) { session = null; throw new AuthError('no mail service in session'); }
  return (session = s);
}

export function clearSession() { session = null; }

// Verified 2026-11-27 against the live web app: POST {mccgateway}/mailws2/v1/thread/search
// (application/json). Folder ids are plain IMAP names ("INBOX", "Archive").
export async function gatewayPost(path, body) {
  const s = await getSession();
  if (!s.gateway) throw new Error('mccgateway not available');
  const res = await fetch(`${s.gateway}${path}?${qs({ clientId: clientId(), dsid: s.dsid })}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (res.status === 401 || res.status === 421) { clearSession(); throw new AuthError('session expired'); }
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function clientId() {
  if (!globalThis.__cid) globalThis.__cid = crypto.randomUUID();
  return globalThis.__cid;
}

const SESSION_HEADERS = (folder) => ({ folder, modseq: null, threadmodseq: null, condstore: 1, qresync: 1, threadmode: 1 });

export function parseSender(s) {
  const m = /^s*"?(.*?)"?s*<([^>]*)>s*$/.exec(s || '');
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), address: m[2].trim() } : { name: s || '', address: s || '' };
}

export function normalizeThread(t, folder) {
  const flags = t.flags || [];
  const snd = parseSender((t.senders || [])[0]);
  return {
    uid: String(t.threadId), threadId: String(t.threadId), folder,
    from: snd.name || snd.address, fromAddress: snd.address,
    subject: t.subject || '', preview: t.preview || '',
    date: t.timestamp ? new Date(t.timestamp).toISOString() : null,
    unread: !flags.includes('\\Seen'), starred: flags.includes('\\Flagged'),
    hasAttachments: flags.includes('\\HasAttachment'), count: t.count || 1
  };
}

export async function listMessages(folder = FOLDERS.inbox, count = 30, query = '') {
  const body = {
    responseType: 'THREAD_DIGEST', includeFolderStatus: true, maxResults: count, sessionHeaders: SESSION_HEADERS(folder)
  };
  // Verified 2026-11-27: searchType "anyfield" | "from" | "recipient" | "subject".
  if (query) { body.searchText = query; body.searchType = 'anyfield'; }
  const r = await gatewayPost('/mailws2/v1/thread/search', body);
  return (r.threadList || []).map((t) => normalizeThread(t, folder));
}

/** Very light check: unread count plus the newest thread (id and time). */
export async function quickStatus(folder = FOLDERS.inbox) {
  const r = await gatewayPost('/mailws2/v1/thread/search', {
    responseType: 'THREAD_ID_AND_DATE', includeFolderStatus: true, maxResults: 1, sessionHeaders: SESSION_HEADERS(folder)
  });
  const top = r.threadList?.[0];
  return { unseen: r.folderStatus?.unseenUndeletedMessages ?? 0, topThread: top?.threadId ?? '', topTime: top?.timestamp ?? 0 };
}

export async function unreadCount(folder = FOLDERS.inbox) {
  const r = await gatewayPost('/mailws2/v1/thread/search', {
    responseType: 'THREAD_ID_AND_DATE', includeFolderStatus: true, maxResults: 1, sessionHeaders: SESSION_HEADERS(folder)
  });
  return r.folderStatus?.unseenUndeletedMessages ?? 0;
}

// Verified 2026-11-27 (response shapes, read-only): thread/get -> messageMetadataList[{uid, parts[...]}],
// message/get {uid, parts:[partId], dontMarkAsRead} -> parts[{content}] (already decoded).
// UNTESTED against a real mailbox (taken from the web app bundle): thread/flag and thread/move payloads.
async function loadBody(folder, m) {
  const bodyParts = (m.parts || []).filter((p) => !p.isAttach && /^text\/(html|plain)$/i.test(p.contentType));
  const htmlPart = bodyParts.find((p) => /html/i.test(p.contentType)) || null;
  const chosen = htmlPart || bodyParts[0];
  let content = '';
  if (chosen) {
    try {
      const r = await gatewayPost('/mailws2/v1/message/get', {
        uid: m.uid, parts: [chosen.partId], dontMarkAsRead: true, sessionHeaders: SESSION_HEADERS(folder)
      });
      content = r.parts?.[0]?.content || '';
    } catch (e) {
      if (e instanceof AuthError) throw e;
    }
  }
  const snd = parseSender((m.from || [])[0]);
  return {
    uid: String(m.uid),
    from: snd.name || snd.address, fromAddress: snd.address,
    subject: m.subject || '', date: m.date ? new Date(m.date).toISOString() : null,
    unread: !(m.flags || []).includes('\\Seen'),
    to: m.to || [], cc: m.cc || [], messageId: m.messageId || '',
    html: htmlPart ? content : '', text: htmlPart ? htmlToText(content) : content,
    attachments: (m.parts || []).filter((p) => p.isAttach).map((p) => ({ name: p.name || p.partId, size: p.size, type: p.contentType }))
  };
}

const MAX_THREAD_MESSAGES = 12;

/** Whole conversation: `thread` holds every message (oldest first); top-level fields mirror the latest. */
export async function getMessage(folder, threadId) {
  const t = await gatewayPost('/mailws2/v1/thread/get', { threadId, sessionHeaders: SESSION_HEADERS(folder) });
  const list = (t.messageMetadataList || []).slice(-MAX_THREAD_MESSAGES);
  if (!list.length) throw new Error('empty thread');
  const thread = await Promise.all(list.map((m) => loadBody(folder, m)));
  const last = thread[thread.length - 1];
  return {
    ...last, uid: String(threadId), threadId: String(threadId), folder, thread,
    messages: (t.messageMetadataList || []).length
  };
}

const flagThreads = (folder, threadIds, flag, on) => gatewayPost('/mailws2/v1/thread/flag', {
  method: on ? 'ADD' : 'REMOVE', flags: [flag], threadIds, sessionHeaders: SESSION_HEADERS(folder)
});
export const markRead = (folder, threadIds, read = true) => flagThreads(folder, threadIds, 'SEEN', read);
export const star = (folder, threadIds, on = true) => flagThreads(folder, threadIds, 'FLAGGED', on);
export const moveTo = (folder, threadIds, dest) => gatewayPost('/mailws2/v1/thread/move', {
  moveMethod: 'MOVE', destFolder: dest, threadIds, sessionHeaders: SESSION_HEADERS(folder)
});
export const archive = (folder, threadIds) => moveTo(folder, threadIds, FOLDERS.archive);
export const trash = (folder, threadIds) => gatewayPost('/mailws2/v1/thread/move', {
  moveMethod: 'DELETE', destFolder: FOLDERS.trash, threadIds, sessionHeaders: SESSION_HEADERS(folder)
});

// Body shape taken from the web app bundle (UNTESTED): POST /mailws2/v1/message/send.
export async function sendMessage({ to, subject, body, html = '' }) {
  const s = await getSession();
  const from = s.email;
  if (!from) throw new Error('sender address unknown');
  const r = await gatewayPost('/mailws2/v1/message/send', {
    date: new Date().toUTCString().replace('GMT', '-0000'),
    from, to, subject, textBody: body, htmlBody: html, isHME: false, webmailClientBuild: 'current'
  });
  return { id: r.sentMessageGUID ?? null };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function folderThreadIds(folder, max = 1000) {
  const r = await gatewayPost('/mailws2/v1/thread/search', {
    responseType: 'THREAD_ID_AND_DATE', includeFolderStatus: true, maxResults: max, sessionHeaders: SESSION_HEADERS(folder)
  });
  return { ids: (r.threadList || []).map((t) => t.threadId), total: r.folderStatus?.undeletedThreads ?? (r.threadList || []).length };
}

/**
 * Permanently deletes everything in a folder (used for the Trash). UNTESTED on a real mailbox:
 * first tries the web app's bulk job (POST /bulkaction/v1/action/emptymailbox), and if iCloud
 * rejects the request, falls back to deleting threads in chunks. Always re-counts afterwards and
 * returns how many threads are left, so the caller can report honestly.
 */
export async function emptyFolder(folder = FOLDERS.trash) {
  let used = 'bulk';
  try {
    await gatewayPost('/bulkaction/v1/action/emptymailbox', { sourceMailbox: folder });
  } catch (e) {
    if (e instanceof AuthError) throw e;
    used = 'threads';
    const { ids } = await folderThreadIds(folder);
    for (let i = 0; i < ids.length; i += 100) {
      await gatewayPost('/mailws2/v1/thread/move', {
        moveMethod: 'DELETE', destFolder: folder, threadIds: ids.slice(i, i + 100), sessionHeaders: SESSION_HEADERS(folder)
      });
    }
  }
  let left = -1;
  for (let n = 0; n < 4; n++) {
    await sleep(1200);
    left = (await folderThreadIds(folder, 1)).total;
    if (left === 0) break;
  }
  return { left, used };
}

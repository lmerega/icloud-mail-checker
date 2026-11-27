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

export async function listMessages(folder = FOLDERS.inbox, count = 30) {
  const r = await gatewayPost('/mailws2/v1/thread/search', {
    responseType: 'THREAD_DIGEST', includeFolderStatus: true, maxResults: count, sessionHeaders: SESSION_HEADERS(folder)
  });
  return (r.threadList || []).map((t) => normalizeThread(t, folder));
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
const stripTags = (h) => h
  .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export async function getMessage(folder, threadId) {
  const sh = SESSION_HEADERS(folder);
  const t = await gatewayPost('/mailws2/v1/thread/get', { threadId, sessionHeaders: sh });
  const list = t.messageMetadataList || [];
  const m = list[list.length - 1];
  if (!m) throw new Error('empty thread');
  const bodyParts = (m.parts || []).filter((p) => !p.isAttach && /^text\/(html|plain)$/i.test(p.contentType));
  const html = bodyParts.find((p) => /html/i.test(p.contentType)) || null;
  const chosen = html || bodyParts[0];
  let content = '';
  if (chosen) {
    const r = await gatewayPost('/mailws2/v1/message/get', {
      uid: m.uid, parts: [chosen.partId], dontMarkAsRead: true, sessionHeaders: sh
    });
    content = r.parts?.[0]?.content || '';
  }
  const snd = parseSender((m.from || [])[0]);
  return {
    uid: String(threadId), threadId: String(threadId), folder,
    from: snd.name || snd.address, fromAddress: snd.address,
    subject: m.subject || '', date: m.date ? new Date(m.date).toISOString() : null,
    unread: !(m.flags || []).includes('\\Seen'),
    to: m.to || [], cc: m.cc || [], messageId: m.messageId || '',
    html: html ? content : '', text: html ? stripTags(content) : content,
    attachments: (m.parts || []).filter((p) => p.isAttach).map((p) => ({ name: p.name || p.partId, size: p.size, type: p.contentType })),
    messages: list.length
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

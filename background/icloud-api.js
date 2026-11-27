import { SETUP_URL, WEB_ORIGIN, CLIENT, METHODS, FOLDERS } from './constants.js';

let session = null; // { dsid, mailUrl, email, name, at }

export class AuthError extends Error {}

// Folder ids are sent as "folder:<name>" (confirmed from the web app bundle, 2026-11-27).
const fid = (n) => (n.startsWith("folder:") ? n : "folder:" + n);

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

export const rawRpc = (path, method, params) => rpc({ path, method }, params);

async function rpc(def, params = {}) {
  const s = await getSession();
  const url = `${s.mailUrl}${def.path}?${qs({ dsid: s.dsid, method: def.method })}`;
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: def.method, params })
  });
  if (res.status === 401 || res.status === 421) { clearSession(); throw new AuthError('session expired'); }
  if (!res.ok) throw new Error(`${def.path} ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'rpc error');
  return json.result;
}

export function normalizeMessage(m, folder) {
  const flags = m.flags || [];
  return {
    uid: String(m.uid ?? m.id),
    folder,
    from: m.from?.[0]?.name || m.from?.[0]?.address || m.from || '',
    fromAddress: m.from?.[0]?.address || '',
    subject: m.subject || '',
    preview: m.preview || m.snippet || '',
    date: m.date ? new Date(m.date).toISOString() : null,
    unread: !flags.includes('\\Seen'),
    starred: flags.includes('\\Flagged'),
    hasAttachments: !!(m.attachments?.length || m.hasAttachments)
  };
}

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

export async function getMessage(folder, uid) {
  const m = await rpc(METHODS.getMessage, { guid: fid(folder), uid });
  return {
    ...normalizeMessage(m, folder),
    to: m.to || [],
    cc: m.cc || [],
    html: m.html || '',
    text: m.text || '',
    messageId: m.messageId || '',
    attachments: (m.attachments || []).map((a) => ({ name: a.name, size: a.size, url: a.url, type: a.type })),
    calendar: m.calendar || null
  };
}

export const markRead = (folder, uids, read = true) =>
  rpc(METHODS.flag, { guid: fid(folder), uids, flag: '\\Seen', set: read });
export const star = (folder, uids, on = true) =>
  rpc(METHODS.flag, { guid: fid(folder), uids, flag: '\\Flagged', set: on });
export const moveTo = (folder, uids, dest) =>
  rpc(METHODS.move, { guid: fid(folder), uids, destGuid: fid(dest) });
export const archive = (folder, uids) => moveTo(folder, uids, FOLDERS.archive);
export const trash = (folder, uids) => moveTo(folder, uids, FOLDERS.trash);
export const remove = (folder, uids) => rpc(METHODS.remove, { folder: fid(folder), uids, rollbackslot: null });

export function sendMessage({ to, cc = [], subject, body, inReplyTo = '', attachments = [] }) {
  return rpc(METHODS.send, { to, cc, subject, textBody: body, inReplyTo, attachments });
}

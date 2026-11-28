// Zoho Mail client: OAuth 2.0 with the user's own API Console client + official REST API.
// Tokens, Client ID and Client Secret live only in chrome.storage.local and are sent only to Zoho.
// Same exported surface as the former iCloud client, so popup and poller did not change.
import { htmlToText, decodeEntities } from '../lib/text.js';
import { REGIONS, ACCOUNTS_HOST, SCOPES, FOLDERS } from './constants.js';

export class AuthError extends Error {}

const ARCHIVE_NAME = 'Archive';

/* ---------- OAuth ---------- */

export const redirectUrl = () => chrome.identity.getRedirectURL('zoho');
const mailBaseOf = (accountsServer) => accountsServer.replace('https://accounts.', 'https://mail.');

function randomState() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty error body */ }
  return { res, data };
}

/** Interactive sign-in with the Zoho consent page; stores the refresh token locally. */
export async function signIn() {
  const { credentials: c } = await chrome.storage.local.get('credentials');
  if (!c?.clientId || !c?.clientSecret) throw new Error('missing-credentials');
  const region = REGIONS[c.region] || REGIONS.eu;
  const state = randomState();
  const auth = new URL(`${region.accounts}/oauth/v2/auth`);
  auth.search = new URLSearchParams({
    scope: SCOPES, client_id: c.clientId, response_type: 'code', access_type: 'offline',
    prompt: 'consent', redirect_uri: redirectUrl(), state
  }).toString();

  const back = new URL(await chrome.identity.launchWebAuthFlow({ url: auth.toString(), interactive: true }));
  const p = back.searchParams;
  if (p.get('state') !== state) throw new Error('OAuth state mismatch');
  if (p.get('error')) throw new AuthError(`Zoho: ${p.get('error')}`);
  if (!p.get('code')) throw new Error('No authorization code from Zoho');

  // Multi data center: Zoho says where the account lives.
  let accountsServer = p.get('accounts-server') || region.accounts;
  if (!ACCOUNTS_HOST.test(accountsServer)) accountsServer = region.accounts;

  const { data } = await postForm(`${accountsServer}/oauth/v2/token`, {
    grant_type: 'authorization_code', code: p.get('code'), client_id: c.clientId,
    client_secret: c.clientSecret, redirect_uri: redirectUrl()
  });
  if (!data.access_token || !data.refresh_token) throw new AuthError(`Zoho token: ${data.error || 'no refresh token'}`);

  clearSession();
  await chrome.storage.local.remove(['account', 'sig', 'seen', 'primed', 'state']);
  await chrome.storage.local.set({
    auth: {
      accountsServer, mailBase: mailBaseOf(accountsServer), refreshToken: data.refresh_token,
      accessToken: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000
    }
  });
  return getSession(true);
}

/** Revokes the refresh token on Zoho (best effort) and forgets the account locally. */
export async function signOut() {
  const { auth } = await chrome.storage.local.get('auth');
  if (auth?.refreshToken) {
    try {
      await fetch(`${auth.accountsServer}/oauth/v2/token/revoke?${new URLSearchParams({ token: auth.refreshToken })}`, { method: 'POST' });
    } catch { /* offline: still sign out locally */ }
  }
  clearSession();
  await chrome.storage.local.remove(['auth', 'account', 'sig', 'seen', 'primed', 'state']);
}

let refreshing = null;
async function refreshToken() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const { auth, credentials: c } = await chrome.storage.local.get(['auth', 'credentials']);
    if (!auth?.refreshToken || !c) throw new AuthError('not signed in');
    const { res, data } = await postForm(`${auth.accountsServer}/oauth/v2/token`, {
      grant_type: 'refresh_token', refresh_token: auth.refreshToken, client_id: c.clientId, client_secret: c.clientSecret
    });
    if (!data.access_token) {
      // invalid_code / invalid_client: token revoked or client deleted, a new sign-in is needed.
      if (data.error || res.status === 400 || res.status === 401) throw new AuthError(`Zoho: ${data.error || res.status}`);
      throw new Error(`token refresh ${res.status}`);
    }
    const next = { ...auth, accessToken: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    await chrome.storage.local.set({ auth: next });
    return next;
  })();
  try { return await refreshing; } finally { refreshing = null; }
}

async function validAuth() {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.refreshToken) throw new AuthError('not signed in');
  return auth.accessToken && auth.expiresAt - Date.now() > 60_000 ? auth : refreshToken();
}

/* ---------- REST ---------- */

async function request(method, path, { query, body } = {}) {
  let auth = await validAuth();
  for (let attempt = 0; ; attempt++) {
    const url = new URL(`${auth.mailBase}/api${path}`);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const res = await fetch(url.toString(), {
      method,
      headers: { Authorization: `Zoho-oauthtoken ${auth.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 && attempt === 0) { auth = await refreshToken(); continue; }
    if (res.status === 401) throw new AuthError('Zoho rejected the access token');
    let json = {};
    try { json = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new Error(`${path} ${res.status}${json?.status?.description ? `: ${json.status.description}` : ''}`);
    return json.data;
  }
}

/* ---------- account and folders ---------- */

let session = null; // { accountId, email, name, mailBase, folders: {role: folderId}, at }

export function clearSession() { session = null; }

function folderRoles(list) {
  const byType = (t) => list.find((f) => f.folderType === t);
  const byName = (re) => list.find((f) => re.test(f.folderName || ''));
  const id = (f) => (f ? String(f.folderId) : null);
  return {
    [FOLDERS.inbox]: id(byType('Inbox') || byName(/^inbox$/i)),
    [FOLDERS.sent]: id(byType('Sent') || byName(/^sent$/i)),
    [FOLDERS.trash]: id(byType('Trash') || byName(/^trash$/i)),
    [FOLDERS.archive]: id(byType('Archive') || byName(/^archiv/i))
  };
}

/** Account, mail host and folder ids. Cached for 30 minutes. */
export async function getSession(force = false) {
  if (session && !force && Date.now() - session.at < 30 * 60 * 1000) return session;
  const auth = await validAuth();
  let { account } = await chrome.storage.local.get('account');
  if (!account) {
    const accounts = await request('GET', '/accounts');
    const a = (accounts || []).find((x) => x.isDefaultAccount) || (accounts || [])[0];
    if (!a) throw new AuthError('no Zoho Mail account');
    account = {
      accountId: String(a.accountId),
      email: a.primaryEmailAddress || a.mailboxAddress || a.incomingUserName || '',
      name: a.displayName || a.accountDisplayName || ''
    };
    await chrome.storage.local.set({ account });
  }
  const folders = await request('GET', `/accounts/${account.accountId}/folders`);
  return (session = { ...account, mailBase: auth.mailBase, folderList: folders || [], folders: folderRoles(folders || []), at: Date.now() });
}

async function folderId(role) {
  const s = await getSession();
  if (/^\d+$/.test(role)) return role;
  return s.folders[role] || null;
}

async function ensureArchiveFolder() {
  const s = await getSession();
  if (s.folders[FOLDERS.archive]) return s.folders[FOLDERS.archive];
  const created = await request('POST', `/accounts/${s.accountId}/folders`, { body: { folderName: ARCHIVE_NAME } });
  clearSession();
  return String(created?.folderId || (await getSession()).folders[FOLDERS.archive]);
}

/* ---------- messages ---------- */

// The popup only knows an opaque uid; it carries the folder so actions work from search results too.
const makeUid = (fid, mid) => `${fid}:${mid}`;
export function splitUid(uid) {
  const [fid, mid] = String(uid).split(':');
  return { fid, mid };
}

export function parseSender(name, address) {
  const n = decodeEntities(String(name || '')).trim();
  const a = decodeEntities(String(address || '')).replace(/^.*<([^>]+)>.*$/, '$1').trim();
  return { name: n && n !== a ? n : '', address: a };
}

export function normalizeMessage(m, folder) {
  const snd = parseSender(m.sender, m.fromAddress);
  const fid = String(m.folderId);
  return {
    uid: makeUid(fid, m.messageId), threadId: String(m.threadId || m.messageId), folder, folderId: fid,
    from: snd.name || snd.address, fromAddress: snd.address,
    subject: decodeEntities(m.subject || ''), preview: decodeEntities(m.summary || '').trim(),
    date: m.receivedTime ? new Date(Number(m.receivedTime)).toISOString() : null,
    unread: String(m.status) === '0',
    starred: !!m.flagid && m.flagid !== 'flag_not_set',
    hasAttachments: String(m.hasAttachment) === '1', count: Number(m.threadCount) || 1
  };
}

export async function listMessages(folder = FOLDERS.inbox, count = 30, query = '') {
  const s = await getSession();
  if (query) {
    const r = await request('GET', `/accounts/${s.accountId}/messages/search`, {
      query: { searchKey: `entire:${query}`, limit: count, includeto: true }
    });
    return (r || []).map((m) => normalizeMessage(m, folder));
  }
  const fid = await folderId(folder);
  if (!fid) return [];
  const r = await request('GET', `/accounts/${s.accountId}/messages/view`, {
    query: { folderId: fid, limit: count, sortorder: false }
  });
  return (r || []).map((m) => normalizeMessage(m, folder));
}

/** Very light check: unread count of the folder plus the newest message (id and time). */
export async function quickStatus(folder = FOLDERS.inbox) {
  const s = await getSession(true);
  const fid = await folderId(folder);
  const f = s.folderList.find((x) => String(x.folderId) === fid);
  const top = (await request('GET', `/accounts/${s.accountId}/messages/view`, { query: { folderId: fid, limit: 1, sortorder: false } }) || [])[0];
  return { unseen: Number(f?.unreadCount) || 0, topThread: top ? String(top.messageId) : '', topTime: Number(top?.receivedTime) || 0 };
}

export async function unreadCount(folder = FOLDERS.inbox) {
  return (await quickStatus(folder)).unseen;
}

const addrList = (v) => decodeEntities(String(v || '')).split(',').map((x) => x.trim()).filter(Boolean);

/** One message, shaped like a one-message conversation (the popup renders `thread`). */
export async function getMessage(folder, uid) {
  const s = await getSession();
  const { fid, mid } = splitUid(uid);
  const base = `/accounts/${s.accountId}/folders/${fid}/messages/${mid}`;
  const [details, content, att] = await Promise.all([
    request('GET', `${base}/details`),
    request('GET', `${base}/content`, { query: { includeBlockContent: true } }),
    request('GET', `${base}/attachmentinfo`).catch(() => null)
  ]);
  const html = content?.content || '';
  const snd = parseSender(details?.sender, details?.fromAddress);
  const msg = {
    uid: String(uid), folder, folderId: fid,
    from: snd.name || snd.address, fromAddress: snd.address,
    subject: decodeEntities(details?.subject || ''),
    date: details?.receivedTime ? new Date(Number(details.receivedTime)).toISOString() : null,
    unread: String(details?.status) === '0',
    to: addrList(details?.toAddress), cc: addrList(details?.ccAddress), messageId: String(mid),
    html, text: htmlToText(html),
    attachments: (att?.attachments || []).map((a) => ({ name: a.attachmentName, size: Number(a.attachmentSize) || 0, type: '' }))
  };
  return { ...msg, threadId: String(details?.threadId || mid), thread: [msg], messages: 1 };
}

const messageIds = (uids) => uids.map((u) => splitUid(u).mid);

async function update(body) {
  const s = await getSession();
  return request('PUT', `/accounts/${s.accountId}/updatemessage`, { body });
}

export const markRead = (_folder, uids, read = true) => update({ mode: read ? 'markAsRead' : 'markAsUnread', messageId: messageIds(uids) });
export const star = (_folder, uids, on = true) => update({ mode: 'setFlag', flagid: on ? 'important' : 'flag_not_set', messageId: messageIds(uids) });
export const moveTo = (_folder, uids, destfolderId) => update({ mode: 'moveMessage', destfolderId, messageId: messageIds(uids) });
export const archive = async (folder, uids) => moveTo(folder, uids, await ensureArchiveFolder());

/** Moves to Trash (Zoho deletes permanently only messages already in Trash). */
export async function trash(_folder, uids) {
  const s = await getSession();
  for (const u of uids) {
    const { fid, mid } = splitUid(u);
    await request('DELETE', `/accounts/${s.accountId}/folders/${fid}/messages/${mid}`);
  }
}

export async function sendMessage({ to, subject, body, html = '' }) {
  const s = await getSession();
  if (!s.email) throw new Error('sender address unknown');
  const r = await request('POST', `/accounts/${s.accountId}/messages`, {
    body: {
      fromAddress: s.email, toAddress: [].concat(to).join(','), subject: subject || '',
      content: html || body || '', mailFormat: html ? 'html' : 'plaintext'
    }
  });
  return { id: r?.messageId ?? null };
}

/** Permanently empties a folder (the Trash) and reports how many messages are left. */
export async function emptyFolder(folder = FOLDERS.trash) {
  const s = await getSession();
  const fid = await folderId(folder);
  if (!fid) throw new Error('folder not found');
  await request('PUT', `/accounts/${s.accountId}/folders/${fid}`, { body: { mode: 'emptyFolder' } });
  const leftList = await request('GET', `/accounts/${s.accountId}/messages/view`, { query: { folderId: fid, limit: 200 } });
  return { left: (leftList || []).length, used: 'emptyFolder' };
}

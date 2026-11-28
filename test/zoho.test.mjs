// End-to-end run of service_worker.js against a fake chrome API and a fake Zoho server.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = { local: {}, sync: {} };
const listeners = {};
const on = (name) => ({ addListener: (fn) => { (listeners[name] ||= []).push(fn); } });
const badge = { text: '' };
const notifications = [];
const calls = [];
const zoho = {
  token: 'AT1', reject: null, refreshError: null, inboxUnread: 1, archiveExists: false,
  inbox: [{ messageId: '101', folderId: '9', sender: 'Mario', fromAddress: 'mario@x.invalid', subject: 'Ciao', summary: 'Il tuo codice è 482915', receivedTime: '1795880000000', status: '0', flagid: 'flag_not_set', threadId: '101' }]
};

const area = (name) => ({
  get: async (keys) => {
    const s = store[name];
    const list = keys == null ? Object.keys(s) : [].concat(keys);
    const out = {};
    for (const k of list) if (k in s) out[k] = structuredClone(s[k]);
    return out;
  },
  set: async (o) => { Object.assign(store[name], structuredClone(o)); },
  remove: async (keys) => { for (const k of [].concat(keys)) delete store[name][k]; }
});

globalThis.chrome = {
  runtime: {
    id: 'ext', onInstalled: on('installed'), onStartup: on('startup'), onMessage: on('message'),
    getURL: (p) => `chrome-extension://ext/${p}`, openOptionsPage: () => {}, getContexts: async () => [{}], sendMessage: async () => {}
  },
  storage: { local: area('local'), sync: area('sync'), onChanged: on('changed') },
  alarms: { create: async () => {}, onAlarm: on('alarm') },
  commands: { onCommand: on('command') },
  notifications: { create: async (id, o) => { notifications.push({ id, ...o }); }, onClicked: on('notif') },
  action: { setBadgeText: async ({ text }) => { badge.text = text; }, setBadgeBackgroundColor: async () => {} },
  tabs: { query: async () => [], create: async () => {}, update: async () => {} },
  windows: { update: async () => {} },
  i18n: { getMessage: (k) => k },
  identity: {
    getRedirectURL: (p) => `https://chcbjlpfjoelgihmhdcbnfehgbfopcfe.chromiumapp.org/${p}`,
    launchWebAuthFlow: async ({ url }) => {
      const u = new URL(url);
      assert.equal(u.origin, 'https://accounts.zoho.eu');
      assert.match(u.searchParams.get('scope'), /ZohoMail\.messages\.ALL/);
      return `https://chcbjlpfjoelgihmhdcbnfehgbfopcfe.chromiumapp.org/zoho?code=C1&state=${u.searchParams.get('state')}&location=eu&accounts-server=https%3A%2F%2Faccounts.zoho.eu`;
    }
  }
};

const json = (status, data) => ({ status, ok: status < 300, json: async () => ({ status: { code: status }, data }) });

globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url);
  const method = o.method || 'GET';
  calls.push(`${method} ${u.pathname}`);
  if (u.pathname === '/oauth/v2/token') {
    const p = new URLSearchParams(o.body);
    assert.equal(p.get('client_secret'), 'SEC');
    if (p.get('grant_type') === 'authorization_code') return { status: 200, ok: true, json: async () => ({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600 }) };
    if (zoho.refreshError) return { status: 200, ok: true, json: async () => ({ error: zoho.refreshError }) };
    zoho.token = 'AT2';
    return { status: 200, ok: true, json: async () => ({ access_token: 'AT2', expires_in: 3600 }) };
  }
  if (u.pathname === '/oauth/v2/token/revoke') return { status: 200, ok: true, json: async () => ({}) };
  assert.equal(u.origin, 'https://mail.zoho.eu');
  if (o.headers.Authorization === `Zoho-oauthtoken ${zoho.reject}`) return json(401, {});
  const body = o.body ? JSON.parse(o.body) : null;
  const p = u.pathname;
  if (p === '/api/accounts') return json(200, [{ accountId: '7', primaryEmailAddress: 'luca@x.invalid', isDefaultAccount: true }]);
  if (p === '/api/accounts/7/folders' && method === 'GET') {
    const f = [
      { folderId: '9', folderName: 'Inbox', folderType: 'Inbox', unreadCount: zoho.inboxUnread },
      { folderId: '10', folderName: 'Sent', folderType: 'Sent', unreadCount: 0 },
      { folderId: '11', folderName: 'Trash', folderType: 'Trash', unreadCount: 0 }
    ];
    if (zoho.archiveExists) f.push({ folderId: '12', folderName: 'Archive', folderType: 'Normal', unreadCount: 0 });
    return json(200, f);
  }
  if (p === '/api/accounts/7/folders' && method === 'POST') { assert.equal(body.folderName, 'Archive'); zoho.archiveExists = true; return json(200, { folderId: '12' }); }
  if (p === '/api/accounts/7/messages/view') {
    const fid = u.searchParams.get('folderId');
    return json(200, fid === '9' ? zoho.inbox.slice(0, Number(u.searchParams.get('limit'))) : []);
  }
  if (p === '/api/accounts/7/messages/search') { assert.equal(u.searchParams.get('searchKey'), 'entire:ciao'); return json(200, zoho.inbox); }
  if (p === '/api/accounts/7/folders/9/messages/101/details') return json(200, { ...zoho.inbox[0], toAddress: '&lt;luca@x.invalid&gt;' });
  if (p === '/api/accounts/7/folders/9/messages/101/content') return json(200, { content: '<p>Il tuo codice è <b>482915</b></p>' });
  if (p === '/api/accounts/7/folders/9/messages/101/attachmentinfo') return json(200, { attachments: [{ attachmentName: 'a.pdf', attachmentSize: '2048' }] });
  if (p === '/api/accounts/7/updatemessage') { zoho.lastUpdate = body; return json(200, {}); }
  if (p === '/api/accounts/7/folders/9/messages/101' && method === 'DELETE') return json(200, {});
  if (p === '/api/accounts/7/messages' && method === 'POST') { zoho.sent = body; return json(200, { messageId: '555' }); }
  if (p === '/api/accounts/7/folders/11' && method === 'PUT') { assert.equal(body.mode, 'emptyFolder'); return json(200, {}); }
  throw new Error(`unexpected ${method} ${url}`);
};

await import('../service_worker.js');

function send(msg, sender = { id: 'ext' }) {
  return new Promise((resolve) => { if (!listeners.message[0](msg, sender, resolve)) resolve(undefined); });
}

test('full flow against a fake Zoho', async () => {
  assert.equal(await send({ action: 'poll' }, { id: 'other' }), undefined, 'foreign senders ignored');

  let r = await send({ action: 'connect' });
  assert.equal(r.ok, false, 'needs credentials first');
  assert.match(r.error, /missing-credentials/);

  store.local.credentials = { clientId: 'CID', clientSecret: 'SEC', region: 'eu' };
  r = await send({ action: 'connect' });
  assert.deepEqual(r, { ok: true, result: { email: 'luca@x.invalid' } });
  assert.equal(store.local.state.signedIn, true);
  assert.equal(badge.text, '1');
  assert.equal(notifications.length, 0, 'no notification for mail already there');

  // New mail -> notification with the verification code
  zoho.inbox.unshift({ ...zoho.inbox[0], messageId: '102', receivedTime: '1795880100000' });
  zoho.inboxUnread = 2;
  await send({ action: 'poll' });
  assert.equal(badge.text, '2');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].message, 'codeLabel: 482915');
  zoho.inbox.shift();
  zoho.inboxUnread = 1;

  r = await send({ action: 'list', folder: 'inbox' });
  assert.equal(r.result[0].uid, '9:101');
  assert.equal(r.result[0].unread, true);
  assert.equal((await send({ action: 'list', folder: 'inbox', q: 'ciao' })).result.length, 1);
  assert.deepEqual((await send({ action: 'list', folder: 'archive' })).result, []);

  r = await send({ action: 'get', folder: 'inbox', uid: '9:101' });
  assert.equal(r.result.code, '482915');
  assert.equal(r.result.thread.length, 1);
  assert.deepEqual(r.result.to, ['<luca@x.invalid>']);
  assert.equal(r.result.attachments[0].size, 2048);

  await send({ action: 'read', folder: 'inbox', uids: ['9:101'], read: true });
  assert.deepEqual(zoho.lastUpdate, { mode: 'markAsRead', messageId: ['101'] });
  await send({ action: 'star', folder: 'inbox', uids: ['9:101'], on: true });
  assert.equal(zoho.lastUpdate.flagid, 'important');
  r = await send({ action: 'archive', folder: 'inbox', uids: ['9:101'] });
  assert.equal(r.ok, true);
  assert.deepEqual(zoho.lastUpdate, { mode: 'moveMessage', destfolderId: '12', messageId: ['101'] });
  assert.equal((await send({ action: 'trash', folder: 'inbox', uids: ['9:101'] })).ok, true);

  await send({ action: 'send', to: ['a@x.invalid', 'b@x.invalid'], subject: 'Re: Ciao', body: 'ok', html: '<div>ok</div>' });
  assert.deepEqual(zoho.sent, { fromAddress: 'luca@x.invalid', toAddress: 'a@x.invalid,b@x.invalid', subject: 'Re: Ciao', content: '<div>ok</div>', mailFormat: 'html' });

  assert.deepEqual((await send({ action: 'emptyTrash' })).result, { left: 0, used: 'emptyFolder' });

  // Expired access token: refreshed and retried transparently
  zoho.reject = 'AT1';
  r = await send({ action: 'list', folder: 'inbox' });
  assert.equal(r.ok, true);
  assert.equal(store.local.auth.accessToken, 'AT2');

  // Revoked on Zoho: auth error, badge "!"
  zoho.reject = 'AT2';
  zoho.refreshError = 'invalid_code';
  r = await send({ action: 'list', folder: 'inbox' });
  assert.equal(r.ok, false);
  assert.equal(r.auth, true);
  assert.equal(badge.text, '!');

  calls.length = 0;
  assert.equal((await send({ action: 'disconnect' })).ok, true);
  assert.ok(calls.includes('POST /oauth/v2/token/revoke'));
  assert.equal(store.local.auth, undefined);
  assert.ok(store.local.credentials, 'credentials kept for reconnecting');
});

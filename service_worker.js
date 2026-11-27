import * as api from './background/icloud-api.js';
import { ALARM, poll, scheduleAlarm } from './background/poller.js';
import { findVerificationCode } from './lib/codes.js';

const MAIL_URL = 'https://www.icloud.com/mail/';

async function init() {
  await api.installHeaderRules();
  await scheduleAlarm();
  await poll();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) poll(); });
chrome.notifications.onClicked.addListener(() => chrome.tabs.create({ url: MAIL_URL }));
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'sync' && c.settings) scheduleAlarm();
});

const shape = (x, d = 0) => x === null ? 'null' : Array.isArray(x) ? ['arr' + x.length, x.length && d < 3 ? shape(x[0], d + 1) : 0] : typeof x === 'object' ? Object.fromEntries(Object.entries(x).slice(0, 30).map(([k, y]) => [k, d < 3 ? shape(y, d + 1) : typeof y])) : typeof x;

const actions = {
  // Diagnostics: reports only the SHAPE of responses (keys/types), never mail content.
  async diag() {
    const out = {};
    try { const s = await api.getSession(true); out.session = { mail: s.mailUrl.replace(/p\d+/, 'pNN'), hasDsid: !!s.dsid }; }
    catch (e) { return { session: 'FAIL ' + e.message }; }
    for (const [name, fn] of [['list', async () => (await api.listMessages('INBOX', 2)).map(({ unread, folder, hasAttachments, count }) => ({ unread, folder, hasAttachments, count }))],['unread', () => api.unreadCount('INBOX')],
      ['sent', () => api.listMessages('Sent Messages', 1)], ['trash', () => api.listMessages('Deleted Messages', 1)]]) {
      try { out[name] = shape(await fn()); } catch (e) { out[name] = 'FAIL ' + e.message; }
    }
    return out;
  },
  poll: () => poll(),
  signIn: () => chrome.tabs.create({ url: 'https://www.icloud.com/' }),
  openWeb: () => chrome.tabs.create({ url: MAIL_URL }),
  list: ({ folder }) => api.listMessages(folder),
  async get({ folder, uid }) {
    const m = await api.getMessage(folder, uid);
    m.code = findVerificationCode(`${m.subject} ${m.text}`);
    return m;
  },
  read: ({ folder, uids, read }) => api.markRead(folder, uids, read),
  star: ({ folder, uids, on }) => api.star(folder, uids, on),
  archive: ({ folder, uids }) => api.archive(folder, uids),
  trash: ({ folder, uids }) => api.trash(folder, uids),
};

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  const fn = actions[msg?.action];
  if (!fn) return false;
  Promise.resolve(fn(msg))
    .then(async (r) => { if (msg.action !== 'poll') await poll(); send({ ok: true, result: r }); })
    .catch((e) => send({ ok: false, error: String(e.message || e), auth: e instanceof api.AuthError }));
  return true;
});

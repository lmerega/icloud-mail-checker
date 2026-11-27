import * as api from './background/icloud-api.js';
import { ALARM, poll, scheduleAlarm, playDing } from './background/poller.js';
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

const actions = {
  // Connection check for the options page: plain pass/fail per step, never mail content.
  async diag() {
    const out = {};
    try {
      const s = await api.getSession(true);
      out.session = { ok: true, detail: s.email || '' };
    } catch (e) {
      out.session = { ok: false, detail: String(e.message || e) };
      return out;
    }
    try {
      const q = await api.quickStatus('INBOX');
      out.inbox = { ok: true, detail: String(q.unseen) };
    } catch (e) { out.inbox = { ok: false, detail: String(e.message || e) }; }
    try {
      await Promise.all(['Archive', 'Sent Messages', 'Deleted Messages'].map((f) => api.listMessages(f, 1)));
      out.folders = { ok: true };
    } catch (e) { out.folders = { ok: false, detail: String(e.message || e) }; }
    return out;
  },
  testSound: () => playDing().then(() => ({ played: true })),
  emptyTrash: () => api.emptyFolder('Deleted Messages'),
  poll: () => poll(true),
  signIn: () => chrome.tabs.create({ url: 'https://www.icloud.com/' }),
  openWeb: () => chrome.tabs.create({ url: MAIL_URL }),
  list: ({ folder, q }) => api.listMessages(folder, 30, q),
  send: ({ to, subject, body, html }) => api.sendMessage({ to, subject, body, html }),
  async get({ folder, uid }) {
    const m = await api.getMessage(folder, uid);
    m.code = findVerificationCode(`${m.subject} ${m.text}`);
    for (const x of m.thread) x.code = findVerificationCode(`${x.subject} ${x.text}`);
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

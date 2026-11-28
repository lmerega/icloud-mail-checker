import * as api from './background/zoho-api.js';
import { ALARM, poll, scheduleAlarm, playDing } from './background/poller.js';
import { FOLDERS, MAIL_HOST } from './background/constants.js';
import { findVerificationCode } from './lib/codes.js';

async function mailUrl() {
  const { auth } = await chrome.storage.local.get('auth');
  return `${auth?.mailBase || 'https://mail.zoho.eu'}/zm/`;
}

// Reuse a Zoho Mail tab if one is already open, otherwise open a new one.
async function openMail() {
  const url = await mailUrl();
  const tabs = (await chrome.tabs.query({})).filter((t) => t.url && MAIL_HOST.test(t.url));
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}
chrome.commands.onCommand.addListener((c) => { if (c === 'open-mail') openMail(); });

async function init() {
  await scheduleAlarm();
  await poll();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) poll(); });
chrome.notifications.onClicked.addListener(() => openMail());
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
      const q = await api.quickStatus(FOLDERS.inbox);
      out.inbox = { ok: true, detail: String(q.unseen) };
    } catch (e) { out.inbox = { ok: false, detail: String(e.message || e) }; }
    try {
      await Promise.all([FOLDERS.sent, FOLDERS.trash].map((f) => api.listMessages(f, 1)));
      out.folders = { ok: true };
    } catch (e) { out.folders = { ok: false, detail: String(e.message || e) }; }
    return out;
  },
  testSound: ({ sound }) => playDing(sound).then(() => ({ played: true })),
  emptyTrash: () => api.emptyFolder(FOLDERS.trash),
  poll: () => poll(true),
  // Sign-in needs the Client ID/Secret, so it lives in the options page.
  signIn: () => chrome.runtime.openOptionsPage(),
  connect: () => api.signIn().then((s) => ({ email: s.email })),
  disconnect: () => api.signOut(),
  redirectUrl: () => api.redirectUrl(),
  openWeb: () => openMail(),
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

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (sender.id !== chrome.runtime.id) return false;
  const fn = actions[msg?.action];
  if (!fn) return false;
  Promise.resolve(fn(msg))
    .then(async (r) => {
      if (!['poll', 'redirectUrl', 'testSound'].includes(msg.action)) await poll();
      send({ ok: true, result: r });
    })
    .catch(async (e) => {
      // Refresh badge/state right away when the account is no longer usable.
      if (msg.action === 'connect' || e instanceof api.AuthError) await poll();
      send({ ok: false, error: String(e.message || e), auth: e instanceof api.AuthError });
    });
  return true;
});

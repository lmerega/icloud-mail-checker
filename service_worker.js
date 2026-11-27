import * as api from './background/icloud-api.js';
import { ALARM, poll, scheduleAlarm } from './background/poller.js';
import { findVerificationCode } from './lib/codes.js';
import { parseInvitation, buildReply } from './lib/ics.js';

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
  poll: () => poll(),
  signIn: () => chrome.tabs.create({ url: 'https://www.icloud.com/' }),
  openWeb: () => chrome.tabs.create({ url: MAIL_URL }),
  list: ({ folder }) => api.listMessages(folder),
  async get({ folder, uid }) {
    const m = await api.getMessage(folder, uid);
    m.code = findVerificationCode(`${m.subject} ${m.text}`);
    if (m.calendar) m.invitation = parseInvitation(m.calendar);
    return m;
  },
  read: ({ folder, uids, read }) => api.markRead(folder, uids, read),
  star: ({ folder, uids, on }) => api.star(folder, uids, on),
  archive: ({ folder, uids }) => api.archive(folder, uids),
  trash: ({ folder, uids }) => api.trash(folder, uids),
  move: ({ folder, uids, dest }) => api.moveTo(folder, uids, dest),
  send: (p) => api.sendMessage(p),
  async rsvp({ invitation, partstat, attendee, to }) {
    const ics = buildReply(invitation, partstat, attendee);
    return api.sendMessage({ to: [to], subject: `Re: ${invitation.summary}`, body: '', attachments: [{ name: 'reply.ics', type: 'text/calendar; method=REPLY', content: ics }] });
  }
};

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  const fn = actions[msg?.action];
  if (!fn) return false;
  Promise.resolve(fn(msg))
    .then(async (r) => { if (msg.action !== 'poll') await poll(); send({ ok: true, result: r }); })
    .catch((e) => send({ ok: false, error: String(e.message || e), auth: e instanceof api.AuthError }));
  return true;
});

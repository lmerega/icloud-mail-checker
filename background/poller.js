import { listMessages, quickStatus, getSession, AuthError } from './icloud-api.js';
import { DEFAULTS, FOLDERS } from './constants.js';
import { findVerificationCode } from '../lib/codes.js';

export const ALARM = 'icloud-poll';

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULTS, ...(settings || {}) };
}

export async function scheduleAlarm() {
  const s = await getSettings();
  // Chrome allows alarms down to 30 seconds.
  await chrome.alarms.create(ALARM, { periodInMinutes: Math.max(0.5, Number(s.pollMinutes) || DEFAULTS.pollMinutes) });
}

async function setBadge(unread, signedIn) {
  const s = await getSettings();
  const text = !signedIn ? '!' : s.badge && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: signedIn ? '#7c3aed' : '#8a8a8a' });
}

/**
 * One check. iCloud does not push to extensions (and extensions cannot open IMAP sockets), so we
 * poll with a very light request (unread count + newest thread) and only fetch the list when that
 * changed. `force` skips the shortcut (manual refresh).
 */
export async function poll(force = false) {
  try {
    const sess = await getSession();
    const q = await quickStatus(FOLDERS.inbox);
    const sig = `${q.unseen}|${q.topThread}|${q.topTime}`;
    const { sig: prev, state: prevState } = await chrome.storage.local.get(['sig', 'state']);
    if (!force && prev === sig && prevState?.signedIn) {
      await chrome.storage.local.set({ state: { ...prevState, checkedAt: Date.now() } });
      await setBadge(q.unseen, true);
      return;
    }
    const msgs = await listMessages(FOLDERS.inbox, 30);
    const unread = msgs.filter((m) => m.unread);
    const { seen = [] } = await chrome.storage.local.get('seen');
    const fresh = unread.filter((m) => !seen.includes(m.uid));
    const settings = await getSettings();
    if (settings.notifications && seen.length) {
      for (const m of fresh.slice(0, 5)) {
        const code = findVerificationCode(`${m.subject} ${m.preview}`);
        await chrome.notifications.create(`m-${m.uid}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
          title: m.from || chrome.i18n.getMessage('newMail'),
          message: code ? `${chrome.i18n.getMessage('codeLabel')}: ${code}` : m.subject
        });
      }
    }
    await chrome.storage.local.set({
      sig,
      seen: unread.map((m) => m.uid).slice(0, 200),
      state: { signedIn: true, email: sess.email, unread: q.unseen, checkedAt: Date.now() }
    });
    await setBadge(q.unseen, true);
  } catch (e) {
    const signedIn = !(e instanceof AuthError) && (await chrome.storage.local.get('state')).state?.signedIn;
    await chrome.storage.local.set({ state: { signedIn: !!signedIn, error: String(e.message || e), unread: 0 } });
    await setBadge(0, !!signedIn);
  }
}

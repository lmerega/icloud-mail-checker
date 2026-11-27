import { listMessages, unreadCount, getSession, AuthError } from './icloud-api.js';
import { DEFAULTS, FOLDERS } from './constants.js';
import { findVerificationCode } from '../lib/codes.js';

export const ALARM = 'icloud-poll';

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULTS, ...(settings || {}) };
}

export async function scheduleAlarm() {
  const s = await getSettings();
  await chrome.alarms.create(ALARM, { periodInMinutes: Math.max(1, Number(s.pollMinutes) || 2) });
}

async function setBadge(unread, signedIn) {
  const s = await getSettings();
  const text = !signedIn ? '!' : s.badge && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: signedIn ? '#2f80ed' : '#8a8a8a' });
}

export async function poll() {
  try {
    const sess = await getSession();
    const msgs = await listMessages(FOLDERS.inbox, 30);
    const unread = msgs.filter((m) => m.unread);
    const total = await unreadCount(FOLDERS.inbox);
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
      seen: unread.map((m) => m.uid).slice(0, 200),
      state: { signedIn: true, email: sess.email, unread: total, checkedAt: Date.now() }
    });
    await setBadge(total, true);
  } catch (e) {
    const signedIn = !(e instanceof AuthError) && (await chrome.storage.local.get('state')).state?.signedIn;
    await chrome.storage.local.set({ state: { signedIn: !!signedIn, error: String(e.message || e), unread: 0 } });
    await setBadge(0, !!signedIn);
  }
}

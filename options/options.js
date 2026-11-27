const $ = (id) => document.getElementById(id);
const t = (k) => chrome.i18n.getMessage(k) || k;
const DEFAULTS = { pollMinutes: 2, notifications: true, badge: true };

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
$('h').textContent = t('appName');

async function load() {
  const { settings } = await chrome.storage.sync.get('settings');
  const s = { ...DEFAULTS, ...(settings || {}) };
  $('poll').value = s.pollMinutes;
  $('notif').checked = s.notifications;
  $('badge').checked = s.badge;
}

async function save() {
  const pollMinutes = Math.min(60, Math.max(1, Number($('poll').value) || 2));
  await chrome.storage.sync.set({
    settings: { pollMinutes, notifications: $('notif').checked, badge: $('badge').checked }
  });
  $('msg').textContent = t('saved');
}

for (const id of ['poll', 'notif', 'badge']) $(id).addEventListener('change', save);

// Export/import: preferences only, never cookies or message data.
$('export').onclick = async () => {
  const { settings } = await chrome.storage.sync.get('settings');
  const blob = new Blob([JSON.stringify({ app: 'icloud-mail-checker', settings: { ...DEFAULTS, ...(settings || {}) } }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'icloud-mail-checker-settings.json'; a.click();
  URL.revokeObjectURL(a.href);
};
$('import').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  try {
    const j = JSON.parse(await e.target.files[0].text());
    if (j.app !== 'icloud-mail-checker') throw new Error('format');
    const s = j.settings || {};
    await chrome.storage.sync.set({ settings: {
      pollMinutes: Math.min(60, Math.max(1, Number(s.pollMinutes) || 2)),
      notifications: !!s.notifications, badge: !!s.badge
    } });
    await load(); $('msg').textContent = t('saved');
  } catch { $('msg').textContent = t('importError'); }
};

load();

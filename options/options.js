const $ = (id) => document.getElementById(id);
const t = (k) => chrome.i18n.getMessage(k) || k;
const DEFAULTS = { pollMinutes: 1, notifications: true, badge: true, theme: 'auto' };
const THEMES = ['auto', 'light', 'dark'];
const applyTheme = (th) => { if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme; };
const INTERVALS = [0.5, 1, 2, 5, 10, 15, 30];
const label = (m) => (m < 1 ? t('secs30') : `${m} min`);

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
$('h').textContent = t('appName');
$('poll').replaceChildren(...INTERVALS.map((m) => { const o = document.createElement('option'); o.value = m; o.textContent = label(m); return o; }));

let flash;
function saved() {
  $('msg').textContent = t('saved');
  clearTimeout(flash);
  flash = setTimeout(() => { $('msg').textContent = ''; }, 1800);
}

const nearest = (v) => INTERVALS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), INTERVALS[0]);

async function load() {
  const { settings } = await chrome.storage.sync.get('settings');
  const s = { ...DEFAULTS, ...(settings || {}) };
  $('poll').value = String(nearest(Number(s.pollMinutes) || DEFAULTS.pollMinutes));
  $('notif').checked = !!s.notifications;
  $('badge').checked = !!s.badge;
  $('theme').value = THEMES.includes(s.theme) ? s.theme : 'auto';
  applyTheme($('theme').value);
}

async function save() {
  await chrome.storage.sync.set({
    settings: { pollMinutes: Number($('poll').value), notifications: $('notif').checked, badge: $('badge').checked, theme: $('theme').value }
  });
  saved();
}
for (const id of ['poll', 'notif', 'badge', 'theme']) $(id).addEventListener('change', save);
$('theme').addEventListener('change', () => applyTheme($('theme').value));

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
      pollMinutes: nearest(Number(s.pollMinutes) || DEFAULTS.pollMinutes), notifications: !!s.notifications, badge: !!s.badge, theme: THEMES.includes(s.theme) ? s.theme : 'auto'
    } });
    await load(); saved();
  } catch { $('msg').textContent = t('importError'); }
};

// Connection check: plain-language results instead of raw diagnostics.
const STEPS = [['session', 'connSession'], ['inbox', 'connInbox'], ['folders', 'connFolders']];
$('diag').onclick = async () => {
  const out = $('diagOut');
  out.replaceChildren();
  const r = await chrome.runtime.sendMessage({ action: 'diag' });
  const res = r.ok ? r.result : { session: { ok: false, detail: r.error } };
  for (const [key, msg] of STEPS) {
    if (!res[key]) continue;
    const li = document.createElement('li');
    const mark = document.createElement('span');
    mark.className = res[key].ok ? 'ok' : 'bad';
    mark.textContent = res[key].ok ? '✓' : '✕';
    const text = document.createElement('div');
    text.textContent = t(msg);
    if (res[key].detail) { const s = document.createElement('small'); s.textContent = res[key].detail; text.append(s); }
    li.append(mark, text);
    out.append(li);
  }
};

load();

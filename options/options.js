import { REGIONS } from '../background/constants.js';
import { initI18n, paintI18n, t, LANGS } from '../lib/i18n.js';

await initI18n();

const $ = (id) => document.getElementById(id);
const DEFAULTS = { pollMinutes: 1, notifications: true, badge: true, sound: true, soundId: 'ding', theme: 'auto', lang: 'auto' };
const THEMES = ['auto', 'light', 'dark'];
const SOUND_IDS = ['ding', 'chime', 'bell', 'pop', 'marimba', 'alert'];
const SOUND_NAME = { ding: 'sndDing', chime: 'sndChime', bell: 'sndBell', pop: 'sndPop', marimba: 'sndMarimba', alert: 'sndAlert' };
const applyTheme = (th) => { if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme; };
const INTERVALS = [0.5, 1, 2, 5, 10, 15, 30];
const label = (m) => (m < 1 ? t('secs30') : `${m} min`);

paintI18n();
$('h').textContent = t('appName');
$('poll').replaceChildren(...INTERVALS.map((m) => { const o = document.createElement('option'); o.value = m; o.textContent = label(m); return o; }));

const picker = $('sounds');
for (const id of SOUND_IDS) {
  const row = document.createElement('div');
  row.className = 'snd';
  const lab = document.createElement('label');
  const radio = document.createElement('input');
  radio.type = 'radio'; radio.name = 'snd'; radio.value = id;
  const name = document.createElement('span');
  name.textContent = t(SOUND_NAME[id]);
  lab.append(radio, name);
  const play = document.createElement('button');
  play.className = 'btn';
  play.textContent = '▶';
  play.title = t('testSound');
  play.onclick = async () => {
    $('soundMsg').textContent = '…';
    const r = await chrome.runtime.sendMessage({ action: 'testSound', sound: id });
    $('soundMsg').textContent = r.ok ? t('soundPlayed') : `${t('soundFailed')}: ${r.error}`;
  };
  radio.addEventListener('change', save);
  row.append(lab, play);
  picker.append(row);
}
const chosenSound = () => (document.querySelector('input[name=snd]:checked') || {}).value || 'ding';
const paintSounds = (id) => {
  for (const r of picker.querySelectorAll('input')) { r.checked = r.value === id; r.closest('.snd').classList.toggle('on', r.checked); }
};

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
  $('sound').checked = !!s.sound;
  paintSounds(SOUND_IDS.includes(s.soundId) ? s.soundId : 'ding');
  $('theme').value = THEMES.includes(s.theme) ? s.theme : 'auto';
  applyTheme($('theme').value);
  $('lang').value = LANGS.includes(s.lang) ? s.lang : 'auto';
}

async function save() {
  await chrome.storage.sync.set({
    settings: { pollMinutes: Number($('poll').value), notifications: $('notif').checked, badge: $('badge').checked, sound: $('sound').checked, soundId: chosenSound(), theme: $('theme').value, lang: $('lang').value }
  });
  paintSounds(chosenSound());
  saved();
}
for (const id of ['poll', 'notif', 'badge', 'sound', 'theme']) $(id).addEventListener('change', save);
// A new language repaints every text: simplest is to reload the page.
$('lang').addEventListener('change', async () => { await save(); location.reload(); });
$('theme').addEventListener('change', () => applyTheme($('theme').value));

// Export/import: preferences only, never credentials, tokens or message data.
$('export').onclick = async () => {
  const { settings } = await chrome.storage.sync.get('settings');
  const blob = new Blob([JSON.stringify({ app: 'zoho-mail-checker', settings: { ...DEFAULTS, ...(settings || {}) } }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'zoho-mail-checker-settings.json'; a.click();
  URL.revokeObjectURL(a.href);
};
$('import').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  try {
    const j = JSON.parse(await e.target.files[0].text());
    if (j.app !== 'zoho-mail-checker') throw new Error('format');
    const s = j.settings || {};
    await chrome.storage.sync.set({ settings: {
      pollMinutes: nearest(Number(s.pollMinutes) || DEFAULTS.pollMinutes), notifications: !!s.notifications, badge: !!s.badge, sound: s.sound !== false, soundId: SOUND_IDS.includes(s.soundId) ? s.soundId : 'ding', theme: THEMES.includes(s.theme) ? s.theme : 'auto', lang: LANGS.includes(s.lang) ? s.lang : 'auto'
    } });
    location.reload();
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


// Zoho account: the user's own API Console client (Client ID/Secret stay in this browser).
async function fillCredentials() {
  const { credentials: c = {} } = await chrome.storage.local.get('credentials');
  $('clientId').value = c.clientId || '';
  $('clientSecret').value = c.clientSecret || '';
  $('region').value = c.region || 'eu';
}

async function paintAccount() {
  const { state, auth } = await chrome.storage.local.get(['state', 'auth']);
  const on = !!auth;
  $('acctState').textContent = on ? `${t('connectedAs')} ${state?.email || '…'}` : t('notConnected');
  $('connect').textContent = t(on ? 'reconnect' : 'connect');
  $('disconnect').hidden = !on;
}

// Step-by-step guide; links follow the data center chosen below.
const consoleUrl = () => (REGIONS[$('region').value] || REGIONS.eu).console;
const mailUrl = () => (REGIONS[$('region').value] || REGIONS.eu).accounts.replace('https://accounts.', 'https://mail.');
function link(href, text) {
  const a = document.createElement('a');
  a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text;
  return a;
}
// Message texts use {link} / {code} placeholders, filled with real elements (no innerHTML).
function richText(key, parts) {
  const frag = document.createDocumentFragment();
  for (const piece of t(key).split(/(\{\w+\})/)) {
    const m = /^\{(\w+)\}$/.exec(piece);
    frag.append(m && parts[m[1]] ? parts[m[1]]() : piece);
  }
  return frag;
}
function code(text) { const c = document.createElement('code'); c.textContent = text; return c; }
function paintGuide() {
  const steps = [
    ['guide1', { link: () => link(consoleUrl(), consoleUrl().replace('https://', '')) }],
    ['guide2', {}],
    ['guide3', { home: () => code(mailUrl()) }],
    ['guide4', { uri: () => code($('redirect').value || '…') }],
    ['guide5', {}],
    ['guide6', {}]
  ];
  $('guide').replaceChildren(...steps.map(([k, parts]) => { const li = document.createElement('li'); li.append(richText(k, parts)); return li; }));
  $('consoleBtn').href = consoleUrl();
}

$('region').replaceChildren(...Object.entries(REGIONS).map(([k, r]) => { const o = document.createElement('option'); o.value = k; o.textContent = r.label; return o; }));
chrome.runtime.sendMessage({ action: 'redirectUrl' }).then((r) => { if (r?.ok) $('redirect').value = r.result; paintGuide(); });
$('region').addEventListener('change', paintGuide);
$('copyRedirect').onclick = () => navigator.clipboard.writeText($('redirect').value);

const acctMsg = (text, bad = false) => { $('acctMsg').textContent = text; $('acctMsg').classList.toggle('bad', bad); };

$('connect').onclick = async () => {
  const credentials = { clientId: $('clientId').value.trim(), clientSecret: $('clientSecret').value.trim(), region: $('region').value };
  if (!credentials.clientId || !credentials.clientSecret) { acctMsg(t('missingCredentials'), true); return; }
  await chrome.storage.local.set({ credentials });
  $('connect').disabled = true;
  acctMsg(t('waitingZoho'));
  const r = await chrome.runtime.sendMessage({ action: 'connect' });
  $('connect').disabled = false;
  if (r.ok) acctMsg(`${t('connectedAs')} ${r.result.email}`);
  else acctMsg(`${t('connectFailed')}: ${r.error}`, true);
  paintAccount();
};
$('disconnect').onclick = async () => {
  await chrome.runtime.sendMessage({ action: 'disconnect' });
  acctMsg(t('disconnected'));
  paintAccount();
};
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.state || ch.auth)) paintAccount(); });

load();
fillCredentials().then(paintGuide);
paintAccount();

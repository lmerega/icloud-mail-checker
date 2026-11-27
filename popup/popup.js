import { icon, paintIcons } from './icons.js';

const $ = (id) => document.getElementById(id);
const t = (k) => chrome.i18n.getMessage(k) || k;
const call = (m) => chrome.runtime.sendMessage(m);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const VIEWS = ['v-main', 'v-detail', 'v-composer'];
const PALETTE = ['#e8710a', '#1a73e8', '#188038', '#a142f4', '#d93025', '#129eaf', '#b06000', '#5f6368', '#c2185b'];
let folder = 'INBOX';
let current = null;
let query = '';
let searchTimer = null;

if (new URLSearchParams(location.search).has('tab')) document.body.classList.add('tab');
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
paintIcons();
$('title').textContent = t('appShortName');

function show(view) {
  for (const id of VIEWS) $(id).hidden = id !== view;
  $('menu').hidden = true;
}

function avatar(name, el = document.createElement('div')) {
  const s = (name || '?').trim();
  el.className = 'avatar';
  el.textContent = (s.match(/[\p{L}\p{N}]/u) || ['?'])[0];
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  el.style.background = PALETTE[h % PALETTE.length];
  return el;
}

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};

/* ---------- main: account header + mail cards ---------- */
async function home() {
  show('v-main');
  const { state } = await chrome.storage.local.get('state');
  const signedIn = !!state?.signedIn && !!state?.email;
  $('signin').hidden = signedIn;
  $('account').hidden = !signedIn;
  if (!signedIn) return;
  avatar(state.email, $('acc-avatar'));
  $('acc-email').textContent = state.email;
  $('acc-sub').textContent = `${state.unread || 0} ${t('unreadLabel')}`;
  await load();
}

function actionBtn(name, title, fn) {
  const b = document.createElement('button');
  b.className = 'icon sm';
  b.title = title;
  b.append(icon(name, 20));
  b.onclick = async (e) => { e.stopPropagation(); await fn(); };
  return b;
}

const rowCall = (m, action, extra = {}) => call({ action, folder: m.folder, uids: [m.uid], ...extra });

function row(m) {
  const d = document.createElement('div');
  d.className = 'mail' + (m.unread ? ' unread' : '');
  const content = document.createElement('div');
  content.className = 'mail-content';
  const l1 = document.createElement('div'); l1.className = 'line1';
  const s = document.createElement('div'); s.className = 'sender'; s.textContent = m.from;
  if (m.count > 1) { const c = document.createElement('span'); c.className = 'count'; c.textContent = m.count; s.append(c); }
  const dt = document.createElement('div'); dt.className = 'date'; dt.textContent = when(m.date);
  l1.append(s, dt);
  const sub = document.createElement('div'); sub.className = 'subject'; sub.textContent = m.subject;
  const sn = document.createElement('div'); sn.className = 'snippet'; sn.textContent = m.preview;
  content.append(l1, sub, sn);

  const acts = document.createElement('div'); acts.className = 'actions';
  acts.append(
    actionBtn(m.unread ? 'read' : 'mail', t(m.unread ? 'markRead' : 'markUnread'), async () => {
      const r = await rowCall(m, 'read', { read: !!m.unread });
      if (r.ok) load();
    }),
    actionBtn('archive', t('archive'), async () => { if ((await rowCall(m, 'archive')).ok) load(); }),
    actionBtn('trash', t('trash'), async () => { if ((await rowCall(m, 'trash')).ok) load(); })
  );
  d.append(avatar(m.from), content, acts);
  d.onclick = () => open(m);
  return d;
}

async function load() {
  const list = $('list');
  const r = await call({ action: 'list', folder, q: query });
  if (!r.ok) {
    if (r.auth) { $('account').hidden = true; $('signin').hidden = false; return; }
    list.textContent = r.error;
    return;
  }
  if (!r.result.length) {
    const e = document.createElement('div'); e.className = 'empty';
    e.textContent = query ? t('noResults') : t('empty');
    list.replaceChildren(e);
    return;
  }
  list.replaceChildren(...r.result.map(row));
}

/* ---------- message ---------- */
const CSP = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\">";
// The reading pane is always light: emails that ship dark-mode rules (white text) would
// otherwise turn invisible on the white pane, so those rules are disabled.
const BASE = '<meta name="color-scheme" content="light"><base target="_blank"><style>html{color-scheme:light;background:#fff;color:#202124}body{font:14px Roboto,Arial,sans-serif;margin:12px;word-wrap:break-word}</style>';
const lightOnly = (html) => html.replace(/prefers-color-schemes*:s*dark/gi, 'prefers-color-scheme: x-disabled');

function paintFlags() {
  $('act-read').replaceChildren(icon(current.unread ? 'read' : 'mail', 22));
  $('act-read').title = current.unread ? t('markRead') : t('markUnread');
  $('act-star').replaceChildren(icon(current.starred ? 'star' : 'starBorder', 22));
}

async function open(m) {
  current = m;
  $('d-subject').textContent = m.subject;
  $('d-sender').textContent = m.from;
  $('d-addr').textContent = m.fromAddress ? `<${m.fromAddress}>` : '';
  $('d-date').textContent = m.date ? new Date(m.date).toLocaleString() : '';
  $('d-body').srcdoc = `${CSP}${BASE}<pre style="white-space:pre-wrap">${esc(m.preview)}</pre>`;
  $('d-code').hidden = true;
  $('d-err').textContent = '';
  $('d-att').replaceChildren();
  paintFlags();
  show('v-detail');
  const r = await call({ action: 'get', folder: m.folder, uid: m.uid });
  if (current !== m) return;
  if (!r.ok) { $('d-err').textContent = r.error; return; }
  const full = r.result;
  current = { ...m, ...full, preview: m.preview, starred: m.starred };
  $('d-body').srcdoc = full.html
    ? `${CSP}${BASE}${lightOnly(full.html)}`
    : `${CSP}${BASE}<pre style="white-space:pre-wrap">${esc(full.text)}</pre>`;
  if (full.code) {
    const box = $('d-code');
    box.hidden = false;
    box.textContent = `${t('codeLabel')}: ${full.code}`;
    const c = document.createElement('button'); c.textContent = t('copy');
    c.onclick = () => navigator.clipboard.writeText(full.code);
    box.append(c);
  }
  $('d-att').replaceChildren(...full.attachments.map((a) => {
    const li = document.createElement('li');
    li.textContent = `${a.name} (${Math.round((a.size || 0) / 1024)} KB)`;
    return li;
  }));
}

const act = (name, extra = {}, after = home) => async () => {
  const r = await call({ action: name, folder: current.folder, uids: [current.uid], ...extra });
  if (r.ok) after(); else $('d-err').textContent = r.error;
};
$('act-read').onclick = () => act('read', { read: !!current.unread }, () => { current.unread = !current.unread; paintFlags(); })();
$('act-star').onclick = () => act('star', { on: !current.starred }, () => { current.starred = !current.starred; paintFlags(); })();
$('act-archive').onclick = act('archive');
$('act-trash').onclick = act('trash');

/* ---------- composer ---------- */
function compose(reply) {
  $('c-to').value = reply ? reply.fromAddress : '';
  $('c-subject').value = reply ? (/^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`) : '';
  $('c-body').value = reply && reply.text ? `\n\n> ${reply.text.split('\n').join('\n> ')}` : '';
  $('c-status').textContent = '';
  show('v-composer');
  (reply ? $('c-body') : $('c-to')).focus();
}

$('c-send').onclick = async () => {
  const to = $('c-to').value.split(/[,;\s]+/).filter(Boolean);
  if (!to.length) { $('c-status').textContent = t('to'); return; }
  $('c-send').disabled = true;
  const r = await call({ action: 'send', to, subject: $('c-subject').value, body: $('c-body').value });
  $('c-send').disabled = false;
  if (r.ok) { $('c-status').textContent = t('sentOk'); setTimeout(home, 800); }
  else $('c-status').textContent = r.error;
};

/* ---------- wiring ---------- */
$('refresh').onclick = async () => { await call({ action: 'poll' }); home(); };
$('newtab').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?tab=1') });
$('menu-top').onclick = (e) => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; };
document.addEventListener('click', () => { $('menu').hidden = true; });
$('m-web').onclick = () => call({ action: 'openWeb' });
$('m-options').onclick = () => chrome.runtime.openOptionsPage();
$('signinBtn').onclick = () => call({ action: 'signIn' });
$('open-web').onclick = () => call({ action: 'openWeb' });
$('acc-compose').onclick = () => compose(null);
$('act-reply').onclick = () => compose(current);
$('d-back').onclick = home;
$('c-back').onclick = home;

$('acc-search').onclick = () => {
  const on = $('q').hidden;
  $('q').hidden = !on;
  document.querySelector('.acc-main').hidden = on;
  if (on) $('q').focus();
  else { $('q').value = ''; query = ''; load(); }
};
$('q').oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { query = $('q').value.trim(); load(); }, 400);
};

for (const b of document.querySelectorAll('#tabs button')) {
  b.onclick = () => {
    for (const x of document.querySelectorAll('#tabs button')) x.classList.remove('on');
    b.classList.add('on'); folder = b.dataset.folder; load();
  };
}

home();

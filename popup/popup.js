const $ = (id) => document.getElementById(id);
const t = (k) => chrome.i18n.getMessage(k) || k;
const call = (m) => chrome.runtime.sendMessage(m);

let folder = 'INBOX';
let current = null;

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
$('title').textContent = t('appShortName');

function show(view) {
  for (const id of ['list', 'detail', 'composer', 'signin']) $(id).hidden = id !== view;
  $('tabs').hidden = view !== 'list';
}

function row(m) {
  const d = document.createElement('div');
  d.className = 'row' + (m.unread ? ' unread' : '');
  const f = document.createElement('div'); f.className = 'f';
  const a = document.createElement('span'); a.textContent = m.from;
  const b = document.createElement('span'); b.textContent = m.date ? new Date(m.date).toLocaleString() : '';
  f.append(a, b);
  const s = document.createElement('div'); s.className = 's'; s.textContent = m.subject;
  const p = document.createElement('div'); p.className = 'p'; p.textContent = m.preview;
  d.append(f, s, p);
  d.onclick = () => open(m);
  return d;
}

async function load() {
  show('list');
  $('list').textContent = '…';
  const r = await call({ action: 'list', folder });
  if (!r.ok) {
    if (r.auth) return show('signin');
    $('list').textContent = r.error;
    return;
  }
  $('list').replaceChildren(...r.result.map(row));
  if (!r.result.length) $('list').textContent = t('empty');
  const { state } = await chrome.storage.local.get('state');
  $('who').textContent = state?.email || '';
}

const CSP = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\">";
const BASE = '<base target="_blank"><style>body{font:13px sans-serif;margin:8px;word-wrap:break-word}</style>';

async function open(m) {
  current = m;
  $('d-subject').textContent = m.subject;
  $('d-meta').textContent = `${m.from} <${m.fromAddress}> · ${m.date ? new Date(m.date).toLocaleString() : ''}`;
  $('d-body').srcdoc = `<pre style="font:13px sans-serif">${esc(m.preview)}</pre>`;
  $('d-code').hidden = true;
  $('d-att').replaceChildren();
  $('act-read').textContent = m.unread ? t('markRead') : t('markUnread');
  show('detail');
  const r = await call({ action: 'get', folder: m.folder, uid: m.uid });
  if (current !== m || !r.ok) { if (!r.ok) $('d-meta').textContent += ` — ${r.error}`; return; }
  const full = r.result;
  $('d-body').srcdoc = full.html
    ? `${CSP}${BASE}${full.html}`
    : `${CSP}${BASE}<pre style="white-space:pre-wrap;font:13px sans-serif">${esc(full.text)}</pre>`;
  if (full.code) {
    const box = $('d-code');
    box.hidden = false;
    box.textContent = `${t('codeLabel')}: ${full.code} `;
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

const act = (name, extra = {}) => async () => {
  const r = await call({ action: name, folder: current.folder, uids: [current.uid], ...extra });
  if (r.ok) load(); else $('d-meta').textContent = r.error;
};

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
$('back').onclick = load;
$('refresh').onclick = load;
$('settings').onclick = () => chrome.runtime.openOptionsPage();
$('signinBtn').onclick = () => call({ action: 'signIn' });
$('act-read').onclick = () => act('read', { read: !!current.unread })();
$('act-star').onclick = () => act('star', { on: !current.starred })();
$('act-archive').onclick = act('archive');
$('act-trash').onclick = act('trash');
$('open-web').onclick = () => call({ action: 'openWeb' });

for (const b of document.querySelectorAll('#tabs button')) {
  b.onclick = () => {
    for (const x of document.querySelectorAll('#tabs button')) x.classList.remove('on');
    b.classList.add('on'); folder = b.dataset.folder; load();
  };
}

load();

const $ = (id) => document.getElementById(id);
const t = (k) => chrome.i18n.getMessage(k) || k;
const call = (m) => chrome.runtime.sendMessage(m);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const VIEWS = ['v-accounts', 'v-mailbox', 'v-detail', 'v-composer'];
let folder = 'INBOX';
let current = null;
let query = '';
let searchTimer = null;

if (new URLSearchParams(location.search).has('tab')) document.body.classList.add('tab');
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
$('title').textContent = t('appShortName');

function show(view) {
  for (const id of VIEWS) $(id).hidden = id !== view;
  $('menu').hidden = true;
}

/* ---------- accounts home ---------- */
async function home() {
  show('v-accounts');
  const { state } = await chrome.storage.local.get('state');
  const signedIn = !!state?.signedIn && !!state?.email;
  $('signin').hidden = signedIn;
  $('account').hidden = !signedIn;
  if (!signedIn) return;
  $('acc-email').textContent = state.email;
  const n = state.unread || 0;
  $('acc-badge').hidden = n === 0;
  $('acc-badge').textContent = n > 99 ? '99+' : String(n);
  $('acc-sub').textContent = `${n} ${t('unreadLabel')}`;
}

async function refresh() {
  await call({ action: 'poll' });
  if (!$('v-accounts').hidden) await home(); else if (!$('v-mailbox').hidden) await load();
}

/* ---------- mailbox ---------- */
function row(m) {
  const d = document.createElement('div');
  d.className = 'row' + (m.unread ? ' unread' : '');
  const f = document.createElement('div'); f.className = 'f';
  const a = document.createElement('span'); a.textContent = m.from;
  const b = document.createElement('span'); b.textContent = m.date ? new Date(m.date).toLocaleDateString() : '';
  f.append(a, b);
  const s = document.createElement('div'); s.className = 's'; s.textContent = m.subject;
  const p = document.createElement('div'); p.className = 'p'; p.textContent = m.preview;
  d.append(f, s, p);
  d.onclick = () => open(m);
  return d;
}

async function load() {
  show('v-mailbox');
  const list = $('list');
  list.textContent = '…';
  const r = await call({ action: 'list', folder, q: query });
  if (!r.ok) {
    if (r.auth) return home();
    list.textContent = r.error;
    return;
  }
  if (!r.result.length) {
    list.replaceChildren();
    const e = document.createElement('div'); e.className = 'empty';
    e.textContent = query ? t('noResults') : t('empty');
    list.append(e);
    return;
  }
  list.replaceChildren(...r.result.map(row));
}

/* ---------- message ---------- */
const CSP = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\">";
const BASE = '<base target="_blank"><style>body{font:13px sans-serif;margin:8px;word-wrap:break-word}</style>';

function paintFlags() {
  $('act-read').textContent = current.unread ? '✓' : '✉';
  $('act-read').title = current.unread ? t('markRead') : t('markUnread');
  $('act-star').textContent = current.starred ? '★' : '☆';
}

async function open(m) {
  current = m;
  $('d-subject').textContent = m.subject;
  $('d-meta').textContent = `${m.from} <${m.fromAddress}> · ${m.date ? new Date(m.date).toLocaleString() : ''}`;
  $('d-body').srcdoc = `${CSP}${BASE}<pre style="white-space:pre-wrap">${esc(m.preview)}</pre>`;
  $('d-code').hidden = true;
  $('d-att').replaceChildren();
  paintFlags();
  show('v-detail');
  const r = await call({ action: 'get', folder: m.folder, uid: m.uid });
  if (current !== m) return;
  if (!r.ok) { $('d-meta').textContent += ` — ${r.error}`; return; }
  const full = r.result;
  current = { ...m, ...full, preview: m.preview, starred: m.starred };
  $('d-body').srcdoc = full.html
    ? `${CSP}${BASE}${full.html}`
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

const act = (name, extra = {}, after = load) => async () => {
  const r = await call({ action: name, folder: current.folder, uids: [current.uid], ...extra });
  if (r.ok) after(); else $('d-meta').textContent = r.error;
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
$('refresh').onclick = refresh;
$('newtab').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?tab=1') });
$('menu-top').onclick = (e) => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; };
$('acc-menu').onclick = $('menu-top').onclick;
document.addEventListener('click', () => { $('menu').hidden = true; });
$('m-web').onclick = () => call({ action: 'openWeb' });
$('m-options').onclick = () => chrome.runtime.openOptionsPage();
$('signinBtn').onclick = () => call({ action: 'signIn' });
$('open-web').onclick = () => call({ action: 'openWeb' });

$('acc-open').onclick = () => { query = ''; $('q').value = ''; load(); };
$('acc-search').onclick = async () => { query = ''; $('q').value = ''; await load(); $('q').focus(); };
$('acc-compose').onclick = () => compose(null);
$('mb-compose').onclick = () => compose(null);
$('act-reply').onclick = () => compose(current);
$('mb-back').onclick = home;
$('d-back').onclick = load;
$('c-back').onclick = home;

$('q').oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { query = $('q').value.trim(); load(); $('q').focus(); }, 400);
};

for (const b of document.querySelectorAll('#tabs button')) {
  b.onclick = () => {
    for (const x of document.querySelectorAll('#tabs button')) x.classList.remove('on');
    b.classList.add('on'); folder = b.dataset.folder; load();
  };
}

home();

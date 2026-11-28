import { icon, paintIcons } from './icons.js';
import { quoteForReply } from '../lib/text.js';
import { renderMail, buildReplyHtml, sanitizeHtml } from '../lib/sanitize.js';
import { initI18n, paintI18n, t } from '../lib/i18n.js';

await initI18n();

const $ = (id) => document.getElementById(id);
const call = (m) => chrome.runtime.sendMessage(m);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const VIEWS = ['v-main', 'v-detail', 'v-composer'];
const PALETTE = ['#e8710a', '#1a73e8', '#188038', '#a142f4', '#d93025', '#129eaf', '#b06000', '#5f6368', '#c2185b'];
let folder = 'inbox';
let current = null;
let listItems = []; // messages of the list the user is browsing
let listPos = -1;
let query = '';
let searchTimer = null;

const applyTheme = (th) => { if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme; };
chrome.storage.sync.get('settings').then(({ settings }) => applyTheme(settings?.theme));
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync' && ch.settings) applyTheme(ch.settings.newValue?.theme); });

if (new URLSearchParams(location.search).has('tab')) document.body.classList.add('tab');
paintI18n();
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
  $('acc-email').textContent = (state.unread || 0) > 0 ? `${state.email} (${state.unread})` : state.email;
  const n = state.unread || 0;
  $('acc-sub').textContent = `${n} ${t('unreadLabel')}`;
  $('hero-title').textContent = n > 0 ? `${n} ${t('unreadLabel')}` : t('heroZero');
  $('hero-sub').textContent = n > 0 ? t('heroSub') : t('heroZeroSub');
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
  const star = document.createElement('button');
  star.className = 'mail-star' + (m.starred ? ' on' : '');
  star.title = t('star');
  star.append(icon(m.starred ? 'star' : 'starBorder', 22));
  star.onclick = async (e) => {
    e.stopPropagation();
    const r = await rowCall(m, 'star', { on: !m.starred });
    if (!r.ok) return;
    m.starred = !m.starred;
    star.classList.toggle('on', m.starred);
    star.replaceChildren(icon(m.starred ? 'star' : 'starBorder', 22));
  };
  d.append(avatar(m.from), content, acts, star);
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
  listItems = r.result;
  $('trashbar').hidden = !(folder === 'trash' && !query && r.result.length);
  $('trash-confirm').hidden = true;
  list.replaceChildren(...r.result.map(row));
}

/* ---------- message ---------- */
// Mail is rendered in a shadow root after sanitizing (no iframe): see lib/sanitize.js.
function paintFlags() {
  $('act-read').replaceChildren(icon(current.unread ? 'read' : 'mail', 22));
  $('act-read').title = current.unread ? t('markRead') : t('markUnread');
  $('act-star').replaceChildren(icon(current.starred ? 'star' : 'starBorder', 22));
}

function previewCard(m) {
  const card = document.createElement('div');
  card.className = 'msg single';
  const body = document.createElement('div');
  body.className = 'mbody';
  renderMail(body, '', m.preview);
  card.append(body);
  return card;
}

function threadCards(thread) {
  const multi = thread.length > 1;
  return thread.map((x, i) => {
    const card = document.createElement('div');
    card.className = 'msg' + (multi ? '' : ' single');
    const body = document.createElement('div');
    body.className = 'mbody';
    let painted = false;
    const paint = () => { if (!painted) { renderMail(body, x.html, x.text); painted = true; } };
    if (multi) {
      const head = document.createElement('div');
      head.className = 'msg-head';
      const who = document.createElement('span'); who.className = 'who'; who.textContent = x.from;
      const snip = document.createElement('span'); snip.className = 'snip';
      const when = document.createElement('span'); when.className = 'when'; when.textContent = x.date ? new Date(x.date).toLocaleString() : '';
      head.append(avatar(x.from), who, snip, when);
      const setOpen = (on) => { body.hidden = !on; snip.textContent = on ? '' : (x.text || '').replace(/\s+/g, ' ').slice(0, 140); if (on) paint(); };
      head.onclick = () => setOpen(body.hidden);
      card.append(head, body);
      setOpen(i === thread.length - 1);
    } else {
      card.append(body);
      paint();
    }
    return card;
  });
}

function paintNav() {
  $('d-prev').disabled = listPos <= 0;
  $('d-next').disabled = listPos < 0 || listPos >= listItems.length - 1;
}

function step(delta) {
  const n = listItems[listPos + delta];
  if (n) open(n);
}

async function open(m) {
  current = m;
  listPos = listItems.findIndex((x) => x.uid === m.uid && x.folder === m.folder);
  paintNav();
  $('d-subject').textContent = m.subject;
  $('d-sender').textContent = m.from;
  $('d-addr').textContent = m.fromAddress ? `<${m.fromAddress}>` : '';
  $('d-date').textContent = m.date ? new Date(m.date).toLocaleString() : '';
  $('d-thread').replaceChildren(previewCard(m));
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
  try {
    $('d-thread').replaceChildren(...threadCards(full.thread));
  } catch (e) {
    $('d-err').textContent = String(e.message || e);
  }
  // Opening a message in the popup counts as reading it.
  if (m.unread) {
    const opened = current;
    call({ action: 'read', folder: m.folder, uids: [m.uid], read: true }).then((rr) => {
      if (rr.ok) {
        m.unread = false;
        opened.unread = false;
        if (current === opened) paintFlags();
      } else if (current === opened) {
        $('d-err').textContent = rr.error;
      }
    });
  }
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
// One editable area (like a mail app): you type on top, the original stays below as a quote.
let replyCtx = null; // { html, text, attribution } when answering a message
let savedRange = null;
const editor = () => $('c-editor');

function exec(cmd, value) {
  editor().focus();
  document.execCommand(cmd, false, value);
}
for (const [id, cmd] of [['f-undo', 'undo'], ['f-redo', 'redo'], ['f-bold', 'bold'], ['f-italic', 'italic'], ['f-underline', 'underline'], ['f-list', 'insertUnorderedList']]) {
  $(id).onmousedown = (e) => { e.preventDefault(); exec(cmd); };
}
$('f-link').onmousedown = (e) => {
  e.preventDefault();
  const sel = getSelection();
  savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const row = $('c-linkrow');
  row.hidden = !row.hidden;
  if (!row.hidden) setTimeout(() => $('c-link').focus(), 0);
};
$('c-linkok').onclick = () => {
  const u = $('c-link').value.trim();
  $('c-linkrow').hidden = true;
  if (!/^(https?:\/\/|mailto:)/i.test(u)) return;
  editor().focus();
  if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  const s = getSelection();
  if (s.isCollapsed) exec('insertHTML', `<a href="${u.replace(/"/g, '&quot;')}">${u.replace(/[&<>]/g, '')}</a>`);
  else exec('createLink', u);
  $('c-link').value = '';
};

async function compose(reply) {
  replyCtx = null;
  const { state } = await chrome.storage.local.get('state');
  $('c-from').textContent = state?.email || '';
  $('c-to').value = reply ? reply.fromAddress : '';
  $('c-subject').value = reply ? (/^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`) : '';
  editor().innerHTML = '<div><br></div>';
  $('c-linkrow').hidden = true;
  $('c-status').textContent = '';
  const wrap = $('c-quote-wrap');
  wrap.hidden = true;
  if (reply && (reply.html || reply.text)) {
    const date = reply.date ? new Date(reply.date).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' }) : '';
    const attribution = t('attribution').replace('{date}', date).replace('{sender}', `${reply.from} <${reply.fromAddress}>`);
    replyCtx = { html: reply.html, text: reply.text || '', attribution };
    $('c-attrib').textContent = attribution;
    renderMail($('c-quote'), reply.html, reply.text);
    wrap.hidden = false;
  }
  show('v-composer');
  (reply ? editor() : $('c-to')).focus();
}

$('c-send').onclick = async () => {
  const to = $('c-to').value.split(/[,;\s]+/).filter(Boolean);
  if (!to.length) { $('c-status').textContent = t('to'); $('c-to').focus(); return; }
  $('c-send').disabled = true;
  const userHtml = sanitizeHtml(editor().innerHTML).body.innerHTML;
  const userText = editor().innerText.trim();
  const msg = { action: 'send', to, subject: $('c-subject').value, body: userText, html: `<div>${userHtml}</div>` };
  if (replyCtx) {
    msg.body = `${userText}\n\n${replyCtx.attribution}\n${quoteForReply(replyCtx.text)}`;
    msg.html = buildReplyHtml(userHtml, replyCtx.attribution, replyCtx);
  }
  const r = await call(msg);
  $('c-send').disabled = false;
  if (r.ok) { $('c-status').textContent = t('sentOk'); setTimeout(home, 800); }
  else $('c-status').textContent = r.error;
};

/* ---------- wiring ---------- */
$('refresh').onclick = async () => { await call({ action: 'poll' }); home(); };
$('newtab').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?tab=1') });
$('menu-top').onclick = (e) => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; };
document.addEventListener('click', () => { $('menu').hidden = true; });
$('open-zoho').onclick = () => call({ action: 'openWeb' });
$('m-web').onclick = () => call({ action: 'openWeb' });
$('m-options').onclick = () => chrome.runtime.openOptionsPage();
$('signinBtn').onclick = () => call({ action: 'signIn' });
$('open-web').onclick = () => call({ action: 'openWeb' });
$('acc-compose').onclick = () => compose(null);
$('act-reply').onclick = () => compose(current);
$('empty-trash').onclick = () => { $('trash-confirm').hidden = false; $('empty-trash').hidden = true; $('trash-status').textContent = ''; };
$('trash-cancel').onclick = () => { $('trash-confirm').hidden = true; $('empty-trash').hidden = false; };
$('trash-go').onclick = async () => {
  $('trash-go').disabled = true;
  $('trash-confirm').hidden = true;
  $('trash-status').textContent = '…';
  const r = await call({ action: 'emptyTrash' });
  $('trash-go').disabled = false;
  $('empty-trash').hidden = false;
  if (!r.ok) { $('trash-status').textContent = r.error; return; }
  const left = r.result.left;
  $('trash-status').textContent = left === 0 ? t('trashEmptied') : `${t('trashLeft').replace('{n}', left)}`;
  load();
};
$('d-back').onclick = home;
$('d-prev').onclick = () => step(-1);
$('d-next').onclick = () => step(1);
document.addEventListener('keydown', (e) => {
  if ($('v-detail').hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'ArrowRight' || e.key === 'j') step(1);
  else if (e.key === 'ArrowLeft' || e.key === 'k') step(-1);
});
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

import { findVerificationCode } from '../lib/codes.js';
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

function open(m) {
  current = m;
  $('d-subject').textContent = m.subject;
  $('d-meta').textContent = `${m.from} <${m.fromAddress}> · ${m.date ? new Date(m.date).toLocaleString() : ''}`;
  $('d-body').srcdoc = `<pre style="white-space:pre-wrap;font:13px sans-serif">${esc(m.preview)}</pre>`;
  const code = findVerificationCode(`${m.subject} ${m.preview}`);
  const box = $('d-code');
  box.hidden = !code;
  if (code) {
    box.textContent = `${t('codeLabel')}: ${code} `;
    const c = document.createElement('button'); c.textContent = t('copy');
    c.onclick = () => navigator.clipboard.writeText(code);
    box.append(c);
  }
  $('d-invite').hidden = true;
  $('d-att').replaceChildren();
  show('detail');
}

function renderInvite(box, inv) {
  box.textContent = `${inv.summary} — ${inv.start ? new Date(inv.start).toLocaleString() : ''} `;
  for (const [label, ps] of [['accept', 'ACCEPTED'], ['tentative', 'TENTATIVE'], ['decline', 'DECLINED']]) {
    const b = document.createElement('button'); b.textContent = t(label);
    b.onclick = async () => {
      const { state } = await chrome.storage.local.get('state');
      const r = await call({ action: 'rsvp', invitation: inv, partstat: ps, attendee: state?.email, to: inv.organizer });
      b.textContent = r.ok ? '✓' : '✗';
    };
    box.append(b);
  }
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
$('back').onclick = load;
$('refresh').onclick = load;
$('settings').onclick = () => chrome.runtime.openOptionsPage();
$('signinBtn').onclick = () => call({ action: 'signIn' });
$('open-web').onclick = () => call({ action: 'openWeb' });

for (const b of document.querySelectorAll('#tabs button')) {
  b.onclick = () => {
    for (const x of document.querySelectorAll('#tabs button')) x.classList.remove('on');
    b.classList.add('on'); folder = b.dataset.folder; load();
  };
}

load();

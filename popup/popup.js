const $ = (id) => document.getElementById(id);
const t = (k) => chrome.i18n.getMessage(k) || k;
const call = (m) => chrome.runtime.sendMessage(m);

let folder = 'INBOX';
let current = null;
let replyCtx = null;

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

async function open(m) {
  const r = await call({ action: 'get', folder: m.folder, uid: m.uid });
  if (!r.ok) { $('list').textContent = r.error; return; }
  current = r.result;
  $('d-subject').textContent = current.subject;
  $('d-meta').textContent = `${current.from} <${current.fromAddress}> · ${current.date ? new Date(current.date).toLocaleString() : ''}`;
  $('d-body').srcdoc = current.html || `<pre style="white-space:pre-wrap;font:13px sans-serif">${esc(current.text)}</pre>`;
  const code = $('d-code');
  code.hidden = !current.code;
  if (current.code) {
    code.textContent = `${t('codeLabel')}: ${current.code} `;
    const c = document.createElement('button'); c.textContent = t('copy');
    c.onclick = () => navigator.clipboard.writeText(current.code);
    code.append(c);
  }
  const inv = $('d-invite');
  inv.hidden = !current.invitation;
  if (current.invitation) renderInvite(inv, current.invitation);
  $('d-att').replaceChildren(...current.attachments.map((a) => {
    const li = document.createElement('li');
    const l = document.createElement('a'); l.textContent = `${a.name} (${Math.round((a.size || 0) / 1024)} KB)`;
    l.href = a.url; l.target = '_blank'; l.rel = 'noreferrer';
    li.append(l); return li;
  }));
  $('act-read').textContent = current.unread ? t('markRead') : t('markUnread');
  show('detail');
  if (current.unread) call({ action: 'read', folder: current.folder, uids: [current.uid], read: true });
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
const act = (name, extra = {}) => async () => {
  await call({ action: name, folder: current.folder, uids: [current.uid], ...extra });
  load();
};

$('act-read').onclick = () => act('read', { read: !!current.unread })();
$('act-star').onclick = () => act('star', { on: !current.starred })();
$('act-archive').onclick = act('archive');
$('act-trash').onclick = act('trash');
$('back').onclick = load;
$('refresh').onclick = load;
$('settings').onclick = () => chrome.runtime.openOptionsPage();
$('signinBtn').onclick = () => call({ action: 'signIn' });
$('compose').onclick = () => openComposer(null);
$('act-reply').onclick = () => openComposer(current);
$('c-cancel').onclick = load;

for (const b of document.querySelectorAll('#tabs button')) {
  b.onclick = () => {
    for (const x of document.querySelectorAll('#tabs button')) x.classList.remove('on');
    b.classList.add('on'); folder = b.dataset.folder; load();
  };
}

function openComposer(reply) {
  replyCtx = reply;
  $('c-to').value = reply ? reply.fromAddress : '';
  $('c-subject').value = reply ? (/^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`) : '';
  $('c-body').value = reply ? `\n\n> ${reply.text.split('\n').join('\n> ')}` : '';
  $('c-status').textContent = '';
  show('composer');
}

$('c-send').onclick = async () => {
  const to = $('c-to').value.split(/[,;\s]+/).filter(Boolean);
  if (!to.length) return;
  const r = await call({
    action: 'send', to, subject: $('c-subject').value, body: $('c-body').value,
    inReplyTo: replyCtx?.messageId || ''
  });
  if (r.ok) load(); else $('c-status').textContent = r.error;
};

load();

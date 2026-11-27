// DOM-based HTML sanitizer for rendering and quoting received mail (browser only).
// Removes everything that can run code or phone home; remote images are dropped
// unless `images: true` (used when quoting the original in a reply).
const DROP = 'script,iframe,frame,frameset,object,embed,applet,form,input,button,textarea,select,base,meta,link,video,audio,source,track,canvas,svg script';
const SAFE_URL = /^(https?:|mailto:|tel:|#)/i;

function cleanCss(css, images) {
  let out = css.replace(/@import[^;]*;?/gi, '');
  out = out.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, _q, u) => (images && /^https?:/i.test(u.trim()) ? m : /^data:image\//i.test(u.trim()) ? m : 'none'));
  return out.replace(/expression\s*\(|behavior\s*:|-moz-binding/gi, '');
}

export function sanitizeHtml(html, { images = false } = {}) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.querySelectorAll(DROP).forEach((n) => n.remove());
  for (const el of doc.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'ping') el.removeAttribute(a.name);
      else if (name === 'style') el.setAttribute('style', cleanCss(a.value, images));
      else if (name === 'href') {
        if (!SAFE_URL.test(a.value.trim())) el.removeAttribute('href');
      } else if (name === 'src' || name === 'background' || name === 'poster' || name === 'srcset') {
        const v = a.value.trim();
        if (name === 'src' && /^data:image\//i.test(v)) continue;
        if (images && name === 'src' && /^https?:/i.test(v)) continue;
        el.removeAttribute(a.name);
      }
    }
    if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
    if (el.tagName === 'STYLE') el.textContent = cleanCss(el.textContent, images);
  }
  return doc;
}

/** Renders sanitized mail inside a shadow root so its CSS cannot leak into (or out of) the popup. */
export function renderMail(host, html, text = '') {
  host.replaceChildren();
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  root.replaceChildren();
  const base = document.createElement('style');
  base.textContent = ':host{display:block;background:#fff;color:#202124;color-scheme:light}'
    + '.mail-body{font:14px Roboto,Arial,sans-serif;padding:12px;overflow-wrap:anywhere;overflow-x:auto}'
    + 'img{max-width:100%;height:auto} a{color:#0b57d0} pre{white-space:pre-wrap;font:inherit;margin:0}';
  root.append(base);
  const wrap = document.createElement('div');
  wrap.className = 'mail-body';
  if (html) {
    const doc = sanitizeHtml(html);
    for (const st of doc.head.querySelectorAll('style')) root.append(document.importNode(st, true));
    for (const n of doc.body.childNodes) wrap.append(document.importNode(n, true));
    // honour the email's own body styling (background / colour)
    const bs = doc.body.getAttribute('style');
    if (bs) wrap.setAttribute('style', bs);
  } else {
    const pre = document.createElement('pre');
    pre.textContent = text;
    wrap.append(pre);
  }
  root.append(wrap);
  root.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (a) { e.preventDefault(); if (/^https?:|^mailto:/i.test(a.href)) chrome.tabs.create({ url: a.href }); }
  });
}

/** HTML for a reply: what the user typed (already sanitized HTML), attribution, then the original as a quote. */
export function buildReplyHtml(userHtml, attribution, original) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let quoted = '';
  let styles = '';
  if (original.html) {
    const doc = sanitizeHtml(original.html, { images: true });
    quoted = doc.body.innerHTML;
    styles = [...doc.head.querySelectorAll('style')].map((s) => s.outerHTML).join('');
  } else {
    quoted = `<pre style="white-space:pre-wrap;font:inherit;margin:0">${esc(original.text || '')}</pre>`;
  }
  return `<div>${userHtml}</div><br>`
    + `<div style="color:#6b6bd6">${esc(attribution)}</div>`
    + `<blockquote style="margin:6px 0 0;border-left:2px solid #6b6bd6;padding-left:12px">${styles}${quoted}</blockquote>`;
}

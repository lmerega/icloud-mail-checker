// Generates Chrome Web Store screenshots and promo tiles from the real popup code,
// using synthetic data only. Usage: node design/make-store-assets.mjs
// Needs: npm i (esbuild, @resvg/resvg-js) and Chrome installed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import zlib from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'store', 'assets');
const work = path.join(root, 'dist', 'assets-work');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(work, { recursive: true });

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome'
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome not found');

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const messages = JSON.parse(read('_locales/en/messages.json'));
const i18n = Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, v.message]));

const bundle = (await build({ entryPoints: [path.join(root, 'popup/popup.js')], bundle: true, format: 'iife', write: false })).outputFiles[0].text;
const css = read('popup/popup.css');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'icons/icon-48.png')).toString('base64');
const bodyHtml = read('popup/popup.html').match(/<body>([\s\S]*?)<script type="module"/)[1].replace('../icons/icon-48.png', logo);
const iconSvg = read('design/icon.svg');

/* ---------- synthetic mailbox ---------- */
const now = Date.now();
const h = (n) => new Date(now - n * 3600e3).toISOString();
const M = (i, from, addr, subject, preview, hours, unread, count = 1) => ({
  uid: `t${i}`, threadId: `t${i}`, folder: 'INBOX', from, fromAddress: addr, subject, preview, date: h(hours), unread, starred: false, count
});
const LIST = [
  M(1, 'Maria Bianchi', 'maria@example.invalid', 'Dinner on Friday?', 'Hi! Are you free on Friday evening? I booked a table for four at the new place near the station.', 0.4, true, 3),
  M(2, 'Northwind Travel', 'no-reply@northwind.invalid', 'Your booking is confirmed', 'Thank you for booking with Northwind Travel. Your itinerary and e-tickets are attached to this message.', 2, true),
  M(3, 'Studio Verdi', 'hello@studioverdi.invalid', 'Invoice 2026-114', 'Please find attached the invoice for November. Payment is due within 30 days. Let us know if you have any questions.', 5, false),
  M(4, 'Acme Bank', 'security@acmebank.invalid', 'Your verification code', 'Your one-time code is 482915 and expires in 10 minutes. Never share this code with anyone.', 7, false),
  M(5, 'Photo Club', 'news@photoclub.invalid', 'Weekend workshop: night photography', 'Join us on Saturday for a hands-on workshop. Bring your camera and a tripod. Places are limited.', 26, false),
  M(6, 'Lena Fischer', 'lena@example.invalid', 'Re: Notes from yesterday', 'Thanks for sending these over, I will review them tonight and come back to you tomorrow morning.', 30, false)
];
const msgHtml = (title, body, color = '#1a73e8') => `<div style="font-family:Arial,sans-serif;color:#202124;padding:6px"><h2 style="margin:0 0 10px;color:${color};font-size:20px">${title}</h2>${body}</div>`;
const THREAD = [
  { uid: 'a', from: 'Maria Bianchi', fromAddress: 'maria@example.invalid', subject: 'Dinner on Friday?', date: h(26), unread: false, html: '', text: 'Hi! Are you free on Friday evening? I booked a table for four at the new place near the station. Let me know!', attachments: [] },
  { uid: 'b', from: 'Luca', fromAddress: 'demo@example.invalid', subject: 'Re: Dinner on Friday?', date: h(25), unread: false, html: '', text: 'Sounds great, count me in. Can we make it 8pm instead of 7:30?', attachments: [] },
  { uid: 'c', from: 'Maria Bianchi', fromAddress: 'maria@example.invalid', subject: 'Re: Dinner on Friday?',
    date: h(0.4), unread: true, text: 'Perfect, 8pm it is.',
    html: msgHtml('See you Friday at 8pm', '<p>Perfect, I moved the booking to <b>8pm</b>. The address is Via dei Tigli 12, right behind the station.</p><p>Giulia and Marco are coming too, so we will be four. Bring an appetite!</p><table style="width:100%;border-collapse:collapse;margin-top:8px"><tr><td style="background:#e8f0fe;padding:10px;border-radius:8px"><b>Friday 29 Nov</b><br>8:00 pm · Trattoria Verde<br>Table for 4</td></tr></table><p style="color:#5f6368">See you there! — Maria</p>', '#188038'),
    attachments: [{ name: 'menu.pdf', size: 184000 }] }
];

/* ---------- harness page ---------- */
const stub = `
window.__I18N = ${JSON.stringify(i18n)};
window.__LIST = ${JSON.stringify(LIST)};
window.__THREAD = ${JSON.stringify(THREAD)};
window.chrome = {
  i18n: { getMessage: (k) => window.__I18N[k] || '' },
  storage: { local: { get: async () => ({ state: { signedIn: true, email: 'demo@example.invalid', unread: 2 } }) } },
  runtime: {
    getURL: (p) => p, openOptionsPage() {},
    sendMessage: async (m) => {
      if (m.action === 'list') return { ok: true, result: window.__LIST };
      if (m.action === 'get') {
        const last = window.__THREAD[window.__THREAD.length - 1];
        const multi = m.uid === 't1';
        const thread = multi ? window.__THREAD : [{ ...last, uid: m.uid, from: 'Northwind Travel', fromAddress: 'no-reply@northwind.invalid', subject: 'Your booking is confirmed', html: '<div style="font-family:Arial;color:#202124;padding:6px"><h2 style="color:#1a73e8;margin:0 0 10px">Booking confirmed</h2><p>Thank you for booking with <b>Northwind Travel</b>.</p><p>Flight NW 482 · Milan → Lisbon · 14 Dec, 09:35</p><p style="background:#e6f4ea;padding:10px;border-radius:8px">Booking reference: <b>QX7K2P</b></p></div>', attachments: [{ name: 'e-ticket.pdf', size: 92000 }] }];
        return { ok: true, result: { ...thread[thread.length - 1], thread, code: null } };
      }
      return { ok: true, result: {} };
    }
  },
  tabs: { create() {} }
};`;

const LIGHT = ':root{--bg:#f5f5f5;--card:#fff;--text:#333;--mut:#7a7a7a;--accent:#0b57d0;--line:#e2e2e2;--hover:#eaeaea;--icon:#49454f;--unread:#0b57d0;--read-bg:#ebebeb;--glow:0 0 20px 0 rgba(219,219,219,.5);--ring:0 0 0 1px rgba(193,193,193,.6)}';
const DARK = ':root{--bg:#131314;--card:#232323;--text:#ddd;--mut:#9b9b9b;--accent:#e3e3e3;--line:#3a3a3a;--hover:#333;--icon:#ccc;--unread:#8ab4f8;--read-bg:#1b1b1c;--glow:none;--ring:0 0 0 1px #4a4a4a}';
// Headless Chrome follows the OS theme; make each scene independent of it by resolving the
// prefers-color-scheme: dark blocks ourselves (drop them for light, always-apply for dark).
function forceScheme(source, dark) {
  const key = '@media (prefers-color-scheme: dark)';
  let outCss = '';
  let i = 0;
  while (i < source.length) {
    const j = source.indexOf(key, i);
    if (j < 0) { outCss += source.slice(i); break; }
    outCss += source.slice(i, j);
    const open = source.indexOf('{', j);
    let depth = 0, k = open;
    for (; k < source.length; k++) {
      if (source[k] === '{') depth++;
      else if (source[k] === '}' && --depth === 0) break;
    }
    if (dark) outCss += source.slice(open + 1, k);
    i = k + 1;
  }
  return outCss;
}
const SCENES = {
  list: { h: 620, act: '' },
  open: { h: 640, act: "document.querySelectorAll('.mail')[1].click();" },
  thread: { h: 740, act: "document.querySelectorAll('.mail')[0].click();" },
  reply: { h: 700, act: "document.querySelectorAll('.mail')[0].click(); setTimeout(()=>{ document.getElementById('act-reply').click(); setTimeout(() => { document.getElementById('c-editor').innerHTML = '<div>Sounds perfect, see you there!</div>'; }, 300); }, 500);" },
  dark: { h: 620, act: '', dark: true }
};

const shot = {};
for (const [name, s] of Object.entries(SCENES)) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${forceScheme(css, !!s.dark)}${s.dark ? DARK : LIGHT}</style></head><body>${bodyHtml}`
    + `<script>${stub}</script><script>${bundle}</script>`
    + `<script>setTimeout(() => { ${s.act} }, 600);</script></body></html>`;
  const file = path.join(work, `${name}.html`);
  const png = path.join(work, `${name}.png`);
  fs.writeFileSync(file, html);
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=650,${s.h}`, '--force-device-scale-factor=2', '--virtual-time-budget=4000', `--screenshot=${png}`];
    args.push('file:///' + file.replace(/\\/g, '/'));
  execFileSync(CHROME, args, { stdio: 'ignore' });
  shot[name] = fs.readFileSync(png).toString('base64');
}

/* ---------- compositions ---------- */
const FONT = 'Segoe UI, Arial, sans-serif';
const grad = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const iconInner = iconSvg.replace(/<\/?svg[^>]*>/g, '').replace(/id="g7"/, 'id="ic"').replace('url(#g7)', 'url(#ic)');
const icon = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s / 128})">${iconInner}</g>`;

function screenshotSvg(name, title, sub, a, b) {
  const W = 1280, H = 800, ph = 700, pw = Math.round(ph * 650 / SCENES[name].h);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${grad('bg', a, b)}<filter id="sh" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity=".35"/></filter>
  <clipPath id="clip"><rect x="${W - pw - 90}" y="50" width="${pw}" height="${ph}" rx="22"/></clipPath></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${icon(80, 90, 84)}
  <text x="80" y="260" font-family="${FONT}" font-size="50" font-weight="700" fill="#fff">${title}</text>
  ${sub.map((l, i) => `<text x="80" y="${380 + i * 34}" font-family="${FONT}" font-size="24" fill="#fff" fill-opacity=".92">${l}</text>`).join('')}
  <g filter="url(#sh)"><rect x="${W - pw - 90}" y="50" width="${pw}" height="${ph}" rx="22" fill="#fff"/></g>
  <image x="${W - pw - 90}" y="50" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMin slice" clip-path="url(#clip)" href="data:image/png;base64,${shot[name]}"/>
</svg>`;
}

const cards = [
  ['list', 'Your inbox,<tspan x="80" dy="62">one click away</tspan>', ['Unread badge, notifications', 'and search.'], '#7c3aed', '#2563eb'],
  ['open', 'Read mail<tspan x="80" dy="62">in the popup</tspan>', ['Remote images and trackers', 'are blocked.'], '#0ea5e9', '#22c55e'],
  ['thread', 'Whole<tspan x="80" dy="62">conversations</tspan>', ['Older messages fold away,', 'one tap opens them.'], '#f97316', '#ec4899'],
  ['reply', 'Reply in HTML<tspan x="80" dy="62">to HTML mail</tspan>', ['The original is quoted,', 'not flattened.'], '#14b8a6', '#6366f1'],
  ['dark', 'Light and dark,<tspan x="80" dy="62">your choice</tspan>', ['Follows your system theme', 'automatically.'], '#1f2937', '#4b5563']
];
// The Web Store wants 24-bit PNGs without alpha: write RGB explicitly.
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]); const o = Buffer.alloc(4); o.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(b)); return Buffer.concat([o, b, c]); };
function rgbPng(width, height, rgba) {
  const stride = width * 3, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, o = y * (stride + 1) + 1 + x * 3;
      raw[o] = rgba[i]; raw[o + 1] = rgba[i + 1]; raw[o + 2] = rgba[i + 2];
    }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(width, 0); ih.writeUInt32BE(height, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const render = (svg, file, w) => {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render();
  fs.writeFileSync(path.join(out, file), rgbPng(r.width, r.height, r.pixels));
};
cards.forEach(([name, title, sub, a, b], i) => render(screenshotSvg(name, title, sub, a, b), `screenshot-${i + 1}-${name}.png`, 1280));

// promo tiles (small 440x280, marquee 1400x560)
function tile(W, H, shotName) {
  const big = W > 800;
  const ph = big ? H - 60 : 215, pw = Math.round(ph * 650 / SCENES[shotName].h);
  const px = W - pw - (big ? 40 : 16), py = big ? H - ph * 0.82 : 62;
  const tx = big ? 90 : 28;
  const title = big
    ? `<text x="${tx}" y="330" font-family="${FONT}" font-size="72" font-weight="700" fill="#fff">iCloud Mail Checker</text>`
    : `<text x="${tx}" y="140" font-family="${FONT}" font-size="27" font-weight="700" fill="#fff">iCloud Mail</text><text x="${tx}" y="170" font-family="${FONT}" font-size="27" font-weight="700" fill="#fff">Checker</text>`;
  const sub = (big ? ['Unread badge, notifications,', 'search, read and reply.'] : ['Badge, alerts,', 'search and reply.'])
    .map((l, i) => `<text x="${tx}" y="${big ? 392 + i * 42 : 200 + i * 20}" font-family="${FONT}" font-size="${big ? 32 : 15}" fill="#fff" fill-opacity=".92">${l}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${grad('bg', '#7c3aed', '#2563eb')}<clipPath id="c"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="14"/></clipPath></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${icon(tx, big ? 120 : 34, big ? 130 : 70)}
  ${title}${sub}
  <image x="${px}" y="${py}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMin slice" clip-path="url(#c)" href="data:image/png;base64,${shot[shotName]}"/>
</svg>`;
}
render(tile(440, 280, 'list'), 'promo-small-440x280.png', 440);
render(tile(1400, 560, 'list'), 'promo-marquee-1400x560.png', 1400);
console.log(fs.readdirSync(out).join('\n'));

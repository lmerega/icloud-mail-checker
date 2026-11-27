// HTML -> readable plain text (used for code detection and reply quoting).
const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', euro: '€' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(cp) || cp > 0x10ffff) return m;
      const ch = String.fromCodePoint(cp);
      return cp === 160 ? ' ' : ch;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html) {
  const text = decodeEntities(
    String(html)
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t ​‌͏]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function quoteForReply(text, max = 1500) {
  const body = text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  return body.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
}

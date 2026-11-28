// Language chosen in the options (auto = browser language via chrome.i18n).
// chrome.i18n cannot switch language at runtime, so for an explicit choice we load that
// locale's messages.json ourselves and fall back to chrome.i18n for anything missing.
export const LANGS = ['auto', 'en', 'it'];

let dict = null;
let current = 'auto';

export async function initI18n() {
  let lang = 'auto';
  try {
    const { settings } = await chrome.storage.sync.get('settings');
    if (LANGS.includes(settings?.lang)) lang = settings.lang;
  } catch { /* storage unavailable: browser language */ }
  if (lang === current && (lang === 'auto' || dict)) return lang;
  current = lang;
  dict = null;
  if (lang !== 'auto') {
    try {
      const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
      const json = await res.json();
      dict = Object.fromEntries(Object.entries(json).map(([k, v]) => [k, v.message]));
    } catch { dict = null; }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'auto' ? chrome.i18n.getUILanguage().slice(0, 2) : lang;
  }
  return lang;
}

export const t = (k) => (dict && dict[k]) || chrome.i18n.getMessage(k) || k;

/** Fills every [data-i18n], [data-i18n-title] and [data-i18n-ph] element. */
export function paintI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
}

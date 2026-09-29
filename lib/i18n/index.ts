// Tiny i18n: per-device interface language, English fallback, **bold** + {var} templates.
import en, { type Key } from './en';
import es from './es';
import fr from './fr';
import de from './de';
import ja from './ja';
import zh from './zh';
import hi from './hi';

export type { Key };
export type UiLang = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'hi';
export type WordLang = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh';

export const UI_LANGS: { code: UiLang; name: string; locale: string }[] = [
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'ja', name: '日本語', locale: 'ja-JP' },
  { code: 'zh', name: '中文', locale: 'zh-CN' },
  { code: 'hi', name: 'हिन्दी', locale: 'hi-IN' },
];
export const WORD_LANGS: { code: WordLang; name: string; flag: string }[] = [
  { code: 'en', name: 'English', flag: 'EN' },
  { code: 'es', name: 'Español', flag: 'ES' },
  { code: 'fr', name: 'Français', flag: 'FR' },
  { code: 'de', name: 'Deutsch', flag: 'DE' },
  { code: 'ja', name: '日本語 (romaji)', flag: 'JA' },
  { code: 'zh', name: '中文 (pinyin)', flag: 'ZH' },
];

type Dict = Partial<Record<Key, string>>;
export const DICTS: Record<UiLang, Dict> = { en, es, fr, de, ja, zh, hi };
const STORE = 'letterlock:lang';
export const LANG_EVENT = 'letterlock:lang';

// Start in English on both server and client so hydration matches; the saved/browser language is applied after mount.
let cur: UiLang = 'en';
let version = 0;
export function langVersion(): number { return version; }

function detect(): UiLang {
  try {
    const saved = window.localStorage.getItem(STORE) as UiLang | null;
    if (saved && saved in DICTS) return saved;
  } catch { /* ignore */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase();
  return (nav in DICTS ? nav : 'en') as UiLang;
}

export function getLang(): UiLang { return cur; }
export function localeOf(l: UiLang = cur): string { return UI_LANGS.find((x) => x.code === l)?.locale ?? 'en-US'; }

export function setLang(l: UiLang, persist = true) {
  cur = l;
  version++;
  if (persist) { try { window.localStorage.setItem(STORE, l); } catch { /* ignore */ } }
  try { document.documentElement.lang = l; } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(LANG_EVENT)); } catch { /* ignore */ }
}

/** Call once on mount (from the root layout) to switch to the player's language. */
export function bootLang() {
  const l = detect();
  if (l !== cur) setLang(l, false); else { try { document.documentElement.lang = l; } catch { /* ignore */ } }
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s: string = DICTS[cur][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}


// Per-device preferences (music / sound effects / announcer voice).
export interface Prefs { music: boolean; sfx: boolean; voice: boolean }

const KEY = 'letterlock:prefs';
let prefs: Prefs = { music: true, sfx: true, voice: true };
try {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
  if (raw) prefs = { ...prefs, ...JSON.parse(raw) };
} catch { /* ignore */ }

export function getPrefs(): Prefs { return prefs; }

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  prefs = { ...prefs, [k]: v };
  try { window.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('letterlock:mute')); } catch { /* ignore */ }
}

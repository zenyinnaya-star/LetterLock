// Per-device preferences (music / sound effects / announcer voice).
export interface Prefs { music: boolean; sfx: boolean; voice: boolean; chicken: boolean }

const KEY = 'letterlock:prefs';
// narrator voice is opt-in: off by default, and devices that saved the old on-by-default value (no `vv` marker) are switched off once
let prefs: Prefs = { music: true, sfx: true, voice: false, chicken: false };
try {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
  if (raw) {
    const saved = JSON.parse(raw) as Partial<Prefs> & { vv?: number };
    prefs = { ...prefs, ...saved };
    if (!saved.vv) { prefs.voice = false; prefs.chicken = false; }
  }
} catch { /* ignore */ }

export function getPrefs(): Prefs { return prefs; }

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  prefs = { ...prefs, [k]: v };
  try { window.localStorage.setItem(KEY, JSON.stringify({ ...prefs, vv: 1 })); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('letterlock:mute')); } catch { /* ignore */ }
}

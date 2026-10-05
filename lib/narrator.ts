// Recorded narrator (one voice for everything). Files live in /public/audio/narrator/<key>.mp3.
// If a file is missing the call is a silent no-op, so the game works with or without the clips.
import { getPrefs } from './prefs';

export type NarratorKey =
  | 'cl_ninja' | 'cl_mastermind' | 'cl_hero' | 'cl_villain' | 'cl_hacker' | 'cl_mimic'
  | 'cl_gambler' | 'cl_thief' | 'cl_parasite' | 'cl_oracle' | 'cl_wildcard' | 'cl_jester'
  | 'three' | 'two' | 'one' | 'fight' | 'welcome' | 'choose' | 'round' | 'final' | 'ten' | 'timeup'
  | 'locked' | 'eliminated' | 'victory' | 'defeat' | 'daily' | 'reverse' | 'chaos' | 'memory';

const cache = new Map<string, HTMLAudioElement | null>();
let current: HTMLAudioElement | null = null;
let broken = false;

function load(key: string): HTMLAudioElement | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  if (typeof window === 'undefined') return null;
  const a = new Audio(`/audio/narrator/${key}.mp3`);
  a.preload = 'auto';
  a.addEventListener('error', () => cache.set(key, null));
  cache.set(key, a);
  return a;
}

export const narrator = {
  say(key: NarratorKey, opts: { delay?: number; interrupt?: boolean } = {}) {
    if (broken || typeof window === 'undefined') return;
    const go = () => {
      const prefs = getPrefs();
      if (!prefs.voice || !prefs.sfx) return;
      const a = load(key);
      if (!a) return;
      if (opts.interrupt !== false && current && !current.paused && current !== a) current.pause();
      try { a.currentTime = 0; } catch { /* not ready yet */ }
      current = a;
      a.volume = 1;
      void a.play().catch(() => { /* autoplay blocked or missing file */ });
    };
    if (opts.delay) window.setTimeout(go, opts.delay); else go();
  },
  preload(keys: NarratorKey[]) { keys.forEach((k) => load(k)); },
  stop() { if (current) current.pause(); },
};

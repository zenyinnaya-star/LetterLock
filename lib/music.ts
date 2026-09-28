// Background music: the site theme everywhere, the duel track during a 1v1.
// Uses plain <audio> elements (streamed, cheap) with volume crossfades.
import { audio } from './audio';
import { getPrefs } from './prefs';

export type Track = 'theme' | 'duel' | 'none';

const SRC: Record<Exclude<Track, 'none'>, string> = { theme: '/audio/theme.mp3', duel: '/audio/duel.mp3' };
const LEVEL: Record<Exclude<Track, 'none'>, number> = { theme: 0.32, duel: 0.55 };

let els: Partial<Record<Exclude<Track, 'none'>, HTMLAudioElement>> = {};
let want: Track = 'none';
let quiet = false; // in-game: sit the theme lower under the announcer
let gestureHooked = false;
const fades = new Map<HTMLAudioElement, number>();

function el(t: Exclude<Track, 'none'>): HTMLAudioElement {
  let a = els[t];
  if (!a) {
    a = new Audio(SRC[t]);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    els = { ...els, [t]: a };
  }
  return a;
}

function fade(a: HTMLAudioElement, to: number, ms: number, then?: () => void) {
  const prev = fades.get(a);
  if (prev) window.clearInterval(prev);
  const from = a.volume;
  const steps = Math.max(1, Math.round(ms / 40));
  let i = 0;
  const id = window.setInterval(() => {
    i++;
    a.volume = Math.min(1, Math.max(0, from + (to - from) * (i / steps)));
    if (i >= steps) { window.clearInterval(id); fades.delete(a); then?.(); }
  }, 40);
  fades.set(a, id);
}

function target(t: Exclude<Track, 'none'>) {
  return t === 'theme' && quiet ? LEVEL.theme * 0.55 : LEVEL[t];
}

function hookGesture() {
  if (gestureHooked || typeof window === 'undefined') return;
  gestureHooked = true;
  const go = () => { apply(); };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}

function apply() {
  if (typeof window === 'undefined') return;
  (['theme', 'duel'] as const).forEach((t) => {
    const on = want === t && !audio.isMuted() && getPrefs().music;
    const a = els[t];
    if (on) {
      const x = el(t);
      if (x.paused) {
        x.play().catch(() => hookGesture()); // autoplay blocked until the first tap/key
      }
      fade(x, target(t), 900);
    } else if (a && !a.paused) {
      fade(a, 0, t === 'duel' ? 700 : 900, () => { if (want !== t || audio.isMuted() || !getPrefs().music) a.pause(); });
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('letterlock:mute', () => apply());
}

export const music = {
  play(t: Track, opts: { quiet?: boolean } = {}) {
    const q = !!opts.quiet;
    if (t === want && q === quiet) return;
    want = t;
    quiet = q;
    if (t === 'duel') { const d = el('duel'); if (d.paused) d.currentTime = 0; }
    apply();
  },
  current() { return want; },
};

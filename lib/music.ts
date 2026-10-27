// Background music: the site theme everywhere, the Story/RPG track (story.mp3) during battle/camp, the duel track during a 1v1.
// Uses plain <audio> elements (streamed, cheap) with volume crossfades.
import { audio } from './audio';
import { getPrefs } from './prefs';

export type Track = 'theme' | 'vault' | 'duel' | 'battle' | 'none';

const SRC: Record<Exclude<Track, 'none'>, string> = { theme: '/audio/theme.mp3', vault: '/audio/classic-epic-m.mp3', duel: '/audio/duel.mp3', battle: '/audio/story.mp3' };
const LEVEL: Record<Exclude<Track, 'none'>, number> = { theme: 0.32, vault: 0.4, duel: 0.55, battle: 0.5 };

let els: Partial<Record<Exclude<Track, 'none'>, HTMLAudioElement>> = {};
let want: Track = 'none';
let quiet = false; // in-game: sit the theme lower under the announcer
let gestureHooked = false;
let switchTimer = 0;
const dbgLog: string[] = [];
function note(m: string) { dbgLog.push(`${new Date().toISOString().slice(14, 19)} ${m}`); if (dbgLog.length > 8) dbgLog.shift(); }
const fades = new Map<HTMLAudioElement, number>();

function el(t: Exclude<Track, 'none'>): HTMLAudioElement {
  let a = els[t];
  if (!a) {
    a = new Audio(SRC[t]);
    a.loop = true;
    // dedicated RPG track is optional: if the story track fails to load, the duel track stands in
    // the Classic track is optional too: if it can't load (slow/mobile network), the site theme stands in
    if (t === 'vault') a.addEventListener('error', () => { if (!a!.src.endsWith('theme.mp3')) { a!.src = SRC.theme; a!.load(); if (want === 'vault') void a!.play().catch(() => hookGesture()); } }, { once: true });
    if (t === 'battle') a.addEventListener('error', () => { if (!a!.src.endsWith('duel.mp3')) { a!.src = SRC.duel; a!.load(); if (want === 'battle') void a!.play().catch(() => undefined); } }, { once: true });
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
  return (t === 'theme' || t === 'vault') && quiet ? LEVEL[t] * 0.55 : LEVEL[t];
}

function hookGesture() {
  if (gestureHooked || typeof window === 'undefined') return;
  gestureHooked = true;
  // iOS/Android only unlock audio on touchend/click (not pointerdown), and each track needs its own unlock: keep listening
  const go = () => { apply(); };
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, go, { passive: true }));
}

function apply() {
  if (typeof window === 'undefined') return;
  (['theme', 'vault', 'duel', 'battle'] as const).forEach((t) => {
    const on = want === t && !audio.isMuted() && getPrefs().music;
    const a = els[t];
    if (on) {
      const x = el(t);
      if (x.paused) {
        note(`play ${t}`);
        x.play().catch((e: unknown) => { note(`blocked ${t}: ${(e as Error)?.name ?? e}`); hookGesture(); }); // autoplay blocked until the first tap/key
      }
      fade(x, target(t), 900);
    } else if (a && !a.paused) {
      fade(a, 0, t === 'theme' || t === 'vault' ? 900 : 700, () => { if (want !== t || audio.isMuted() || !getPrefs().music) a.pause(); });
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('letterlock:mute', () => apply());
}

export const music = {
  play(t: Track, opts: { quiet?: boolean } = {}) {
    const q = !!opts.quiet;
    hookGesture();
    if (t === want && q === quiet) return;
    want = t;
    quiet = q;
    if (t === 'duel' || t === 'battle') { const d = el(t); if (d.paused) d.currentTime = 0; }
    // never overlap: fade whatever is playing out first, then bring the new track in
    if (switchTimer) window.clearTimeout(switchTimer);
    const others = (['theme', 'vault', 'duel', 'battle'] as const).some((k) => k !== t && els[k] && !els[k]!.paused);
    if (others && t !== 'none') {
      const keep = want;
      want = 'none'; apply(); want = keep;
      switchTimer = window.setTimeout(() => apply(), 800);
    } else apply();
  },
  current() { return want; },
  /** For the ?musicdebug=1 overlay: what the player thinks it is doing. */
  debug() {
    return {
      want, quiet, muted: audio.isMuted(), pref: getPrefs().music, log: [...dbgLog],
      els: (Object.keys(els) as (keyof typeof els)[]).map((k) => { const a = els[k]!; return `${k}: ${a.paused ? 'paused' : 'PLAYING'} t=${a.currentTime.toFixed(1)} vol=${a.volume.toFixed(2)} ready=${a.readyState} net=${a.networkState} err=${a.error?.code ?? '-'} ${a.src.split('/').pop()}`; }),
    };
  },
};

// All sound effects are synthesized with the Web Audio API — no asset files.
import { getPrefs } from './prefs';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let lobbyTimer: number | null = null;

try { muted = window.localStorage.getItem('letterlock:muted') === '1'; } catch { /* ignore */ }

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, slideTo?: number) {
  if (!getPrefs().sfx) return;
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Short burst of filtered noise (impacts, whooshes, static). */
function noise(start: number, dur: number, vol = 0.4, freq = 1200, q = 1, sweepTo?: number) {
  if (!getPrefs().sfx) return;
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const audio = {
  unlock() { ac(); },
  isMuted() { return muted; },
  setMuted(m: boolean) {
    muted = m;
    try { window.localStorage.setItem('letterlock:muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.35, ctx.currentTime, 0.02);
    if (m) this.stopLobby();
    try { window.dispatchEvent(new Event('letterlock:mute')); } catch { /* ignore */ }
  },
  tick(urgent: boolean) { tone(urgent ? 1400 : 1000, 0, 0.05, 'square', urgent ? 0.25 : 0.12); },
  buzzer() { tone(140, 0, 0.45, 'sawtooth', 0.5, 90); tone(147, 0, 0.45, 'square', 0.25, 95); },
  success() { tone(660, 0, 0.12, 'triangle', 0.4); tone(990, 0.1, 0.2, 'triangle', 0.4); },
  chime() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.25, 'triangle', 0.35)); },
  attack() { tone(420, 0, 0.3, 'sawtooth', 0.35, 120); },
  fight() {
    tone(98, 0, 0.9, 'sawtooth', 0.45, 82);
    tone(196, 0, 0.9, 'square', 0.2, 164);
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.55 + i * 0.09, 0.3, 'square', 0.25));
  },
  fanfare() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.14, i === 5 ? 0.7 : 0.2, 'triangle', 0.4));
  },
  /** Punchy impact + descending growl: someone got attacked. */
  hit() {
    noise(0, 0.18, 0.7, 900, 0.8, 200);
    tone(220, 0, 0.35, 'sawtooth', 0.35, 70);
    tone(110, 0.02, 0.4, 'square', 0.2, 55);
  },
  /** Glitchy data-corruption stutter: a hack. */
  hack() {
    for (let i = 0; i < 7; i++) {
      const f = 300 + Math.random() * 1600;
      tone(f, i * 0.045, 0.04, 'square', 0.18, f * (Math.random() > 0.5 ? 2 : 0.5));
    }
    noise(0.05, 0.3, 0.3, 3000, 4, 600);
    tone(80, 0.32, 0.25, 'sawtooth', 0.25, 40);
  },
  /** Metallic clang: a shield blocks. */
  block() {
    [523, 1319, 2093, 2637].forEach((f, i) => tone(f, 0, 0.5 - i * 0.08, 'triangle', 0.22 - i * 0.03));
    noise(0, 0.06, 0.5, 4000, 1.5);
  },
  /** Rising shimmer: a letter gets cleansed. */
  cleanse() {
    noise(0, 0.45, 0.22, 800, 2, 6000);
    [659, 880, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.05 + i * 0.06, 0.3, 'sine', 0.2));
  },
  /** Heroic two-note brass stab: the Hero absorbs a hit. */
  absorb() {
    tone(392, 0, 0.18, 'sawtooth', 0.25); tone(523, 0.16, 0.45, 'sawtooth', 0.28);
    tone(784, 0.16, 0.45, 'triangle', 0.2);
    noise(0, 0.12, 0.35, 700, 1);
  },
  /** Alarm siren: the hacker got caught. */
  caught() {
    for (let i = 0; i < 3; i++) { tone(880, i * 0.28, 0.14, 'square', 0.22); tone(660, i * 0.28 + 0.14, 0.14, 'square', 0.22); }
  },
  /** Error buzz: trace missed. */
  denied() { tone(180, 0, 0.12, 'square', 0.25); tone(140, 0.14, 0.22, 'square', 0.25); },
  /** Cartoon chicken: bawk bawk ba-GAWK. */
  chicken() {
    const cluck = (t: number, f: number, dur: number) => {
      tone(f, t, dur, 'sawtooth', 0.28, f * 0.62);
      tone(f * 2.02, t, dur * 0.8, 'square', 0.08, f * 1.1);
      noise(t, dur * 0.7, 0.25, f * 2.5, 3);
    };
    cluck(0, 620, 0.09);
    cluck(0.16, 600, 0.09);
    cluck(0.32, 640, 0.08);
    // the long "ba-GAWK"
    tone(520, 0.5, 0.08, 'sawtooth', 0.25, 700);
    tone(760, 0.6, 0.34, 'sawtooth', 0.3, 430);
    tone(1520, 0.6, 0.28, 'square', 0.08, 900);
    noise(0.6, 0.3, 0.25, 1800, 3, 900);
  },
  startLobby() {
    if (lobbyTimer !== null || muted) return;
    const notes = [262, 330, 392, 494, 440, 392, 330, 294];
    let i = 0;
    const step = () => {
      tone(notes[i % notes.length], 0, 0.35, 'triangle', 0.12);
      if (i % 4 === 0) tone(notes[i % notes.length] / 2, 0, 0.6, 'sine', 0.12);
      i++;
    };
    step();
    lobbyTimer = window.setInterval(step, 380);
  },
  stopLobby() {
    if (lobbyTimer !== null) { window.clearInterval(lobbyTimer); lobbyTimer = null; }
  },
};

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

/** Breathy whistle note with vibrato (western standoff melody). */
function whistleNote(freq: number, start: number, dur: number, vol = 0.22, slideTo?: number) {
  if (!getPrefs().sfx) return;
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur * 0.85);
  lfo.frequency.value = 5.5; lfoGain.gain.value = freq * 0.012;
  lfo.connect(lfoGain).connect(osc.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
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

const SFX_CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_';
// Higgsfield-generated combat SFX (mirelo_text_to_audio)
const SFX: Record<string, string> = {
  hit: '20261008_070003_20e59aaf-cada-4ba1-8257-d18981c13bf3', crit: '20261008_070003_b1e88a80-bda2-4493-b3ef-154176ee9ee2',
  dodge: '20261008_070003_e718dc64-7b2b-4ac9-9b6d-a11332d2dc85', guard: '20261008_070027_92f6712c-3705-42e0-9543-5a36acf9686e',
  heal: '20261008_070027_ea690194-9d78-4b77-9d8c-5e0eb007973f', ult: '20261008_070003_b78e970f-8d0f-40ec-bc2c-38f9ae732a43',
  limit: '20261008_070003_7fe71d9c-c627-4e58-baaa-f4e79c96c92a', aoe: '20261008_070042_33223399-d8a4-48c0-9a55-d3b7551f5a24',
};
const SFX_ALIAS: Record<string, string> = { sweep: 'aoe', mega_sweep: 'aoe', e_aoe: 'aoe', season: 'aoe', e_heal: 'heal', miss: 'dodge' };
const sfxCache: Record<string, HTMLAudioElement> = {};

export const audio = {
  /** Play a Higgsfield-made battle SFX; falls back to the synth version if it can't load/play. */
  battle(t: string, enemyActing = false) {
    const key = SFX_ALIAS[t] ?? t;
    const id = SFX[key];
    if (!id || typeof window === 'undefined' || !getPrefs().sfx || muted) { this.battleSynth(t, enemyActing); return; }
    try {
      const a = (sfxCache[key] ??= new Audio(`${SFX_CDN}${id}.mp3`));
      const c = a.cloneNode(true) as HTMLAudioElement; c.volume = 0.85;
      void c.play().catch(() => this.battleSynth(t, enemyActing));
    } catch { this.battleSynth(t, enemyActing); }
  },
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
  /** Synth battle SFX by log type (fallback). */
  battleSynth(t: string, enemyActing = false) {
    switch (t) {
      case 'hit': noise(0, 0.14, 0.6, 1100, 0.8, 250); tone(180, 0, 0.25, 'sawtooth', 0.3, 60); if (enemyActing) tone(90, 0.03, 0.3, 'square', 0.25, 45); break;
      case 'crit': noise(0, 0.22, 0.8, 1500, 0.7, 200); tone(260, 0, 0.4, 'sawtooth', 0.4, 50); tone(1318, 0.02, 0.25, 'triangle', 0.3); tone(1760, 0.08, 0.3, 'triangle', 0.25); break;
      case 'miss': noise(0, 0.2, 0.25, 2500, 2, 700); break;
      case 'dodge': noise(0, 0.28, 0.35, 600, 1.5, 4500); tone(900, 0, 0.18, 'sine', 0.18, 1800); break;
      case 'guard': tone(523, 0, 0.35, 'triangle', 0.3); tone(1319, 0, 0.3, 'triangle', 0.2); noise(0, 0.05, 0.4, 4000, 1.5); break;
      case 'heal': [659, 880, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.3, 'sine', 0.25)); break;
      case 'ult': noise(0, 0.7, 0.5, 300, 1.2, 5000); tone(110, 0, 0.9, 'sawtooth', 0.45, 440); [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.35 + i * 0.08, 0.5, 'square', 0.22)); noise(0.55, 0.4, 0.7, 500, 0.6, 90); break;
      case 'limit': noise(0, 1, 0.6, 200, 1, 6000); tone(80, 0, 1.2, 'sawtooth', 0.5, 600); [392, 523, 659, 784, 1047, 1318].forEach((f, i) => tone(f, 0.3 + i * 0.09, 0.6, 'square', 0.25)); noise(0.8, 0.6, 0.8, 400, 0.5, 60); break;
      case 'sweep': case 'mega_sweep': case 'e_aoe': case 'season': noise(0, 0.5, 0.6, 700, 0.8, 120); tone(140, 0, 0.5, 'sawtooth', 0.4, 50); break;
      case 'e_buff': tone(300, 0, 0.4, 'sawtooth', 0.25, 600); break;
      case 'e_debuff': tone(500, 0, 0.4, 'square', 0.22, 150); break;
      case 'e_heal': this.battleSynth('heal'); break;
      case 'stage': this.fanfare(); break;
    }
  },
  /** Error buzz: trace missed. */
  denied() { tone(180, 0, 0.12, 'square', 0.25); tone(140, 0.14, 0.22, 'square', 0.25); },
  /** Play one of the recorded effects in /public/audio (after `delay` seconds); returns false if it can't. */
  file(name: 'sword-slash' | 'access-denied' | 'money' | 'villain-laugh' | 'victory' | 'defeat' | 'correct' | 'metal-clang' | 'coin-swipe' | 'mystical-harp' | 'cannon' | 'boing' | 'siren' | 'squelch' | 'nope', delay = 0, volume = 0.9) {
    if (!getPrefs().sfx || muted || typeof window === 'undefined') return false;
    const go = () => { try { const a = new Audio(`/audio/${name}.mp3`); a.volume = volume; void a.play().catch(() => undefined); } catch { /* ignore */ } };
    if (delay > 0) window.setTimeout(go, delay * 1000); else go();
    return true;
  },
  /** The real chicken (your recording); falls back to the synth cluck if it can't play. */
  chicken() {
    if (!getPrefs().sfx || !getPrefs().chicken || muted || typeof window === 'undefined') return;
    try {
      const a = new Audio('/audio/chicken.mp3');
      a.volume = 0.9;
      a.play().catch(() => this.chickenSynth());
    } catch { this.chickenSynth(); }
  },
  /** Cartoon chicken: bawk bawk ba-GAWK. */
  chickenSynth() {
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
  /** Chip clink: the Gambler goes all in. */
  coin() { tone(2637, 0, 0.12, 'triangle', 0.22); tone(3136, 0.06, 0.18, 'triangle', 0.18); noise(0, 0.05, 0.3, 6000, 3); },
  /** Slot-machine payout. */
  cashout() { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, i * 0.06, 0.14, 'square', 0.14)); this.coin(); },
  /** Sad trombone: the Gambler busts. */
  bust() { [392, 370, 349, 294].forEach((f, i) => tone(f, i * 0.32, i === 3 ? 0.7 : 0.3, 'sawtooth', 0.2, i === 3 ? 260 : undefined)); },
  /** Quick swipe: the Thief pockets a card (or drops one). */
  swipe() { noise(0, 0.22, 0.4, 500, 1.2, 5000); tone(900, 0.05, 0.12, 'triangle', 0.16, 1800); },
  /** Wet squelch: the Parasite latches on / drains. */
  squelch() { tone(160, 0, 0.25, 'sawtooth', 0.3, 60); noise(0, 0.25, 0.35, 400, 5, 150); tone(90, 0.12, 0.3, 'sine', 0.3, 200); },
  /** Morph warble: the Mimic transforms. */
  morph() { for (let i = 0; i < 6; i++) tone(300 + i * 90, i * 0.06, 0.18, 'sine', 0.18, 600 - i * 40); noise(0.1, 0.4, 0.15, 1200, 6, 300); },
  /** Mystic shimmer: the Oracle sees ahead. */
  mystic() { [523, 659, 831, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.8, 'sine', 0.14)); },
  /** Whoosh-whoosh: the Jester swaps racks. */
  /** Mastermind: an index card gets pinned to the board. */
  pin() { noise(0, 0.05, 0.5, 2500, 2, 900); tone(180, 0, 0.12, 'sine', 0.5, 90); tone(1400, 0.02, 0.05, 'triangle', 0.14); },
  /** Mastermind: soft clock tick for the last seconds. */
  clockTick(low = false) { tone(low ? 700 : 950, 0, 0.04, 'square', 0.12); },
  /** Mastermind: wrong guess slams shut. */
  slam() { tone(95, 0, 0.35, 'sawtooth', 0.45, 48); noise(0, 0.18, 0.55, 600, 0.8, 140); tone(160, 0.05, 0.2, 'square', 0.2, 80); },
  /** Mastermind: case cracked. */
  cracked() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle', 0.28)); tone(1568, 0.38, 0.7, 'sine', 0.22); noise(0.3, 0.3, 0.2, 5000, 2, 9000); },
  /** Mastermind: case goes cold (time ran out). */
  /** Siege: war horn (King's Rally / push-to-talk). */
  horn(short = false) { const d = short ? 0.35 : 1.4; tone(147, 0, d, 'sawtooth', 0.22, short ? 147 : 165); tone(220, 0.02, d, 'sawtooth', 0.12, short ? 220 : 247); tone(294, 0.05, d * 0.9, 'triangle', 0.08); noise(0, d * 0.6, 0.04, 400, 0.5); },
  /** Siege: arrow volley (focus fire). */
  volley() { for (let i = 0; i < 7; i++) noise(i * 0.045, 0.32, 0.16, 2600 - i * 120, 2.5, 700); tone(900, 0.3, 0.06, 'triangle', 0.1); },
  /** Siege: catapult creak + launch. */
  catapult() { noise(0, 0.25, 0.25, 260, 3, 160); tone(110, 0.22, 0.12, 'square', 0.18, 60); noise(0.3, 0.5, 0.12, 900, 0.8, 300); },
  /** Siege: boulder lands on a wall. */
  boulder() { tone(55, 0, 0.6, 'sine', 0.85, 30); noise(0, 0.35, 0.7, 500, 0.6, 120); noise(0.08, 0.6, 0.25, 1800, 1, 400); },
  /** Siege: a wall stone shatters. */
  shatter() { noise(0, 0.08, 0.7, 3200, 1, 900); noise(0.04, 0.5, 0.35, 900, 0.7, 200); tone(80, 0, 0.3, 'sine', 0.5, 40); [0.12, 0.2, 0.31].forEach((t) => noise(t, 0.05, 0.2, 2200, 3)); },
  /** Siege: war drums for a new round. */
  drums() { [0, 0.22, 0.44, 0.8].forEach((t, i) => { tone(i === 3 ? 60 : 75, t, 0.35, 'sine', 0.6, 40); noise(t, 0.08, 0.3, 300, 1); }); },
  /** Siege: victory fanfare on the horns. */
  siegeWin() { [[262, 0], [330, 0.25], [392, 0.5], [523, 0.8]].forEach(([f, t]) => { tone(f, t, 0.5, 'sawtooth', 0.12); tone(f * 1.5, t, 0.45, 'triangle', 0.06); }); tone(523, 1.3, 1.2, 'sawtooth', 0.14); tone(659, 1.3, 1.2, 'triangle', 0.08); },
  /** Siege: defeat, a low drum and a falling horn. */
  siegeLose() { tone(60, 0, 0.8, 'sine', 0.7, 35); tone(196, 0.5, 1.4, 'sawtooth', 0.12, 131); noise(0.4, 2.2, 0.06, 420, 0.5, 260); },
  /** Western duel: the lone standoff whistle (rising, falling, held). */
  standoff() { whistleNote(880, 0, 0.55, 0.2, 1175); whistleNote(1175, 0.6, 0.5, 0.2, 880); whistleNote(660, 1.2, 1.1, 0.18); noise(0, 2.4, 0.05, 500, 0.4, 300); },
  /** Western duel: a dry gust of wind. */
  wind() { noise(0, 1.8, 0.09, 420, 0.5, 900); noise(0.4, 1.4, 0.05, 1600, 0.8, 700); },
  /** Western duel: spurs jingle (someone steps into the street). */
  spurs() { [0, 0.09, 0.42, 0.5].forEach((t, i) => { tone(3200 + i * 140, t, 0.12, 'triangle', 0.06); tone(4700, t + 0.01, 0.08, 'sine', 0.04); }); },
  /** Western duel: bullet whines off something. */
  ricochet() { tone(2600, 0, 0.42, 'sine', 0.18, 700); noise(0, 0.05, 0.35, 3000, 1, 1500); },
  /** Western duel: bullet bites into the wooden post / poster. */
  thunk() { tone(140, 0, 0.12, 'sine', 0.55, 70); noise(0, 0.07, 0.45, 1100, 1.4, 400); noise(0.03, 0.2, 0.12, 2400, 2, 3500); },
  /** Western duel: shield block, steel clang. */
  clang() { [1760, 2350, 3130].forEach((f, i) => tone(f, 0, 0.7 - i * 0.15, 'sine', 0.14)); noise(0, 0.04, 0.4, 5000, 2, 3000); },
  /** Western duel: hammer cocked back. */
  cock() { noise(0, 0.02, 0.45, 3400, 6, 2200); noise(0.11, 0.025, 0.5, 2000, 6, 1300); },
  /** Western duel: saloon register bell for points. */
  register() { tone(2093, 0, 0.6, 'sine', 0.16); tone(3136, 0.02, 0.45, 'sine', 0.08); noise(0, 0.03, 0.2, 4000, 3); },
  /** Western duel: victory phrase on the whistle. */
  westWin() { whistleNote(660, 0, 0.3); whistleNote(880, 0.32, 0.3); whistleNote(1047, 0.64, 0.3); whistleNote(1319, 0.98, 1.0, 0.22, 1319); },
  /** Western duel: defeat, a slow falling whistle and wind. */
  westLose() { whistleNote(784, 0, 0.7, 0.18, 659); whistleNote(587, 0.75, 1.3, 0.16, 440); noise(0.4, 2.2, 0.06, 450, 0.5, 260); },
  /** Western duel: one sharp revolver shot with a short canyon echo. */
  gunshot() { noise(0, 0.09, 0.9, 2600, 0.6, 400); tone(70, 0, 0.32, 'sine', 0.8, 32); noise(0.02, 0.5, 0.25, 900, 0.5, 120); noise(0.32, 0.35, 0.08, 700, 0.6, 150); },
  /** Western duel: hammer falls on an empty chamber. */
  hammer() { noise(0, 0.018, 0.55, 4200, 6, 3000); noise(0.07, 0.022, 0.4, 2600, 6, 1800); },
  /** Western duel: cylinder spins a few clicks. */
  spin() { [0, 0.045, 0.09, 0.14, 0.2, 0.27].forEach((t, i) => noise(t, 0.012, 0.3 - i * 0.035, 3800, 7, 2600)); },
  /** Western duel: far-off church bell for the countdown. */
  bell(low = false) { const f = low ? 196 : 262; tone(f, 0, 1.6, 'sine', 0.35); tone(f * 2.76, 0, 0.9, 'sine', 0.08); tone(f * 5.4, 0, 0.4, 'sine', 0.04); },
  /** Mastermind: the lamp buzzes and stutters on a wrong guess. */
  flicker() { [0, 0.07, 0.16].forEach((t) => noise(t, 0.04, 0.16, 120, 6, 90)); tone(60, 0, 0.3, 'sawtooth', 0.06); },
  /** Mastermind: a letter lights up on the table. */
  reveal() { tone(880, 0, 0.12, 'triangle', 0.22); tone(1320, 0.08, 0.3, 'sine', 0.2); noise(0.02, 0.1, 0.12, 6000, 3, 9000); },
  /** Mastermind: rubber stamp hits the page. */
  stamp() { tone(70, 0, 0.18, 'sine', 0.7, 35); noise(0, 0.09, 0.6, 900, 0.7, 200); },
  /** Mastermind: typewriter key while a clue types out. */
  key() { noise(0, 0.025, 0.25, 3200, 4, 1800); },
  /** Mastermind: emoji reaction pop. */
  pop() { tone(660, 0, 0.07, 'sine', 0.2, 990); },
  cold() { [392, 349, 294].forEach((f, i) => tone(f, i * 0.2, 0.5, 'sine', 0.22)); },
  /** Mastery flair: extra layers on a class ability for tier 3-5 players (cosmetic only). */
  flair(cls: string, tier: number) {
    if (tier < 3) return;
    const big = tier >= 5, mid = tier >= 4;
    const sig: Record<string, () => void> = {
      gambler: () => { const n = 3 + (tier - 3) * 3; for (let i = 0; i < n; i++) tone(2200 + (i % 4) * 330, 0.05 + i * 0.05, 0.12, 'triangle', 0.18); if (big) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3 + i * 0.09, 0.5, 'square', 0.12)); },
      villain: () => { tone(55, 0, 0.9, 'sawtooth', 0.35, 40); noise(0, 0.5, 0.5, 200, 0.8, 80); if (mid) tone(82, 0.1, 1.1, 'square', 0.18, 41); if (big) { tone(98, 0.2, 1.4, 'sawtooth', 0.2, 49); noise(0.3, 0.6, 0.5, 120, 1, 60); } },
      ninja: () => { noise(0, 0.18, 0.5, 4000, 1.4, 900); if (mid) noise(0.12, 0.18, 0.5, 5000, 1.4, 1000); if (big) { noise(0.24, 0.2, 0.5, 6000, 1.4, 1200); tone(1760, 0.3, 0.4, 'sine', 0.12); } },
      hero: () => { [392, 523, 659].forEach((f, i) => tone(f, i * 0.08, 0.4, 'triangle', 0.2)); if (mid) tone(784, 0.28, 0.6, 'triangle', 0.2); if (big) [1047, 1319].forEach((f, i) => tone(f, 0.4 + i * 0.1, 0.8, 'sine', 0.16)); },
      mastermind: () => { [330, 440, 554].forEach((f, i) => tone(f, i * 0.12, 0.5, 'sine', 0.18)); if (big) tone(660, 0.4, 1, 'sine', 0.16); },
      hacker: () => { for (let i = 0; i < 6 + tier * 2; i++) tone(900 + ((i * 337) % 1200), i * 0.04, 0.04, 'square', 0.12); if (big) tone(200, 0.5, 0.3, 'sawtooth', 0.2, 1200); },
      mimic: () => { for (let i = 0; i < 4 + tier; i++) tone(300 + i * 110, i * 0.05, 0.15, 'sine', 0.16, 700 - i * 40); },
      thief: () => { noise(0, 0.15, 0.4, 1500, 1.2, 4000); for (let i = 0; i < tier - 1; i++) tone(2500 + i * 250, 0.12 + i * 0.06, 0.1, 'triangle', 0.16); },
      parasite: () => { tone(110, 0, 0.5, 'sawtooth', 0.25, 50); noise(0.05, 0.4, 0.4, 300, 5, 120); if (big) tone(70, 0.3, 0.7, 'sine', 0.3, 35); },
      oracle: () => { [523, 659, 784, 988, 1175].slice(0, tier).forEach((f, i) => tone(f, i * 0.1, 1, 'sine', 0.14)); },
      wildcard: () => { for (let i = 0; i < 5 + tier; i++) tone(400 + ((i * 523) % 900), i * 0.05, 0.12, 'square', 0.14); },
      jester: () => { [523, 659, 523, 784, 659, 1047].slice(0, 3 + tier - 2).forEach((f, i) => tone(f, i * 0.07, 0.12, 'square', 0.14)); },
    };
    (sig[cls] ?? sig.hero)();
    if (big) tone(60, 0, 0.5, 'sine', 0.4, 36);   // tier 5: a sub-bass hit under everything
  },
  whoosh() { noise(0, 0.3, 0.4, 300, 1, 3000); noise(0.3, 0.3, 0.4, 3000, 1, 300); },
  /** Prize-wheel spin then a stinger: Wildcard chaos. */
  wheel() {
    for (let i = 0; i < 12; i++) tone(1200, i * (0.04 + i * 0.008), 0.03, 'square', 0.14);
    [392, 523, 659, 1047].forEach((f, i) => tone(f, 0.95 + i * 0.07, 0.3, 'sawtooth', 0.2));
  },
  /** Vault slam: heavy thud, chain rattle, lock click. Used when a letter gets locked. */
  lockSlam(delay = 0) {
    tone(70, delay, 0.35, 'sine', 0.6, 38);
    noise(delay, 0.12, 0.6, 500, 0.8, 120);
    for (let i = 0; i < 4; i++) tone(2400 + i * 300, delay + 0.08 + i * 0.045, 0.05, 'square', 0.1);
    tone(1800, delay + 0.3, 0.05, 'square', 0.22); tone(900, delay + 0.34, 0.08, 'square', 0.18);
  },
  /** Low double thump: last seconds on the clock. */
  heartbeat() { tone(60, 0, 0.14, 'sine', 0.7, 42); tone(54, 0.2, 0.18, 'sine', 0.55, 38); },
  /** Doom stinger: a player is eliminated. */
  elimination() {
    [196, 185, 165, 147].forEach((f, i) => tone(f, i * 0.16, 0.5, 'sawtooth', 0.22, f * 0.8));
    tone(55, 0.1, 1.1, 'sine', 0.55, 35);
    noise(0, 0.5, 0.3, 300, 1, 80);
  },
  /** Round-start gong. */
  gong() {
    [110, 164.8, 221, 330, 441].forEach((f, i) => tone(f, 0, 2.0 - i * 0.2, 'sine', 0.3 - i * 0.04, f * 0.985));
    noise(0, 0.1, 0.35, 1500, 0.7);
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

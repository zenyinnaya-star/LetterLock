// All sound is synthesized with the Web Audio API — no asset files.
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

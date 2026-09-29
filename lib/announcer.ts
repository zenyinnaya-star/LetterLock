// Game-show announcer using the browser's built-in speech synthesis (free, works offline, speaks player names).
import { audio } from './audio';
import { getLang, localeOf } from './i18n';
import { getPrefs } from './prefs';

let voice: SpeechSynthesisVoice | null = null;
let voiceLang = '';
let unlocked = false;

// Deep, clear English voices across platforms, best first.
const PREFERRED = [
  /Google UK English Male/i, /Daniel/i, /Microsoft (Guy|Ryan|Christopher|Davis|Andrew|Brian)/i,
  /Alex/i, /Fred/i, /Aaron/i, /Arthur/i, /Male/i, /Google US English/i,
];

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

function pickVoice() {
  const s = synth();
  if (!s) return;
  const lang = getLang();
  voiceLang = lang;
  const all = s.getVoices();
  const voices = all.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  if (lang === 'en') {
    for (const re of PREFERRED) {
      const v = voices.find((x) => re.test(x.name));
      if (v) { voice = v; return; }
    }
  }
  // other languages: prefer a male / Google voice for the game-show feel, else the first match
  voice = voices.find((v) => /male|google/i.test(v.name) && !/female/i.test(v.name)) ?? voices[0] ?? null;
}

if (typeof window !== 'undefined' && synth()) {
  pickVoice();
  synth()!.addEventListener?.('voiceschanged', pickVoice);
}

export const announcer = {
  /** Must run once inside a user gesture (iOS Safari requirement). */
  unlock() {
    const s = synth();
    if (!s || unlocked) return;
    unlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    s.speak(u);
  },
  say(text: string, opts: { delay?: number; urgent?: boolean; hype?: boolean } = {}) {
    const s = synth();
    if (!s || audio.isMuted() || !getPrefs().voice) return;
    const go = () => {
      if (audio.isMuted()) return;
      if (voiceLang !== getLang()) pickVoice();
      if (opts.urgent) s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? localeOf();
      u.rate = opts.hype ? 1.02 : 0.94;
      u.pitch = opts.hype ? 0.85 : 0.72;
      u.volume = 1;
      s.speak(u);
    };
    if (opts.delay) window.setTimeout(go, opts.delay); else go();
  },
  stop() { synth()?.cancel(); },
};

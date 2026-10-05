// Recorded narrator (one voice for everything). Files live in /public/audio/narrator/<key>.mp3.
// If a file is missing the call is a silent no-op, so the game works with or without the clips.
import { getPrefs } from './prefs';

export type NarratorKey =
  | 'cl_ninja' | 'cl_mastermind' | 'cl_hero' | 'cl_villain' | 'cl_hacker' | 'cl_mimic'
  | 'cl_gambler' | 'cl_thief' | 'cl_parasite' | 'cl_oracle' | 'cl_wildcard' | 'cl_jester'
  | 'three' | 'two' | 'one' | 'fight' | 'welcome' | 'choose' | 'round' | 'final' | 'ten' | 'timeup'
  | 'locked' | 'eliminated' | 'victory' | 'defeat' | 'daily' | 'reverse' | 'chaos' | 'memory';

// Higgsfield-hosted clips until they're self-hosted (drop <key>.mp3 in /public/audio/narrator/ and it wins).
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261005_';
const REMOTE: Record<NarratorKey, string> = {
  cl_ninja: '041546_95a8c383-0fd0-4e3b-819d-a2e4ce42d86f.wav',
  cl_mastermind: '041448_9bd38e37-c859-456b-874b-e98d24aca4cb.wav',
  cl_hero: '041448_cf50e8f3-ddec-42f1-a0c8-3dcb2a34c137.wav',
  cl_villain: '041448_dabfada6-c071-4345-bcdc-4fb0b1d9d1d5.wav',
  cl_hacker: '041634_3727f6b2-c49a-4f6f-9466-a6a6d762c090.wav',
  cl_mimic: '041448_750d610d-82aa-40ca-b1b2-e8152c983749.wav',
  cl_gambler: '041546_bc0bdcfa-3dc8-4561-9f88-92ab1ceabba8.wav',
  cl_thief: '041448_109bfa3c-67e1-4179-a16e-46713a82245d.wav',
  cl_parasite: '041547_c15420db-8d11-4753-aaf1-10e7ba1210ad.wav',
  cl_oracle: '041448_53ef84c8-edfa-42e4-a34a-2ca9a9396c26.wav',
  cl_wildcard: '041449_47a57764-03c6-4cee-b0fa-e98ec4e20195.wav',
  cl_jester: '041448_1a47d827-5751-40ba-a522-9d032f808b0e.wav',
  three: '041634_97200197-0723-45d5-90e6-af61b516ca87.wav',
  two: '041634_d1b3562a-e40f-4659-bd4c-b716c085362a.wav',
  one: '041635_1717f508-19c1-43c1-b7e5-16c4bb7ab0f3.wav',
  fight: '041707_2320abb0-2ddf-475b-b7d8-b81bdc9e22cc.wav',
  welcome: '041707_ad7de079-2308-4695-a3d7-c503d5e39a0b.wav',
  choose: '041707_305908fe-8b17-4eee-bc66-3ba59d8bda1d.wav',
  round: '041707_e38fc021-6490-4ceb-b36c-d2749829eb9f.wav',
  final: '042103_f989eebe-acec-4848-93b0-36fc128e2514.wav',
  ten: '041757_e3a8d156-78b9-4485-8653-8c215e6478ca.wav',
  timeup: '042103_39c3c0a7-7aaa-4475-95ab-8a1f576329cd.wav',
  locked: '041757_6d547627-de9e-4b38-8422-66d1f47e6eb1.wav',
  eliminated: '041842_3e86e252-e440-4b0a-a1a8-c055cd7c905e.wav',
  victory: '041927_adb1abf6-765a-438c-b5f7-5354f1a96b5c.wav',
  defeat: '041842_51f124eb-b16a-4984-9f37-d5dda852b5d9.wav',
  daily: '041927_c5d33b68-a6e3-4932-8e4e-e7dd53b04cf5.wav',
  reverse: '041927_e1e34311-4154-4060-97f6-f71b599be388.wav',
  chaos: '042023_6ef2baf2-d822-417b-8912-401e6d309156.wav',
  memory: '042024_8e2c8322-0f85-4221-9824-414934708e40.wav',
};

const cache = new Map<string, HTMLAudioElement | null>();
let current: HTMLAudioElement | null = null;
let broken = false;

function load(key: NarratorKey): HTMLAudioElement | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  if (typeof window === 'undefined') return null;
  const a = new Audio(`/audio/narrator/${key}.mp3`);
  a.preload = 'auto';
  let fell = false;
  a.addEventListener('error', () => {
    if (!fell) { fell = true; a.src = CDN + REMOTE[key]; a.load(); } else cache.set(key, null);
  });
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

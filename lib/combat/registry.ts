// Animation registry: one place that knows which frame/clip serves which combat state.
// Today every state resolves to a pixel-art frame from lib/art.ts; when Higgsfield clips land they are
// registered here (with `clip`) and everything else (controller, camera, VFX) keeps working unchanged.
import { ENEMY_PIXEL, ENEMY_SPRITE, ENEMY_STRIKE, HERO_BACK, HERO_CAST, HERO_SPRITE, HERO_STRIKE, HERO_WIN, HURT } from '@/lib/art';

export type AnimState = 'IDLE' | 'READY' | 'ATTACK' | 'HEAVY_ATTACK' | 'CRITICAL_ATTACK' | 'SKILL' | 'GUARD' | 'HURT' | 'DEFEAT' | 'VICTORY' | 'ULTIMATE_INTRO' | 'ULTIMATE_ATTACK' | 'LEVEL_UP' | 'BREAK';
export type CameraPreset = 'IDLE' | 'FOCUS_ENEMY' | 'FOCUS_PLAYER' | 'ATTACK_SWING' | 'HEAVY_ATTACK' | 'CRITICAL' | 'BREAK' | 'ULTIMATE_INTRO' | 'ULTIMATE_ATTACK' | 'VICTORY';

export type AnimMeta = {
  id: string; character: string; action: AnimState; duration: number; playbackSpeed: number;
  fallback?: AnimState; cameraPreset?: CameraPreset; vfxPreset?: string; sfxPreset?: string; priority: number;
  frame?: string; clip?: string; // frame = still pose, clip = optional video (versioned, e.g. kira_attack_v01)
};

export const PRIORITY: Record<AnimState, number> = { ULTIMATE_INTRO: 9, ULTIMATE_ATTACK: 9, BREAK: 8, CRITICAL_ATTACK: 7, SKILL: 6, HEAVY_ATTACK: 5, ATTACK: 4, GUARD: 3, HURT: 2, LEVEL_UP: 2, VICTORY: 2, DEFEAT: 2, READY: 1, IDLE: 0 };

const DEFAULTS: Record<AnimState, Pick<AnimMeta, 'duration' | 'playbackSpeed' | 'fallback' | 'cameraPreset' | 'vfxPreset' | 'sfxPreset'>> = {
  IDLE: { duration: 1200, playbackSpeed: 1 },
  READY: { duration: 400, playbackSpeed: 1, fallback: 'IDLE', cameraPreset: 'FOCUS_PLAYER' },
  ATTACK: { duration: 650, playbackSpeed: 1, fallback: 'IDLE', cameraPreset: 'ATTACK_SWING', vfxPreset: 'slash', sfxPreset: 'hit' },
  HEAVY_ATTACK: { duration: 800, playbackSpeed: 1, fallback: 'ATTACK', cameraPreset: 'HEAVY_ATTACK', vfxPreset: 'slash-heavy', sfxPreset: 'hit' },
  CRITICAL_ATTACK: { duration: 1100, playbackSpeed: 1, fallback: 'ATTACK', cameraPreset: 'CRITICAL', vfxPreset: 'letters-streak', sfxPreset: 'crit' },
  SKILL: { duration: 900, playbackSpeed: 1, fallback: 'ATTACK', cameraPreset: 'FOCUS_ENEMY', vfxPreset: 'letters-orbit', sfxPreset: 'cast' },
  GUARD: { duration: 700, playbackSpeed: 1, fallback: 'IDLE', vfxPreset: 'shield', sfxPreset: 'block' },
  HURT: { duration: 450, playbackSpeed: 1, fallback: 'IDLE', sfxPreset: 'hit' },
  DEFEAT: { duration: 900, playbackSpeed: 1, fallback: 'HURT' },
  VICTORY: { duration: 1600, playbackSpeed: 1, fallback: 'IDLE', cameraPreset: 'VICTORY' },
  ULTIMATE_INTRO: { duration: 1100, playbackSpeed: 1, fallback: 'SKILL', cameraPreset: 'ULTIMATE_INTRO', vfxPreset: 'letters-buildup', sfxPreset: 'ult' },
  ULTIMATE_ATTACK: { duration: 1300, playbackSpeed: 1, fallback: 'CRITICAL_ATTACK', cameraPreset: 'ULTIMATE_ATTACK', vfxPreset: 'letters-fill', sfxPreset: 'ult' },
  LEVEL_UP: { duration: 1200, playbackSpeed: 1, fallback: 'VICTORY' },
  BREAK: { duration: 1000, playbackSpeed: 1, fallback: 'HURT', cameraPreset: 'BREAK', vfxPreset: 'letters-shatter', sfxPreset: 'break' },
};

// pose sources per state (what art exists today); missing entries fall through `fallback`
function frameFor(name: string, isHero: boolean, a: AnimState): string | undefined {
  if (isHero) switch (a) {
    case 'IDLE': case 'READY': return HERO_SPRITE[name];
    case 'ATTACK': case 'HEAVY_ATTACK': case 'CRITICAL_ATTACK': return HERO_STRIKE[name];
    case 'SKILL': case 'ULTIMATE_INTRO': case 'ULTIMATE_ATTACK': case 'GUARD': return HERO_CAST[name];
    case 'HURT': case 'DEFEAT': return HURT[name];
    case 'VICTORY': case 'LEVEL_UP': return HERO_WIN[name];
  } else switch (a) {
    case 'IDLE': case 'READY': return ENEMY_PIXEL[name] ?? ENEMY_SPRITE[name];
    case 'ATTACK': case 'HEAVY_ATTACK': case 'CRITICAL_ATTACK': case 'SKILL': return ENEMY_STRIKE[name];
    case 'HURT': case 'DEFEAT': case 'BREAK': return HURT[name];
  }
  return undefined;
}
export const heroBack = (name: string) => HERO_BACK[name];

/** Resolve a state to concrete metadata, walking fallbacks until something exists. Never throws, never returns empty. */
export function resolveAnim(name: string, isHero: boolean, want: AnimState): AnimMeta {
  let a: AnimState | undefined = want; let guard = 0;
  while (a && guard++ < 6) {
    const frame = frameFor(name, isHero, a);
    if (frame || a === 'IDLE') {
      const d = DEFAULTS[want]; // camera/vfx/sfx stay those of the REQUESTED state even when the frame falls back
      return { id: `${name.toLowerCase()}_${want.toLowerCase()}_v01`, character: name, action: a, priority: PRIORITY[want], frame, ...d };
    }
    a = DEFAULTS[a].fallback;
  }
  return { id: `${name}_idle`, character: name, action: 'IDLE', priority: 0, frame: frameFor(name, isHero, 'IDLE'), ...DEFAULTS.IDLE };
}

/** Preload only what this encounter needs, in priority order. */
export function preloadFor(heroes: string[], enemies: string[]) {
  const urls: string[] = [];
  const add = (n: string, h: boolean, s: AnimState[]) => s.forEach((x) => { const f = frameFor(n, h, x); if (f && !urls.includes(f)) urls.push(f); });
  heroes.forEach((n) => add(n, true, ['IDLE', 'ATTACK', 'HURT']));
  enemies.forEach((n) => add(n, false, ['IDLE', 'HURT', 'ATTACK']));
  heroes.forEach((n) => add(n, true, ['SKILL', 'VICTORY']));
  urls.forEach((src) => { const i = new Image(); i.src = src; });
}

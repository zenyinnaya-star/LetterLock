// Per-character combat identity (presentation + Break synergy). Add a hero here and the whole
// camera / letter-VFX / label pipeline picks it up. Higgsfield clips are registered separately in registry.ts.
export type HeroProfile = {
  glow: string; core: string;            // letter colours
  popKind: 'pop' | 'orbit' | 'streak';   // how an ordinary good word looks
  cam: { amp: number; speed: number };   // camera personality: amplitude and tempo (>1 = faster)
  ult: string;                           // ultimate title card
  breakBonus: (w: { long: boolean; rare: boolean; weak: boolean; crit: boolean; len: number }) => number; // class-flavoured Break fill
};

export const HERO_PROFILE: Record<string, HeroProfile> = {
  Shiro: { glow: '#38bdf8', core: '#e0f2fe', popKind: 'streak', cam: { amp: 1.1, speed: 1.35 }, ult: 'GALE OF WORDS',
    breakBonus: (w) => (w.crit ? 1 : 0) + (w.len <= 5 ? 1 : 0) },                         // fast striker: short, sharp words chain Break
  Nero:  { glow: '#94a3b8', core: '#f1f5f9', popKind: 'pop', cam: { amp: 1.25, speed: .8 }, ult: 'IRON LEXICON',
    breakBonus: (w) => (w.long ? 1 : 0) + (w.len >= 8 ? 1 : 0) },                          // tank: long words hit like a wall
  Kira:  { glow: '#f43f5e', core: '#ffe4e6', popKind: 'orbit', cam: { amp: 1, speed: 1.15 }, ult: 'HIGH ROLLER',
    breakBonus: (w) => (w.rare ? 2 : 0) },                                                  // luck & utility: rare letters are her jackpot
  Mira:  { glow: '#34d399', core: '#ecfdf5', popKind: 'orbit', cam: { amp: .7, speed: .85 }, ult: 'SONG OF MENDING',
    breakBonus: (w) => (w.weak ? 1 : 0) + (w.long ? 1 : 0) },                              // seer: reads the weakness
  Prince:{ glow: '#fbbf24', core: '#fffbeb', popKind: 'streak', cam: { amp: 1.15, speed: .95 }, ult: 'ROYAL DECREE',
    breakBonus: (w) => (w.crit ? 1 : 0) + (w.weak ? 1 : 0) },                              // commander: decisive finishes
};
export const DEFAULT_PROFILE: HeroProfile = { glow: '#f59e0b', core: '#fff6d0', popKind: 'pop', cam: { amp: 1, speed: 1 }, ult: 'ALL-OUT', breakBonus: () => 0 };

// enemy intro title cards + how tough their Break is
export const ENEMY_PROFILE: Record<string, { title: string; breakMax: number }> = {
  'Intern Auditor': { title: 'The Fresh Audit', breakMax: 5 },
  'Filer Alpha': { title: 'Form 1 of 2', breakMax: 5 },
  'Filer Beta': { title: 'Form 2 of 2', breakMax: 5 },
  'Clerk': { title: 'Please Take a Number', breakMax: 5 },
  'Bailiff': { title: 'Enforcer of the Writ', breakMax: 7 },
  'Tax Drone': { title: 'Automated Assessment', breakMax: 6 },
  'The Collector': { title: 'Debt Never Sleeps', breakMax: 8 },
  'The Commissioner': { title: 'Head of the Revenue Office', breakMax: 9 },
  'Government': { title: 'The Final Audit', breakMax: 12 },
};

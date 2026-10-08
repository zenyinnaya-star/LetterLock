// Per-character combat identity (presentation + Break synergy). Add a hero here and the whole
// camera / letter-VFX / label pipeline picks it up. Higgsfield clips are registered separately in registry.ts.
export type WordCtx = { long: boolean; rare: boolean; weak: boolean; crit: boolean; len: number; speed?: number };
export type HeroProfile = {
  glow: string; core: string;            // letter colours
  popKind: 'pop' | 'orbit' | 'streak';   // how an ordinary good word looks
  cam: { amp: number; speed: number };   // camera personality: amplitude and tempo (>1 = faster)
  ult: string;                           // ultimate title card
  mechanic: string;                      // one-line description of the class's word mechanic, shown once on pick
  breakBonus: (w: WordCtx) => number;     // class-flavoured Break fill
  scoreBonus: (w: WordCtx) => number;     // 0-0.3ish nudge to WordScore.finalScore — the actual "words play differently per class"
  tag?: (w: WordCtx) => string | undefined; // short combat-log flavour tag when the class mechanic procs (e.g. "COUNTER READY")
};

export const HERO_PROFILE: Record<string, HeroProfile> = {
  // Fast Striker: speed is his whole kit. Short words (<=5) score like a rogue's quick strike;
  // every one landed also stacks SPEED SURGE, a flavour tag the UI shows (real dodge/haste bonus is server-side).
  Shiro: { glow: '#38bdf8', core: '#e0f2fe', popKind: 'streak', cam: { amp: 1.1, speed: 1.35 }, ult: 'GALE OF WORDS',
    mechanic: 'Short words (5 letters or fewer) score higher and chain Break fastest.',
    breakBonus: (w) => (w.crit ? 1 : 0) + (w.len <= 5 ? 1 : 0),
    scoreBonus: (w) => (w.len > 0 && w.len <= 5 ? 0.18 : 0),
    tag: (w) => (w.len <= 4 ? 'SPEED SURGE' : undefined) },
  // Tank: wears the enemy down with long, heavy words; short words do nothing special for him.
  Nero:  { glow: '#94a3b8', core: '#f1f5f9', popKind: 'pop', cam: { amp: 1.25, speed: .8 }, ult: 'IRON LEXICON',
    mechanic: 'Long words (8+ letters) hit like a wall and fill Break fastest.',
    breakBonus: (w) => (w.long ? 1 : 0) + (w.len >= 8 ? 1 : 0),
    scoreBonus: (w) => (w.len >= 8 ? 0.22 : w.long ? 0.1 : 0),
    tag: (w) => (w.len >= 8 ? 'BULWARK' : undefined) },
  // Luck & utility: rare letters are her jackpot — a gambler's variance made literal.
  Kira:  { glow: '#f43f5e', core: '#ffe4e6', popKind: 'orbit', cam: { amp: 1, speed: 1.15 }, ult: 'HIGH ROLLER',
    mechanic: 'Rare letters (J Q X Z K V W Y) pay out the most — her words gamble for bigger scores.',
    breakBonus: (w) => (w.rare ? 2 : 0),
    scoreBonus: (w) => (w.rare ? 0.25 : 0),
    tag: (w) => (w.rare ? 'JACKPOT' : undefined) },
  // Seer & healer: reads what the enemy fears — weakness words are her specialty, length helps the read.
  Mira:  { glow: '#34d399', core: '#ecfdf5', popKind: 'orbit', cam: { amp: .7, speed: .85 }, ult: 'SONG OF MENDING',
    mechanic: 'Hitting an enemy weakness scores far higher for her, and heals scale with word length.',
    breakBonus: (w) => (w.weak ? 1 : 0) + (w.long ? 1 : 0),
    scoreBonus: (w) => (w.weak ? 0.2 : 0) + (w.long ? 0.08 : 0),
    tag: (w) => (w.weak ? 'INSIGHT' : undefined) },
  // Commander: every word is a decisive order — crits and weaknesses both score well, nothing is wasted.
  Prince:{ glow: '#fbbf24', core: '#fffbeb', popKind: 'streak', cam: { amp: 1.15, speed: .95 }, ult: 'ROYAL DECREE',
    mechanic: 'Crits and weakness hits both score extra — his words are always a decisive order.',
    breakBonus: (w) => (w.crit ? 1 : 0) + (w.weak ? 1 : 0),
    scoreBonus: (w) => (w.crit ? 0.15 : 0) + (w.weak ? 0.15 : 0),
    tag: (w) => (w.crit && w.weak ? 'DECREE' : undefined) },
};
export const DEFAULT_PROFILE: HeroProfile = { glow: '#f59e0b', core: '#fff6d0', popKind: 'pop', cam: { amp: 1, speed: 1 }, ult: 'ALL-OUT', mechanic: '', breakBonus: () => 0, scoreBonus: () => 0 };

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

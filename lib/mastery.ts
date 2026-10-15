import type { PlayerClass } from './types';

/** Class XP needed for tiers 1..5 (must match _mastery_tier in migration 076). */
export const TIER_XP = [0, 100, 300, 700, 1500];

export const TIER_NAMES: Record<PlayerClass, [string, string, string, string, string]> = {
  ninja: ['Shinobi', 'Squire', 'Senior Ninja', 'Shadow-Lurker', 'Oni'],
  hero: ['Sidekick', 'Hero', 'Champion', 'Legend', 'Living Legend'],
  villain: ['Henchman', 'Schemer', 'Villain', 'Archvillain', 'Dread Lord'],
  mastermind: ['Apprentice', 'Planner', 'Strategist', 'Mastermind', 'Grand Architect'],
  hacker: ['Script Kiddie', 'Cracker', 'Hacker', 'Black Hat', 'Root'],
  mimic: ['Parrot', 'Copycat', 'Impostor', 'Shapeshifter', 'Doppelganger'],
  gambler: ['Rookie', 'Card Sharp', 'High Roller', 'Whale', 'Lucky Legend'],
  thief: ['Pickpocket', 'Burglar', 'Cat Burglar', 'Master Thief', 'Phantom'],
  parasite: ['Tick', 'Leech', 'Parasite', 'Host-Eater', 'Plague'],
  oracle: ['Initiate', 'Seer', 'Oracle', 'Prophet', 'Omniscient'],
  wildcard: ['Fresh Face', 'Wildling', 'Wildcard', 'Chaos Agent', 'Entropy'],
  jester: ['Fool', 'Prankster', 'Jester', 'Trickster', 'Court Legend'],
};

export interface ClassMastery { class: PlayerClass; xp: number; games: number; wins: number; tier: number }
export interface Mastery {
  classes: ClassMastery[]; longest_word: string | null; win_streak: number; best_win_streak: number;
  modes: Record<string, number>; badge: string | null;
}

export const tierOf = (xp: number) => TIER_XP.reduce((t, need, i) => (xp >= need ? i + 1 : t), 1);
export const tierName = (c: PlayerClass, tier: number) => TIER_NAMES[c]?.[Math.min(5, Math.max(1, tier)) - 1] ?? '';
export const nextTierXp = (xp: number) => TIER_XP.find((n) => n > xp) ?? null;
/** 'ninja:3' → 'Senior Ninja'. Tier 1 is the starting rank, so only 2+ can be worn. */
export function badgeLabel(badge: string | null | undefined): string | null {
  if (!badge) return null;
  const [c, t] = badge.split(':');
  return tierName(c as PlayerClass, Number(t)) || null;
}

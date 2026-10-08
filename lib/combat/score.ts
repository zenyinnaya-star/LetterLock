// WordScore: turns a resolved word into a tier + rank so the UI can celebrate it. The server stays
// authoritative for damage; this is the presentation read of the same result.
import { isLong, isRare } from './events';

export type Tier = 'FAIL' | 'NORMAL' | 'GOOD' | 'GREAT' | 'CRITICAL' | 'PERFECT';
export type Rank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
export type WordScore = { correctness: number; speedBonus: number; lengthBonus: number; rarityBonus: number; weaknessBonus: number; comboBonus: number; finalScore: number; tier: Tier; rank: Rank };

export function scoreWord(i: { word?: string; ok: boolean; crit?: boolean; weak?: boolean; ult?: boolean; combo: number; speed?: number }): WordScore {
  const w = i.word ?? '';
  const correctness = i.ok ? 1 : 0;
  const lengthBonus = Math.min(1, Math.max(0, (w.length - 3) / 6));
  const rarityBonus = isRare(w) ? 1 : (w.match(/[jqxzkvwy]/gi)?.length ? 0.5 : 0);
  const weaknessBonus = i.weak ? 1 : 0;
  const comboBonus = Math.min(1, i.combo / 8);
  const speedBonus = i.speed ?? 0; // wired when the Book reports answer time
  const finalScore = correctness * (0.25 + 0.25 * lengthBonus + 0.15 * rarityBonus + 0.2 * weaknessBonus + 0.1 * comboBonus + 0.05 * speedBonus + (i.crit ? 0.25 : 0) + (i.ult ? 0.4 : 0));
  const tier: Tier = !i.ok ? 'FAIL' : i.ult ? 'PERFECT' : i.crit ? 'CRITICAL' : finalScore >= 0.6 ? 'GREAT' : finalScore >= 0.42 ? 'GOOD' : 'NORMAL';
  const rank: Rank = !i.ok ? 'D' : finalScore >= 0.95 ? 'SS' : finalScore >= 0.75 ? 'S' : finalScore >= 0.58 ? 'A' : finalScore >= 0.42 ? 'B' : 'C';
  return { correctness, speedBonus, lengthBonus, rarityBonus, weaknessBonus, comboBonus, finalScore, tier, rank };
}
export { isLong, isRare };

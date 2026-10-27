/** Only Classic is playable for now. Locked unless NEXT_PUBLIC_CLASSIC_ONLY is exactly 'false' (set only on the QA preview branch). */
export const CLASSIC_ONLY = false; // QA BRANCH ONLY: never merge this line into vault-heist or main
/** Entry kinds the class-select page accepts that start Classic. */
export const CLASSIC_KINDS = ['create', 'join'];
export function isClassicKind(kind: string | null | undefined): boolean {
  return !CLASSIC_ONLY || CLASSIC_KINDS.includes(kind ?? 'create');
}
/** True when a room's settings describe a non-Classic mode (duel, team/siege, twists). */
export function isLockedRoom(s?: { mode?: string; twist?: string } | null): boolean {
  if (!CLASSIC_ONLY || !s) return false;
  return (!!s.mode && s.mode !== 'classic') || (!!s.twist && s.twist !== 'none');
}

const MESSAGES: Record<string, string> = {
  BAD_NAME: 'Pick a name between 1 and 20 characters.',
  CLASS_REQUIRED: 'Pick a class first.',
  ROOM_NOT_FOUND: "That room doesn't exist. Check the code.",
  GAME_IN_PROGRESS: 'That game already started — you can watch as a spectator.',
  ROOM_FULL: 'That room is full (8 players max).',
  NAME_TAKEN: 'Someone in the room already has that name.',
  BAD_TOKEN: 'Your seat in this room was lost. Rejoin from the home page.',
  NOT_HOST: 'Only the host can do that.',
  NEED_TWO_PLAYERS: 'You need at least 2 players to start.',
  WRONG_PHASE: "You can't do that right now.",
  TIME_UP: "Time's up for this round.",
  ELIMINATED: "You're out — spectating now.",
  TARGET_NOT_FOUND: 'Pick a player.',
  CANNOT_TARGET_SELF: "You can't target yourself.",
  TARGET_ELIMINATED: 'That player is already out.',
  BAD_LETTER: 'Pick a letter A–Z.',
  ALREADY_GUESSED: 'You already guessed this round.',
  ALREADY_REVEALED: "That letter's already been cracked — pick another.",
  CARD_NOT_AVAILABLE: "That card isn't available.",
  VILLAIN_NO_SHIELD: "Villains can't use Shields.",
  NOTHING_TO_BLOCK: 'Nothing is aimed at you to block.',
  AT_MINIMUM: 'You already have just 1 letter — nothing to cleanse.',
  PERK_USED: "You've already used your perk.",
  PERK_NOT_READY: 'Ninja vision unlocks from round 3.',
  NOTHING_TO_ABSORB: 'Nothing is aimed at that player.',
  NO_ACTIVE_PERK: 'The Villain perk is passive — your attacks hit twice as hard.',
};

export const REASONS: Record<string, string> = {
  BLANK: 'No answer',
  NOT_LETTERS: 'Letters only',
  TOO_SHORT: 'Too short (3+ letters)',
  NOT_A_WORD: 'Not in the dictionary',
  REPEAT: 'Already used that word',
  BANNED_LETTER: 'Used a banned letter',
};

export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err
    ? String((err as { message: unknown }).message) : String(err);
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return MESSAGES[code];
  if (/fetch|network/i.test(raw)) return 'Connection problem — retrying…';
  return 'Something went wrong. Try again.';
}

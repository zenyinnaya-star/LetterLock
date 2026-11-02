import { supabase } from './supabase';

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface MmPlayer { id: string; name: string; points: number; hp: number; out: boolean; is_host: boolean; is_mastermind: boolean; sitting?: boolean;
  /** migration 099: only true once the round is over */ is_impostor?: boolean; voted?: boolean; votes?: number | null; lazy_count?: number; caught_count?: number; fooled_count?: number }
export interface MmState {
  room: { code: string; status: 'lobby' | 'round' | 'between' | 'finished'; quick: boolean; round: number; total_rounds: number;
    round_secs: number; round_ends: number | null; between_until: number | null; server_now: number; clues_left: number; clue_limit: number;
    solved_by: string | null; mastermind_id: string | null; can_reveal?: boolean;
    /** migration 099 (Impostor): revealed only when the round ends */ impostor_id?: string | null; accused_id?: string | null; caught?: boolean | null; lazy?: boolean; decoys_left?: number; min_players?: number };
  me: { id: string; name: string; is_host: boolean; hp: number; out: boolean; points: number; is_mastermind: boolean; backing: string | null; sitting?: boolean;
    role?: 'mastermind' | 'impostor' | 'detective' | null; is_impostor?: boolean; vote?: string | null };
  word: string | null;
  players: MmPlayer[];
  clues: string[];
  guesses: { player_id: string; text: string; correct: boolean; hits?: number; near?: number; hit_pos?: number[]; decoy?: boolean | null }[];
  /** v2 (migration 078): one entry per letter, null while hidden. Missing on older servers. */
  slots?: (string | null)[];
  reacts?: { id: number; player_id: string; emoji: string }[];
}
export const REACTIONS = ['😱', '🤔', '🔥', '😂', '🕵️', '👀'] as const;
export interface MmJoin { code: string; token: string; player_id: string }

/** Profile photos live in their own calls so an older server (without migration 098) just shows initials. */
export const mmAvatars = {
  set: (token: string, url: string | null) => call<void>('mm_set_avatar', { p_token: token, p_url: url }),
  get: async (token: string): Promise<Record<string, string>> => {
    const rows = await call<{ player_id: string; avatar_url: string }[]>('mm_avatars', { p_token: token });
    return Object.fromEntries((rows ?? []).map((r) => [r.player_id, r.avatar_url]));
  },
};

export const mm = {
  create: (name: string, quick: boolean) => call<MmJoin>('mm_create', { p_name: name, p_quick: quick }),
  join: (code: string, name: string) => call<MmJoin>('mm_join', { p_code: code, p_name: name }),
  start: (token: string) => call<void>('mm_start', { p_token: token }),
  clue: (token: string, text: string) => call<void>('mm_clue', { p_token: token, p_text: text }),
  guess: (token: string, text: string) => call<{ correct: boolean }>('mm_guess', { p_token: token, p_text: text }),
  back: (token: string, target: string) => call<void>('mm_back', { p_token: token, p_target: target }),
  sit: (token: string, sit: boolean) => call<{ sitting: boolean }>('mm_sit', { p_token: token, p_sit: sit }),
  again: (token: string) => call<void>('mm_again', { p_token: token }),
  reveal: (token: string) => call<{ pos: number }>('mm_reveal', { p_token: token }),
  leave: (token: string) => call<void>('mm_leave', { p_token: token }),
  kick: (token: string, target: string) => call<void>('mm_kick', { p_token: token, p_target: target }),
  vote: (token: string, target: string) => call<void>('mm_vote', { p_token: token, p_target: target }),
  react: (token: string, emoji: string) => call<void>('mm_react', { p_token: token, p_emoji: emoji }),
  state: (token: string) => call<MmState>('mm_state', { p_token: token }),
};

const key = (code: string) => `letterlock:mm:${code.toUpperCase()}`;
export function saveToken(code: string, token: string) { try { localStorage.setItem(key(code), token); } catch { /* private mode */ } }
export function loadToken(code: string): string | null { try { return localStorage.getItem(key(code)); } catch { return null; } }

export function mmError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const map: Record<string, string> = {
    REVEALS_WORD: 'That clue gives the word away. Try describing it differently.',
    NO_CLUES_LEFT: 'No clues left this round.', MAX_REVEALS: 'You already revealed as many letters as allowed.',
    'Could not find the function': 'This needs the latest database update.', ROOM_NOT_FOUND: 'No room with that code.', ROOM_FULL: 'Room is full.',
    ALREADY_STARTED: 'That game already started.', NEED_PLAYERS: 'A case needs at least 4 detectives.', WAIT_FOR_CLUES: 'Wait for the Mastermind to post two clues first.', DECOY_LIMIT: 'No decoys left this round.', BAD_TARGET: "You can't point at that person.", NAME: 'Enter a name first.',
    NOT_ALLOWED: "You can't do that right now.", EMPTY: 'Type something first.', BAD_TOKEN: 'Session expired. Rejoin the room.', REMOVED: 'You were removed from this case.', NOT_HOST: 'Only the host can do that.',
  };
  for (const k of Object.keys(map)) if (m.includes(k)) return map[k];
  return 'Something went wrong. Try again.';
}

/** Rules shown in the room's Rules panel and on the How to Play page. */
export const MM_RULES: { h: string; t: string }[] = [
  { h: 'The goal', t: 'The Mastermind hides a secret word and drops clues. Detectives crack it before the clock runs out.' },
  { h: 'Mastermind', t: 'Post clear clues (never the word itself). A case that gets solved pays you. Saying little never pays, and a cold case you barely helped costs you points.' },
  { h: 'Detectives', t: 'Guessing opens once two clues are posted. A guess shows how many letters are in the right place and how many are elsewhere. Each wrong guess costs a life.' },
  { h: 'The Impostor', t: 'One detective is secretly the Impostor. They know the word and can post two decoy guesses that look real but lie. Decoys cost them no life.' },
  { h: 'Voting', t: 'Spot the liar? Tap the ballot on a detective during the round. Naming the Impostor earns points. The most-voted player is accused when the round ends.' },
  { h: 'Winning', t: 'Fastest solver scores most. The Impostor scores when nobody catches them. Most points after every round wins.' },
  { h: 'The room', t: 'Four to eight players. If the host leaves, the next player becomes host. The host can remove anyone with the ✕ on their photo.' },
];

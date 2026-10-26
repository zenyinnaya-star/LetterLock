import { supabase } from './supabase';

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface MmPlayer { id: string; name: string; points: number; hp: number; out: boolean; is_host: boolean; is_mastermind: boolean; sitting?: boolean }
export interface MmState {
  room: { code: string; status: 'lobby' | 'round' | 'between' | 'finished'; quick: boolean; round: number; total_rounds: number;
    round_secs: number; round_ends: number | null; between_until: number | null; server_now: number; clues_left: number; clue_limit: number;
    solved_by: string | null; mastermind_id: string | null; can_reveal?: boolean };
  me: { id: string; name: string; is_host: boolean; hp: number; out: boolean; points: number; is_mastermind: boolean; backing: string | null; sitting?: boolean };
  word: string | null;
  players: MmPlayer[];
  clues: string[];
  guesses: { player_id: string; text: string; correct: boolean; hits?: number; near?: number; hit_pos?: number[] }[];
  /** v2 (migration 078): one entry per letter, null while hidden. Missing on older servers. */
  slots?: (string | null)[];
  reacts?: { id: number; player_id: string; emoji: string }[];
}
export const REACTIONS = ['😱', '🤔', '🔥', '😂', '🕵️', '👀'] as const;
export interface MmJoin { code: string; token: string; player_id: string }

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
    ALREADY_STARTED: 'That game already started.', NEED_PLAYERS: 'Need at least 2 players.', NAME: 'Enter a name first.',
    NOT_ALLOWED: "You can't do that right now.", EMPTY: 'Type something first.', BAD_TOKEN: 'Session expired. Rejoin the room.',
  };
  for (const k of Object.keys(map)) if (m.includes(k)) return map[k];
  return 'Something went wrong. Try again.';
}

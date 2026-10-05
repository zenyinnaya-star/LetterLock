import { supabase } from './supabase';
import type { CardKind, PlayerClass, RoomSettings, RoomState } from './types';

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface GameStat {
  player_id: string; name: string; points: number; correct: number; wrong: number;
  best_streak: number; fastest_ms: number | null; bonus: number; hits: number; shots: number;
  xp_gained: number; xp_after: number | null; new_ach: string[]; bot: boolean; linked: boolean;
}
export interface JoinResult { code: string; player_id: string; token: string }

export const rpc = {
  createRoom: (name: string, cls: PlayerClass) => call<JoinResult>('create_room', { p_name: name, p_class: cls }),
  joinRoom: (code: string, name: string, cls: PlayerClass) =>
    call<JoinResult>('join_room', { p_code: code, p_name: name, p_class: cls }),
  getState: (code: string, token: string | null) =>
    call<RoomState>('get_room_state', { p_code: code, p_token: token }),
  getRoomId: (code: string) => call<string | null>('get_room_id', { p_code: code }),
  setClass: (token: string, cls: PlayerClass) => call<void>('set_class', { p_token: token, p_class: cls }),
  leave: (token: string) => call<void>('leave_room', { p_token: token }),
  heartbeat: (token: string) => call<void>('heartbeat', { p_token: token }),
  start: (token: string) => call<void>('start_game', { p_token: token }),
  answer: (token: string, word: string) =>
    call<{ word: string; valid: boolean; reason: string | null; points: number; letter: string | null;
      bonus?: number; speed_bonus?: number; streak_bonus?: number; streak?: number; elapsed_ms?: number | null }>(
      'submit_answer', { p_token: token, p_word: word }),
  guess: (token: string, targetId: string, letter: string) =>
    call<{ correct: boolean; card: CardKind | null; letter: string }>(
      'submit_guess', { p_token: token, p_target_id: targetId, p_letter: letter }),
  playCard: (token: string, cardId: number, targetId: string | null) =>
    call<{ kind: CardKind; removed: string | null; amount: number | null }>(
      'play_card', { p_token: token, p_card_id: cardId, p_target_id: targetId }),
  usePerk: (token: string, targetId: string | null) =>
    call<Record<string, unknown>>('use_perk', { p_token: token, p_target_id: targetId }),
  reactReady: (token: string) => call<void>('react_ready', { p_token: token }),
  advance: (code: string) => call<{ ok: boolean; phase?: string; reason?: string }>('advance_phase', { p_code: code }),
  playAgain: (token: string) => call<void>('play_again', { p_token: token }),
  updateSettings: (token: string, settings: Partial<RoomSettings>) =>
    call<RoomSettings>('update_settings', { p_token: token, p_settings: settings }),
  setAvatar: (token: string, url: string | null) => call<void>('set_avatar', { p_token: token, p_url: url }),
  teamJoin: (token: string, idx: number | null) => call<void>('team_join', { p_token: token, p_idx: idx }),
  teamUpdate: (token: string, name: string | null, imageUrl: string | null, clearImage = false) =>
    call<void>('team_update', { p_token: token, p_name: name, p_image_url: imageUrl, p_clear_image: clearImage }),
  teamLeader: (token: string, playerId: string) =>
    call<void>('team_set_leader', { p_token: token, p_player_id: playerId }),
  addBot: (token: string, level: number, style = 0) => call<{ player_id: string; name: string }>('add_bot', { p_token: token, p_level: level, p_style: style }),
  setBot: (token: string, botId: string, level: number, style: number) => call<void>('set_bot', { p_token: token, p_bot_id: botId, p_level: level, p_style: style }),
  removeBot: (token: string, botId: string) => call<void>('remove_bot', { p_token: token, p_bot_id: botId }),
  botTick: (token: string) => call<{ bots: string[]; info?: Record<string, { l: number; s: number }> }>('bot_tick', { p_token: token }),
  gameStats: (code: string) => call<GameStat[]>('get_game_stats', { p_code: code }),
  trace: (token: string, suspectId: string) =>
    call<{ caught: boolean }>('trace_hacker', { p_token: token, p_suspect_id: suspectId }),
};

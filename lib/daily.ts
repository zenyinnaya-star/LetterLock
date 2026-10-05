import { supabase } from './supabase';

export interface DailyInfo {
  day: string; prompt: string; banned: string; seconds: number; now: string;
  status: 'new' | 'playing' | 'done'; ends_at: string | null; score: number; name: string | null;
  words: { word: string; points: number }[];
  board: { name: string; score: number; words: number; me: boolean }[];
  rank: number | null;
}
export interface DailyAnswer { word: string; valid: boolean; reason: string | null; points: number; score: number; words: number }

const KEY = 'letterlock.daily.key';
const STREAK = 'letterlock.daily.streak';

export function dailyKey(): string {
  try {
    let k = window.localStorage.getItem(KEY);
    if (!k) { k = crypto.randomUUID(); window.localStorage.setItem(KEY, k); }
    return k;
  } catch { return '00000000-0000-4000-8000-000000000000'; }
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const daily = {
  info: () => call<DailyInfo>('daily_info', { p_key: dailyKey() }),
  start: (name: string) => call<DailyInfo>('daily_start', { p_key: dailyKey(), p_name: name }),
  answer: (word: string) => call<DailyAnswer>('daily_answer', { p_key: dailyKey(), p_word: word }),
  finish: () => call<DailyInfo>('daily_finish', { p_key: dailyKey() }),
};

/** Consecutive days with a finished daily (kept in this browser only). */
export function recordStreak(day: string): number {
  try {
    const raw = window.localStorage.getItem(STREAK);
    const s = raw ? (JSON.parse(raw) as { last: string; n: number }) : { last: '', n: 0 };
    if (s.last === day) return s.n;
    const yesterday = new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10);
    const n = s.last === yesterday ? s.n + 1 : 1;
    window.localStorage.setItem(STREAK, JSON.stringify({ last: day, n }));
    return n;
  } catch { return 1; }
}
export function readStreak(): number {
  try { const s = JSON.parse(window.localStorage.getItem(STREAK) ?? 'null') as { n: number } | null; return s?.n ?? 0; } catch { return 0; }
}

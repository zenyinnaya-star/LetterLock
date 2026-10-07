import { supabase } from './supabase';

export interface ProfileInfo {
  name: string; xp: number; level: number; title: string; level_floor: number; level_next: number;
  games: number; wins: number; valid_answers: number; best_streak: number; fastest_ms: number | null;
  achievements: string[]; code: string;
}
const KEY = 'letterlock.profile.v1';
interface Stored { secret: string; code: string }

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function getStored(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch { return null; }
}
function store(s: Stored | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event('letterlock:profile')); } catch { /* ssr */ }
}

export async function ensureProfile(name: string): Promise<Stored | null> {
  const have = getStored();
  if (have) return have;
  try {
    const s = await call<Stored>('profile_create', { p_name: name });
    store(s);
    return s;
  } catch { return null; }
}

/** Attach this seat to the player's profile (created on first use). Never throws: XP is a bonus, not a gate. */
export async function linkProfile(token: string, name: string): Promise<void> {
  const s = await ensureProfile(name);
  if (!s) return;
  try { await call<boolean>('profile_link', { p_token: token, p_secret: s.secret }); } catch { /* ignore */ }
}

export async function fetchProfile(): Promise<ProfileInfo | null> {
  const s = getStored();
  if (!s) return null;
  try { return await call<ProfileInfo>('profile_get', { p_secret: s.secret }); }
  catch (e) {
    if (e instanceof Error && e.message.includes('PROFILE_NOT_FOUND')) store(null);
    return null;
  }
}

export async function restoreProfile(code: string): Promise<boolean> {
  try {
    const s = await call<Stored>('profile_restore', { p_code: code });
    store(s);
    return true;
  } catch { return false; }
}

export const levelFloor = (level: number) => 60 * (level - 1) * (level - 1);
export const levelOf = (xp: number) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 60));
export function titleKey(level: number) {
  return level >= 22 ? 'grandmaster' : level >= 15 ? 'cipher' : level >= 10 ? 'vault' : level >= 6 ? 'lockpicker' : level >= 3 ? 'wordsmith' : 'rookie';
}

export interface StoryTotals { runs: number; wins: number; dmg: number; healed: number; crits: number; ults: number; words: number; books: number; best_stage: number; xp: number }
export interface StoryRun {
  created_at: string; hero: string | null; won: boolean; stages_cleared: number; dmg: number; healed: number; crits: number; ults: number;
  words: number; books: number; survived: boolean; xp: number; lvl_before: number; lvl_after: number; xp_after: number;
}
export interface StoryStats {
  profile: ProfileInfo; totals: StoryTotals; heroes: { hero: string; runs: number; wins: number; dmg: number; healed: number }[]; recent: StoryRun[];
}
export interface StoryResult {
  hero: string; won: boolean; stages_cleared: number; dmg: number; healed: number; crits: number; ults: number; words: number; books: number; survived: boolean;
  xp: number; lvl_before: number; lvl_after: number; xp_after: number; level_floor: number; level_next: number;
}
export async function fetchStoryStats(): Promise<StoryStats | null> {
  const s = getStored();
  if (!s) return null;
  try { return await call<StoryStats>('story_stats', { p_secret: s.secret }); } catch { return null; }
}
export async function fetchStoryResult(token: string): Promise<StoryResult | null> {
  try { return await call<StoryResult | null>('story_result', { p_token: token }); } catch { return null; }
}

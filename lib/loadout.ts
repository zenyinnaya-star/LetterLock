import { supabase } from './supabase';
import { getStored } from './profile';
import type { PlayerClass } from './types';

export interface HeroUnlock { class: PlayerClass; xp_required: number; open: boolean }
export interface HeroState { xp: number; loadout: PlayerClass[]; heroes: HeroUnlock[] }

export const STARTERS: PlayerClass[] = ['ninja', 'hero', 'gambler'];

/** The player's chosen hero loadout and the unlock state of every hero. Guests get the three starters. */
export async function fetchHeroState(): Promise<HeroState | null> {
  try {
    const s = getStored();
    const { data, error } = await supabase().rpc('profile_heroes', { p_secret: s?.secret ?? null });
    if (error) throw new Error(error.message);
    return data as HeroState;
  } catch { return null; }
}

export async function saveLoadout(heroes: PlayerClass[]): Promise<PlayerClass[]> {
  const s = getStored();
  if (!s) throw new Error('PROFILE_NOT_FOUND');
  const { data, error } = await supabase().rpc('profile_set_loadout', { p_secret: s.secret, p_heroes: heroes });
  if (error) throw new Error(error.message);
  return data as PlayerClass[];
}

// Central combat event bus. Battle log entries (server truth) are translated into CombatEvents;
// animation, camera, VFX, audio and UI all subscribe instead of being hard-coded in handlers.
import type { BattleLogEntry, BattleUnit } from '@/lib/rpc';

export type CombatEventType =
  | 'WORD_STARTED' | 'WORD_SUBMITTED' | 'WORD_CORRECT' | 'WORD_INCORRECT' | 'WORD_FAST' | 'WORD_LONG' | 'WORD_RARE' | 'WORD_PERFECT'
  | 'WEAKNESS_HIT' | 'CRITICAL_HIT' | 'COMBO_INCREASED' | 'BREAK_STARTED' | 'BREAK_TRIGGERED'
  | 'SKILL_USED' | 'ULTIMATE_READY' | 'ULTIMATE_STARTED' | 'ULTIMATE_SUCCESS'
  | 'DAMAGE_DEALT' | 'DAMAGE_RECEIVED' | 'CHARACTER_DEFEATED' | 'BATTLE_WON' | 'BATTLE_LOST' | 'LEVEL_UP'
  | 'BATTLE_INTRO';

export type CombatEvent = {
  type: CombatEventType;
  actorId?: string;
  targetId?: string;
  word?: string;
  amount?: number;
  heroSide?: boolean; // true when the acting unit is on the player's side
  data?: Record<string, unknown>;
};

type Handler = (e: CombatEvent) => void;

export class CombatBus {
  private subs = new Map<CombatEventType | '*', Set<Handler>>();
  on(type: CombatEventType | '*', h: Handler) {
    if (!this.subs.has(type)) this.subs.set(type, new Set());
    this.subs.get(type)!.add(h);
    return () => { this.subs.get(type)?.delete(h); };
  }
  emit(e: CombatEvent) {
    this.subs.get(e.type)?.forEach((h) => h(e));
    this.subs.get('*')?.forEach((h) => h(e));
  }
}

const RARE = /[jqxzkvwy]/gi;
export const isLong = (w?: string) => !!w && w.length >= 6;
export const isRare = (w?: string) => !!w && (w.match(RARE)?.length ?? 0) >= 2;

/** Translate one resolved log entry into the combat events it represents. */
export function eventsFor(e: BattleLogEntry, units: BattleUnit[]): CombatEvent[] {
  const byId = (id?: string) => units.find((u) => u.id === id);
  const named = (n?: string) => units.find((u) => u.name === n);
  const actor = byId(e.ai) ?? named(e.a);
  const target = byId(e.di) ?? named(e.d);
  const heroSide = actor?.side === 'hero';
  const base = { actorId: actor?.id, targetId: target?.id, heroSide, word: e.w, amount: e.n };
  const out: CombatEvent[] = [];
  const dmg = e.t === 'hit' || e.t === 'crit' || e.t === 'ult' || e.t === 'limit' || e.t === 'sweep' || e.t === 'mega_sweep' || e.t === 'e_aoe' || e.t === 'season';
  if (heroSide && e.w) {
    out.push({ ...base, type: 'WORD_SUBMITTED' });
    if (e.t === 'miss' || e.t === 'dodge') out.push({ ...base, type: 'WORD_INCORRECT' });
    else {
      out.push({ ...base, type: 'WORD_CORRECT' });
      if (isLong(e.w)) out.push({ ...base, type: 'WORD_LONG' });
      if (isRare(e.w)) out.push({ ...base, type: 'WORD_RARE' });
    }
  } else if (heroSide && (e.t === 'miss' || e.t === 'dodge')) out.push({ ...base, type: 'WORD_INCORRECT' });
  if (e.sp && heroSide) out.push({ ...base, type: 'SKILL_USED' });
  if (e.x === 'weak') out.push({ ...base, type: 'WEAKNESS_HIT' });
  if (e.t === 'crit') out.push({ ...base, type: 'CRITICAL_HIT' });
  if (e.t === 'ult' || e.t === 'limit') { out.push({ ...base, type: 'ULTIMATE_STARTED' }); out.push({ ...base, type: 'ULTIMATE_SUCCESS' }); }
  if (dmg) out.push({ ...base, type: heroSide ? 'DAMAGE_DEALT' : 'DAMAGE_RECEIVED' });
  if (e.t === 'stage') out.push({ ...base, type: 'BATTLE_WON' });
  return out;
}

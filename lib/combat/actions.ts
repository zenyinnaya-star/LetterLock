// Data-driven action definitions: what each resolved log entry type looks like on screen and how long it holds.
// Rules stay on the server (Supabase). This table is PRESENTATION ONLY: timing, targeting hints, cost labels,
// and which presentation events fire. Tune the game feel here without touching Battle.tsx.
import type { BattleLogEntry } from '@/lib/rpc';

export type ActionDef = {
  id: string;
  target: 'enemy' | 'ally' | 'all-enemies' | 'all-allies' | 'self' | 'none';
  cost?: string;              // shown in the UI, enforced server-side
  anticipate: number;         // ms: pull-back / wind-up
  strike: number;             // ms: lunge to contact
  recover: number;            // ms: return to formation
  hold: number;               // ms: how long the log entry stays on screen before the next one (>= sum of phases)
  hitstop: number;            // ms freeze at impact (0 = none)
  events: string[];           // presentation cues, in order
};

const phases = (a: number, s: number, r: number) => ({ anticipate: a, strike: s, recover: r });

export const ACTIONS: Record<string, ActionDef> = {
  hit:    { id: 'attack', target: 'enemy', ...phases(180, 200, 260), hold: 950, hitstop: 0,   events: ['anticipate', 'move', 'impact', 'react', 'recover'] },
  crit:   { id: 'critical', target: 'enemy', ...phases(260, 220, 340), hold: 1500, hitstop: 90, events: ['anticipate', 'move', 'impact', 'hitstop', 'react', 'recover'] },
  miss:   { id: 'miss', target: 'enemy', ...phases(180, 200, 260), hold: 900, hitstop: 0,   events: ['anticipate', 'move', 'whiff', 'recover'] },
  dodge:  { id: 'dodge', target: 'self', ...phases(0, 220, 200), hold: 800, hitstop: 0,   events: ['evade'] },
  guard:  { id: 'guard', target: 'self', ...phases(120, 200, 300), hold: 950, hitstop: 0,   events: ['brace', 'shield'] },
  heal:   { id: 'heal', target: 'ally', ...phases(200, 300, 300), hold: 1000, hitstop: 0,   events: ['cast', 'release'] },
  ult:    { id: 'ultimate', target: 'all-enemies', cost: 'Ultimate 6/6', ...phases(500, 500, 600), hold: 2300, hitstop: 110, events: ['intro', 'cast', 'impact', 'hitstop', 'react', 'recover'] },
  limit:  { id: 'limit-break', target: 'all-enemies', ...phases(500, 500, 600), hold: 2300, hitstop: 110, events: ['intro', 'impact', 'hitstop'] },
  sweep:  { id: 'sweep', target: 'all-enemies', ...phases(300, 300, 400), hold: 1500, hitstop: 60, events: ['cast', 'impact', 'react'] },
  mega_sweep: { id: 'mega-sweep', target: 'all-enemies', ...phases(400, 400, 500), hold: 2000, hitstop: 90, events: ['cast', 'impact', 'react'] },
  e_aoe:  { id: 'enemy-aoe', target: 'all-allies', ...phases(300, 300, 300), hold: 1300, hitstop: 0, events: ['telegraph', 'impact', 'react'] },
  e_buff: { id: 'enemy-buff', target: 'all-enemies', ...phases(200, 200, 200), hold: 900, hitstop: 0, events: ['cast'] },
  e_debuff: { id: 'enemy-debuff', target: 'ally', ...phases(200, 200, 200), hold: 1000, hitstop: 0, events: ['cast', 'react'] },
  e_heal: { id: 'enemy-heal', target: 'enemy', ...phases(200, 200, 200), hold: 900, hitstop: 0, events: ['cast'] },
  season: { id: 'tax-season', target: 'all-allies', ...phases(300, 300, 300), hold: 1500, hitstop: 0, events: ['telegraph', 'impact'] },
  brk:    { id: 'break-tick', target: 'none', ...phases(0, 0, 0), hold: 150, hitstop: 0, events: [] },
  stunned:{ id: 'stunned', target: 'none', ...phases(0, 0, 0), hold: 800, hitstop: 0, events: ['stun'] },
};

const FALLBACK: ActionDef = { id: 'generic', target: 'none', ...phases(150, 200, 250), hold: 950, hitstop: 0, events: [] };

/** Timing for one log entry. Enemy attacks (hit by an enemy) are quicker than hero attacks. */
export function actionFor(e: BattleLogEntry, enemyActor = false): ActionDef {
  const base = ACTIONS[e.t] ?? FALLBACK;
  if (enemyActor && (e.t === 'hit' || e.t === 'crit' || e.t === 'miss')) return { ...base, hold: Math.round(base.hold * 0.85) };
  return base;
}

/** Framer-motion keyframe times for a lunge from the phase lengths. */
export function lungeTimes(d: ActionDef): { duration: number; times: number[] } {
  const total = d.anticipate + d.strike + d.recover + 120; // 120ms contact hold
  const a = d.anticipate / total, s = (d.anticipate + d.strike) / total, h = (d.anticipate + d.strike + 120) / total;
  return { duration: total / 1000, times: [0, a, s, h, 1] };
}

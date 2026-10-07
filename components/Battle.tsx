'use client';

import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc, type BattleState, type BattleUnit } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import type { Act } from './phases';

const ACTIONS = [
  { id: 'attack', label: '⚔ Attack', hint: 'Power ×2 damage' },
  { id: 'guard', label: '🛡 Guard', hint: 'Power ×1.5 shield' },
  { id: 'heal', label: '✚ Heal', hint: 'Power ×2 to weakest ally' },
] as const;

const INTENT: Record<string, string> = {
  strike: 'Government strikes', red_tape: 'Red Tape: 4 letters locked', taxes: 'Taxes: applies Corruption', tax_season: 'TAX SEASON: huge party-wide hit — Guard!',
};

function Bar({ u }: { u: BattleUnit }) {
  const pct = Math.max(0, Math.min(100, (u.hp / u.max_hp) * 100));
  return (
    <div className={`bt-unit ${u.side}${u.hp <= 0 ? ' down' : ''}`}>
      <div className="bt-name">{u.name}{u.hero ? ` (${u.hero})` : ''}{u.locked && u.hp > 0 && u.side === 'hero' ? ' ✓' : ''}</div>
      <div className="bt-sprite">{u.side === 'enemy' ? '🧾' : '🧙'}</div>
      <div className="bt-hp"><motion.i animate={{ width: `${pct}%` }} /></div>
      <div className="bt-nums">{u.hp}/{u.max_hp}{u.shield > 0 ? ` · 🛡${u.shield}` : ''}{u.corruption > 0 ? ` · ☠${u.corruption}` : ''} · SPD {u.spd}</div>
    </div>
  );
}

function logLine(e: BattleState['log'][number]) {
  switch (e.t) {
    case 'crit': return `${e.a} CRITS ${e.d} for ${e.n}${e.w ? ` (${e.w})` : ''}!`;
    case 'season': return `${e.a} unleashes Tax Season on the whole party!`;
    case 'corrupt': return `${e.d} is Corrupted`;
    case 'resist': return `${e.d} resists Corruption`;
    case 'stage': return `— Encounter ${e.n} —`;
    case 'hit': return `${e.a} hits ${e.d} for ${e.n}${e.w ? ` (${e.w})` : ''}`;
    case 'miss': return `${e.a} misses ${e.d}`;
    case 'dodge': return `${e.d} dodges ${e.a}`;
    case 'guard': return `${e.a} guards +${e.n}${e.w ? ` (${e.w})` : ''}`;
    case 'heal': return `${e.a} heals ${e.d} +${e.n}${e.w ? ` (${e.w})` : ''}`;
  }
}

export function Battle({ state, token, act, fallback }: { state: RoomState; token: string | null; act: Act; fallback?: React.ReactNode }) {
  const [b, setB] = useState<BattleState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [word, setWord] = useState('');
  const [action, setAction] = useState<'attack' | 'guard' | 'heal'>('attack');
  const [msg, setMsg] = useState('');
  const [left, setLeft] = useState(0);
  const stepped = useRef(-1);

  const load = useCallback(async () => {
    if (!token) return;
    try { setB(await rpc.getBattle(token)); } catch { /* ignore */ }
    setLoaded(true);
  }, [token]);

  useEffect(() => { void load(); }, [load, state.room.state_version]);
  useEffect(() => { const i = setInterval(() => void load(), 3000); return () => clearInterval(i); }, [load]);

  const mine = b?.units.find((u) => u.player_id === b.me);
  const turn = b?.turn ?? 0;
  useEffect(() => { setWord(''); setMsg(''); }, [turn]);

  useEffect(() => {
    if (!b || b.step !== 'input') return;
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(b.ends_at).getTime() - Date.now()) / 1000)));
    tick();
    const i = setInterval(tick, 250);
    return () => clearInterval(i);
  }, [b]);

  // advance when everyone alive has locked in, or the clock ran out (server enforces both, idempotent)
  useEffect(() => {
    if (!b || b.step !== 'input' || !token) return;
    const allLocked = b.units.filter((u) => u.side === 'hero' && u.hp > 0).every((u) => u.locked);
    if ((allLocked || left <= 0) && stepped.current !== b.turn * 10 + (allLocked ? 1 : 2)) {
      stepped.current = b.turn * 10 + (allLocked ? 1 : 2);
      const d = allLocked ? 400 : 300;
      const id = setTimeout(() => { void rpc.battleStep(token, b.turn).then(load).catch(() => {}); }, d);
      return () => clearTimeout(id);
    }
  }, [b, left, token, load]);

  if (loaded && !b) return <>{fallback ?? null}</>;
  if (!b) return <div className="center muted">Loading battle…</div>;

  const heroes = b.units.filter((u) => u.side === 'hero');
  const enemy = b.units.find((u) => u.side === 'enemy');
  const canAct = b.step === 'input' && mine && mine.hp > 0 && !mine.locked;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !word.trim() || !canAct) return;
    const r = await act(() => rpc.battleSubmit(token, word.trim(), action));
    if (!r) return;
    if (!r.ok) setMsg(r.reason === 'OFF_TOPIC' ? "That doesn't fit the prompt." : r.reason === 'NOT_A_WORD' ? 'Not a word.' : r.reason === 'LOCKED' ? `The letter ${r.letter?.toUpperCase()} is locked!` : 'Invalid.');
    else { setMsg(`Locked in! Power ${r.power}`); void load(); }
  }

  return (
    <div className="battle">
      <div className="bt-field">
        <div className="bt-side">{heroes.map((u) => <Bar key={u.id} u={u} />)}</div>
        <div className="bt-vs">VS</div>
        <div className="bt-side">{enemy && <Bar u={enemy} />}</div>
      </div>

      {b.step === 'input' ? (
        <div className="bt-panel">
          <div className="bt-turn">Encounter {b.stage}/{b.stages} · {b.enemy} · Turn {b.turn} · {left}s</div>
          {b.locked && <div className="bt-lock">🔒 Locked letters: <b>{b.locked.toUpperCase().split('').join(' ')}</b></div>}
          {b.intent !== 'attack' && <div className="bt-intent">⚠ {INTENT[b.intent] ?? b.intent}{b.next_intent !== 'strike' && b.next_intent !== 'attack' ? ` · next: ${INTENT[b.next_intent] ?? b.next_intent}` : ''}</div>}
          {b.drain && <div className="bt-intent">The Collector garnishes your Power (−20%)</div>}
          <div className="bt-prompt">{b.prompt}</div>
          <div className="bt-actions">
            {ACTIONS.map((a) => (
              <button key={a.id} type="button" className={`btn sm${action === a.id ? '' : ' ghost'}`} title={a.hint} onClick={() => setAction(a.id)}>{a.label}</button>
            ))}
          </div>
          {mine && mine.hp <= 0 ? <div className="muted center">You&apos;re down. Your team fights on…</div> : mine?.locked ? (
            <div className="muted center">{msg || 'Locked in'} — waiting for the team…</div>
          ) : (
            <form onSubmit={submit} className="bt-form">
              <input className="input" autoFocus autoComplete="off" autoCapitalize="none" value={word} maxLength={20}
                placeholder="Type a word that fits…" onChange={(e) => setWord(e.target.value)} />
              <button className="btn" disabled={!word.trim()}>Cast</button>
            </form>
          )}
          {msg && !mine?.locked && <div className="muted small center">{msg}</div>}
        </div>
      ) : (
        <div className="bt-panel center">
          <h2>{b.step === 'won' ? `Victory! The Government has fallen.` : 'Defeat… the IRS wins this round.'}</h2>
          <a className="btn" href="/">Back to menu</a>
        </div>
      )}

      <div className="bt-log">
        {b.log.map((e, i) => <div key={i}>{logLine(e)}</div>)}
      </div>
    </div>
  );
}

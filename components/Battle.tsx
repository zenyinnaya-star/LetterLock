'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rpc, type BattleState, type BattleUnit } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import type { Act } from './phases';

type ActionId = 'attack' | 'guard' | 'heal';
const ACTIONS: { id: ActionId; label: string; glyph: string; hint: string }[] = [
  { id: 'attack', label: 'Attack', glyph: '⚔', hint: 'Power ×2 damage' },
  { id: 'guard', label: 'Guard', glyph: '🛡', hint: 'Power ×1.5 shield' },
  { id: 'heal', label: 'Heal', glyph: '✚', hint: 'Power ×2 to an ally' },
];
const CARDS: Record<string, { label: string; glyph: string }> = {
  sweep: { label: 'Sweep: hits all enemies', glyph: '🌀' },
  heal_all: { label: 'Group Heal', glyph: '✨' },
  cleanse: { label: 'Cleanse Corruption', glyph: '🧿' },
};
const INTENT: Record<string, string> = {
  strike: 'Government strikes', red_tape: 'Red Tape: 4 letters locked', taxes: 'Taxes: applies Corruption', tax_season: 'TAX SEASON: huge party hit. Guard!',
};
const HERO_COLOR: Record<string, string> = { Shiro: '#93c5fd', Nero: '#94a3b8', Kira: '#f472b6', Mira: '#34d399', Prince: '#fbbf24' };

// ── placeholder figures (SVG silhouettes until real art lands) ──
function HeroFigure({ hero }: { hero: string | null }) {
  const c = HERO_COLOR[hero ?? ''] ?? '#cbd5e1';
  return (
    <svg viewBox="0 0 80 120" className="bt-fig" aria-hidden>
      <ellipse cx="40" cy="114" rx="26" ry="5" fill="rgba(0,0,0,.45)" />
      <path d="M22 108 L28 50 Q40 40 52 50 L58 108 Z" fill="#1e293b" stroke={c} strokeWidth="2" />
      <path d="M28 50 Q40 62 52 50 L50 70 Q40 78 30 70 Z" fill={c} opacity=".85" />
      <circle cx="40" cy="34" r="13" fill="#e2c9a8" stroke="#0f172a" strokeWidth="2" />
      <path d="M27 32 Q40 14 53 32 Q40 24 27 32Z" fill={hero === 'Kira' || hero === 'Mira' ? '#7c3a1d' : '#1f2937'} />
      <line x1="60" y1="96" x2="74" y2="30" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      <line x1="56" y1="70" x2="68" y2="66" stroke={c} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function EnemyFigure({ name }: { name: string }) {
  if (name === 'Government') {
    return (
      <svg viewBox="0 0 220 160" className="bt-fig boss" aria-hidden>
        <ellipse cx="110" cy="150" rx="80" ry="8" fill="rgba(0,0,0,.5)" />
        <path d="M110 70 L20 20 L50 80 L10 90 L70 110Z M110 70 L200 20 L170 80 L210 90 L150 110Z" fill="#3b0d0d" stroke="#ef4444" strokeWidth="2" />
        <path d="M70 110 Q110 150 150 110 Q160 70 130 50 L112 20 L98 50 Q60 70 70 110Z" fill="#7f1d1d" stroke="#f87171" strokeWidth="2" />
        <circle cx="96" cy="66" r="5" fill="#fde047" /><circle cx="126" cy="66" r="5" fill="#fde047" />
        <path d="M90 90 L130 90 L120 100 L100 100Z" fill="#1c0a0a" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 80 120" className="bt-fig" aria-hidden>
      <ellipse cx="40" cy="114" rx="26" ry="5" fill="rgba(0,0,0,.45)" />
      <rect x="22" y="48" width="36" height="58" rx="6" fill="#111827" stroke="#ef4444" strokeWidth="2" />
      <path d="M40 50 L34 72 L40 100 L46 72Z" fill="#b91c1c" />
      <circle cx="40" cy="34" r="13" fill="#d6d3d1" stroke="#0f172a" strokeWidth="2" />
      <rect x="28" y="28" width="24" height="7" rx="3" fill="#0f172a" />
      <rect x="54" y="62" width="18" height="24" rx="2" fill="#f5f5f4" stroke="#78716c" />
      <line x1="58" y1="70" x2="68" y2="70" stroke="#78716c" /><line x1="58" y1="76" x2="68" y2="76" stroke="#78716c" />
    </svg>
  );
}

function logLine(e: BattleState['log'][number]) {
  switch (e.t) {
    case 'crit': return `${e.a} CRITS ${e.d} for ${e.n}${e.w ? ` (${e.w})` : ''}!`;
    case 'sweep': return `${e.a} plays Sweep: ${e.n} to every enemy!`;
    case 'group_heal': return `${e.a} plays Group Heal: +${e.n} to everyone`;
    case 'cleanse': return `${e.a} plays Cleanse`;
    case 'season': return `${e.a} unleashes Tax Season on the whole party!`;
    case 'corrupt': return `${e.d} is Corrupted`;
    case 'resist': return `${e.d} resists Corruption`;
    case 'stage': return `Encounter ${e.n}`;
    case 'hit': return `${e.a} hits ${e.d} for ${e.n}${e.w ? ` (${e.w})` : ''}`;
    case 'miss': return `${e.a} misses ${e.d}`;
    case 'dodge': return `${e.d} dodges ${e.a}`;
    case 'guard': return `${e.a} guards +${e.n}${e.w ? ` (${e.w})` : ''}`;
    case 'heal': return `${e.a} heals ${e.d} +${e.n}${e.w ? ` (${e.w})` : ''}`;
  }
}

function Unit({ u, order, picked, onPick, floats, x, y }: {
  u: BattleUnit; order: number; picked: boolean; onPick?: () => void; floats: { k: string; text: string; cls: string }[]; x: number; y: number;
}) {
  const pct = Math.max(0, Math.min(100, (u.hp / u.max_hp) * 100));
  const shield = Math.min(100, (u.shield / u.max_hp) * 100);
  const boss = u.name === 'Government';
  return (
    <motion.div className={`bt-u ${u.side}${boss ? ' boss' : ''}${u.hp <= 0 ? ' down' : ''}${picked ? ' picked' : ''}${onPick ? ' pickable' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }} onClick={onPick} role={onPick ? 'button' : undefined}
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: u.hp <= 0 ? 0.35 : 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
      <div className="bt-plate">
        {u.hp > 0 && <span className="bt-order">{order}</span>}
        <div className="bt-bars">
          <div className="bt-hp"><motion.i animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} /></div>
          <div className="bt-sh"><motion.i animate={{ width: `${shield}%` }} /></div>
        </div>
        <span className="bt-lv">{u.hero ?? u.name}{u.corruption > 0 ? ` ☠${u.corruption}` : ''}{u.locked && u.side === 'hero' && u.hp > 0 ? ' ✓' : ''}</span>
      </div>
      <motion.div key={floats.length ? floats[0].k : 'idle'} animate={floats.some((f) => f.cls === 'dmg') ? { x: [0, -6, 6, -4, 0] } : {}} transition={{ duration: 0.35 }}>
        {u.side === 'hero' ? <HeroFigure hero={u.hero} /> : <EnemyFigure name={u.name} />}
      </motion.div>
      <AnimatePresence>
        {floats.map((f, i) => (
          <motion.span key={f.k} className={`bt-float ${f.cls}`} style={{ marginLeft: i * 14 }}
            initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 1, 1, 0], y: -46 }} transition={{ duration: 1.6 }}>{f.text}</motion.span>
        ))}
      </AnimatePresence>
      <div className="bt-hpnum">{u.hp}/{u.max_hp}</div>
    </motion.div>
  );
}

export function Battle({ state, token, act, fallback }: { state: RoomState; token: string | null; act: Act; fallback?: React.ReactNode }) {
  const [b, setB] = useState<BattleState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [word, setWord] = useState('');
  const [action, setAction] = useState<ActionId>('attack');
  const [target, setTarget] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [left, setLeft] = useState(0);
  const [wheel, setWheel] = useState(true);
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
  useEffect(() => { setWord(''); setMsg(''); setTarget(null); }, [turn]);

  useEffect(() => {
    if (!b || b.step !== 'input') return;
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(b.ends_at).getTime() - Date.now()) / 1000)));
    tick();
    const i = setInterval(tick, 250);
    return () => clearInterval(i);
  }, [b]);

  useEffect(() => {
    if (!b || b.step !== 'input' || !token) return;
    const enemiesAlive = b.units.some((u) => u.side === 'enemy' && u.hp > 0);
    const allLocked = b.units.filter((u) => u.side === 'hero' && u.hp > 0).every((u) => u.locked);
    const go = allLocked || left <= 0 || !enemiesAlive;
    const key = b.turn * 10 + (allLocked ? 1 : 2);
    if (go && stepped.current !== key) {
      stepped.current = key;
      const id = setTimeout(() => { void rpc.battleStep(token, b.turn).then(load).catch(() => {}); }, allLocked ? 400 : 300);
      return () => clearTimeout(id);
    }
  }, [b, left, token, load]);

  // initiative badge: rank by speed (the server adds a little randomness)
  const orderOf = useMemo(() => {
    const alive = (b?.units ?? []).filter((u) => u.hp > 0).sort((a, c) => c.spd - a.spd);
    return Object.fromEntries(alive.map((u, i) => [u.id, i + 1])) as Record<string, number>;
  }, [b]);

  // floating numbers from the latest log, keyed by battle version
  const floatsFor = (u: BattleUnit) => {
    if (!b) return [];
    const out: { k: string; text: string; cls: string }[] = [];
    b.log.forEach((e, i) => {
      if (e.t === 'hit' || e.t === 'crit') { if (e.d === u.name) out.push({ k: `${b.version}-${i}`, text: `-${e.n}${e.t === 'crit' ? '!' : ''}`, cls: 'dmg' }); }
      else if (e.t === 'heal' && e.d === u.name) out.push({ k: `${b.version}-${i}`, text: `+${e.n}`, cls: 'heal' });
      else if (e.t === 'guard' && e.a === u.name) out.push({ k: `${b.version}-${i}`, text: `🛡${e.n}`, cls: 'shield' });
      else if ((e.t === 'miss' && e.d === u.name) || (e.t === 'dodge' && e.d === u.name)) out.push({ k: `${b.version}-${i}`, text: e.t === 'miss' ? 'MISS' : 'DODGE', cls: 'miss' });
      else if (e.t === 'sweep' && u.side === 'enemy') out.push({ k: `${b.version}-${i}`, text: `-${e.n}`, cls: 'dmg' });
    });
    return out.slice(0, 3);
  };

  if (loaded && !b) return <>{fallback ?? null}</>;
  if (!b) return <div className="center muted">Loading battle…</div>;

  const heroes = b.units.filter((u) => u.side === 'hero');
  const enemies = b.units.filter((u) => u.side === 'enemy');
  const canAct = b.step === 'input' && !!mine && mine.hp > 0 && !mine.locked;
  const boss = enemies.some((e) => e.name === 'Government');
  const total = 25;

  // field positions (percent of the stage)
  const heroPos = (i: number, n: number) => ({ x: 14 + i * (n > 1 ? 60 / (n - 1) : 0) + (n === 1 ? 20 : 0), y: i % 2 ? 76 : 66 });
  const enemyPos = (i: number, n: number) => boss ? { x: 58, y: 40 } : { x: n === 1 ? 62 : 44 + i * 26, y: i % 2 ? 40 : 28 };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !word.trim() || !canAct) return;
    const r = await act(() => rpc.battleSubmit(token, word.trim(), action, target));
    if (!r) return;
    if (!r.ok) setMsg(r.reason === 'OFF_TOPIC' ? "That doesn't fit the prompt." : r.reason === 'NOT_A_WORD' ? 'Not a word.' : r.reason === 'LOCKED' ? `The letter ${r.letter?.toUpperCase()} is locked!` : 'Invalid.');
    else { setMsg(`Locked in! Power ${r.power}`); void load(); }
  }

  return (
    <div className="battle">
      <div className={`bt-stage${boss ? ' boss' : ''}`} data-act={b.stage}>
        <div className="bt-sky" /><div className="bt-fog" /><div className="bt-ground" /><div className="bt-rain" />

        <div className="bt-top">
          <span className="bt-chip">Encounter {b.stage}/{b.stages}</span>
          <span className="bt-chip">Turn {b.turn}</span>
          <span className={`bt-chip${left <= 5 ? ' warn' : ''}`}>⏱ {left}s</span>
        </div>
        <div className="bt-banner">
          <div className="bt-prompt">{b.prompt}</div>
          {b.locked && <div className="bt-lock">🔒 Locked: <b>{b.locked.toUpperCase().split('').join(' ')}</b></div>}
          {b.intent !== 'attack' && <div className="bt-intent">⚠ {INTENT[b.intent] ?? b.intent}{b.next_intent !== 'strike' && b.next_intent !== 'attack' ? ` · next: ${INTENT[b.next_intent] ?? b.next_intent}` : ''}</div>}
          {b.drain && <div className="bt-intent">The Collector garnishes your Power (−20%)</div>}
        </div>

        {enemies.map((u, i) => { const p = enemyPos(i, enemies.length); return (
          <Unit key={u.id} u={u} order={orderOf[u.id] ?? 0} x={p.x} y={p.y} floats={floatsFor(u)} picked={target === u.id}
            onPick={action === 'attack' && canAct && u.hp > 0 ? () => setTarget(target === u.id ? null : u.id) : undefined} />
        ); })}
        {heroes.map((u, i) => { const p = heroPos(i, heroes.length); return (
          <Unit key={u.id} u={u} order={orderOf[u.id] ?? 0} x={p.x} y={p.y} floats={floatsFor(u)} picked={target === u.id}
            onPick={action === 'heal' && canAct && u.hp > 0 ? () => setTarget(target === u.id ? null : u.id) : undefined} />
        ); })}

        {/* Power / timer bar (bottom left) */}
        <div className="bt-energy">
          <span className="bt-gem">{mine?.power ?? b.turn}</span>
          <div className="bt-seg">{Array.from({ length: 5 }).map((_, i) => <i key={i} className={left / total * 5 > i ? 'on' : ''} />)}</div>
        </div>

        {/* skill wheel (bottom right) */}
        {mine && b.step === 'input' && (
          <div className={`bt-wheel${wheel ? ' open' : ''}`}>
            {ACTIONS.map((a, i) => (
              <button key={a.id} type="button" className={`bt-skill s${i}${action === a.id ? ' sel' : ''}`} title={a.hint}
                onClick={() => { setAction(a.id); setTarget(null); }}><span>{a.glyph}</span><em>{a.label}</em></button>
            ))}
            {b.cards.slice(0, 2).map((c, i) => (
              <button key={c + i} type="button" className={`bt-skill card c${i}`} disabled={b.card_used || mine.hp <= 0} title={CARDS[c]?.label ?? c}
                onClick={() => token && void act(() => rpc.battleCard(token, c)).then(() => load())}><span>{CARDS[c]?.glyph ?? '🃏'}</span></button>
            ))}
            <button type="button" className="bt-portrait" onClick={() => setWheel((w) => !w)} aria-label="Toggle actions">
              <span style={{ color: HERO_COLOR[mine.hero ?? ''] ?? '#fff' }}>{(mine.hero ?? mine.name).slice(0, 1)}</span>
              <small>{mine.hero}</small>
            </button>
          </div>
        )}
      </div>

      {b.step === 'input' ? (
        <div className="bt-panel">
          {mine && mine.hp <= 0 ? <div className="muted center">You&apos;re down. Your team fights on…</div> : mine?.locked ? (
            <div className="muted center">{msg || 'Locked in'}. Waiting for the team…</div>
          ) : (
            <form onSubmit={submit} className="bt-form">
              <input className="input" autoFocus autoComplete="off" autoCapitalize="none" value={word} maxLength={20}
                placeholder={`${ACTIONS.find((a) => a.id === action)?.label}: type a word that fits…`} onChange={(e) => setWord(e.target.value)} />
              <button className="btn" disabled={!word.trim()}>Cast ▸</button>
            </form>
          )}
          {(action === 'attack' || action === 'heal') && canAct && <div className="muted small center">Tap {action === 'attack' ? 'an enemy' : 'an ally'} on the field to target it{target ? ' ✓' : ' (auto if none)'}</div>}
          {msg && !mine?.locked && <div className="muted small center">{msg}</div>}
          {mine && b.cards.length === 0 && <div className="muted small center">No cards yet. Good words draw them.</div>}
        </div>
      ) : (
        <div className="bt-panel center">
          <h2>{b.step === 'won' ? 'Victory! The Government has fallen.' : 'Defeat… the IRS wins this round.'}</h2>
          <a className="btn" href="/">Back to menu</a>
        </div>
      )}

      <div className="bt-log">{b.log.map((e, i) => <div key={i}>{logLine(e)}</div>)}</div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACT_BG, ACT_NAME, BOOK_ART, ENEMY_SPRITE, HERO_SPRITE, actOf } from '@/lib/art';
import { heroById, type HeroId } from '@/lib/heroes';
import { rpc, type BattleLogEntry, type BattleState, type BattleUnit } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import type { Act } from './phases';

type ActionId = 'attack' | 'guard' | 'heal' | 'ult';
const ULT_NAME: Record<string, string> = { Shiro: 'Thousand Letters', Nero: 'Bastion Wall', Kira: 'All In', Mira: 'Bloom of Dawn', Prince: 'Crown Strike' };
const CARDS: Record<string, { label: string; glyph: string; rare?: boolean; hint: string }> = {
  sweep: { label: 'Sweep', glyph: '🌀', hint: 'Hits all enemies' },
  heal_all: { label: 'Group Heal', glyph: '✨', hint: 'Heals the whole party' },
  cleanse: { label: 'Cleanse', glyph: '🧿', hint: 'Removes Corruption' },
  mega_sweep: { label: 'Mega Sweep', glyph: '☄️', rare: true, hint: 'Huge damage to all enemies' },
  full_heal: { label: 'Full Restore', glyph: '💖', rare: true, hint: 'Fully heals the party' },
  revive: { label: 'Revive', glyph: '🕊️', rare: true, hint: 'Raises a fallen hero' },
  overcharge: { label: 'Overcharge', glyph: '⚡', rare: true, hint: 'Fills your ultimate' },
};
const INTENT: Record<string, string> = {
  strike: 'Government strikes', red_tape: 'Red Tape: 4 letters locked', taxes: 'Taxes: applies Corruption', tax_season: 'TAX SEASON: huge party hit. Guard!',
};

function logLine(e: BattleLogEntry) {
  switch (e.t) {
    case 'crit': return `${e.a} CRITS ${e.d} for ${e.n}${e.w ? ` (${e.w})` : ''}!`;
    case 'sweep': return `${e.a} plays Sweep: ${e.n} to every enemy!`;
    case 'mega_sweep': return `${e.a} plays Mega Sweep: ${e.n} to every enemy!`;
    case 'group_heal': return `${e.a} plays Group Heal: +${e.n} to everyone`;
    case 'full_heal': return `${e.a} plays Full Restore!`;
    case 'revive': return `${e.a} raises ${e.d ?? 'an ally'}!`;
    case 'overcharge': return `${e.a} overcharges!`;
    case 'ult': return `${e.a} unleashes their ULTIMATE${e.n ? ` (${e.n})` : ''}!`;
    case 'book': return `${e.a} reads the Book of Wisdom`;
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

const portrait = (u: BattleUnit) => (u.hero ? heroById(u.hero as HeroId)?.artFull : ENEMY_SPRITE[u.name]) ?? '';
const sprite = (u: BattleUnit) => (u.hero ? HERO_SPRITE[u.hero] : ENEMY_SPRITE[u.name]) ?? '';

type Float = { k: string; text: string; cls: string };

function Sprite({ u, floats, picked, onPick, style }: { u: BattleUnit; floats: Float[]; picked: boolean; onPick?: () => void; style: React.CSSProperties }) {
  const pct = Math.max(0, Math.min(100, (u.hp / u.max_hp) * 100));
  const hit = floats.some((f) => f.cls === 'dmg');
  return (
    <div className={`rg-unit ${u.side}${u.hp <= 0 ? ' down' : ''}${picked ? ' picked' : ''}${onPick ? ' pickable' : ''}${u.name === 'Government' ? ' boss' : ''}`}
      style={style} onClick={onPick} role={onPick ? 'button' : undefined}>
      <div className="rg-ehp"><motion.i animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} /></div>
      <motion.div animate={hit ? { x: [0, -8, 8, -5, 0], filter: ['brightness(2)', 'brightness(1)'] } : {}} transition={{ duration: 0.4 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rg-img" src={sprite(u)} alt={u.name} draggable={false} style={u.side === 'hero' ? undefined : { transform: 'scaleX(1)' }} />
      </motion.div>
      <span className="rg-uname">{u.name}{u.corruption > 0 ? ` ☠${u.corruption}` : ''}</span>
      <AnimatePresence>
        {floats.map((f, i) => (
          <motion.span key={f.k} className={`rg-float ${f.cls}`} style={{ marginLeft: i * 16 }}
            initial={{ opacity: 0, y: 0, scale: 0.6 }} animate={{ opacity: [0, 1, 1, 0], y: -60, scale: 1.2 }} transition={{ duration: 1.7 }}>{f.text}</motion.span>
        ))}
      </AnimatePresence>
    </div>
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
  const [showLog, setShowLog] = useState(false);
  const [intro, setIntro] = useState<number | null>(null);
  const seenAct = useRef(-1);
  const stepped = useRef(-1);
  // Book of Wisdom
  const [book, setBook] = useState<{ prompt: string; ends: number } | null>(null);
  const [bookWord, setBookWord] = useState('');
  const [bookMsg, setBookMsg] = useState('');
  const [bookLeft, setBookLeft] = useState(0);
  const [bookOpenStage, setBookOpenStage] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try { setB(await rpc.getBattle(token)); } catch { /* ignore */ }
    setLoaded(true);
  }, [token]);

  useEffect(() => { void load(); }, [load, state.room.state_version]);
  useEffect(() => { const i = setInterval(() => void load(), 3000); return () => clearInterval(i); }, [load]);

  const mine = b?.units.find((u) => u.player_id === b.me);
  const turn = b?.turn ?? 0;
  useEffect(() => { setWord(''); setMsg(''); setTarget(null); setAction('attack'); }, [turn]);

  // Act intro card
  useEffect(() => {
    if (!b) return;
    const a = actOf(b.stage);
    if (seenAct.current !== a) { seenAct.current = a; setIntro(a); const id = setTimeout(() => setIntro(null), 3200); return () => clearTimeout(id); }
  }, [b]);

  useEffect(() => {
    if (!b || b.step !== 'input') return;
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(b.ends_at).getTime() - Date.now()) / 1000)));
    tick();
    const i = setInterval(tick, 250);
    return () => clearInterval(i);
  }, [b]);

  useEffect(() => {
    if (!b || b.step !== 'input' || !token || intro !== null) return;
    const enemiesAlive = b.units.some((u) => u.side === 'enemy' && u.hp > 0);
    const allLocked = b.units.filter((u) => u.side === 'hero' && u.hp > 0).every((u) => u.locked);
    const go = allLocked || left <= 0 || !enemiesAlive;
    const key = b.turn * 10 + (allLocked ? 1 : 2);
    if (go && stepped.current !== key) {
      stepped.current = key;
      const id = setTimeout(() => { void rpc.battleStep(token, b.turn).then(load).catch(() => {}); }, allLocked ? 400 : 300);
      return () => clearTimeout(id);
    }
  }, [b, left, token, load, intro]);

  // book timer
  useEffect(() => {
    if (!book) return;
    const tick = () => setBookLeft(Math.max(0, Math.ceil((book.ends - Date.now()) / 1000)));
    tick();
    const i = setInterval(tick, 200);
    return () => clearInterval(i);
  }, [book]);

  const orderUnits = useMemo(() => (b?.units ?? []).filter((u) => u.hp > 0).sort((a, c) => c.spd - a.spd), [b]);

  const floatsFor = (u: BattleUnit): Float[] => {
    if (!b) return [];
    const out: Float[] = [];
    b.log.forEach((e, i) => {
      const k = `${b.version}-${i}`;
      if (e.t === 'hit' || e.t === 'crit') { if (e.d === u.name) out.push({ k, text: `-${e.n}${e.t === 'crit' ? '!' : ''}`, cls: e.t === 'crit' ? 'dmg crit' : 'dmg' }); }
      else if (e.t === 'heal' && e.d === u.name) out.push({ k, text: `+${e.n}`, cls: 'heal' });
      else if (e.t === 'guard' && e.a === u.name) out.push({ k, text: `🛡${e.n}`, cls: 'shield' });
      else if ((e.t === 'miss' || e.t === 'dodge') && e.d === u.name) out.push({ k, text: e.t === 'miss' ? 'MISS' : 'DODGE', cls: 'miss' });
      else if ((e.t === 'sweep' || e.t === 'mega_sweep') && u.side === 'enemy') out.push({ k, text: `-${e.n}`, cls: 'dmg' });
      else if (e.t === 'ult' && u.side === 'enemy' && e.n) out.push({ k, text: `-${e.n}`, cls: 'dmg crit' });
    });
    return out.slice(0, 3);
  };

  if (loaded && !b) return <>{fallback ?? null}</>;
  if (!b) return <div className="center muted">Loading battle…</div>;

  const heroes = b.units.filter((u) => u.side === 'hero');
  const enemies = b.units.filter((u) => u.side === 'enemy');
  const aliveEnemies = enemies.filter((e) => e.hp > 0);
  const canAct = b.step === 'input' && !!mine && mine.hp > 0 && !mine.locked;
  const lead = enemies.find((e) => e.name === 'Government') ?? enemies.find((e) => e.name === 'The Collector') ?? enemies.find((e) => e.name === 'The Commissioner') ?? enemies[0];
  const leadPct = lead ? Math.max(0, Math.round((lead.hp / lead.max_hp) * 100)) : 0;
  const ultReady = (mine?.ult ?? 0) >= 6;
  const ai = actOf(b.stage);
  const myHero = mine?.hero ? heroById(mine.hero as HeroId) : null;
  const needsEnemy = action === 'attack';
  const needsAlly = action === 'heal';

  // enemy field layout: spread across the right half, staggered rows
  const ePos = (i: number, n: number): React.CSSProperties => {
    const cols = Math.min(n, 4);
    const x = n === 1 ? 66 : 46 + (i * 44) / Math.max(1, cols - 1);
    const y = i % 2 ? 56 : 42;
    return { left: `${x}%`, top: `${y}%`, zIndex: 10 + (i % 2) };
  };
  const hPos = (i: number, n: number): React.CSSProperties => ({ left: `${14 + i * (n > 1 ? 22 / (n - 1) * 1.6 : 0)}%`, top: `${i % 2 ? 78 : 66}%`, zIndex: 20 + (i % 2) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !word.trim() || !canAct) return;
    const r = await act(() => rpc.battleSubmit(token, word.trim(), action, target));
    if (!r) return;
    if (!r.ok) setMsg(r.reason === 'OFF_TOPIC' ? "That doesn't fit the prompt." : r.reason === 'NOT_A_WORD' ? 'Not a word.' : r.reason === 'LOCKED' ? `The letter ${r.letter?.toUpperCase()} is locked!` : r.reason === 'ULT_NOT_READY' ? 'Ultimate is not charged yet.' : 'Invalid.');
    else { setMsg(`Locked in! Power ${r.power}`); void load(); }
  }

  async function openBook() {
    if (!token) return;
    const r = await act(() => rpc.bookOpen(token));
    if (!r) { setBookMsg('The Book was already read this encounter.'); setBookOpenStage(true); return; }
    if (r.prompt) { setBook({ prompt: r.prompt, ends: r.ends_at ? new Date(r.ends_at).getTime() : Date.now() + 15000 }); setBookWord(''); setBookMsg(''); setBookOpenStage(true); void load(); }
    else setBookMsg(r.reason === 'ALREADY_USED' ? 'The Book was already read this encounter.' : 'The Book stays shut.');
  }
  async function answerBook(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !bookWord.trim()) return;
    const r = await act(() => rpc.bookAnswer(token, bookWord.trim()));
    if (!r) return;
    if (r.ok) { setBookMsg(`Wisdom granted: ${CARDS[r.card ?? '']?.label ?? 'a powerful card'}!`); setBook(null); setBookOpenStage(true); void load(); }
    else if (r.reason === 'TOO_SLOW') { setBookMsg('Too slow. The pages go dark.'); setBook(null); }
    else if (r.reason === 'WRONG') setBookMsg('The Book does not accept that. Try again!');
    else setBookMsg('Invalid.');
  }

  const skillDisabled = !canAct;

  return (
    <div className="rg">
      <div className="rg-stage" data-boss={lead?.name === 'Government' ? 1 : 0}>
        <div className="rg-bg" style={{ backgroundImage: `url(${ACT_BG[ai]})` }} />
        <div className="rg-vig" />

        {/* top-left: turn order */}
        <div className="rg-order" aria-label="Turn order">
          <span className="rg-rd">{b.turn}<small>/{b.stages * 5}</small></span>
          {orderUnits.slice(0, 7).map((u, i) => (
            <div key={u.id} className={`rg-ord ${u.side}${i === 0 ? ' first' : ''}`} title={u.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portrait(u)} alt={u.name} draggable={false} />
            </div>
          ))}
        </div>

        {/* top-center: boss bar */}
        {lead && (
          <div className="rg-boss">
            <div className="rg-boss-name"><b>{lead.name}</b><span>{leadPct}%</span></div>
            <div className="rg-boss-bar"><motion.i animate={{ width: `${leadPct}%` }} transition={{ duration: 0.6 }} /></div>
            <div className="rg-boss-sub">{aliveEnemies.length} enemies · {b.intent !== 'attack' ? `⚠ ${INTENT[b.intent] ?? b.intent}` : 'Preparing…'}
              {b.next_intent !== 'strike' && b.next_intent !== 'attack' ? ` · next: ${INTENT[b.next_intent] ?? b.next_intent}` : ''}</div>
          </div>
        )}

        {/* top-right: round / objectives */}
        <div className="rg-tr">
          <div className="rg-tr-row">
            <span className={`rg-chip${left <= 5 ? ' warn' : ''}`}>⏱ {left}s</span>
            <Link href="/skills" className="rg-chip">✦ Skills</Link>
            <button type="button" className="rg-chip" onClick={() => setShowLog((v) => !v)}>Log</button>
          </div>
          <div className="rg-obj">
            <b>Encounter {b.stage} / {b.stages}</b>
            <span>{ACT_NAME[ai]}</span>
            <span className={aliveEnemies.length === 0 ? 'ok' : ''}>◉ Defeat all {enemies.length} enemies</span>
            <span className={heroes.every((h) => h.hp > 0) ? 'ok' : ''}>◉ Keep every hero standing</span>
            {b.drain && <span className="bad">The Collector garnishes Power (−20%)</span>}
          </div>
        </div>

        {/* prompt banner */}
        <div className="rg-prompt">
          <div className="rg-prompt-t">{b.prompt}</div>
          {b.locked && <div className="rg-lock">🔒 Locked: <b>{b.locked.toUpperCase().split('').join(' ')}</b></div>}
        </div>

        {/* units */}
        {enemies.map((u, i) => (
          <Sprite key={u.id} u={u} floats={floatsFor(u)} style={ePos(i, enemies.length)} picked={target === u.id}
            onPick={needsEnemy && canAct && u.hp > 0 ? () => setTarget(target === u.id ? null : u.id) : undefined} />
        ))}
        {heroes.map((u, i) => (
          <Sprite key={u.id} u={u} floats={floatsFor(u)} style={hPos(i, heroes.length)} picked={target === u.id}
            onPick={needsAlly && canAct && u.hp > 0 ? () => setTarget(target === u.id ? null : u.id) : undefined} />
        ))}

        {/* bottom-left: party cards */}
        <div className="rg-party">
          {heroes.map((u) => {
            const hp = Math.max(0, Math.min(100, (u.hp / u.max_hp) * 100));
            const me = u.player_id === b.me;
            return (
              <button key={u.id} type="button" className={`rg-pc${me ? ' me' : ''}${u.hp <= 0 ? ' down' : ''}${target === u.id ? ' picked' : ''}`}
                onClick={needsAlly && canAct && u.hp > 0 ? () => setTarget(target === u.id ? null : u.id) : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={portrait(u)} alt="" draggable={false} />
                <span className="rg-pc-ult">{u.ult ?? 0}/6</span>
                <span className="rg-pc-hp"><i style={{ width: `${hp}%` }} /></span>
                <span className="rg-pc-n">{u.hero ?? u.name}{u.locked && u.hp > 0 ? ' ✓' : ''}{u.corruption > 0 ? ` ☠${u.corruption}` : ''}</span>
                <span className="rg-pc-v">{u.hp}</span>
              </button>
            );
          })}
        </div>

        {/* bottom-right: skills + ultimate */}
        {mine && b.step === 'input' && (
          <div className="rg-skills">
            <button type="button" className={`rg-sk${action === 'attack' ? ' sel' : ''}`} disabled={skillDisabled} onClick={() => { setAction('attack'); setTarget(null); }}><b>⚔</b><em>Strike</em></button>
            <button type="button" className={`rg-sk${action === 'guard' ? ' sel' : ''}`} disabled={skillDisabled} onClick={() => { setAction('guard'); setTarget(null); }}><b>🛡</b><em>Guard</em></button>
            <button type="button" className={`rg-sk${action === 'heal' ? ' sel' : ''}`} disabled={skillDisabled} onClick={() => { setAction('heal'); setTarget(null); }}><b>✚</b><em>Heal</em></button>
            <button type="button" className={`rg-ult${ultReady ? ' ready' : ''}${action === 'ult' ? ' sel' : ''}`} disabled={skillDisabled || !ultReady}
              onClick={() => { setAction('ult'); setTarget(null); }} title={ULT_NAME[mine.hero ?? ''] ?? 'Ultimate'}>
              {myHero && /* eslint-disable-next-line @next/next/no-img-element */ <img src={myHero.artFull} alt="" draggable={false} />}
              <span className="rg-ult-n">{mine.ult ?? 0}/6</span>
              <em>{ultReady ? (ULT_NAME[mine.hero ?? ''] ?? 'ULT') : 'ULT'}</em>
            </button>
          </div>
        )}
      </div>

      {/* hand of cards + book */}
      {b.step === 'input' && mine && (
        <div className="rg-hand">
          <button type="button" className="rg-book" disabled={!!b.book_used || mine.hp <= 0} onClick={() => void openBook()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BOOK_ART} alt="" draggable={false} />
            <b>Book of Wisdom</b><small>{b.book_used ? 'Read' : 'Answer fast → rare card'}</small>
          </button>
          {b.cards.length === 0 && <span className="muted small">No cards. Good words draw them, the Book gives rare ones.</span>}
          {b.cards.map((c, i) => (
            <button key={c + i} type="button" className={`rg-card${CARDS[c]?.rare ? ' rare' : ''}`} disabled={b.card_used || mine.hp <= 0}
              onClick={() => token && void act(() => rpc.battleCard(token, c)).then(() => load())}>
              {myHero && /* eslint-disable-next-line @next/next/no-img-element */ <img src={myHero.artFull} alt="" draggable={false} />}
              <span className="rg-card-g">{CARDS[c]?.glyph ?? '🃏'}</span>
              <b>{CARDS[c]?.label ?? c}</b><small>{CARDS[c]?.hint}</small>
            </button>
          ))}
        </div>
      )}

      {b.step === 'input' ? (
        <div className="rg-panel">
          {mine && mine.hp <= 0 ? <div className="muted center">You&apos;re down. Your team fights on…</div> : mine?.locked ? (
            <div className="muted center">{msg || 'Locked in'}. Waiting for the team…</div>
          ) : (
            <form onSubmit={submit} className="bt-form">
              <input className="input" autoComplete="off" autoCapitalize="none" value={word} maxLength={20}
                placeholder={action === 'ult' ? `${ULT_NAME[mine?.hero ?? ''] ?? 'Ultimate'}: type a word that fits…` : `${action === 'attack' ? 'Strike' : action === 'guard' ? 'Guard' : 'Heal'}: type a word that fits…`}
                onChange={(e) => setWord(e.target.value)} />
              <button className="btn" disabled={!word.trim() || !canAct}>Cast ▸</button>
            </form>
          )}
          {(needsEnemy || needsAlly) && canAct && <div className="muted small center">Tap {needsEnemy ? 'an enemy' : 'an ally'} to target it{target ? ' ✓' : ' (auto if none)'}</div>}
          {msg && !mine?.locked && <div className="muted small center">{msg}</div>}
        </div>
      ) : (
        <div className="rg-panel center">
          <h2>{b.step === 'won' ? 'Victory! The Government has fallen.' : 'Defeat… the IRS wins this round.'}</h2>
          <a className="btn" href="/">Back to menu</a>
        </div>
      )}

      {showLog && <div className="bt-log">{b.log.map((e, i) => <div key={i}>{logLine(e)}</div>)}</div>}

      {/* Book of Wisdom modal */}
      <AnimatePresence>
        {(book || bookOpenStage) && (
          <motion.div className="rg-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="rg-bookbox" initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="rg-bookbg" src={BOOK_ART} alt="" draggable={false} />
              <div className="rg-bookin">
                <h3>Book of Wisdom</h3>
                {book ? (
                  <form onSubmit={answerBook}>
                    <div className="rg-bookq">{book.prompt}</div>
                    <div className={`rg-booktimer${bookLeft <= 5 ? ' warn' : ''}`}><i style={{ width: `${(bookLeft / 15) * 100}%` }} /></div>
                    <div className="muted small center">{bookLeft}s left</div>
                    <input className="input" autoFocus autoComplete="off" autoCapitalize="none" value={bookWord} maxLength={24} placeholder="Answer…" onChange={(e) => setBookWord(e.target.value)} />
                    <button className="btn" disabled={!bookWord.trim()}>Answer ▸</button>
                    {bookMsg && <div className="muted small center">{bookMsg}</div>}
                  </form>
                ) : (
                  <div className="center"><p>{bookMsg}</p><button type="button" className="btn" onClick={() => { setBookOpenStage(false); setBookMsg(''); }}>Close</button></div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Act intro */}
      <AnimatePresence>
        {intro !== null && (
          <motion.div className="rg-intro" style={{ backgroundImage: `url(${ACT_BG[intro]})` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4, duration: 0.7 }}>
              <small>{['ACT ONE', 'ACT TWO', 'ACT THREE'][intro]}</small>
              <h1>{ACT_NAME[intro].split('· ')[1]}</h1>
              <p>Get ready…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

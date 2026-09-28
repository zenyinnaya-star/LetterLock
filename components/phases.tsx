'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_INFO, CLASSES } from '@/lib/classes';
import { REASONS } from '@/lib/errors';
import { rpc } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import { CLASS_COLORS, CardIcon, ClassIcon, Icon } from './icons';
import { Avatar, Clock, nameOf, softSpring, spring, TileRow } from './ui';

export type Act = <T>(fn: () => Promise<T>, okMsg?: string) => Promise<T | undefined>;

export interface PhaseProps {
  state: RoomState;
  token: string | null;
  msLeft: number;
  act: Act;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const stagger = (i: number, step = 0.08) => ({ ...softSpring, delay: i * step });

function StageHead({ state, label, msLeft, showClock = true }: { state: RoomState; label: string; msLeft: number; showClock?: boolean }) {
  return (
    <div className="stage-head">
      <span className={`phase-tag${state.room.duel ? ' duel' : ''}`}>
        {state.room.duel && <Icon name="swords" size={14} />}
        {state.room.duel ? 'Final duel · ' : ''}Round {state.room.round} · {label}
      </span>
      {showClock && <Clock msLeft={msLeft} />}
    </div>
  );
}

function Hints({ state }: { state: RoomState }) {
  if (state.hints.length === 0) return null;
  return (
    <div className="col" style={{ gap: 6, width: '100%', maxWidth: 620, margin: '0 auto' }}>
      {state.hints.map((h, i) => (
        <motion.div key={i} className="hint" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={stagger(i)}>
          <Icon name="eye" size={16} /> Round {h.round}: {h.text}
        </motion.div>
      ))}
    </div>
  );
}

function Spectating({ text }: { text: string }) {
  return <div className="note info" style={{ justifyContent: 'center' }}><Icon name="eye" size={18} /> {text}</div>;
}

/* ───────────── ANSWER ───────────── */
export function AnswerPhase({ state, token, msLeft, act }: PhaseProps) {
  const me = state.me;
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const banned = useMemo(() => new Set(me?.letters.map((l) => l.letter) ?? []), [me?.letters]);

  useEffect(() => { setWord(''); inputRef.current?.focus(); }, [state.room.round]);

  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  const hasBanned = !me?.hacked && clean.toUpperCase().split('').some((c) => banned.has(c));
  const canPlay = !!me && !me.eliminated && !!token;

  async function submit() {
    if (!token || !clean || busy) return;
    setBusy(true);
    await act(() => rpc.answer(token, clean));
    setBusy(false);
  }

  return (
    <>
      <StageHead state={state} label="Answer" msLeft={msLeft} />
      <div className="prompt-kicker label">The prompt</div>
      <motion.h1 className="prompt" initial={{ opacity: 0, scale: 0.85, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={softSpring}>
        {state.prompt}
      </motion.h1>
      {canPlay && me.hacked && (
        <motion.div className="note hack" style={{ maxWidth: 620, margin: '0 auto', width: '100%' }}
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1, x: [0, -3, 3, 0] }} transition={{ x: { repeat: 3, duration: 0.2 } }}>
          <Icon name="terminal" size={16} /> You&apos;ve been hacked — your locks are hidden this round. Play carefully{me.can_trace ? ', and trace the hacker from your rack' : ''}.
        </motion.div>
      )}
      {canPlay ? (
        <div className="narrow-col">
          <form className="col" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <input ref={inputRef} className="input word" value={word} maxLength={30} autoCapitalize="off" autoComplete="off"
              autoCorrect="off" spellCheck={false} placeholder="type a word"
              onChange={(e) => setWord(e.target.value)} aria-label="Your answer" />
            <div className="word-preview" aria-hidden>
              <AnimatePresence initial={false} mode="popLayout">
                {clean.toUpperCase().split('').map((c, i) => (
                  <motion.span key={`${i}-${c}`} layout className={`ch${!me?.hacked && banned.has(c) ? ' bad' : ''}`}
                    initial={{ y: -10, opacity: 0, scale: 0.6 }}
                    animate={!me?.hacked && banned.has(c) ? { y: 0, opacity: 1, scale: 1, x: [0, -4, 4, -3, 0] } : { y: 0, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.22 }}>
                    {c}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {hasBanned && (
                <motion.div className="note bad" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Icon name="alert" size={16} /> That uses one of your locked letters — it&apos;ll cost you a strike.
                </motion.div>
              )}
            </AnimatePresence>
            <button className="btn lg block" disabled={!clean || busy}>{me.answer ? 'Change answer' : 'Lock it in'}</button>
          </form>
          <AnimatePresence mode="wait">
            {me.answer && (
              <motion.div key={`${me.answer.word}-${me.answer.valid}`} className={`note ${me.answer.valid ? 'ok' : 'bad'}`}
                initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={spring}>
                <Icon name={me.answer.valid ? 'check' : 'x'} size={16} />
                <span>{me.answer.valid
                  ? <>Locked in <b>{me.answer.word.toUpperCase()}</b> for +{me.answer.points}. You can change it until time runs out.</>
                  : <>{me.answer.word ? <b>{me.answer.word.toUpperCase()}</b> : 'That'} — {REASONS[me.answer.reason ?? ''] ?? me.answer.reason}. Try another.</>}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {me.used_words.length > 0 && <div className="muted small center">Already used: {me.used_words.join(', ')}</div>}
        </div>
      ) : (
        <Spectating text="Spectating — watching everyone answer." />
      )}
      <Hints state={state} />
    </>
  );
}

/* ───────────── REVEAL ───────────── */
export function RevealPhase({ state, msLeft }: PhaseProps) {
  return (
    <>
      <StageHead state={state} label="Reveal" msLeft={msLeft} />
      <h2 className="stage-title">“{state.prompt}”</h2>
      <div className="reveal-list">
        {state.reveal.map((r, i) => {
          const p = state.players.find((x) => x.id === r.player_id);
          return (
            <motion.div key={r.player_id} className={`reveal-row${r.valid ? '' : ' bad'}`}
              initial={{ opacity: 0, rotateX: -90, y: 10 }} animate={{ opacity: 1, rotateX: 0, y: 0 }}
              transition={{ ...spring, delay: 0.15 + i * 0.35 }} style={{ transformPerspective: 600 }}>
              <Avatar state={state} id={r.player_id} size={36} />
              <div>
                <div className="small muted">{p?.name}</div>
                <div className="word">{r.word ? r.word.toUpperCase() : '— — —'}</div>
                {!r.valid && (
                  <div className="why"><Icon name="x" size={13} strokeWidth={3} /> {REASONS[r.reason ?? ''] ?? r.reason} · strike{p?.eliminated ? ' · eliminated' : ''}</div>
                )}
              </div>
              <motion.div className="score" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.35 + i * 0.35 }}
                style={{ color: r.valid ? 'var(--ok)' : 'var(--lock)' }}>
                {r.valid ? `+${r.points}` : <Icon name={p?.eliminated ? 'skull' : 'x'} size={24} strokeWidth={2.6} />}
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}

/* ───────────── GUESS ───────────── */
export function GuessPhase({ state, token, msLeft, act }: PhaseProps) {
  const me = state.me;
  const [target, setTarget] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const targets = state.players.filter((p) => !p.eliminated && p.id !== me?.id);
  const tp = targets.find((p) => p.id === target);
  const canPlay = !!me && !me.eliminated && !!token;

  useEffect(() => { setTarget(null); setLetter(null); }, [state.room.round]);

  return (
    <>
      <StageHead state={state} label="Guess" msLeft={msLeft} />
      <h2 className="stage-title">Crack someone&apos;s lock</h2>
      <p className="muted center" style={{ margin: 0 }}>One guess. Hit a banned letter and you draw a card.</p>
      <Hints state={state} />
      {!canPlay ? (
        <Spectating text="Spectating — players are guessing." />
      ) : me.guess ? (
        <motion.div className={`note ${me.guess.correct ? 'ok' : 'bad'}`} style={{ maxWidth: 560, margin: '0 auto' }}
          initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
          <Icon name={me.guess.correct ? 'target' : 'miss'} size={18} />
          <span>{me.guess.correct
            ? <>Cracked! <b>{nameOf(state, me.guess.target_id)}</b> is locked out of “{me.guess.letter}”. You drew a card if you had room.</>
            : <>Miss — {nameOf(state, me.guess.target_id)} can use “{me.guess.letter}”.</>}</span>
        </motion.div>
      ) : (
        <div className="narrow-col">
          <div className="targets">
            {targets.map((p, i) => (
              <motion.button key={p.id} className={`target${target === p.id ? ' sel' : ''}`} onClick={() => setTarget(p.id)}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={stagger(i, 0.05)} whileTap={{ scale: 0.95 }}>
                <ClassIcon cls={p.class} size={28} /> {p.name}
                <span className="muted small" style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><Icon name="lock" size={12} />{p.letter_count}</span>
              </motion.button>
            ))}
          </div>
          <div className="kbd">
            {ALPHABET.map((l, i) => (
              <motion.button key={l} className={`key${letter === l ? ' sel' : ''}`} disabled={!tp || tp.revealed.includes(l)}
                onClick={() => setLetter(l)} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: letter === l ? 1.08 : 1 }}
                transition={{ ...spring, delay: i * 0.012 }} whileTap={{ scale: 0.9 }}>{l}</motion.button>
            ))}
          </div>
          <button className="btn lg block" disabled={!target || !letter}
            onClick={() => target && letter && token && void act(() => rpc.guess(token, target, letter))}>
            <Icon name="target" size={20} /> {tp && letter ? `Guess “${letter}” on ${tp.name}` : 'Pick a player and a letter'}
          </button>
        </div>
      )}
    </>
  );
}

/* ───────────── REACT ───────────── */
export function ReactPhase({ state, token, msLeft, act }: PhaseProps) {
  const me = state.me;
  const canPlay = !!me && !me.eliminated && !!token;
  const myReady = state.players.find((p) => p.id === me?.id)?.react_ready;
  const aimedAtMe = state.pending.some((p) => p.target_id === me?.id && p.status === 'pending');
  let i = 0;

  return (
    <>
      <StageHead state={state} label="Cards" msLeft={msLeft} />
      <h2 className="stage-title">Play your cards</h2>
      <div className="feed">
        {state.guess_results.length === 0 && state.pending.length === 0 && (
          <div className="feed-item muted"><span className="glyph miss"><Icon name="miss" size={16} /></span><span className="txt">Quiet round — nobody cracked anything.</span></div>
        )}
        {state.guess_results.map((g) => (
          <motion.div key={`g-${g.guesser_id}`} className="feed-item" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={stagger(i++)}>
            <span className={`glyph ${g.correct ? 'good' : 'miss'}`}><Icon name={g.correct ? 'target' : 'miss'} size={16} /></span>
            <span className="txt"><b>{nameOf(state, g.guesser_id)}</b>{' '}
              {g.correct ? <>cracked <b>{nameOf(state, g.target_id)}</b>’s “{g.letter}”</> : <>missed on {nameOf(state, g.target_id)}</>}</span>
          </motion.div>
        ))}
        <AnimatePresence initial={false}>
          {state.pending.map((p) => (
            <motion.div key={`p-${p.id}`} layout className={`feed-item${p.status === 'blocked' ? ' blocked' : ''}`}
              initial={{ opacity: 0, x: 30, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={stagger(i++)}>
              <span className={`glyph ${p.status === 'blocked' ? 'block' : 'hit'}`}>
                <Icon name={p.status === 'blocked' ? 'shield' : p.kind === 'ninja' ? 'eye' : p.kind === 'hack' ? 'terminal' : 'burst'} size={16} />
              </span>
              <span className="txt">
                {p.kind === 'ninja'
                  ? <>Ninja penalty: <b>{nameOf(state, p.target_id)}</b> takes +{p.amount} letters</>
                  : p.kind === 'hack'
                  ? <><b>{p.source_id ? nameOf(state, p.source_id) : 'Someone'}</b> hacks <b>{nameOf(state, p.target_id)}</b> (+{p.amount}, locks hidden next round)</>
                  : <><b>{nameOf(state, p.source_id)}</b> attacks <b>{nameOf(state, p.target_id)}</b> (+{p.amount})</>}
                {p.absorbed_by && <> — absorbed by {nameOf(state, p.absorbed_by)}</>}
                {p.status === 'blocked' && <> — blocked</>}
              </span>
              {canPlay && me.class === 'hero' && !me.perk_used && state.room.settings.perks && p.status === 'pending' && p.target_id !== me.id && (
                <button className="btn sm ok" onClick={() => token && void act(() => rpc.usePerk(token, p.target_id), 'Absorbed! +5 points')}>
                  Take the hit (+5)
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {canPlay && aimedAtMe && me.cards.some((c) => c.kind === 'shield') && me.class !== 'villain' && (
          <motion.div className="note bad" style={{ maxWidth: 620, margin: '0 auto', width: '100%' }}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: [1, 1.03, 1] }} exit={{ opacity: 0 }}
            transition={{ scale: { repeat: Infinity, duration: 1.2 } }}>
            <Icon name="alert" size={16} /> You&apos;re under attack — play your Shield from the rack below.
          </motion.div>
        )}
      </AnimatePresence>
      {canPlay && (
        <div className="narrow-col">
          <button className="btn ghost block" disabled={!!myReady} onClick={() => token && void act(() => rpc.reactReady(token))}>
            {myReady ? 'Waiting for the others…' : "I'm done — skip ahead"}
          </button>
        </div>
      )}
      <p className="muted small center" style={{ margin: 0 }}>When the clock ends, attacks land and everyone who survived the round gains a new lock.</p>
    </>
  );
}

/* ───────────── DUEL INTRO ───────────── */
export function DuelIntro({ state }: PhaseProps) {
  const [a, b] = state.players.filter((p) => !p.eliminated);
  if (!a || !b) return null;
  return (
    <div className="duel-stage">
      <motion.div className="phase-tag duel" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Icon name="swords" size={14} /> Final duel
      </motion.div>
      <div className="fighters">
        <motion.div className="fighter" initial={{ x: -160, opacity: 0, rotate: -12 }} animate={{ x: 0, opacity: 1, rotate: 0 }} transition={{ ...spring, delay: 0.1 }}>
          <ClassIcon cls={a.class} size={110} /><b>{a.name}</b><span className="muted">{a.points} pts</span>
        </motion.div>
        <motion.div className="vs" initial={{ scale: 4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 700, damping: 18, delay: 0.55 }}>VS</motion.div>
        <motion.div className="fighter" initial={{ x: 160, opacity: 0, rotate: 12 }} animate={{ x: 0, opacity: 1, rotate: 0 }} transition={{ ...spring, delay: 0.25 }}>
          <ClassIcon cls={b.class} size={110} /><b>{b.name}</b><span className="muted">{b.points} pts</span>
        </motion.div>
      </div>
      <motion.div className="center muted" style={{ maxWidth: 440 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
        +1 letter each · {state.room.settings.duel_seconds}-second rounds · strikes never reset. Last one standing wins.
        {[a, b].some((p) => p.class === 'hero') && <><br />The Hero&apos;s comeback: cut down to a single letter.</>}
      </motion.div>
    </div>
  );
}

/* ───────────── FINISHED ───────────── */
export function Finished({ state, token, act }: PhaseProps) {
  const t = state.titles;
  const isHost = state.me?.id === state.room.host_id;
  const winner = state.players.find((p) => p.id === state.room.winner_id);
  const awards = [
    { key: 'champ', icon: 'trophy' as const, color: '#ffcf4a', title: 'Champion', who: t?.champion, sub: 'Last one standing' },
    { key: 'ein', icon: 'bulb' as const, color: '#b69cff', title: 'Albert Einstein', who: t?.einstein, sub: 'Most letters played' },
    { key: 'vil', icon: 'horns' as const, color: '#ff7a90', title: 'The Villain', who: t?.villain, sub: 'Stacked the most letters on others' },
  ];
  return (
    <>
      <div className="winner victory-stage">
        {winner && (
          <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            <ClassIcon cls={winner.class} size={120} />
          </motion.div>
        )}
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay: 0.2 }}>
          {nameOf(state, state.room.winner_id)} wins!
        </motion.h1>
      </div>
      <div className="podium">
        {awards.map((a, i) => (
          <motion.div key={a.key} className="award" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.45 + i * 0.15 }}>
            <div className="medal" style={{ background: `${a.color}22`, color: a.color }}><Icon name={a.icon} size={28} /></div>
            <div className="title">{a.title}</div>
            <div className="who">{a.who ? nameOf(state, a.who) : 'Nobody'}</div>
            <div className="muted small">{a.sub}</div>
          </motion.div>
        ))}
      </div>
      <div className="locks-table">
        <div className="label">Everyone&apos;s locks</div>
        {state.players.map((p) => (
          <div key={p.id} className="locks-row">
            <span className="row" style={{ gap: 8 }}><ClassIcon cls={p.class} size={26} /><b>{p.name}</b>{p.quit && <span className="tagchip chicken">chicken</span>}</span>
            <TileRow small letters={(p.letters ?? []).map((l) => ({ letter: l, revealed: p.revealed.includes(l) }))} />
            <span className="muted small">{p.points} pts</span>
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        {isHost && token
          ? <button className="btn lg" onClick={() => void act(() => rpc.playAgain(token))}>Play again</button>
          : <span className="muted">Waiting for the host to start a rematch…</span>}
      </div>
    </>
  );
}

/* ───────────── RACK: my letters, cards, perk ───────────── */
export function Rack({ state, token, act }: Omit<PhaseProps, 'msLeft'>) {
  const me = state.me;
  const [open, setOpen] = useState<null | { kind: 'card'; id: number } | { kind: 'perk' } | { kind: 'trace' }>(null);
  const phase = state.room.phase;
  useEffect(() => setOpen(null), [phase]);
  if (!me || !token || phase === 'lobby' || phase === 'finished') return null;

  const info = CLASSES[me.class];
  const cfg = state.room.settings;
  const others = state.players.filter((p) => !p.eliminated && p.id !== me.id);
  const suspects = state.players.filter((p) => p.id !== me.id && !p.quit);
  const perkUsable = cfg.perks && !me.perk_used && !me.eliminated && (
    (me.class === 'ninja' && state.room.round >= 3) ||
    (me.class === 'mastermind' && ['answer', 'reveal', 'guess'].includes(phase)));

  function cardUsable(kind: string): boolean {
    if (me!.eliminated) return false;
    if (kind === 'attack' || kind === 'cleanse') return phase === 'guess' || phase === 'react';
    if (kind === 'shield') return phase === 'react' && me!.class !== 'villain'
      && state.pending.some((p) => p.target_id === me!.id && p.status === 'pending');
    return false;
  }

  const perkLabel = !cfg.perks ? 'Perks are off'
    : me.class === 'villain' ? 'Passive: attacks hit ×2'
    : me.class === 'hacker' ? (me.perk_used ? 'Used' : 'Passive: attacks hack')
    : me.class === 'hero' ? (me.perk_used ? 'Used' : 'Absorb a hit in the cards phase')
    : me.perk_used ? 'Used'
    : me.class === 'ninja' ? (state.room.round < 3 ? 'Unlocks round 3' : 'See all letters in play')
    : 'Peek at one player';

  return (
    <motion.div className="rack" initial={{ y: 120 }} animate={{ y: 0 }} transition={softSpring}>
      <div className="rack-inner">
        <div className="sect" style={{ position: 'relative' }}>
          <span className="sect-label">Locks</span>
          {me.hacked ? (
            <div className="tiles hacked-tiles" title="Hacked — you can't see your locks this round">
              {me.letters.map((_, i) => (
                <motion.span key={i} className="tile glitch" animate={{ opacity: [1, 0.4, 1, 0.7, 1], x: [0, -2, 2, 0] }}
                  transition={{ repeat: Infinity, duration: 0.9 + i * 0.13 }}>?</motion.span>
              ))}
            </div>
          ) : <TileRow letters={me.letters} />}
          {me.can_trace && (
            <motion.button className="btn sm hackbtn" onClick={() => setOpen(open?.kind === 'trace' ? null : { kind: 'trace' })}
              animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}>
              <Icon name="terminal" size={15} /> Trace hacker
            </motion.button>
          )}
          <AnimatePresence>
            {open?.kind === 'trace' && (
              <motion.div className="popover" initial={{ opacity: 0, y: 8, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }}>
                <span className="label">Who hacked you? One guess.</span>
                {suspects.map((p) => (
                  <button key={p.id} className="btn sm ghost" onClick={() => {
                    setOpen(null);
                    void act(() => rpc.trace(token, p.id));
                  }}><ClassIcon cls={p.class} size={18} /> {p.name}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <span className="sep" />
        <div className="sect" style={{ position: 'relative' }}>
          <span className="sect-label">Cards</span>
          {me.cards.length === 0 && <span className="small" style={{ color: '#e8cfa6' }}>{cfg.cards ? 'Crack a lock to draw one' : 'Cards are off'}</span>}
          <AnimatePresence initial={false}>
            {me.cards.map((c) => (
              <motion.div key={c.id} style={{ position: 'relative' }} layout
                initial={{ rotateY: 180, scale: 0.5, opacity: 0 }} animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                exit={{ y: -80, opacity: 0, scale: 1.2 }} transition={spring}>
                <motion.button className={`minicard ${c.kind}`} disabled={!cardUsable(c.kind)} whileHover={{ y: -4 }} whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (c.kind === 'attack') setOpen(open?.kind === 'card' && open.id === c.id ? null : { kind: 'card', id: c.id });
                    else void act(() => rpc.playCard(token, c.id, null), c.kind === 'shield' ? 'Blocked!' : 'Cleansed a letter');
                  }}>
                  <span className="art"><CardIcon kind={c.kind} size={22} /></span>
                  <span>{CARD_INFO[c.kind].name}<small>{c.kind === 'attack' && me.class === 'villain' ? '+2 letters' : c.kind === 'attack' && me.class === 'hacker' ? 'Anonymous hack' : CARD_INFO[c.kind].text}</small></span>
                </motion.button>
                <AnimatePresence>
                  {open?.kind === 'card' && open.id === c.id && (
                    <motion.div className="popover" initial={{ opacity: 0, y: 8, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }}>
                      <span className="label">{me.class === 'hacker' ? 'Hack who?' : 'Attack who?'}</span>
                      {others.map((p) => (
                        <button key={p.id} className="btn sm danger" onClick={() => {
                          setOpen(null);
                          void act(() => rpc.playCard(token, c.id, p.id), me.class === 'hacker' ? `Hack queued on ${p.name}` : `Attack queued on ${p.name}`);
                        }}><ClassIcon cls={p.class} size={18} /> {p.name}</button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <span className="sep" />
        <div className="sect" style={{ position: 'relative' }}>
          <motion.button className="perkbtn" disabled={!perkUsable} whileTap={{ scale: 0.96 }}
            animate={perkUsable ? { boxShadow: [`0 0 0 0 ${CLASS_COLORS[me.class][0]}00`, `0 0 0 4px ${CLASS_COLORS[me.class][0]}66`, `0 0 0 0 ${CLASS_COLORS[me.class][0]}00`] } : {}}
            transition={{ repeat: Infinity, duration: 1.8 }}
            onClick={() => {
              if (me.class === 'mastermind') setOpen(open?.kind === 'perk' ? null : { kind: 'perk' });
              else if (me.class === 'ninja') void act(() => rpc.usePerk(token, null), 'Ninja vision activated');
            }}>
            <ClassIcon cls={me.class} size={32} />
            <span>{info.name}<small>{perkLabel}</small></span>
          </motion.button>
          <AnimatePresence>
            {open?.kind === 'perk' && (
              <motion.div className="popover" initial={{ opacity: 0, y: 8, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }}>
                <span className="label">Peek at who?</span>
                {others.map((p) => (
                  <button key={p.id} className="btn sm ghost" onClick={() => {
                    setOpen(null);
                    void act(() => rpc.usePerk(token, p.id), 'Peeked — one letter leaked to the room');
                  }}><ClassIcon cls={p.class} size={18} /> {p.name}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {me.intel.length > 0 && (
          <>
            <span className="sep" />
            <div className="sect">
              <span className="sect-label">Intel</span>
              <div className="col" style={{ gap: 4 }}>
                {me.intel.map((x, idx) => (
                  <div key={idx} className="row small" style={{ gap: 6, color: '#fff4dc' }}>
                    <Icon name="eye" size={14} /> {x.kind === 'ninja' ? 'In play' : x.target_name}
                    <TileRow small letters={x.letters.map((l) => ({ letter: l }))} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        <span className="grow" />
        <div className="rack-pts">
          <motion.span key={me.points} initial={{ scale: 1.4 }} animate={{ scale: 1 }} style={{ display: 'inline-block' }}>{me.points}</motion.span>
          <small>POINTS</small>
        </div>
      </div>
    </motion.div>
  );
}

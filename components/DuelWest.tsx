'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prepareAnswer } from '@/lib/answer';
import { audio } from '@/lib/audio';
import { CHAOS_INFO } from '@/lib/classes';
import { REASONS } from '@/lib/errors';
import { useT } from '@/lib/i18n/react';
import { narrator } from '@/lib/narrator';
import { rpc } from '@/lib/rpc';
import type { PublicPlayer, RoomState } from '@/lib/types';
import { westArtVars } from '@/lib/westArt';
import type { PhaseProps } from './phases';
import { nameOf } from './ui';
import { GameSummary } from './GameSummary';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PHASE_SECS: Record<string, number> = { reveal: 6, guess: 20, react: 8, duel_intro: 6 };

/* ───────── pieces ───────── */

/** Revolver cylinder: one brass round per life left, empty chambers for strikes taken. */
function Cylinder({ lives, max, flip }: { lives: number; max: number; flip?: boolean }) {
  const n = Math.max(max, 1);
  const spent = useRef(n - lives);
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (n - lives > spent.current) { setTurn((v) => v + 360 / n); audio.spin(); }
    spent.current = n - lives;
  }, [lives, n]);
  return (
    <motion.svg className="w-cyl" viewBox="0 0 100 100" animate={{ rotate: (flip ? -1 : 1) * turn }} transition={{ type: 'spring', stiffness: 90, damping: 14 }}
      role="img" aria-label={`${lives} of ${n} rounds left`}>
      <defs>
        <radialGradient id="cylsteel" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#6b6f78" /><stop offset=".55" stopColor="#2e3036" /><stop offset="1" stopColor="#141518" /></radialGradient>
        <radialGradient id="cylbrass" cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#ffe7a3" /><stop offset=".45" stopColor="#d4a33c" /><stop offset="1" stopColor="#7a5414" /></radialGradient>
        <radialGradient id="cylhole" cx="50%" cy="50%" r="60%"><stop offset="0" stopColor="#030303" /><stop offset="1" stopColor="#1d1e22" /></radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="url(#cylsteel)" stroke="#0b0b0d" strokeWidth="2" />
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(a) * 28, y = 50 + Math.sin(a) * 28;
        const loaded = i < lives;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="12.5" fill="url(#cylhole)" stroke="#0a0a0b" strokeWidth="1.5" />
            {loaded && <><circle cx={x} cy={y} r="10" fill="url(#cylbrass)" /><circle cx={x} cy={y} r="4" fill="#b9862c" stroke="#7a5414" strokeWidth="1" /></>}
          </g>
        );
      })}
      <circle cx="50" cy="50" r="7" fill="#1a1b1f" stroke="#55585f" strokeWidth="1.5" />
    </motion.svg>
  );
}

function Gunslinger({ p, side, me, max, hit }: { p: PublicPlayer; side: 'left' | 'right'; me: boolean; max: number; hit: number }) {
  const t = useT();
  const lives = Math.max(0, max - p.strikes);
  return (
    <div className={`w-gun ${side}${me ? ' me' : ''}`}>
      <div className={`w-portrait${hit ? ' hit' : ''}`} key={`p${hit}`}>
        {p.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.avatar_url} alt="" draggable={false} />
          : <span className="w-portrait-fallback" />}
      </div>
      <Cylinder lives={lives} max={max} flip={side === 'right'} />
      <div className="w-name"><b>{me ? t('wst.you') : p.name}</b><span>{t('du.pts', { n: p.points })}</span></div>
    </div>
  );
}

function TownClock({ msLeft, total }: { msLeft: number; total: number }) {
  const secs = Math.max(0, Math.ceil(msLeft / 1000));
  const frac = total > 0 ? Math.max(0, Math.min(1, msLeft / (total * 1000))) : 0;
  const mm = Math.floor(secs / 60), ss = secs % 60;
  return (
    <div className={`w-clock${secs <= 5 && secs > 0 ? ' urgent' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <line className="hand min" x1="50" y1="50" x2="50" y2="26" style={{ transform: `rotate(${(1 - frac) * 360}deg)` }} />
        <line className="hand sec" x1="50" y1="56" x2="50" y2="18" style={{ transform: `rotate(${(60 - ss) * 6}deg)` }} />
        <circle cx="50" cy="50" r="3" fill="#2b2014" />
      </svg>
      <span className="w-time">{mm}:{String(ss).padStart(2, '0')}</span>
    </div>
  );
}

/** Opponent's locked letters as the bounty on the Wanted poster. Revealed letters keep a stable slot. */
function bountySlots(count: number, revealed: string[]): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: count }, () => null);
  for (const l of revealed) {
    if (count === 0) break;
    let i = (l.charCodeAt(0) * 7) % count;
    for (let k = 0; k < count && out[i] !== null; k++) i = (i + 1) % count;
    if (out[i] === null) out[i] = l;
  }
  return out;
}

/* ───────── main ───────── */

export function DuelWest({ state, token, msLeft, act }: PhaseProps) {
  const t = useT();
  const phase = state.room.phase;
  const me = state.me;
  const alive = state.players.filter((p) => !p.eliminated);
  const meP = alive.find((p) => p.id === me?.id);
  const [left, right] = meP ? [meP, alive.find((p) => p.id !== meP.id)!] : [alive[0], alive[1]];
  const opp = meP ? right : null;
  const max = state.room.settings.strikes;
  const canPlay = !!me && !me.eliminated && !!token && !!meP;
  const total = phase === 'answer' ? state.room.answer_seconds : PHASE_SECS[phase] ?? 0;
  const secs = Math.ceil(msLeft / 1000);

  /* answer input */
  const lang = state.room.settings.lang ?? 'en';
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const banned = useMemo(() => new Set(me?.letters.map((l) => l.letter) ?? []), [me?.letters]);
  const prepared = prepareAnswer(word, lang);
  const typed = prepared.letters.toUpperCase().split('');
  const twist = state.room.settings.twist ?? 'none';
  const reverse = twist === 'reverse', memory = twist === 'memory';
  const noE = state.room.chaos === 'no_e';
  const isBad = (c: string) => (!me?.hacked && !reverse && !memory && banned.has(c)) || (noE && c === 'E');
  useEffect(() => { setWord(''); setPick(null); if (phase === 'answer') window.setTimeout(() => inputRef.current?.focus(), 350); }, [state.room.round, phase]);

  const draftT = useRef<number | null>(null);
  function sendDraft(v: string) {
    if (!token) return;
    if (draftT.current) window.clearTimeout(draftT.current);
    draftT.current = window.setTimeout(() => { void rpc.setDraft(token, v).catch(() => undefined); }, 500);
  }
  async function submitWord() {
    if (!token || !prepared.send || busy) return;
    setBusy(true); audio.unlock();
    await act(() => rpc.answer(token, prepared.send));
    setBusy(false);
  }

  /* guess */
  const [pick, setPick] = useState<string | null>(null);
  async function fire() {
    if (!token || !opp || !pick || busy) return;
    setBusy(true); audio.unlock();
    await act(() => rpc.guess(token, opp.id, pick));
    setBusy(false);
  }
  useEffect(() => {
    if (phase !== 'guess' || !canPlay || me?.guess) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toUpperCase();
      if (k.length === 1 && k >= 'A' && k <= 'Z' && !opp?.revealed.includes(k)) setPick(k);
      if (e.key === 'Enter') void fire();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* event effects: shots, misses, strikes */
  const [shot, setShot] = useState(0);        // white flash
  const [jolt, setJolt] = useState(0);        // poster jolt (CSS animation, restarted via key)
  const [hole, setHole] = useState<string | null>(null);
  const [hitL, setHitL] = useState(0), [hitR, setHitR] = useState(0);
  const prev = useRef<{ oppRev: number; myRev: number; strikesL: number; strikesR: number; guessKey: string } | null>(null);
  useEffect(() => {
    if (!left || !right) return;
    const cur = { oppRev: right.revealed.length, myRev: left.revealed.length, strikesL: left.strikes, strikesR: right.strikes, guessKey: me?.guess ? `${me.guess.letter}${me.guess.correct}` : '' };
    const p = prev.current;
    prev.current = cur;
    if (!p) return;
    if (cur.oppRev > p.oppRev) { audio.gunshot(); setShot(Date.now()); setJolt(Date.now()); setHole(right.revealed[right.revealed.length - 1]); }
    else if (cur.guessKey && cur.guessKey !== p.guessKey && me?.guess && !me.guess.correct) audio.hammer();
    if (cur.myRev > p.myRev) { window.setTimeout(() => audio.gunshot(), 120); setHitL(Date.now()); }
    if (cur.strikesL > p.strikesL) setHitL(Date.now());
    if (cur.strikesR > p.strikesR) setHitR(Date.now());
  }, [left, right, me?.guess]);

  /* countdown bell for the standoff */
  useEffect(() => {
    if (phase !== 'duel_intro') return;
    if (secs === 3 || secs === 2 || secs === 1) audio.bell(secs !== 1);
    if (secs === 3) narrator.say('three'); else if (secs === 2) narrator.say('two'); else if (secs === 1) narrator.say('one');
    if (secs <= 0) { audio.gunshot(); setShot(Date.now()); setJolt(Date.now()); }
  }, [secs, phase]);

  /* keep the bar above the rack */
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rack = document.querySelector('.rack-inner');
    const set = () => rootRef.current?.style.setProperty('--rack-h', `${rack ? (rack as HTMLElement).offsetHeight + 14 : 0}px`);
    set();
    if (!rack) return;
    const ro = new ResizeObserver(set); ro.observe(rack);
    return () => ro.disconnect();
  });

  if (!left || !right) return null;
  const slots = opp ? bountySlots(opp.letter_count, opp.revealed) : bountySlots(right.letter_count, right.revealed);
  const target = opp ?? right;
  const reveal = (id: string) => state.reveal.find((r) => r.player_id === id);

  /* parchment note */
  let note: React.ReactNode;
  if (phase === 'duel_intro') {
    note = <><b className="w-note-big">{t('wst.high_noon')}</b><small>{t('du.rules', { n: state.room.settings.duel_seconds })}</small></>;
  } else if (phase === 'answer') {
    note = <>
      <span className="w-note-big">{state.prompt}</span>
      {state.room.chaos && <small>{CHAOS_INFO[state.room.chaos]?.name}: {CHAOS_INFO[state.room.chaos]?.text}</small>}
      {(reverse || memory) && <small>{reverse ? t('tw.reverse_note') : t('tw.memory_note')}</small>}
    </>;
  } else if (phase === 'reveal') {
    note = <div className="w-shows">{[left, right].map((p) => {
      const r = reveal(p.id);
      return (
        <motion.div key={p.id} className={`w-show${r?.valid ? '' : ' bad'}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: p === left ? 0.2 : 0.7 }}>
          <span>{p.id === me?.id ? t('wst.you') : p.name}</span>
          <b>{r?.word ? r.word.toUpperCase() : t('wst.no_answer')}</b>
          <em>{r ? (r.valid ? `+${r.points}` : `${REASONS[r.reason ?? ''] ?? r.reason ?? ''} · ${t('wst.strike')}`) : ''}</em>
        </motion.div>
      );
    })}</div>;
  } else if (phase === 'guess') {
    note = me?.guess
      ? <span className={`w-note-mid ${me.guess.correct ? 'ok' : 'bad'}`}>{me.guess.correct ? t('wst.hit', { name: target.name, l: me.guess.letter }) : t('wst.miss', { name: target.name, l: me.guess.letter })}</span>
      : <span className="w-note-mid">{canPlay ? t('wst.aim', { name: target.name }) : t('ph.crack')}</span>;
  } else if (phase === 'react') {
    const lines = [
      ...state.guess_results.map((g) => g.correct ? t('wst.hit', { name: nameOf(state, g.target_id), l: g.letter ?? '' }) : t('wst.missed', { name: nameOf(state, g.guesser_id) })),
      ...state.pending.map((p) => `${p.source_id ? nameOf(state, p.source_id) : '?'} → ${nameOf(state, p.target_id)} · ${p.kind} ${p.amount}${p.status === 'blocked' ? ` · ${t('ph.blocked')}` : ''}`),
    ];
    note = lines.length ? <ul className="w-lines">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <span className="w-note-mid">{t('wst.quiet')}</span>;
  }

  /* leather bar */
  let barLabel = t('wst.showdown');
  let bar: React.ReactNode = <div className="w-bar-msg">{phase === 'duel_intro' ? t('wst.high_noon') : t('wst.showdown')}…</div>;
  if (!canPlay) {
    bar = <div className="w-bar-msg">{t('wst.spectating')}</div>;
  } else if (phase === 'answer') {
    barLabel = t('wst.your_word');
    const boxes = Math.max(7, typed.length + (typed.length < 12 ? 1 : 0));
    bar = (
      <form className="w-answer" onSubmit={(e) => { e.preventDefault(); void submitWord(); }}>
        <label className="w-tiles typing" onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: boxes }, (_, i) => {
            const c = typed[i];
            return <span key={i} className={`w-tile${c ? ' on' : ''}${c && isBad(c) ? ' bad' : ''}${i === typed.length ? ' caret' : ''}`}>{c ?? ''}</span>;
          })}
          <input ref={inputRef} className="w-hidden-input" value={word} maxLength={30} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
            lang={lang} aria-label={t('ph.your_answer')} onChange={(e) => { setWord(e.target.value); sendDraft(e.target.value); }} />
        </label>
        <div className="w-bar-foot">
          <span className={`w-status${me.answer ? (me.answer.valid ? ' ok' : ' bad') : ''}`}>
            {me.answer
              ? (me.answer.valid ? t('wst.locked', { n: me.answer.points }) : `${me.answer.word ? me.answer.word.toUpperCase() : ''} · ${REASONS[me.answer.reason ?? ''] ?? me.answer.reason ?? ''}`)
              : typed.some(isBad) ? t('ph.banned') : ''}
          </span>
          <button className="w-draw" disabled={!prepared.send || busy}>{t('wst.draw')}</button>
        </div>
      </form>
    );
  } else if (phase === 'guess') {
    barLabel = t('wst.call_letter');
    bar = me.guess ? (
      <div className={`w-bar-msg ${me.guess.correct ? 'ok' : 'bad'}`}>{me.guess.correct ? t('wst.hit', { name: target.name, l: me.guess.letter }) : t('wst.miss', { name: target.name, l: me.guess.letter })}</div>
    ) : (
      <div className="w-answer">
        <div className="w-keys">
          {ALPHABET.map((l) => (
            <button key={l} type="button" className={`w-key${pick === l ? ' sel' : ''}`} disabled={target.revealed.includes(l)} onClick={() => { audio.hammer(); setPick(l); }}>{l}</button>
          ))}
        </div>
        <div className="w-bar-foot">
          <span className="w-status">{pick ? `“${pick}” → ${target.name}` : t('wst.pick')}</span>
          <button className="w-draw" disabled={!pick || busy} onClick={() => void fire()}>{t('wst.draw')}</button>
        </div>
      </div>
    );
  } else if (phase === 'react') {
    barLabel = t('wst.hold');
    const ready = state.players.find((p) => p.id === me.id)?.react_ready;
    bar = (
      <div className="w-bar-foot center">
        <span className="w-status">{t('ph.cards_note')}</span>
        <button className="w-draw" disabled={!!ready} onClick={() => token && void act(() => rpc.reactReady(token))}>{ready ? t('wst.ready') : t('wst.hold')}</button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`west p-${phase}${secs <= 5 && secs > 0 && (phase === 'answer' || phase === 'guess') ? ' tense' : ''}`} style={westArtVars}>
      <div className="w-dust" aria-hidden>{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
      <div className="w-vignette" aria-hidden />
      <AnimatePresence>{shot > 0 && <motion.div key={shot} className="w-flash" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} onAnimationComplete={() => setShot(0)} />}</AnimatePresence>

      <div className="w-top">
        <Gunslinger p={left} side="left" me={left.id === me?.id} max={max} hit={hitL} />
        <TownClock msLeft={msLeft} total={total} />
        <Gunslinger p={right} side="right" me={right.id === me?.id} max={max} hit={hitR} />
      </div>

      <div className="w-post">
        <div className={`w-poster${jolt ? ' jolt' : ''}`} key={`poster${jolt}`}>
          <div className="w-poster-body">
            <div className="w-wanted-name">{t('wst.wanted_for', { name: target.id === me?.id ? t('wst.you') : target.name })}</div>
            {slots.length > 0 ? (
              <div className="w-tiles bounty">
                {slots.map((l, i) => (
                  <span key={i} className={`w-tile${l ? ' on' : ''}${l && l === hole ? ' holed' : ''}`}>{l ?? ''}{l && <i className="w-bullet" />}</span>
                ))}
              </div>
            ) : <div className="w-nobounty">{t('wst.no_bounty')}</div>}
            <div className="w-reward">{t('wst.bounty', { n: target.letter_count })}</div>
            <AnimatePresence>
              {phase === 'duel_intro' && secs <= 3 && (
                <motion.div key={secs} className="w-count" initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }}>
                  {secs > 0 ? secs : t('wst.draw')}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <motion.div className="w-note" key={`${phase}-${state.room.round}`} initial={{ rotate: -6, y: -14, opacity: 0 }} animate={{ rotate: -1.5, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
          {note}
        </motion.div>
      </div>

      <div className="w-bar">
        <div className="w-plate">{barLabel}</div>
        {bar}
      </div>
    </div>
  );
}

/* ───────── finale: the winner's poster ───────── */
export function WestFinale({ state, token, act }: Omit<PhaseProps, 'msLeft'>) {
  const t = useT();
  const [stats, setStats] = useState(false);
  const winner = state.players.find((p) => p.id === state.room.winner_id) ?? null;
  const loser = state.players.find((p) => p.id !== state.room.winner_id) ?? null;
  const isHost = state.me?.id === state.room.host_id;
  const iWon = !!state.me && state.me.id === winner?.id;
  useEffect(() => { const id = window.setTimeout(() => audio.gunshot(), 450); return () => window.clearTimeout(id); }, []);
  return (
    <div className="west p-finished" style={westArtVars}>
      <div className="w-dust" aria-hidden>{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
      <div className="w-vignette" aria-hidden />
      <div className="w-post finale">
        <motion.div className="w-poster" initial={{ y: -40, rotate: -4, opacity: 0 }} animate={{ y: 0, rotate: -1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 16 }}>
          <div className="w-poster-body">
            <div className="w-wanted-name">{winner ? (iWon ? t('wst.you') : winner.name) : '—'}</div>
            <div className="w-mug">{winner?.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={winner.avatar_url} alt="" /> : <span className="w-portrait-fallback" />}</div>
            <div className="w-reward">{t('wst.reward', { n: winner?.points ?? 0 })}</div>
          </div>
          <motion.div className="w-stamp" initial={{ scale: 2.6, opacity: 0, rotate: -26 }} animate={{ scale: 1, opacity: 1, rotate: -14 }} transition={{ delay: 0.6, type: 'spring', stiffness: 500, damping: 22 }}>
            {t('wst.winner')}
          </motion.div>
        </motion.div>
        <motion.div className="w-note" initial={{ rotate: -6, y: -14, opacity: 0 }} animate={{ rotate: -1.5, y: 0, opacity: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 18 }}>
          <span className="w-note-mid">{iWon ? t('wst.you_won') : winner ? t('wst.they_won', { name: winner.name }) : t('an.over')}</span>
          <div className="w-shows">
            {[winner, loser].filter(Boolean).map((p) => (
              <div key={p!.id} className={`w-show${p === loser ? ' bad' : ''}`}>
                <span>{p!.id === state.me?.id ? t('wst.you') : p!.name}</span>
                <b>{t('du.pts', { n: p!.points })}</b>
                <em>{t('wst.bounty', { n: p!.letter_count })}</em>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
      <div className="w-bar">
        <div className="w-plate">{t('wst.showdown')}</div>
        <div className="w-bar-foot">
          <button type="button" className="w-link" onClick={() => setStats((v) => !v)}>{stats ? t('wst.hide_stats') : t('wst.stats')}</button>
          {isHost && token
            ? <button className="w-draw" onClick={() => void act(() => rpc.playAgain(token))}>{t('wst.again')}</button>
            : <span className="w-status">{t('fn.wait')}</span>}
        </div>
      </div>
      {stats && <div className="w-stats"><GameSummary state={state} /></div>}
    </div>
  );
}

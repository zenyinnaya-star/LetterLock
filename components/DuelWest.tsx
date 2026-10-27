'use client';

import { AnimatePresence, motion } from 'motion/react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

function Gunslinger({ p, side, me, max, hit, portraitRef }: { p: PublicPlayer; side: 'left' | 'right'; me: boolean; max: number; hit: number; portraitRef: React.RefObject<HTMLDivElement | null> }) {
  const t = useT();
  const lives = Math.max(0, max - p.strikes);
  return (
    <div className={`w-gun ${side}${me ? ' me' : ''}`}>
      <div ref={portraitRef} className={`w-portrait${hit ? ' hit' : ''}`} key={`p${hit}`}>
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


/* ───────── VFX: muzzle flash, tracer, smoke, splinters, sparks, dust ───────── */
type Pt = { x: number; y: number };
type Fx = { id: number; from: Pt; to: Pt; kind: 'hit' | 'miss' | 'block' };
function center(el: Element | null | undefined, dy = 0): Pt | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 + dy * r.height };
}
const FxShot = memo(function FxShot({ fx }: { fx: Fx }) {
  const miss = fx.kind === 'miss';
  // a miss sails past the target and off at an angle
  const to = miss ? { x: fx.to.x + (fx.to.x - fx.from.x) * 0.35 + 40, y: fx.to.y + 70 } : fx.to;
  const dx = to.x - fx.from.x, dy = to.y - fx.from.y;
  const len = Math.hypot(dx, dy), ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <>
      <i className="w-muzzle" style={{ left: fx.from.x, top: fx.from.y }} />
      <i className="w-smoke" style={{ left: fx.from.x, top: fx.from.y }} />
      <i className="w-tracer" style={{ left: fx.from.x, top: fx.from.y, width: len, transform: `rotate(${ang}deg)` }} />
      {fx.kind === 'hit' && <span className="w-splinters" style={{ left: to.x, top: to.y }}>{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${i * 40 + 10}deg` }} />)}</span>}
      {fx.kind === 'block' && <span className="w-sparks" style={{ left: to.x, top: to.y }}>{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${i * 36}deg` }} />)}</span>}
      {miss && <i className="w-dustpuff" style={{ left: to.x, top: Math.min(to.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 60) }} />}
    </>
  );
});

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
  useEffect(() => { setWord(''); setPick(null); if (phase === 'answer') later(() => inputRef.current?.focus(), 350); }, [state.room.round, phase]);

  const draftT = useRef<number | null>(null);


  // Every delayed focus/FX/audio timer goes through later() so unmounting cancels them all.

  const timers = useRef(new Set<number>());

  const later = (fn: () => void, ms: number) => {

    const id = window.setTimeout(() => { timers.current.delete(id); fn(); }, ms);

    timers.current.add(id);

    return id;

  };

  useEffect(() => () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current.clear(); if (draftT.current) window.clearTimeout(draftT.current); }, []);
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

  /* event effects: shots, misses, strikes, cards */
  const [shot, setShot] = useState(0);        // white flash
  const [jolt, setJolt] = useState(0);        // poster jolt (CSS animation, restarted via key)
  const [hole, setHole] = useState<string | null>(null);
  const [hitL, setHitL] = useState(0), [hitR, setHitR] = useState(0);
  const [hurt, setHurt] = useState(0);        // red pulse when I get hit
  const [fxs, setFxs] = useState<Fx[]>([]);
  const lRef = useRef<HTMLDivElement>(null), rRef = useRef<HTMLDivElement>(null), posterRef = useRef<HTMLDivElement>(null);
  const portraitOf = (id: string | null | undefined) => (id && id === left?.id ? lRef.current : id && id === right?.id ? rRef.current : null);
  function fireFx(fromId: string | null | undefined, to: Pt | null, kind: Fx['kind'], delay = 0) {
    const from = center(portraitOf(fromId));
    if (!from || !to) return;
    later(() => {
      const f = { id: Date.now() + Math.random(), from, to, kind };
      setFxs((v) => [...v.slice(-6), f]);
      later(() => setFxs((v) => v.filter((x) => x.id !== f.id)), 1400);
    }, delay);
  }
  const prev = useRef<{ oppRev: number; myRev: number; strikesL: number; strikesR: number; guessKey: string; phase: string; pend: string; pts: number } | null>(null);
  useEffect(() => {
    if (!left || !right) return;
    const pendKey = state.pending.map((p) => `${p.id}:${p.status}`).join(',');
    const cur = { oppRev: right.revealed.length, myRev: left.revealed.length, strikesL: left.strikes, strikesR: right.strikes,
      guessKey: me?.guess ? `${me.guess.letter}${me.guess.correct}` : '', phase, pend: pendKey, pts: left.points };
    const p = prev.current;
    prev.current = cur;
    if (!p) return;
    const posterPt = center(posterRef.current, -0.08);
    // my shot at their poster
    if (cur.guessKey && cur.guessKey !== p.guessKey && me?.guess) {
      const ok = me.guess.correct;
      audio.cock();
      later(() => { audio.gunshot(); if (ok) { audio.thunk(); setShot(Date.now()); setJolt(Date.now()); } else audio.ricochet(); }, 220);
      fireFx(left.id, posterPt, ok ? 'hit' : 'miss', 220);
      if (ok) setHole(me.guess.letter);
    } else if (cur.oppRev > p.oppRev) {
      audio.thunk(); setJolt(Date.now()); setHole(right.revealed[right.revealed.length - 1]);
    }
    // they cracked one of my letters
    if (cur.myRev > p.myRev) {
      later(() => { audio.gunshot(); audio.thunk(); }, 120);
      fireFx(right.id, center(lRef.current), 'hit', 120); setHitL(Date.now()); setHurt(Date.now());
    }
    // their misses show up once the guesses are tallied
    if (cur.phase === 'react' && p.phase !== 'react') {
      state.guess_results.filter((g) => g.guesser_id !== left.id && !g.correct && g.target_id === left.id).forEach((_, i) => {
        later(() => { audio.gunshot(); audio.ricochet(); }, 300 + i * 500);
        fireFx(right.id, center(lRef.current), 'miss', 300 + i * 500);
      });
    }
    // cards: attacks fly, shields clang
    if (cur.pend !== p.pend) {
      const before = new Map(p.pend.split(',').filter(Boolean).map((x) => x.split(':') as [string, string]));
      state.pending.forEach((pd) => {
        const was = before.get(String(pd.id));
        const toPt = center(portraitOf(pd.target_id));
        if (!was) { audio.gunshot(); fireFx(pd.source_id, toPt, 'hit'); if (pd.target_id === left.id) { setHitL(Date.now()); setHurt(Date.now()); } else setHitR(Date.now()); }
        else if (was !== 'blocked' && pd.status === 'blocked') { audio.clang(); fireFx(pd.source_id, toPt, 'block'); }
      });
    }
    if (cur.strikesL > p.strikesL) { setHitL(Date.now()); setHurt(Date.now()); }
    if (cur.strikesR > p.strikesR) setHitR(Date.now());
    if (cur.pts > p.pts && cur.phase === 'reveal') audio.register();
  }, [left, right, me?.guess, phase, state.pending, state.guess_results]);

  /* countdown bell for the standoff */
  useEffect(() => { if (phase === 'duel_intro') { audio.standoff(); audio.spurs(); } }, [phase]);
  useEffect(() => {
    if (phase !== 'duel_intro') return;
    if (secs === 4) audio.wind();
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
    barLabel = t('wst.spectating');
    const done = (p: PublicPlayer) => (phase === 'answer' ? p.answered : phase === 'guess' ? p.guessed : phase === 'react' ? p.react_ready : true);
    bar = (
      <div className="w-spec">
        {[left, right].map((p) => (
          <div key={p.id} className={`w-spec-row${done(p) ? ' done' : ''}`}>
            <b>{p.name}</b>
            <span>{phase === 'answer' || phase === 'guess' || phase === 'react' ? (done(p) ? t('wst.drawn') : t('wst.thinking')) : t('du.pts', { n: p.points })}</span>
          </div>
        ))}
      </div>
    );
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
      <div className="w-fx" aria-hidden>{fxs.map((f) => <FxShot key={f.id} fx={f} />)}</div>
      {hurt > 0 && <div key={`hurt${hurt}`} className="w-hurt" aria-hidden />}
      <AnimatePresence>{shot > 0 && <motion.div key={shot} className="w-flash" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} onAnimationComplete={() => setShot(0)} />}</AnimatePresence>

      <div className="w-top">
        <Gunslinger p={left} side="left" me={left.id === me?.id} max={max} hit={hitL} portraitRef={lRef} />
        <TownClock msLeft={msLeft} total={total} />
        <Gunslinger p={right} side="right" me={right.id === me?.id} max={max} hit={hitR} portraitRef={rRef} />
      </div>

      <div className="w-post">
        <div ref={posterRef} className={`w-poster${jolt ? ' jolt' : ''}`} key={`poster${jolt}`}>
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
  const iLost = !!state.me && !!loser && state.me.id === loser.id;
  const face = iLost ? loser! : winner; // a loser sees their own poster, shot through
  useEffect(() => {
    const a = window.setTimeout(() => { audio.gunshot(); if (iLost) audio.thunk(); }, 450);
    const b = window.setTimeout(() => (iLost ? audio.westLose() : audio.westWin()), 1300);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [iLost]);
  return (
    <div className={`west p-finished${iLost ? ' lost' : ' won'}`} style={westArtVars}>
      <div className="w-dust" aria-hidden>{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
      <div className="w-vignette" aria-hidden />
      {iLost && <div className="w-dusk" aria-hidden />}
      <div className="w-post finale">
        <motion.div className={`w-banner${iLost ? ' lost' : ''}`} initial={{ y: -80, rotate: -3, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 12, delay: 0.15 }}>
          <span>{iLost ? t('wst.outdrawn') : t('wst.quickest')}</span>
        </motion.div>
        <motion.div className="w-poster" initial={{ y: -40, rotate: -4, opacity: 0 }} animate={{ y: 0, rotate: iLost ? 3 : -1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 16 }}>
          <div className="w-poster-body">
            <div className="w-wanted-name">{face ? (face.id === state.me?.id ? t('wst.you') : face.name) : '—'}</div>
            <div className={`w-mug${iLost ? ' shot' : ''}`}>{face?.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={face.avatar_url} alt="" /> : <span className="w-portrait-fallback" />}
              {iLost && <><i className="w-hole" style={{ left: '38%', top: '34%' }} /><i className="w-hole sm" style={{ left: '64%', top: '58%' }} /></>}
            </div>
            <div className="w-reward">{iLost ? t('wst.reward_lost', { name: winner?.name ?? '' }) : t('wst.reward', { n: winner?.points ?? 0 })}</div>
          </div>
          <motion.div className={`w-stamp${iLost ? ' lost' : ''}`} initial={{ scale: 2.6, opacity: 0, rotate: -26 }} animate={{ scale: 1, opacity: 1, rotate: iLost ? 10 : -14 }} transition={{ delay: 0.6, type: 'spring', stiffness: 500, damping: 22 }}>
            {iLost ? t('wst.defeated') : t('wst.winner')}
          </motion.div>
        </motion.div>
        <motion.div className="w-note" initial={{ rotate: -6, y: -14, opacity: 0 }} animate={{ rotate: -1.5, y: 0, opacity: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 18 }}>
          <span className="w-note-mid">{iWon ? t('wst.you_won') : iLost ? t('wst.you_lost', { name: winner?.name ?? '' }) : winner ? t('wst.they_won', { name: winner.name }) : t('an.over')}</span>
          <div className="w-shows">
            {[winner, loser].filter(Boolean).map((p) => (
              <div key={p!.id} className={`w-show${p === loser ? ' bad' : ''}`}>
                <span>{p!.id === state.me?.id ? t('wst.you') : p!.name}</span>
                <b>{t('du.pts', { n: p!.points })}</b>
                <em>{p === winner ? t('wst.standing') : t('wst.fell')}</em>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
      <div className="w-bar">
        <div className="w-plate">{iLost ? t('wst.rematch_q') : t('wst.showdown')}</div>
        <div className="w-bar-foot">
          <button type="button" className="w-link" onClick={() => setStats((v) => !v)}>{stats ? t('wst.hide_stats') : t('wst.stats')}</button>
          {isHost && token
            ? <button className="w-draw" onClick={() => void act(() => rpc.playAgain(token))}>{iLost ? t('wst.revenge') : t('wst.again')}</button>
            : <span className="w-status">{t('fn.wait')}</span>}
        </div>
      </div>
      {stats && <div className="w-stats"><GameSummary state={state} /></div>}
    </div>
  );
}

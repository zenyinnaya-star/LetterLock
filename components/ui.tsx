'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { audio } from '@/lib/audio';
import { CLASSES, CLASS_ORDER } from '@/lib/classes';
import type { PlayerClass, PublicPlayer, RoomState } from '@/lib/types';
import { ClassIcon, Icon } from './icons';

export const spring = { type: 'spring', stiffness: 520, damping: 26 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 24 } as const;

/* ───────── header ───────── */
export function Wordmark() {
  return (
    <Link href="/" className="wordmark" aria-label="Letterlock home">
      {'LETTER'.split('').map((c, i) => <span key={i}>{c}</span>)}
      {'LOCK'.split('').map((c, i) => <span key={`l${i}`} className="red">{c}</span>)}
    </Link>
  );
}

export function Header({ right }: { right?: React.ReactNode }) {
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(audio.isMuted()), []);
  return (
    <header className="topbar">
      <Wordmark />
      <div className="tools">
        {right}
        <Link href="/how-to-play" className="textbtn" target="_blank">Rules</Link>
        <button className="iconbtn" aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}
          onClick={() => { audio.setMuted(!muted); setMuted(!muted); }}>
          <Icon name={muted ? 'mute' : 'volume'} />
        </button>
      </div>
    </header>
  );
}

/* ───────── tiles ───────── */
export function Tile({ letter, revealed, small, locked = true, delay = 0 }: {
  letter: string; revealed?: boolean; small?: boolean; locked?: boolean; delay?: number;
}) {
  return (
    <motion.span
      layout
      className={`tile${revealed ? ' revealed' : ''}${small ? ' sm' : ''}`}
      title={revealed ? 'Cracked — everyone knows this one' : 'Banned letter'}
      initial={{ y: -46, rotate: -14, scale: 1.35, opacity: 0 }}
      animate={{ y: 0, rotate: 0, scale: 1, opacity: 1 }}
      exit={{ scale: 0.2, rotate: 25, opacity: 0, transition: { duration: 0.25 } }}
      transition={{ ...spring, delay }}
    >
      {letter}
      {locked && !small && (
        <motion.span className="tile-lock" initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ ...spring, delay: delay + 0.18 }}>
          <Icon name="lock" size={12} strokeWidth={2.6} />
        </motion.span>
      )}
    </motion.span>
  );
}

export function TileRow({ letters, small }: { letters: { letter: string; revealed?: boolean }[]; small?: boolean }) {
  return (
    <div className="tiles">
      <AnimatePresence mode="popLayout" initial={false}>
        {letters.map((l, i) => <Tile key={l.letter} letter={l.letter} revealed={l.revealed} small={small} delay={i * 0.03} />)}
      </AnimatePresence>
    </div>
  );
}

/* ───────── timer ───────── */
export function TimeBar({ msLeft, total }: { msLeft: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (msLeft / (total * 1000)) * 100) : 0;
  const secs = Math.ceil(msLeft / 1000);
  return (
    <div className={`timebar${secs <= 5 && msLeft > 0 ? ' urgent' : secs <= 10 ? ' warn' : ''}`} aria-hidden>
      <div className="fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Clock({ msLeft }: { msLeft: number }) {
  const secs = Math.ceil(msLeft / 1000);
  const urgent = secs <= 5 && msLeft > 0;
  return (
    <div className={`clock${urgent ? ' urgent' : ''}`} aria-label={`${secs} seconds left`}>
      {/* keyed re-mount (no exit animation) so digits can never pile up when the tab is backgrounded */}
      <motion.span key={secs} style={{ display: 'inline-block' }}
        initial={{ y: -12, opacity: 0.2, scale: urgent ? 1.5 : 1 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}>
        {secs}
      </motion.span>
    </div>
  );
}

/* ───────── class picker ───────── */
export function ClassPicker({ value, onChange }: { value: PlayerClass | null; onChange: (c: PlayerClass) => void }) {
  return (
    <div className="classes">
      {CLASS_ORDER.map((c) => {
        const info = CLASSES[c];
        const sel = value === c;
        return (
          <motion.button key={c} type="button" layout className={`class-card${sel ? ' sel' : ''}`}
            onClick={() => onChange(c)} aria-pressed={sel} whileTap={{ scale: 0.97 }} transition={softSpring}>
            <motion.span animate={sel ? { rotate: [0, -10, 8, 0], scale: [1, 1.15, 1] } : {}} transition={{ duration: 0.45 }}>
              <ClassIcon cls={c} size={40} />
            </motion.span>
            <span><b>{info.name}</b></span>
            <span className="tag">{info.tagline}</span>
            <AnimatePresence initial={false}>
              {sel && (
                <motion.span className="detail" key="d" initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <span className="plus">+</span> {info.perk}<br />
                  <span className="minus">−</span> {info.cost}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}

/* ───────── HUD ───────── */
export function Pips({ n, of = 2 }: { n: number; of?: number }) {
  return (
    <span className="pips" title={`${n} of ${of} strikes`}>
      {Array.from({ length: of }, (_, i) => (
        <motion.span key={i} className={`pip${i < n ? ' on' : ''}`}
          animate={i < n ? { scale: [1, 1.8, 1] } : { scale: 1 }} transition={{ duration: 0.4 }} />
      ))}
    </span>
  );
}

export function Hud({ state, meId }: { state: RoomState; meId: string | null }) {
  const phase = state.room.phase;
  const sorted = [...state.players].sort((a, b) =>
    Number(a.eliminated) - Number(b.eliminated) || b.points - a.points);
  return (
    <motion.div className="hud" layout role="list" aria-label="Scoreboard">
      <AnimatePresence initial={false}>
        {sorted.map((p) => <HudChip key={p.id} p={p} me={p.id === meId} phase={phase} />)}
      </AnimatePresence>
    </motion.div>
  );
}

function HudChip({ p, me, phase }: { p: PublicPlayer; me: boolean; phase: RoomState['room']['phase'] }) {
  const done = !p.eliminated && (phase === 'answer' ? p.answered : phase === 'guess' ? p.guessed : phase === 'react' ? p.react_ready : false);
  return (
    <motion.div layout role="listitem" className={`chip${me ? ' me' : ''}${p.eliminated ? ' out' : ''}${p.connected ? '' : ' offline'}`}
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
      transition={softSpring}>
      <ClassIcon cls={p.class} size={34} />
      <div className="who">
        <span className="nm">
          {p.name}
          {p.is_host && <span className="host" title="Host"><Icon name="crown" size={13} /></span>}
          {p.eliminated && <span title="Eliminated" style={{ color: 'var(--lock)' }}><Icon name="x" size={13} strokeWidth={3} /></span>}
        </span>
        <span className="stats">
          <span className="stat" title="Banned letters"><Icon name="lock" size={12} />{p.letter_count}</span>
          <Pips n={p.strikes} />
          {p.perk_used && <span className="stat" title="Perk used"><Icon name="bolt" size={12} /></span>}
        </span>
      </div>
      <motion.span className="pts" key={p.points} initial={{ scale: 1.5, color: '#ffcf4a' }}
        animate={{ scale: 1, color: '#f1efe6' }} transition={{ duration: 0.5 }}>
        {p.points}
      </motion.span>
      <AnimatePresence>
        {done && (
          <motion.span className="done" title="Done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}>
            <Icon name="check" size={12} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ───────── toast ───────── */
export function Toast({ msg, good, onDone }: { msg: string | null; good?: boolean; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(id);
  }, [msg, onDone]);
  return (
    <AnimatePresence>
      {msg && (
        <motion.div key={msg} className={`toast${good ? ' good' : ''}`} role="status"
          initial={{ opacity: 0, y: 24, x: '-50%', scale: 0.9 }} animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: 12, x: '-50%' }} transition={spring}>
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────── helpers ───────── */
export function nameOf(state: RoomState, id: string | null | undefined): string {
  if (!id) return '—';
  return state.players.find((p) => p.id === id)?.name ?? '—';
}

export function Avatar({ state, id, size = 28 }: { state: RoomState; id: string | null | undefined; size?: number }) {
  const p = state.players.find((x) => x.id === id);
  if (!p) return <span style={{ width: size, height: size, display: 'inline-block' }} />;
  return <ClassIcon cls={p.class} size={size} />;
}

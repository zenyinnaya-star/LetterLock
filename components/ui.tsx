'use client';

import { ProfileChip } from './ProfileChip';
import Link from 'next/link';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { narrator } from '@/lib/narrator';
import { CLASSES, CLASS_ORDER } from '@/lib/classes';
import { getPrefs, setPref } from '@/lib/prefs';
import { useT } from '@/lib/i18n/react';
import { ClassSheet } from './ClassSheet';
import type { PlayerClass, PublicPlayer, RoomState } from '@/lib/types';
import { ClassIcon, Icon } from './icons';
import { PlayerAvatar } from './PlayerAvatar';
import { SettingsButton } from './SettingsPanel';

export const spring = { type: 'spring', stiffness: 520, damping: 26 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 24 } as const;

/* ───────── header ───────── */
export function Wordmark() {
  return (
    <Link href="/" className="wordmark" aria-label="Letterlock">
      {'LETTER'.split('').map((c, i) => <span key={i}>{c}</span>)}
      {'LOCK'.split('').map((c, i) => <span key={`l${i}`} className="red">{c}</span>)}
    </Link>
  );
}

export function Header({ right, settings }: { right?: React.ReactNode; settings?: React.ReactNode }) {
  const t = useT();
  const [muted, setMuted] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  useEffect(() => {
    setMuted(audio.isMuted());
    const sync = () => setMusicOn(getPrefs().music);
    sync();
    window.addEventListener('letterlock:mute', sync);
    return () => window.removeEventListener('letterlock:mute', sync);
  }, []);
  return (
    <header className="topbar">
      <Wordmark />
      <div className="tools">
        {right}
        <ProfileChip />
        <Link href="/how-to-play" className="textbtn rules-link" target="_blank">{t('hd.rules')}</Link>
        <button className={`iconbtn${musicOn ? '' : ' off'}`} aria-label={musicOn ? t('hd.music_off') : t('hd.music_on')} title={musicOn ? t('hd.music_off') : t('hd.music_on')}
          aria-pressed={musicOn} onClick={() => setPref('music', !getPrefs().music)}>
          <Icon name={musicOn ? 'music' : 'musicoff'} />
        </button>
        {settings ?? <SettingsButton state={null} token={null} />}
        <button className="iconbtn" aria-label={muted ? t('hd.unmute') : t('hd.mute')} title={muted ? t('hd.unmute') : t('hd.mute')}
          onClick={() => { audio.setMuted(!muted); setMuted(!muted); }}>
          <Icon name={muted ? 'mute' : 'volume'} />
        </button>
      </div>
    </header>
  );
}

/* ───────── tiles ───────── */
export function Tile({ letter, revealed, small, locked = true, delay = 0, fresh = false }: {
  letter: string; revealed?: boolean; small?: boolean; locked?: boolean; delay?: number; fresh?: boolean;
}) {
  const big = fresh && !small;
  return (
    <motion.span
      layout
      className={`tile${revealed ? ' revealed' : ''}${small ? ' sm' : ''}${big ? ' fresh' : ''}`}
      title={revealed ? 'Cracked — everyone knows this one' : 'Banned letter'}
      initial={big ? { y: -130, rotate: -22, scale: 1.9, opacity: 0 } : { y: -46, rotate: -14, scale: 1.35, opacity: 0 }}
      animate={big
        ? { y: [-130, 0, -9, 0], rotate: [-22, 0, 2, 0], scale: [1.9, 1, 1.14, 1], opacity: [0, 1, 1, 1] }
        : { y: 0, rotate: 0, scale: 1, opacity: 1 }}
      exit={{ scale: 0.2, rotate: 25, opacity: 0, transition: { duration: 0.25 } }}
      transition={big ? { duration: 0.75, times: [0, 0.45, 0.7, 1], ease: 'easeOut', delay } : { ...spring, delay }}
    >
      {letter}
      {big && (
        <svg className="tile-crack" viewBox="0 0 48 52" aria-hidden>
          <path d="M26 0 L21 14 L29 22 L19 33 L27 43 L23 52" />
          <path d="M21 14 L9 19 M29 22 L41 27 M19 33 L8 41" />
        </svg>
      )}
      {locked && !small && (
        <motion.span className="tile-lock" initial={{ scale: 0 }} animate={big ? { scale: [0, 1.7, 1] } : { scale: 1 }}
          transition={big ? { duration: 0.35, delay: delay + 0.55 } : { ...spring, delay: delay + 0.18 }}>
          <Icon name="lock" size={12} strokeWidth={2.6} />
        </motion.span>
      )}
      {big && <span className="tile-ring" aria-hidden />}
    </motion.span>
  );
}

export function TileRow({ letters, small }: { letters: { letter: string; revealed?: boolean }[]; small?: boolean }) {
  // letters that show up after the row has first rendered get the full crack-fall-lock entrance
  const seen = useRef<Set<string> | null>(null);
  const controls = useAnimationControls();
  const fresh = new Set<string>();
  if (seen.current) for (const l of letters) if (!seen.current.has(l.letter)) fresh.add(l.letter);
  const freshKey = [...fresh].join('');
  useEffect(() => {
    seen.current = new Set(letters.map((l) => l.letter));
    if (!small && freshKey) {
      audio.lockSlam(0.3);
      const id = window.setTimeout(() => { void controls.start({ x: [0, -7, 6, -4, 2, 0], transition: { duration: 0.4 } }); }, 330);
      return () => window.clearTimeout(id);
    }
  }, [letters, small, freshKey, controls]);
  return (
    <motion.div className="tiles" animate={controls}>
      <AnimatePresence mode="popLayout" initial={false}>
        {letters.map((l, i) => <Tile key={l.letter} letter={l.letter} revealed={l.revealed} small={small} fresh={fresh.has(l.letter)} delay={fresh.has(l.letter) ? 0 : i * 0.03} />)}
      </AnimatePresence>
    </motion.div>
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
  const t = useT();
  const info = value ? CLASSES[value] : null;
  const [open, setOpen] = useState<PlayerClass | null>(null);
  useEffect(() => { if (open) narrator.say(`cl_${open}` as never); }, [open]);
  return (
    <div className="picker">
      <AnimatePresence>
        {open && (
          <ClassSheet key="cs" cls={open} selected={value === open} onClose={() => setOpen(null)}
            onPick={(c) => { onChange(c); setOpen(null); }} onNav={setOpen} />
        )}
      </AnimatePresence>
      <div className="classes-grid" role="radiogroup" aria-label={t('home.class')}>
        {CLASS_ORDER.map((c) => {
          const sel = value === c;
          return (
            <motion.button key={c} type="button" role="radio" aria-checked={sel} className={`class-tile${sel ? ' sel' : ''}`}
              onClick={() => setOpen(c)} whileTap={{ scale: 0.94 }} whileHover={{ y: -3 }} transition={softSpring}>
              <motion.span animate={sel ? { rotate: [0, -8, 6, 0], scale: [1, 1.12, 1] } : {}} transition={{ duration: 0.45 }}>
                <ClassIcon cls={c} size={56} />
              </motion.span>
              <b>{CLASSES[c].name}</b>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {info && value && (
          <motion.div key={value} className="class-detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}>
            <ClassIcon cls={value} size={64} />
            <div>
              <div className="row" style={{ gap: 8 }}><b className="cd-name">{info.name}</b><span className="muted small">{info.tagline}</span></div>
              <div className="cd-line"><span className="plus">+</span> {info.perk}</div>
              <div className="cd-line"><span className="minus">−</span> {info.cost}</div>
              <button type="button" className="textbtn cd-more" onClick={() => setOpen(value)}>{t('cp.more')}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────── HUD ───────── */
export function Pips({ n, of = 2 }: { n: number; of?: number }) {
  const t = useT();
  return (
    <span className="pips" title={t('hu.strikes', { n, of })}>
      {Array.from({ length: of }, (_, i) => (
        <motion.span key={i} className={`pip${i < n ? ' on' : ''}`}
          animate={i < n ? { scale: [1, 1.8, 1] } : { scale: 1 }} transition={{ duration: 0.4 }} />
      ))}
    </span>
  );
}

export function Hud({ state, meId }: { state: RoomState; meId: string | null }) {
  const t = useT();
  const phase = state.room.phase;
  const sorted = [...state.players].sort((a, b) =>
    Number(a.eliminated) - Number(b.eliminated) || b.points - a.points);
  return (
    <motion.div className="hud" layout role="list" aria-label={t('hu.scoreboard')}>
      <AnimatePresence initial={false}>
        {sorted.map((p) => <HudChip key={p.id} p={p} me={p.id === meId} phase={phase} nameOfPlayer={(id) => state.players.find((x) => x.id === id)?.name ?? '?'} />)}
      </AnimatePresence>
    </motion.div>
  );
}

function HudChip({ p, me, phase, nameOfPlayer }: { p: PublicPlayer; me: boolean; phase: RoomState['room']['phase']; nameOfPlayer: (id: string) => string }) {
  const t = useT();
  const done = !p.eliminated && (phase === 'answer' ? p.answered : phase === 'guess' ? p.guessed : phase === 'react' ? p.react_ready : false);
  return (
    <motion.div layout role="listitem" className={`chip${me ? ' me' : ''}${p.eliminated ? ' out' : ''}${p.connected ? '' : ' offline'}`}
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
      transition={softSpring}>
      <PlayerAvatar p={p} size={34} />
      <div className="who">
        <span className="nm">
          {p.name}
          {p.is_host && <span className="host" title={t('hu.host')}><Icon name="crown" size={13} /></span>}
          {p.eliminated && !p.quit && <span title={t('hu.out')} style={{ color: 'var(--lock)' }}><Icon name="x" size={13} strokeWidth={3} /></span>}
          {p.quit && <span className="tagchip chicken" title={t('hu.chicken_t')}>{t('hu.chicken')}</span>}
          {p.exposed && <span className="tagchip exposed" title={t('hu.exposed_t')}>{t('hu.exposed')}</span>}
          {p.hacked && <span className="tagchip hacked" title={t('hu.hacked_t')}><Icon name="glitch" size={11} /> {t('hu.hacked')}</span>}
          {p.orig_class && <span className="tagchip mimic" title={t('hu.mimic_t')}>{t('hu.mimic')}</span>}
          {p.betting && <span className="tagchip bet" title={t('hu.allin_t')}>{t('hu.allin')}</span>}
          {p.latched_to && <span className="tagchip leech" title={t('hu.latched_t')}><Icon name="link2" size={11} /> {nameOfPlayer(p.latched_to)}</span>}
        </span>
        <span className="stats">
          <span className="stat" title={t('hu.letters')}><Icon name="lock" size={12} />{p.letter_count}</span>
          <Pips n={p.strikes} />
          {p.perk_used && <span className="stat" title={t('hu.perk_used')}><Icon name="bolt" size={12} /></span>}
        </span>
      </div>
      <motion.span className="pts" key={p.points} initial={{ scale: 1.5, color: '#ffcf4a' }}
        animate={{ scale: 1, color: '#f1efe6' }} transition={{ duration: 0.5 }}>
        {p.points}
      </motion.span>
      <AnimatePresence>
        {done && (
          <motion.span className="done" title={t('hu.done')} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}>
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
  return <PlayerAvatar p={p} size={size} />;
}

'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { audio } from '@/lib/audio';
import { useT } from '@/lib/i18n/react';
import type { PublicPlayer, RoomState } from '@/lib/types';
import { vaultArtVars } from '@/lib/vaultArt';
import { narrator } from '@/lib/narrator';
import { PlayerAvatar } from './PlayerAvatar';

/**
 * Classic mode, vault-heist skin. The existing phase screens render inside a steel vault door; every player is a
 * safe on the wall, each locked letter a tumbler that clicks open when cracked, strikes are alarm lights.
 */

/** keep the content above the fixed rack */
function useRackPad() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rack = document.querySelector('.rack-inner') as HTMLElement | null;
    const set = () => ref.current?.style.setProperty('--rack-h', `${rack ? rack.offsetHeight + 14 : 0}px`);
    set();
    if (!rack) return;
    const ro = new ResizeObserver(set); ro.observe(rack);
    return () => ro.disconnect();
  });
  return ref;
}

const PHASE_SECS: Record<string, number> = { reveal: 6, guess: 20, react: 8 };

/* ───────── the combination dial (timer) ───────── */
function VaultDial({ msLeft, total }: { msLeft: number; total: number }) {
  const secs = Math.max(0, Math.ceil(msLeft / 1000));
  const frac = total > 0 ? Math.max(0, Math.min(1, msLeft / (total * 1000))) : 0;
  const ticks = Array.from({ length: 40 }, (_, i) => i);
  return (
    <div className={`v-dial${secs <= 5 && secs > 0 ? ' urgent' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 120 120" aria-hidden>
        <defs>
          <radialGradient id="vdial" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#e9edf2" /><stop offset=".55" stopColor="#8b939e" /><stop offset="1" stopColor="#3b4049" /></radialGradient>
          <linearGradient id="vring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3d58b" /><stop offset="1" stopColor="#8a6a2a" /></linearGradient>
        </defs>
        <circle cx="60" cy="60" r="57" fill="#15181d" stroke="url(#vring)" strokeWidth="3" />
        {/* the countdown arc */}
        <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
        <circle cx="60" cy="60" r="52" fill="none" stroke={secs <= 5 ? '#ff4d4d' : '#52e0c4'} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${frac * 326.7} 326.7`} transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray .25s linear' }} />
        {/* the knob turns as time runs */}
        <g transform={`rotate(${(1 - frac) * 720} 60 60)`} style={{ transition: 'transform .25s linear' }}>
          <circle cx="60" cy="60" r="44" fill="url(#vdial)" stroke="#2a2e35" strokeWidth="1.5" />
          {ticks.map((i) => (
            <line key={i} x1="60" y1="18" x2="60" y2={i % 5 === 0 ? 25 : 22} stroke="#22262c" strokeWidth={i % 5 === 0 ? 1.6 : 0.8} transform={`rotate(${i * 9} 60 60)`} />
          ))}
          <circle cx="60" cy="60" r="26" fill="#2b3038" stroke="#9aa2ad" strokeWidth="1" />
        </g>
        <polygon points="60,2 55,11 65,11" fill="#ff4d4d" />
      </svg>
      <span className="v-dial-num">{secs}</span>
    </div>
  );
}

/* ───────── one player = one safe on the wall ───────── */
function Safe({ p, me, maxStrikes, fresh, phase }: { p: PublicPlayer; me: boolean; maxStrikes: number; fresh: string | null; phase: string }) {
  const t = useT();
  const done = !p.eliminated && (phase === 'answer' ? p.answered : phase === 'guess' ? p.guessed : phase === 'react' ? p.react_ready : false);
  const tumblers = Math.max(p.letter_count, p.revealed.length);
  return (
    <motion.div layout className={`v-safe${me ? ' me' : ''}${p.eliminated ? ' busted' : ''}${p.connected ? '' : ' offline'}`}
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
      <div className="v-mug">
        <PlayerAvatar p={p} size={40} />
        {done && <span className="v-done" title={t('vt.ready')}>✓</span>}
      </div>
      <div className="v-safe-body">
        <div className="v-safe-head">
          <b className="v-safe-name">{p.name}</b>
          <span className="v-safe-pts">{p.points}</span>
        </div>
        <div className="v-tumblers" aria-label={t('hu.letters')}>
          {Array.from({ length: tumblers }, (_, i) => {
            const l = p.revealed[i];
            return <i key={i} className={`v-tum${l ? ' open' : ''}${l && l === fresh ? ' click' : ''}`}>{l ?? ''}</i>;
          })}
          {tumblers === 0 && <i className="v-tum empty" />}
        </div>
        <div className="v-leds" aria-label={`${p.strikes}/${maxStrikes}`}>
          {Array.from({ length: Math.max(1, maxStrikes) }, (_, i) => <i key={i} className={i < p.strikes ? 'on' : ''} />)}
        </div>
      </div>
      {p.eliminated && <span className="v-busted">{p.quit ? t('hu.chicken') : t('vt.busted')}</span>}
    </motion.div>
  );
}

/* ───────── the board + the door ───────── */
export function VaultHeist({ state, msLeft, children }: { state: RoomState; msLeft: number; children: React.ReactNode }) {
  const phase = state.room.phase;
  const me = state.me;
  const total = phase === 'answer' ? state.room.answer_seconds : PHASE_SECS[phase] ?? 0;
  const secs = Math.ceil(msLeft / 1000);
  const maxStrikes = state.room.settings.strikes ?? 3;
  const sorted = [...state.players].sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.points - a.points);

  // FX: tumbler clicks, alarms, dial spin
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const [alarm, setAlarm] = useState(0);
  const [spin, setSpin] = useState(0);
  const prev = useRef<{ rev: Record<string, number>; strikes: Record<string, number>; phase: string } | null>(null);
  useEffect(() => {
    const cur = {
      rev: Object.fromEntries(state.players.map((p) => [p.id, p.revealed.length])),
      strikes: Object.fromEntries(state.players.map((p) => [p.id, p.strikes])),
      phase,
    };
    const p = prev.current; prev.current = cur;
    if (!p) return;
    const opened: Record<string, string> = {};
    for (const pl of state.players) {
      if ((cur.rev[pl.id] ?? 0) > (p.rev[pl.id] ?? 0)) opened[pl.id] = pl.revealed[pl.revealed.length - 1];
    }
    const n = Object.keys(opened).length;
    if (n) {
      setFresh(opened);
      for (let i = 0; i < n; i++) window.setTimeout(() => audio.tumbler(), i * 180);
      window.setTimeout(() => setFresh({}), 1600);
    }
    if (state.players.some((pl) => (cur.strikes[pl.id] ?? 0) > (p.strikes[pl.id] ?? 0))) { audio.alarm(); setAlarm(Date.now()); }
    if (cur.phase === 'answer' && p.phase !== 'answer') { audio.dial(); setSpin(Date.now()); }
  }, [state.players, phase]);

  const rootRef = useRackPad();
  return (
    <div ref={rootRef} className={`vault p-${phase}${secs <= 5 && secs > 0 ? ' tense' : ''}`} style={vaultArtVars}>
      <div className="v-shade" aria-hidden />
      <div className="v-lasers" aria-hidden><i /><i /><i /></div>
      {alarm > 0 && <div key={alarm} className="v-alarm-flash" aria-hidden />}

      <div className="v-board" role="list">
        <AnimatePresence initial={false}>
          {sorted.map((p) => <Safe key={p.id} p={p} me={p.id === me?.id} maxStrikes={maxStrikes} fresh={fresh[p.id] ?? null} phase={phase} />)}
        </AnimatePresence>
      </div>

      <div className="v-door">
        <i className="v-bolt b1" /><i className="v-bolt b2" /><i className="v-bolt b3" /><i className="v-bolt b4" />
        <div className={`v-dial-slot${spin ? ' spin' : ''}`} key={`d${spin}`}><VaultDial msLeft={msLeft} total={total} /></div>
        <div className="v-content">{children}</div>
      </div>
    </div>
  );
}

/* ───────── finale: the vault swings open onto gold, or the alarm goes off ───────── */
export function VaultFinale({ state, children }: { state: RoomState; children: React.ReactNode }) {
  const t = useT();
  const me = state.me;
  const winner = state.players.find((p) => p.id === state.room.winner_id);
  const spec = !me || !!me.is_spectator;
  const iLost = !!me && !spec && (!winner || winner.id !== me.id);
  const [intro, setIntro] = useState(false); // door-opening intro removed: it covered the whole screen
  useEffect(() => {
    const a = window.setTimeout(() => (iLost ? audio.vaultLose() : audio.vaultOpen()), 300);
    const b = window.setTimeout(() => setIntro(false), 0);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [iLost]);
  const rootRef = useRackPad();
  return (
    <div ref={rootRef} className={`vault p-finished${iLost ? ' lost' : ' won'}`} style={vaultArtVars}>
      <div className="v-shade" aria-hidden />
      {iLost && <div className="v-beacons" aria-hidden><i /><i /></div>}
      {!iLost && <div className="v-glints" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>}
      <AnimatePresence>
        {intro && (
          <motion.div className="v-intro" exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            {iLost ? (
              <motion.div className="v-alarm-word" initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }}>
                {t('vt.alarm')}
                <span>{winner ? t('vt.caught', { name: winner.name }) : t('vt.nobody')}</span>
              </motion.div>
            ) : (
              <div className="v-bigdoor-wrap">
                <motion.div className="v-bigdoor" initial={{ rotateY: 0 }} animate={{ rotateY: -105 }} transition={{ delay: 1.2, duration: 1.6, ease: [0.5, 0, 0.2, 1] }}>
                  <motion.svg viewBox="0 0 200 200" aria-hidden className="v-wheel" initial={{ rotate: 0 }} animate={{ rotate: 270 }} transition={{ duration: 1.1, ease: 'easeInOut' }}>
                    <circle cx="100" cy="100" r="30" fill="#c9cfd6" stroke="#5b616a" strokeWidth="4" />
                    {[0, 60, 120].map((a) => <rect key={a} x="96" y="20" width="8" height="160" rx="4" fill="#aab1ba" stroke="#5b616a" strokeWidth="2" transform={`rotate(${a} 100 100)`} />)}
                    <circle cx="100" cy="100" r="12" fill="#e8c46a" />
                  </motion.svg>
                </motion.div>
                <motion.div className="v-gold-word" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.2 }}>
                  {me && winner?.id === me.id ? t('vt.you_cracked') : t('vt.cracked_by', { name: winner?.name ?? '—' })}
                </motion.div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className={`v-door v-final${intro ? ' hidden' : ''}`}>
        <div className="v-verdict" role="status">
          <b>{spec ? 'Heist over' : iLost ? t('vt.defeat') : t('vt.victory')}</b>
          <span>{spec ? (winner ? `${winner.name} walked out with the gold.` : t('vt.nobody')) : iLost ? (winner ? t('vt.caught', { name: winner.name }) : t('vt.nobody')) : t('vt.you_cracked')}</span>
        </div>
        <div className="v-content">{children}</div>
      </div>
    </div>
  );
}


/* ───────── the final two: two safes face off across the vault door ───────── */
function Contender({ p, side, maxStrikes }: { p: PublicPlayer; side: 'l' | 'r'; maxStrikes: number }) {
  const t = useT();
  const tumblers = Math.max(p.letter_count, p.revealed.length, 1);
  return (
    <motion.div className={`v-contender ${side}`} initial={{ x: side === 'l' ? -120 : 120, opacity: 0, rotate: side === 'l' ? -6 : 6 }}
      animate={{ x: 0, opacity: 1, rotate: side === 'l' ? -2 : 2 }} transition={{ type: 'spring', stiffness: 220, damping: 20, delay: side === 'l' ? 0.1 : 0.25 }}>
      <div className="v-mug big"><PlayerAvatar p={p} size={104} /></div>
      <b className="v-plate">{p.name}</b>
      <span className="v-score">{t('du.pts', { n: p.points })}</span>
      <div className="v-tumblers">
        {Array.from({ length: tumblers }, (_, i) => {
          const l = p.revealed[i];
          return <i key={i} className={`v-tum${l ? ' open' : ''}`}>{l ?? ''}</i>;
        })}
      </div>
      <div className="v-leds">{Array.from({ length: Math.max(1, maxStrikes) }, (_, i) => <i key={i} className={i < p.strikes ? 'on' : ''} />)}</div>
    </motion.div>
  );
}

export function VaultShowdown({ state, msLeft }: { state: RoomState; msLeft: number }) {
  const t = useT();
  const [a, b] = state.players.filter((p) => !p.eliminated);
  const count = Math.ceil(msLeft / 1000);
  const maxStrikes = state.room.settings.strikes ?? 3;
  useEffect(() => {
    if (count === 3) narrator.say('three'); else if (count === 2) narrator.say('two'); else if (count === 1) narrator.say('one'); else if (count <= 0) narrator.say('fight');
  }, [count]);
  if (!a || !b) return null;
  return (
    <div className="v-showdown">
      <motion.div className="v-final-stamp" initial={{ scale: 3, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -3 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
        {t('vt.final')} <span>·</span> {t('vt.last_safe')}
      </motion.div>
      <div className="v-face">
        <Contender p={a} side="l" maxStrikes={maxStrikes} />
        <div className="v-core">
          <div className="v-core-ring">
            <AnimatePresence mode="wait">
              <motion.span key={count <= 0 ? 'go' : count} className={`v-core-num${count <= 0 ? ' go' : ''}`}
                initial={{ scale: 2.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}>
                {count <= 0 ? t('vt.open') : count}
              </motion.span>
            </AnimatePresence>
          </div>
          <span className="v-vs">VS</span>
        </div>
        <Contender p={b} side="r" maxStrikes={maxStrikes} />
      </div>
      <p className="v-rules">{t('vt.rules', { n: state.room.settings.duel_seconds })}</p>
    </div>
  );
}

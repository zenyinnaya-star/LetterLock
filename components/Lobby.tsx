'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { saveAvatar } from '@/lib/avatar';
import { rpc } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import { Icon } from './icons';
import { AvatarPicker } from './AvatarPicker';
import { PlayerAvatar } from './PlayerAvatar';
import type { Act } from './phases';
import { SettingsButton } from './SettingsPanel';
import { ClassPicker, softSpring, spring } from './ui';

export function Lobby({ state, token, act, onLeave }: { state: RoomState; token: string | null; act: Act; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const me = state.me;
  const isHost = !!me && me.id === state.room.host_id;
  const count = state.players.length;
  const cfg = state.room.settings;
  const max = cfg?.max_players ?? 8;
  const duelMode = cfg?.mode === 'duel';
  const url = typeof window !== 'undefined' ? `${window.location.origin}/room/${state.room.code}` : '';

  async function copy() {
    try {
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) {
        await navigator.share({ title: 'Join my Letterlock game', text: `Room ${state.room.code}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    } catch { /* cancelled */ }
  }

  return (
    <>
      <div className="col" style={{ alignItems: 'center', gap: 10 }}>
        <span className="label">Room code</span>
        <div className="lobby-code">
          {state.room.code.split('').map((c, i) => (
            <motion.span key={i} className="tile" initial={{ y: -60, rotate: -20, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }}
              transition={{ ...spring, delay: i * 0.08 }}>{c}</motion.span>
          ))}
        </div>
        <button className="btn sm ghost" onClick={copy}>
          <Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? 'Link copied' : 'Share invite link'}
        </button>
      </div>

      {duelMode ? (
        <div className="duel-lobby">
          <DuelSeat p={state.players[0]} meId={me?.id} side="left" />
          <motion.span className="dl-vs" initial={{ scale: 3, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 16, delay: 0.3 }}>VS</motion.span>
          <DuelSeat p={state.players[1]} meId={me?.id} side="right" />
        </div>
      ) : (
      <div className="seats">
          <AnimatePresence initial={false}>
            {state.players.map((p) => (
              <motion.div key={p.id} layout className={`seat${p.id === me?.id ? ' me' : ''}`}
                initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring}>
                <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={softSpring}>
                  <PlayerAvatar p={p} size={56} />
                </motion.div>
                <b>{p.name}{p.is_host && <span style={{ color: 'var(--accent)' }} title="Host"><Icon name="crown" size={14} /></span>}</b>
                {p.class ? <span className="muted small" style={{ textTransform: 'capitalize' }}>{p.class}</span>
                  : <span className="class-hidden"><Icon name="mask" size={12} /> secret</span>}
              </motion.div>
            ))}
            {Array.from({ length: Math.max(0, Math.min(max, Math.max(4, count + 1)) - count) }, (_, i) => (
              <motion.div key={`empty-${i}`} layout className="seat empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                Waiting for a player…
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {me && (
        <div className="narrow-col">
          <span className="label">Your avatar</span>
          <AvatarPicker name={me.name} url={state.players.find((p) => p.id === me.id)?.avatar_url ?? null}
            onChange={(url) => { saveAvatar(url); if (token) void act(() => rpc.setAvatar(token, url)); }} />
        </div>
      )}

      {me && (
        <div className="narrow-col">
          <span className="label">Your class — secret until the game ends</span>
          <ClassPicker value={me.class} onChange={(c) => token && void act(() => rpc.setClass(token, c))} />
        </div>
      )}

      {cfg && (
        <div className="rules-strip">
          {duelMode && <span className="duel-tag"><Icon name="swords" size={14} /> 1v1 duel</span>}
          <span><Icon name="users" size={14} /> {count}/{max}</span>
          <span><Icon name="clock" size={14} /> {cfg.answer_seconds}s answers{cfg.shrink ? ', shrinking' : ''}</span>
          <span><Icon name="target" size={14} /> {cfg.guess_seconds}s guesses</span>
          <span><Icon name="x" size={14} /> {cfg.strikes} strike{cfg.strikes > 1 ? 's' : ''} and out</span>
          <span className={cfg.cards ? '' : 'off'}><Icon name="cards" size={14} /> Cards {cfg.cards ? 'on' : 'off'}</span>
          <span className={cfg.perks ? '' : 'off'}><Icon name="bolt" size={14} /> Perks {cfg.perks ? 'on' : 'off'}</span>
          {isHost && <SettingsButton state={state} token={token} act={act} />}
        </div>
      )}

      <div className="narrow-col">
        {isHost ? (
          <>
            <button className="btn lg block" disabled={count < 2} onClick={() => token && void act(() => rpc.start(token))}>
              {count < 2 ? (duelMode ? 'Waiting for a challenger…' : 'Waiting for at least 1 more player…') : duelMode ? 'FIGHT!' : `Start game · ${count} players`}
            </button>
            <div className="muted small center">You&apos;re the host. Tweak the rules with the gear, then start when everyone&apos;s in.</div>
          </>
        ) : (
          <div className="center muted">Waiting for the host to start… ({count}/{max})</div>
        )}
        {me && (
          <button className="btn ghost block" onClick={onLeave}>
            <Icon name="logout" size={18} /> Leave room
          </button>
        )}
      </div>
    </>
  );
}

function DuelSeat({ p, meId, side }: { p: RoomState['players'][number] | undefined; meId: string | undefined; side: 'left' | 'right' }) {
  if (!p) {
    return (
      <motion.div className={`dl-seat empty ${side}`} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.8 }}>
        <span className="dl-q">?</span>
        <b>Waiting for a challenger…</b>
        <span className="muted small">Share the code</span>
      </motion.div>
    );
  }
  return (
    <motion.div className={`dl-seat ${side}${p.id === meId ? ' me' : ''}`}
      initial={{ x: side === 'left' ? -120 : 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
      <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }}><PlayerAvatar p={p} size={120} className="dl-av" /></motion.div>
      <b>{p.name}{p.is_host && <span style={{ color: 'var(--accent)' }}><Icon name="crown" size={14} /></span>}</b>
      <span className="muted small">{p.id === meId ? 'Your class is secret' : 'Secret class'}</span>
    </motion.div>
  );
}

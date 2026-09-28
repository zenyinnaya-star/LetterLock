'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { rpc } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import { ClassIcon, Icon } from './icons';
import type { Act } from './phases';
import { ClassPicker, softSpring, spring } from './ui';

export function Lobby({ state, token, act }: { state: RoomState; token: string | null; act: Act }) {
  const [copied, setCopied] = useState(false);
  const me = state.me;
  const isHost = !!me && me.id === state.room.host_id;
  const count = state.players.length;
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

      <div className="seats">
        <AnimatePresence initial={false}>
          {state.players.map((p) => (
            <motion.div key={p.id} layout className={`seat${p.id === me?.id ? ' me' : ''}`}
              initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring}>
              <motion.div key={p.class} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={softSpring}>
                <ClassIcon cls={p.class} size={52} />
              </motion.div>
              <b>{p.name}{p.is_host && <span style={{ color: 'var(--accent)' }} title="Host"><Icon name="crown" size={14} /></span>}</b>
              <span className="muted small" style={{ textTransform: 'capitalize' }}>{p.class}</span>
            </motion.div>
          ))}
          {Array.from({ length: Math.max(0, Math.min(8, Math.max(4, count + 1)) - count) }, (_, i) => (
            <motion.div key={`empty-${i}`} layout className="seat empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Waiting for a player…
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {me && (
        <div className="narrow-col">
          <span className="label">Your class</span>
          <ClassPicker value={me.class} onChange={(c) => token && void act(() => rpc.setClass(token, c))} />
        </div>
      )}

      <div className="narrow-col">
        {isHost ? (
          <>
            <button className="btn lg block" disabled={count < 2} onClick={() => token && void act(() => rpc.start(token))}>
              {count < 2 ? 'Waiting for at least 1 more player…' : `Start game · ${count} players`}
            </button>
            <div className="muted small center">You&apos;re the host. Start when everyone&apos;s in.</div>
          </>
        ) : (
          <div className="center muted">Waiting for the host to start… ({count}/8)</div>
        )}
      </div>
    </>
  );
}

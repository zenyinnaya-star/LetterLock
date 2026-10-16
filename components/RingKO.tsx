'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { audio } from '@/lib/audio';
import type { RoomState } from '@/lib/types';
import { PlayerAvatar } from './PlayerAvatar';

/** Knockout moment: the winner's fighter punches in from their corner, the screen flashes white and K.O. is stamped in their colour. */
export function RingKO({ state }: { state: RoomState }) {
  const prev = useRef(state.room.phase);
  const [show, setShow] = useState(false);
  const winner = state.players.find((p) => p.id === state.room.winner_id) ?? null;
  const duel = state.room.duel || state.room.settings?.mode === 'duel';

  useEffect(() => {
    const was = prev.current;
    prev.current = state.room.phase;
    if (!duel || state.room.phase !== 'finished' || was === 'finished' || was === 'lobby' || !winner) return;
    setShow(true);
    audio.ko();
    const id = window.setTimeout(() => setShow(false), 2600);
    return () => window.clearTimeout(id);
  }, [state.room.phase, duel, winner]);

  const alive = state.players;
  const red = winner ? alive[0]?.id === winner.id : true;
  const youWon = !!winner && winner.id === state.me?.id;

  return (
    <AnimatePresence>
      {show && winner && (
        <motion.div key="ko" className={`ring-ko ${red ? 'red' : 'blue'}`} initial={{ opacity: 1 }} exit={{ opacity: 0 }} aria-live="assertive">
          <motion.div className="ko-flash" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.7, delay: 0.25 }} />
          <div className="ko-lines" />
          <motion.div className="ko-fighter" initial={{ x: red ? -260 : 260, scale: 0.6, rotate: red ? -20 : 20 }}
            animate={{ x: [red ? -260 : 260, 0, red ? 20 : -20], scale: [0.6, 1.25, 1.1], rotate: [red ? -20 : 20, 0, 0] }} transition={{ duration: 0.5, times: [0, 0.6, 1] }}>
            <PlayerAvatar p={winner} size={110} />
          </motion.div>
          <motion.div className="ko-text" initial={{ scale: 3, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ type: 'spring', stiffness: 520, damping: 16, delay: 0.3 }}>K.O.</motion.div>
          <motion.div className="ko-sub" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>{youWon ? 'YOU WIN' : `${winner.name} wins`}</motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

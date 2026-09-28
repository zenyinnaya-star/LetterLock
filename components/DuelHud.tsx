'use client';

import { motion } from 'motion/react';
import { CLASSES } from '@/lib/classes';
import type { PublicPlayer, RoomState } from '@/lib/types';
import { Icon } from './icons';
import { PlayerAvatar } from './PlayerAvatar';

/** Fighting-game style HUD for any 1v1: portraits, life bars (strikes left), locks and points. */
export function DuelHud({ state }: { state: RoomState }) {
  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length !== 2) return null;
  const meId = state.me?.id;
  const [a, b] = alive[1]?.id === meId ? [alive[1], alive[0]] : [alive[0], alive[1]];
  const max = state.room.settings.strikes;
  return (
    <div className="duel-hud" role="group" aria-label="Duel scoreboard">
      <Fighter p={a} max={max} side="left" me={a.id === meId} />
      <div className="dh-mid">
        <motion.span className="dh-vs" animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}>VS</motion.span>
        <span className="dh-round">{state.room.round > 0 ? `Round ${state.room.round}` : 'Get ready'}</span>
      </div>
      <Fighter p={b} max={max} side="right" me={b.id === meId} />
    </div>
  );
}

function Fighter({ p, max, side, me }: { p: PublicPlayer; max: number; side: 'left' | 'right'; me: boolean }) {
  const left = Math.max(0, max - p.strikes);
  const pct = (left / max) * 100;
  return (
    <div className={`dh-fighter ${side}${me ? ' me' : ''}`}>
      <PlayerAvatar p={p} size={52} badge />
      <div className="dh-info">
        <div className="dh-name"><b>{me ? 'You' : p.name}</b><span>{p.class ? CLASSES[p.class].name : 'Class hidden'}</span></div>
        <div className="dh-bar" aria-label={`${left} of ${max} lives left`}>
          <motion.div className={`dh-fill${left <= 1 ? ' low' : ''}`} initial={false} animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }} />
          {Array.from({ length: max - 1 }, (_, i) => <span key={i} className="dh-notch" style={{ left: `${((i + 1) / max) * 100}%` }} />)}
        </div>
        <div className="dh-stats">
          <span><Icon name="lock" size={12} /> {p.letter_count}</span>
          <motion.span key={p.points} initial={{ scale: 1.4, color: '#ffcf4a' }} animate={{ scale: 1, color: '#f1efe6' }}>{p.points} pts</motion.span>
          {p.hacked && <span className="tagchip hacked">hacked</span>}
          {p.betting && <span className="tagchip bet">all in</span>}
        </div>
      </div>
    </div>
  );
}

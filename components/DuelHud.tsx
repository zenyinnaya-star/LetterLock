'use client';

import { motion } from 'motion/react';
import { CLASSES } from '@/lib/classes';
import { useT } from '@/lib/i18n/react';
import type { PublicPlayer, RoomState } from '@/lib/types';
import { ClassIcon, Icon } from './icons';
import { PlayerAvatar } from './PlayerAvatar';

/** Boxing-ring HUD for any 1v1. Each player sees their OWN corner as the main view; the opponent is only a status strip
 *  (name, lives, submitted or not). Nothing here reveals what the opponent is typing: the server never sends it. */
export function DuelHud({ state, msLeft = 0, total = 0 }: { state: RoomState; msLeft?: number; total?: number }) {
  const t = useT();
  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length !== 2) return null;
  const meId = state.me?.id;
  const me = alive.find((p) => p.id === meId) ?? alive[0];
  const opp = alive.find((p) => p.id !== me.id) ?? alive[1];
  const corner = (p: PublicPlayer) => (alive[0].id === p.id ? 'red' : 'blue');
  const max = state.room.settings.strikes;
  const phase = state.room.phase;
  const secs = Math.max(0, Math.ceil(msLeft / 1000));
  const frac = total > 0 ? Math.max(0, Math.min(1, msLeft / (total * 1000))) : 0;
  const oppDone = phase === 'answer' ? opp.answered : phase === 'guess' ? opp.guessed : false;
  const oppLeft = Math.max(0, max - opp.strikes);
  const myLeft = Math.max(0, max - me.strikes);

  return (
    <div className="ring-hud" role="group" aria-label={t('hu.scoreboard')}>
      <div className="rh-top">
        {state.room.phase_ends_at && total > 0 ? (
          <svg className={`rh-clock${secs <= 5 ? ' urgent' : ''}`} viewBox="0 0 40 40" aria-label={`${secs}s`}>
            <circle cx="20" cy="20" r="17" className="bg" />
            <circle cx="20" cy="20" r="17" className="arc" strokeDasharray={2 * Math.PI * 17} strokeDashoffset={2 * Math.PI * 17 * (1 - frac)} />
            <text x="20" y="25">{secs}</text>
          </svg>
        ) : <span className="rh-clock-gap" />}
        <motion.span className="rh-vs" animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}>VS</motion.span>
        <span className="rh-round">{state.room.round > 0 ? t('ph.round', { n: state.room.round }) : t('du.ready')}</span>
      </div>

      <div className={`rh-opp ${corner(opp)}`}>
        <PlayerAvatar p={opp} size={34} />
        <b className="n">{opp.name}</b>
        {opp.class && <ClassIcon cls={opp.class} size={20} />}
        <div className="rh-bar" aria-label={t('du.lives', { n: oppLeft, max })}>
          <motion.i className={oppLeft <= 1 ? 'low' : ''} initial={false} animate={{ width: `${(oppLeft / max) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} />
        </div>
        {(phase === 'answer' || phase === 'guess') && <span className={`rh-state${oppDone ? ' done' : ''}`}>{oppDone ? <><Icon name="lock" size={12} /> locked in</> : 'thinking…'}</span>}
      </div>

      <div className={`rh-me ${corner(me)}`}>
        <svg className="boxer" viewBox="0 0 80 100" aria-hidden>
          <circle cx="40" cy="20" r="13" />
          <path d="M20 96 C14 60 22 42 40 42 C58 42 66 60 60 96 Z" />
          <circle className="glove" cx="14" cy="46" r="11" /><circle className="glove" cx="66" cy="46" r="11" />
        </svg>
        <div className="rh-me-info">
          <div className="rh-me-top">
            <PlayerAvatar p={me} size={46} />
            <div>
              <b>{t('du.you')}</b>
              <div className="cls">{me.class ? <><ClassIcon cls={me.class} size={18} /> {CLASSES[me.class].name}</> : t('du.hidden')}</div>
            </div>
            <motion.span key={me.points} className="pts" initial={{ scale: 1.4 }} animate={{ scale: 1 }}>{t('du.pts', { n: me.points })}</motion.span>
          </div>
          <div className="rh-bar big" aria-label={t('du.lives', { n: myLeft, max })}>
            <motion.i className={myLeft <= 1 ? 'low' : ''} initial={false} animate={{ width: `${(myLeft / max) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} />
            {Array.from({ length: max - 1 }, (_, i) => <span key={i} className="notch" style={{ left: `${((i + 1) / max) * 100}%` }} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

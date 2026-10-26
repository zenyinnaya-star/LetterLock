import { motion } from 'motion/react';
import { Icon } from './icons';

interface P { id: string; name: string; wins?: number; is_spectator?: boolean }

/** Rivalry score: games won in this room across rematches. Shows nothing until someone has won a game. */
export function Rivalry({ players, meId, min = 1 }: { players: P[]; meId?: string; min?: number }) {
  const list = players.filter((p) => !p.is_spectator);
  const total = list.reduce((a, p) => a + (p.wins ?? 0), 0);
  if (list.length < 2 || total < min) return null;
  const ranked = [...list].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
  const top = ranked[0].wins ?? 0;
  const lead = top > 0 && (ranked[1].wins ?? 0) < top;
  const duel = list.length === 2;
  return (
    <motion.div className="rivalry" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} aria-label="Rivalry score">
      <span className="label"><Icon name="trophy" size={13} /> Rivalry</span>
      {duel ? (
        <div className="rv-row">
          <b className={ranked[0].id === meId ? 'me' : ''}>{ranked[0].name}</b>
          <span className="rv-score">{ranked[0].wins ?? 0} – {ranked[1].wins ?? 0}</span>
          <b className={ranked[1].id === meId ? 'me' : ''}>{ranked[1].name}</b>
        </div>
      ) : (
        <div className="rv-row">
          {ranked.map((p, i) => (
            <span key={p.id} className={`rv-chip${p.id === meId ? ' me' : ''}${lead && i === 0 ? ' lead' : ''}`}>
              {lead && i === 0 && <Icon name="trophy" size={12} />} {p.name} <b>{p.wins ?? 0}</b>
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

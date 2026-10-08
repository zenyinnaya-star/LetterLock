'use client';

import { motion } from 'motion/react';
import { HEROES, type Hero, type HeroId } from '@/lib/heroes';

// Card-style hero picker. `taken` heroes (picked by someone else) are greyed out.
export function HeroCards({ value, onPick, taken = {} }: { value: HeroId | null; onPick: (h: HeroId) => void; taken?: Record<string, string> }) {
  return (
    <div className="hc-row" role="radiogroup" aria-label="Choose your hero">
      {HEROES.map((h, i) => <HeroCard key={h.id} h={h} on={value === h.id} by={taken[h.id]} onPick={onPick} i={i} />)}
    </div>
  );
}

function HeroCard({ h, on, by, onPick, i }: { h: Hero; on: boolean; by?: string; onPick: (h: HeroId) => void; i: number }) {
  const lock = !!by && !on;
  return (
    <motion.button type="button" role="radio" aria-checked={on} disabled={lock} className={`hc${on ? ' on' : ''}${lock ? ' lock' : ''}`}
      style={{ ['--hc' as string]: h.color, backgroundImage: `linear-gradient(180deg,transparent 45%,rgba(5,8,18,.92) 100%), url(${h.art}), radial-gradient(circle at 50% 32%, ${h.color}77, #0a0f1d 72%)` }}
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 22 }}
      whileHover={lock ? undefined : { y: -6 }} whileTap={lock ? undefined : { scale: 0.97 }} onClick={() => onPick(h.id)}>
      <span className="hc-role">{h.role}</span>
      <span className="hc-body">
        <b>{h.name}</b>
        <small>{h.tagline}</small>
        <span className="hc-stats">{Object.entries(h.stats).map(([k, v]) => (
          <i key={k} title={k}><em>{k}</em><u style={{ width: `${v * 12.5}%` }} /></i>
        ))}</span>
        <span className="hc-sig">{h.signature}</span>
      </span>
      {lock && <span className="hc-taken">Taken by {by}</span>}
    </motion.button>
  );
}

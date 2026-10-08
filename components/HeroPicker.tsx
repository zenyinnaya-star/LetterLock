'use client';

import { AnimatePresence, motion } from 'motion/react';
import { HEROES, STAT_INFO, heroById, type HeroId } from '@/lib/heroes';

// Hero select, styled exactly like the class picker: tile grid + detail panel (now with the hero's stats).
export function HeroPicker({ value, onPick, taken = {} }: { value: HeroId | null; onPick: (h: HeroId) => void; taken?: Record<string, string> }) {
  const info = heroById(value);
  return (
    <div className="picker">
      <div className="classes-grid hp-grid" role="radiogroup" aria-label="Choose your hero">
        {HEROES.map((h) => {
          const sel = value === h.id;
          const by = taken[h.id];
          const lock = !!by && !sel;
          return (
            <motion.button key={h.id} type="button" role="radio" aria-checked={sel} disabled={lock}
              className={`class-tile hp-tile${sel ? ' sel' : ''}${lock ? ' lock' : ''}`} style={{ ['--hc' as string]: h.color }}
              onClick={() => onPick(h.id)} whileTap={lock ? undefined : { scale: 0.94 }} whileHover={lock ? undefined : { y: -3 }}>
              <motion.span className="hp-face" animate={sel ? { rotate: [0, -6, 5, 0], scale: [1, 1.1, 1] } : {}} transition={{ duration: 0.45 }}
                style={{ backgroundImage: `url(${h.art}), radial-gradient(circle at 50% 35%, ${h.color}88, #0a0f1d 75%)` }} />
              <b>{h.name}</b>
              <small className="hp-role">{lock ? `Taken · ${by}` : h.role}</small>
              <span className="hp-mini">{(Object.keys(h.stats) as (keyof typeof h.stats)[]).map((k) => (
                <span key={k} title={`${k} ${h.stats[k]}`}><em>{k}</em><span><i style={{ width: `${h.stats[k] * 12.5}%` }} /></span><b>{h.stats[k]}</b></span>
              ))}</span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {info && (
          <motion.div key={info.id} className="class-detail hp-detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <span className="hp-face big" style={{ backgroundImage: `url(${info.art}), radial-gradient(circle at 50% 35%, ${info.color}88, #0a0f1d 75%)` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}><b className="cd-name">{info.name}</b><span className="muted small">{info.tagline}</span></div>
              <div className="cd-line"><span className="plus">+</span> {info.signature}</div>
              <div className="hp-stats">
                {(Object.keys(info.stats) as (keyof typeof info.stats)[]).map((k) => (
                  <div key={k} className="hp-stat" title={STAT_INFO[k].what}>
                    <em>{k}</em>
                    <span><motion.i initial={{ width: 0 }} animate={{ width: `${info.stats[k] * 12.5}%` }} transition={{ duration: 0.5 }} /></span>
                    <b>{info.stats[k]}</b>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

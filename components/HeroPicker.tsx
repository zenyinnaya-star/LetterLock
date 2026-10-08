'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { HEROES, HERO_PORTRAIT, STAT_INFO, heroById, type HeroId } from '@/lib/heroes';
import { HeroSheet } from './HeroSheet';

/** Portrait that matches ClassIcon: rounded square with a coloured ring. */
export function HeroIcon({ id, size = 56 }: { id: HeroId; size?: number }) {
  const h = heroById(id)!;
  return (
    <span className="class-ico portrait" style={{ width: size, height: size, borderRadius: Math.max(8, size * 0.26), boxShadow: `0 0 0 ${size >= 60 ? 3 : 2}px ${h.color}` }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HERO_PORTRAIT[id] ?? h.art} alt="" width={size} height={size} draggable={false} />
    </span>
  );
}

/** Same structure as ClassPicker: tile grid, tap opens the full-screen sheet, detail panel below. */
export function HeroPicker({ value, onPick, taken = {} }: { value: HeroId | null; onPick: (h: HeroId) => void; taken?: Record<string, string> }) {
  const [open, setOpen] = useState<HeroId | null>(null);
  const info = heroById(value);
  return (
    <div className="picker">
      <AnimatePresence>
        {open && (
          <HeroSheet key="hs" hero={open} selected={value === open} taken={taken[open]} onClose={() => setOpen(null)}
            onPick={(h) => { onPick(h); setOpen(null); }} onNav={setOpen} />
        )}
      </AnimatePresence>
      <div className="classes-grid" role="radiogroup" aria-label="Choose your hero">
        {HEROES.map((h) => {
          const sel = value === h.id;
          const by = taken[h.id];
          return (
            <motion.button key={h.id} type="button" role="radio" aria-checked={sel} className={`class-tile${sel ? ' sel' : ''}${by && !sel ? ' hp-lock' : ''}`}
              onClick={() => setOpen(h.id)} whileTap={{ scale: 0.94 }} whileHover={{ y: -3 }}>
              <motion.span animate={sel ? { rotate: [0, -8, 6, 0], scale: [1, 1.12, 1] } : {}} transition={{ duration: 0.45 }}>
                <HeroIcon id={h.id} size={56} />
              </motion.span>
              <b>{h.name}</b>
              {by && !sel && <small className="muted">Taken · {by}</small>}
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {info && value && (
          <motion.div key={value} className="class-detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <HeroIcon id={value} size={64} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}><b className="cd-name">{info.name}</b><span className="muted small">{info.tagline}</span></div>
              <div className="cd-line"><span className="plus">+</span> {info.signature}</div>
              <div className="hp-stats">
                {(Object.keys(info.stats) as (keyof typeof info.stats)[]).map((k) => (
                  <div key={k} className="hp-stat" title={STAT_INFO[k].what}>
                    <em>{k}</em><span><motion.i initial={{ width: 0 }} animate={{ width: `${info.stats[k] * 12.5}%` }} transition={{ duration: 0.5 }} /></span><b>{info.stats[k]}</b>
                  </div>
                ))}
              </div>
              <button type="button" className="textbtn cd-more" onClick={() => setOpen(value)}>More about {info.name}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

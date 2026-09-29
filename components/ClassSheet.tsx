'use client';

import { motion } from 'motion/react';
import { useEffect } from 'react';
import { audio } from '@/lib/audio';
import { CLASSES, CLASS_ORDER } from '@/lib/classes';
import { CLASS_GUIDE } from '@/lib/classGuide';
import type { PlayerClass } from '@/lib/types';
import { CLASS_COLORS, ClassIcon, Icon } from './icons';

/** Full-screen class breakdown: portrait, power, price, how it plays, tips & tricks, counter. */
export function ClassSheet({ cls, selected, onClose, onPick, onNav }: {
  cls: PlayerClass; selected: boolean; onClose: () => void; onPick: (c: PlayerClass) => void; onNav: (c: PlayerClass) => void;
}) {
  const info = CLASSES[cls];
  const guide = CLASS_GUIDE[cls];
  const [a, b] = CLASS_COLORS[cls];
  const i = CLASS_ORDER.indexOf(cls);
  const prev = CLASS_ORDER[(i - 1 + CLASS_ORDER.length) % CLASS_ORDER.length];
  const next = CLASS_ORDER[(i + 1) % CLASS_ORDER.length];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNav(prev);
      if (e.key === 'ArrowRight') onNav(next);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose, onNav, prev, next]);

  return (
    <motion.div className="sheet-backdrop cs-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="class-sheet" role="dialog" aria-modal="true" aria-label={`${info.name} class`}
        onClick={(e) => e.stopPropagation()}
        style={{ ['--ca' as string]: a, ['--cb' as string]: b }}
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
        <div className="cs-top">
          <button type="button" className="iconbtn" aria-label="Previous class" onClick={() => onNav(prev)}><span className="cs-arrow">‹</span></button>
          <span className="cs-count">{i + 1} / {CLASS_ORDER.length}</span>
          <button type="button" className="iconbtn" aria-label="Next class" onClick={() => onNav(next)}><span className="cs-arrow">›</span></button>
          <button type="button" className="iconbtn cs-close" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>

        <motion.div key={cls} className="cs-body" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
          <div className="cs-hero">
            <motion.div initial={{ scale: 0.7, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
              <ClassIcon cls={cls} size={132} />
            </motion.div>
            <div className="cs-title">
              <h2>{info.name}</h2>
              <div className="cs-tag">{info.tagline}</div>
              <div className="cs-meta">
                <span className="cs-chip">{guide.style}</span>
                <span className="cs-chip" title="Difficulty">
                  {[1, 2, 3].map((n) => <span key={n} className={`cs-dot${n <= guide.difficulty ? ' on' : ''}`} />)}
                  {guide.difficulty === 1 ? 'Easy' : guide.difficulty === 2 ? 'Medium' : 'Hard'}
                </span>
              </div>
            </div>
          </div>

          <div className="cs-pp">
            <div className="cs-box plus"><b>Power</b><p>{info.perk}</p></div>
            <div className="cs-box minus"><b>Price</b><p>{info.cost}</p></div>
          </div>

          <section className="cs-sec">
            <h3>How it plays</h3>
            <p>{guide.how}</p>
          </section>

          <section className="cs-sec">
            <h3>Tips &amp; tricks</h3>
            <ol className="cs-tips">
              {guide.tips.map((t, n) => (
                <motion.li key={t} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + n * 0.05 }}>{t}</motion.li>
              ))}
            </ol>
          </section>

          <section className="cs-sec cs-counter">
            <h3><Icon name="target" size={16} /> How to beat it</h3>
            <p>{guide.counter}</p>
          </section>
        </motion.div>

        <div className="cs-foot">
          <motion.button type="button" className="btn primary cs-pick" whileTap={{ scale: 0.96 }}
            onClick={() => { audio.success(); onPick(cls); }}>
            {selected ? <><Icon name="check" size={18} /> {info.name} selected</> : <>Choose {info.name}</>}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

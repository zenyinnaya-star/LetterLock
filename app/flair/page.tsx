'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { BackLink, Header } from '@/components/ui';
import { audio } from '@/lib/audio';
import { CLASS_ORDER, CLASSES } from '@/lib/classes';
import { tierName } from '@/lib/mastery';

/** Preview of mastery-tier flair: tap a class + tier to hear and see it. */
export default function FlairPreview() {
  const [fx, setFx] = useState<{ k: number; cls: string; tier: number } | null>(null);
  const play = (cls: string, tier: number) => { audio.unlock(); audio.flair(cls, tier); setFx({ k: Date.now(), cls, tier }); };
  return (
    <main className="shell narrow">
      <Header />
      <BackLink />
      <div className="sheet" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 className="stage-title">Mastery flair preview</h1>
        <p className="muted small">Tiers 3, 4 and 5 add flair to a class&apos;s moves in a real match. Tiers 1 and 2 stay plain.</p>
        {CLASS_ORDER.map((c) => (
          <div key={c} className="mastery-row">
            <b>{CLASSES[c].name}</b>
            <span style={{ display: 'flex', gap: 6 }}>
              {[3, 4, 5].map((t) => <button key={t} className="btn sm ghost" onClick={() => play(c, t)}>{tierName(c, t)}</button>)}
            </span>
          </div>
        ))}
      </div>
      {fx && (
        <motion.div key={fx.k} className={`tier-fx t${fx.tier} c-${fx.cls}`} aria-hidden
          initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: [0, 1, 0], scale: [0.4, 1.15, 1.5] }} transition={{ duration: 1.3, ease: 'easeOut' }} />
      )}
    </main>
  );
}

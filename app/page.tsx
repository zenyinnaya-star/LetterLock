'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Header } from '@/components/ui';
import { useT } from '@/lib/i18n/react';
import './landing.css';

const WORLDS = [
  { k: 'vault', label: 'Bank' },
  { k: 'west', label: 'Saloon' },
  { k: 'siege', label: 'Castle' },
  { k: 'noir', label: 'Interrogation' },
];

export default function Home() {
  const t = useT();
  return (
    <main className="worlds-land">
      <div className="wl-bg" aria-hidden />
      <Header />
      <section className="wl-stage">
        <motion.h1 className="wl-logo" aria-label="Letterlock" initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
          LETTER<span className="wl-lock">L<i className="wl-key" aria-hidden />CK</span>
        </motion.h1>
        <motion.p className="wl-tag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }}>
          <span>Same lock. Different worlds.</span>
        </motion.p>

        <div className="wl-arches">
          {WORLDS.map((w, i) => (
            <motion.div key={w.k} className="wl-arch-wrap" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.35 + i * 0.12 }}>
              <Link href="/play" className={`wl-arch wl-${w.k}`}>
                <span className="wl-art" style={{ backgroundImage: `url(/art/worlds/land_${w.k}.webp)` }} />
                <span className="wl-rim" aria-hidden />
              </Link>
              <span className="wl-label">{w.label}</span>
            </motion.div>
          ))}
        </div>

        <motion.div className="wl-cta" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.6 }}>
          <Link href="/play" className="wl-play">PLAY</Link>
          <div className="wl-links">
            <Link href="/daily">{t('home.daily')}</Link>
            <Link href="/how-to-play">{t('hd.rules')}</Link>
          </div>
        </motion.div>
      </section>
    </main>
  );
}

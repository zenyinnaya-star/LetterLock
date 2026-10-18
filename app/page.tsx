'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Icon } from '@/components/icons';
import { Header, spring } from '@/components/ui';
import { useT } from '@/lib/i18n/react';

const TITLE = 'LETTERLOCK';
const DOORS = [
  { k: 'vault', tag: 'Classic', name: 'Vault Heist', line: 'Answer fast, crack your rivals’ locks, last safe standing.' },
  { k: 'west', tag: '1v1', name: 'High Noon Duel', line: 'Two players, three strikes, one quickest draw.' },
  { k: 'siege', tag: '2v2 · 3v3', name: 'Team Siege', line: 'Shared rack, focus fire, bring the castle down together.' },
  { k: 'noir', tag: '2–8 players', name: 'Mastermind', line: 'Set the secret, drop the clues, crack the case.' },
];

export default function Home() {
  const t = useT();
  return (
    <main className="shell landing">
      <Header />
      <section className="lp-hero">
        <motion.div className="hero-art lp-art" aria-hidden initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}>
        </motion.div>
        <h1 className="hero-tiles lp-tiles" aria-label="Letterlock">
          {TITLE.split('').map((c, i) => (
            <motion.span key={i} className="tile" aria-hidden
              style={i >= 6 ? { background: 'linear-gradient(180deg,#e0384f,#8e0b1b)', color: '#fff' } : undefined}
              initial={{ y: -120, rotate: (i % 2 ? 1 : -1) * 25, opacity: 0 }}
              animate={{ y: 0, rotate: (i % 3 - 1) * 3, opacity: 1 }}
              whileHover={{ y: -6, rotate: 0 }}
              transition={{ ...spring, delay: 0.1 + i * 0.06 }}>
              {c}
            </motion.span>
          ))}
        </h1>
        <motion.p className="tagline lp-tag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
          {t('home.tag1')}<br />{t('home.tag2')}
        </motion.p>
        <motion.div className="lp-cta" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 1 }}>
          <Link href="/play" className="btn lg block lp-play"><Icon name="play" size={22} /> {t('lp.play')}</Link>
          <div className="lp-links">
            <Link href="/daily"><Icon name="trophy" size={16} /> {t('home.daily')}</Link>
            <Link href="/how-to-play"><Icon name="bulb" size={16} /> {t('hd.rules')}</Link>
          </div>
        </motion.div>
      </section>
      <p className="lp-chips muted small center">{t('lp.chips')}</p>
      <section className="doors" aria-label="Game worlds">
        <motion.h2 className="doors-h" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7 }}>
          Same lock.<br /><span>Different worlds.</span>
        </motion.h2>
        <div className="doors-grid">
          {DOORS.map((d, i) => (
            <motion.div key={d.k} initial={{ opacity: 0, y: 60, rotateX: 12 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, margin: '-60px' }} transition={{ ...spring, delay: (i % 2) * 0.12 }}>
              <Link href="/play" className={`door door-${d.k}`}>
                <span className="door-glow" aria-hidden />
                <span className="door-knob" aria-hidden />
                <span className="door-tag">{d.tag}</span>
                <strong className="door-name">{d.name}</strong>
                <span className="door-line">{d.line}</span>
                <span className="door-go">Step inside →</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}

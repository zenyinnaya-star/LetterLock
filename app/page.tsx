'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Icon } from '@/components/icons';
import { Header, spring } from '@/components/ui';
import { useT } from '@/lib/i18n/react';

const TITLE = 'LETTERLOCK';

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
    </main>
  );
}

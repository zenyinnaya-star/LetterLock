'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { Header, spring } from '@/components/ui';
import { audio } from '@/lib/audio';
import { useT } from '@/lib/i18n/react';
import type { Key } from '@/lib/i18n';

type Kind = 'create' | 'duel' | 'team' | 'solo' | 'reverse' | 'chaos' | 'memory';
interface Mode { kind: Kind; icon: IconName; k: string; tone: string }
// Scene art per mode (local file wins once self-hosted; CDN copy until then). Solo stays plain on purpose.
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_';
const BG: Partial<Record<Kind, string>> = {
  create: `url(/art/mode-classic.webp), url(${CDN}20261005_051536_b7f898c0-9f76-41a2-a8b3-f74fdabe184d.png)`,
  duel: `url(/art/mode-duel.webp), url(${CDN}20261005_051536_53b2e5b2-a949-4a03-80f6-a27be7013203.png)`,
  team: `url(/art/mode-team.webp), url(${CDN}20261005_051536_697b7012-abd7-48ad-ab89-6a5a4171375d.png)`,
};

const MODES: Mode[] = [
  { kind: 'create', icon: 'users', k: 'classic', tone: 'amber' },
  { kind: 'duel', icon: 'swords', k: 'duel', tone: 'red' },
  { kind: 'team', icon: 'shield', k: 'team', tone: 'cyan' },
  { kind: 'solo', icon: 'terminal', k: 'solo', tone: 'violet' },
];
const LAB: Mode[] = [
  { kind: 'reverse', icon: 'swap', k: 'reverse', tone: 'green' },
  { kind: 'chaos', icon: 'dice', k: 'chaos', tone: 'pink' },
  { kind: 'memory', icon: 'eye', k: 'memory', tone: 'blue' },
];

export default function Play() {
  const router = useRouter();
  const t = useT();
  const [code, setCode] = useState('');

  function go(kind: Kind | 'join') {
    audio.unlock();
    router.push(kind === 'join' ? `/play/class?mode=join&code=${code}` : `/play/class?mode=${kind}`);
  }

  const card = (m: Mode, i: number) => (
    <motion.button key={m.kind} className={`mode-card tone-${m.tone}${BG[m.kind] ? ' has-bg' : ''}`} style={BG[m.kind] ? ({ ['--bg' as string]: BG[m.kind] } as React.CSSProperties) : undefined} 
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 + i * 0.05 }}
      whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => go(m.kind)}>
      <span className="mc-ico"><Icon name={m.icon} size={22} /></span>
      <b>{t(`pl.${m.k}` as Key)}</b>
      <span className="mc-desc">{t(`pl.${m.k}_d` as Key)}</span>
    </motion.button>
  );

  return (
    <main className="shell play-shell">
      <Header />
      <div className="play-head">
        <Link href="/" className="play-back" aria-label={t('pl.back')}><Icon name="logout" size={18} /> {t('pl.back')}</Link>
        <h1 className="stage-title">{t('pl.title')}</h1>
      </div>

      <div className="play-grid">
        <section className="play-modes">
          <span className="label">{t('pl.modes')}</span>
          <div className="mode-grid">
            {MODES.map(card)}
            <Link href="/daily" className="mode-card wide tone-gold">
              <span className="mc-ico"><Icon name="trophy" size={22} /></span>
              <span className="mc-txt"><b>{t('pl.daily')}</b><span className="mc-desc">{t('pl.daily_d')}</span></span>
            </Link>
          </div>

          <span className="label lab-label"><Icon name="bolt" size={14} /> {t('pl.lab')}</span>
          <div className="mode-grid three">{LAB.map((m, i) => card(m, i + 4))}</div>

          <div className="join-bar">
            <input className="input code" maxLength={4} value={code} placeholder={t('home.code_ph')} aria-label={t('home.code')}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 4) go('join'); }} />
            <button className="btn lg" disabled={code.length !== 4} onClick={() => go('join')}>{t('pl.join')}</button>
          </div>
        </section>
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { pveUnlocked, tryUnlockPve } from '@/lib/pveGate';
import { Icon, type IconName } from '@/components/icons';
import { Header, spring } from '@/components/ui';
import { audio } from '@/lib/audio';
import { useT } from '@/lib/i18n/react';
import type { Key } from '@/lib/i18n';
import '../landing.css';

type Kind = 'mastermind' | 'jester' | 'create' | 'duel' | 'team' | 'story' | 'solo' | 'reverse' | 'chaos' | 'memory';
interface Mode { kind: Kind; icon: IconName; k: string; tone: string }
// Scene art per mode (local file wins once self-hosted; CDN copy until then).
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_';
// Only Story gets a background image on its mode button — every other mode stays a plain
// icon + tone card, so the grid reads cleanly instead of competing photo/pixel-art styles.
const BG: Partial<Record<Kind, string>> = {
  story: `url(${CDN}20261008_072145_be5c6185-1e84-4cf8-b0c2-942af2b412c9.png)`,
};

const DOORS: { kind: Kind; art: string; icon: IconName; name: string; players: string }[] = [
  { kind: 'create', art: 'vault', icon: 'users', name: 'Classic', players: '2–8 players' },
  { kind: 'duel', art: 'west', icon: 'swords', name: 'Duel', players: '2 players' },
  { kind: 'team', art: 'siege', icon: 'shield', name: 'Siege', players: '4–8 players' },
  { kind: 'mastermind', art: 'noir', icon: 'bulb', name: 'Mastermind', players: '3–12 players' },
];
const MODES: Mode[] = [
  { kind: 'story', icon: 'crown', k: 'story', tone: 'gold' },
  { kind: 'solo', icon: 'terminal', k: 'solo', tone: 'violet' },
];
const LAB: Mode[] = [
  { kind: 'reverse', icon: 'swap', k: 'reverse', tone: 'green' },
  { kind: 'chaos', icon: 'dice', k: 'chaos', tone: 'pink' },
  { kind: 'memory', icon: 'eye', k: 'memory', tone: 'blue' },
  { kind: 'jester', icon: 'skull', k: 'jester', tone: 'pink' },
];

export default function Play() {
  const router = useRouter();
  const t = useT();
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [askPw, setAskPw] = useState(false);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState(false);
  useEffect(() => { setUnlocked(pveUnlocked()); }, []);
  async function submitPw() {
    if (await tryUnlockPve(pw)) { setUnlocked(true); setAskPw(false); setPw(''); setPwErr(false); router.push('/play/class?mode=story'); }
    else setPwErr(true);
  }

  function go(kind: Kind | 'join') {
    audio.unlock();
    router.push(kind === 'join' ? `/play/class?mode=join&code=${code}` : `/play/class?mode=${kind}`);
  }

  const card = (m: Mode, i: number) => (
    <motion.button key={m.kind} className={`mode-card world-${m.kind} tone-${m.tone}${BG[m.kind] ? ' has-bg' : ''}`} style={BG[m.kind] ? ({ ['--bg' as string]: BG[m.kind] } as React.CSSProperties) : undefined} 
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 + i * 0.05 }}
      whileHover={{ y: -6, scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => (m.kind === 'mastermind' ? router.push('/mastermind') : m.kind === 'jester' ? undefined : m.kind === 'story' && !unlocked ? (audio.unlock(), setAskPw(true)) : go(m.kind))}>
      <span className="mc-ico"><Icon name={m.kind === 'story' && !unlocked ? 'lock' : m.icon} size={22} /></span>
      <b>{t(`pl.${m.k}` as Key)}</b>
      <span className="mc-desc">{m.kind === 'story' && !unlocked ? 'Coming soon — locked' : m.kind === 'jester' ? `Coming soon · ${t(`pl.${m.k}_d` as Key)}` : t(`pl.${m.k}_d` as Key)}</span>
    </motion.button>
  );

  return (
    <>
    <div className="pf-bg" aria-hidden="true" />
    <main className="shell play-shell">
      <Header />
      <div className="play-head">
        <Link href="/" className="play-back" aria-label={t('pl.back')}><Icon name="logout" size={18} /> {t('pl.back')}</Link>
        <h1 className="stage-title">{t('pl.title')}</h1>
        <p className="world-sub">Choose your world — same lock, different rules.</p>
      </div>

      <div className="wd-grid">
        {DOORS.map((d, i) => (
          <motion.button key={d.kind} className={`wd-card wd-${d.art}`} initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.1 + i * 0.1 }} whileHover={{ y: -10 }} whileTap={{ scale: 0.97 }}
            onClick={() => (d.kind === 'mastermind' ? router.push('/mastermind') : go(d.kind))}>
            <span className="wd-art" style={{ backgroundImage: `url(/art/worlds/mode_${d.art}.webp)` }} />
            <span className="wd-shade" aria-hidden />
            {d.kind === 'create' && <span className="wd-badge">Start here</span>}
            <span className="wd-ico"><Icon name={d.icon} size={22} /></span>
            <span className="wd-name">{d.name}</span>
            <span className="wd-pl">{d.players}</span>
          </motion.button>
        ))}
      </div>

      <div className="join-bar top">
        <input className="input code" maxLength={4} value={code} placeholder={t('home.code_ph')} aria-label={t('home.code')}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 4) go('join'); }} />
        <button className="btn lg" disabled={code.length !== 4} onClick={() => go('join')}>{t('pl.join')}</button>
      </div>

      <details className="more-modes">
        <summary>More ways to play <span>Tutorial · Daily challenge · Experiments</span></summary>
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

        </section>
      </div>
      </details>
      {askPw && (
        <div className="pve-lock" role="dialog" aria-modal="true" onClick={() => setAskPw(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void submitPw(); }}>
            <h2>Story Mode — Coming Soon</h2>
            <p>This mode is locked for now. Enter the password to get in early.</p>
            <input className="input" type="password" autoFocus autoComplete="off" value={pw} placeholder="Password" onChange={(e) => { setPw(e.target.value); setPwErr(false); }} />
            {pwErr && <div className="note bad">Wrong password.</div>}
            <div className="row">
              <button type="button" className="btn" onClick={() => setAskPw(false)}>Cancel</button>
              <button type="submit" className="btn lg" disabled={!pw.trim()}>Unlock</button>
            </div>
          </form>
        </div>
      )}
    </main>
    </>
  );
}

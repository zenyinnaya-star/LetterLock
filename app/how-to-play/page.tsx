'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { CardIcon, ClassIcon, Icon } from '@/components/icons';
import { RulesVideo } from '@/components/RulesVideo';
import { Wordmark } from '@/components/ui';
import { CARD_INFO, CLASSES, CLASS_ORDER } from '@/lib/classes';
import { Rich, useT } from '@/lib/i18n/react';
import type { CardKind } from '@/lib/types';
import { img } from '@/lib/mmArt';
import { MM_RULES } from '@/lib/mastermind';
import '@/app/comic.css';
import '@/app/rules-comic.css';

const CDN = 'https://d2ol7oe51mr4n9.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU';
const STAGE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261102_151721_92488ad5-75da-4ed7-b406-19b63b030be0.png';
const MODES = [
  { art: 'classic', name: 'Classic', soon: false, blurb: 'Lock a secret word, crack your rivals.' },
  { art: 'duel', name: 'Duel', soon: true, blurb: 'One street, two players, fastest draw.' },
  { art: 'mastermind', name: 'Mastermind', soon: false, blurb: 'Hide a word, drop clues, find the Impostor.' },
];

function ModeCard({ art, name, soon, blurb }: (typeof MODES)[number]) {
  const v = useRef<HTMLVideoElement>(null);
  const go = () => { try { void v.current?.play(); } catch { /* ignore */ } };
  const stop = () => { try { v.current?.pause(); } catch { /* ignore */ } };
  return (
    <figure className="mode-video" onMouseEnter={go} onMouseLeave={stop} onClick={() => (v.current?.paused ? go() : stop())}>
      <div className="mv-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/art/comic/${art}.webp`} alt="" draggable={false} />
        <video ref={v} poster={`/art/comic/${art}.webp`} muted loop playsInline preload="none" aria-hidden>
          <source src={`/art/comic/${art}.mp4`} type="video/mp4" />
          <source src={`/art/comic/${art}.webm`} type="video/webm" />
        </video>
      </div>
      <figcaption><b>{name}</b>{soon ? <em className="mv-soon">Coming soon</em> : null}<span>{blurb}</span></figcaption>
    </figure>
  );
}

export default function HowToPlay() {
  const t = useT();
  return (
    <main className="shell narrow rules rules-comic" style={{ ['--rules-stage' as string]: `url("${img(STAGE, 1200)}")` }}>
      <header className="topbar">
        <Wordmark />
        <Link href="/" className="btn sm">{t('rl.play')}</Link>
      </header>
      <h1>{t('rl.title')}</h1>
      <RulesVideo />
      <section className="mode-videos" aria-label="Game modes">
        {MODES.map((m) => <ModeCard key={m.name} {...m} />)}
      </section>
      <p className="big"><Rich k="rl.intro" /></p>

      <h2>{t('rl.basics')}</h2>
      <ul>
        <li><Rich k="rl.b1" /></li>
        <li><Rich k="rl.b2" /></li>
        <li><Rich k="rl.b3" /></li>
        <li><Rich k="rl.b4" vars={{ good: <i>{t('rl.b4_good')}</i>, bad: <i>{t('rl.b4_bad')}</i> }} /></li>
        <li><Rich k="rl.b5" /></li>
        <li><Rich k="rl.b6" /></li>
      </ul>

      <h2>{t('rl.rounds')}</h2>
      <ol>
        <li><Rich k="rl.r1" /></li>
        <li><Rich k="rl.r2" /></li>
        <li><Rich k="rl.r3" /></li>
        <li><Rich k="rl.r4" /></li>
      </ol>
      <p><Rich k="rl.rounds_note" /></p>

      <h2>{t('rl.strikes')}</h2>
      <ul>
        <li><Rich k="rl.s1" /></li>
        <li><Rich k="rl.s2" /></li>
        <li><Rich k="rl.s3" /></li>
        <li><Rich k="rl.s4" /></li>
      </ul>

      <h2>{t('rl.bonus_h')}</h2>
      <ul>
        {(['rl.x1', 'rl.x2', 'rl.x3', 'rl.x4', 'rl.x5', 'rl.x6', 'rl.x7'] as const).map((k) => <li key={k}>{t(k)}</li>)}
      </ul>

      <h2>{t('rl.cards')}</h2>
      {(Object.keys(CARD_INFO) as CardKind[]).map((k) => (
        <div key={k} className="line">
          <CardIcon kind={k} size={24} />
          <span><Rich k="rl.card_line" vars={{ name: CARD_INFO[k].name, text: CARD_INFO[k].text }} />
            {k === 'shield' ? ` ${t('rl.shield_note')}` : k === 'cleanse' ? ` ${t('rl.cleanse_note')}` : ''}</span>
        </div>
      ))}

      <h2>{t('rl.classes')}</h2>
      <p><Rich k="rl.classes_p" vars={{ ex: <i>{t('rl.classes_ex')}</i> }} /></p>
      {CLASS_ORDER.map((c) => (
        <div key={c} className="line">
          <ClassIcon cls={c} size={36} />
          <span><b>{CLASSES[c].name}</b> — {CLASSES[c].perk} <i className="muted">{t('rl.catch')}</i> {CLASSES[c].cost}</span>
        </div>
      ))}

      <h2>Mastermind</h2>
      <ul>
        {MM_RULES.map((r) => <li key={r.h}><b>{r.h}.</b> {r.t}</li>)}
      </ul>

      <h2>{t('rl.titles')}</h2>
      <div className="line"><span style={{ color: '#ffcf4a' }}><Icon name="trophy" size={24} /></span><span><Rich k="rl.t_champ" /></span></div>
      <div className="line"><span style={{ color: '#b69cff' }}><Icon name="bulb" size={24} /></span><span><Rich k="rl.t_einstein" /></span></div>
      <div className="line"><span style={{ color: '#ff7a90' }}><Icon name="horns" size={24} /></span><span><Rich k="rl.t_villain" /></span></div>
      <p className="muted small">{t('rl.points')}</p>
      <p style={{ marginTop: 30 }}><Link href="/" className="btn lg">{t('rl.start')}</Link></p>
    </main>
  );
}

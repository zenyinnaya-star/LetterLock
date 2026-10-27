'use client';

import Link from 'next/link';
import { CardIcon, ClassIcon, Icon } from '@/components/icons';
import { RulesVideo } from '@/components/RulesVideo';
import { Wordmark } from '@/components/ui';
import { CARD_INFO, CLASSES, CLASS_ORDER } from '@/lib/classes';
import { Rich, useT } from '@/lib/i18n/react';
import type { CardKind } from '@/lib/types';
import '@/app/comic.css';
import '@/app/rules-comic.css';

const CDN = 'https://d2ol7oe51mr4n9.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU';
const MODE_VIDEOS = [
  { id: '264c39d9-823b-4fcf-81ae-739cb8789067', name: 'Classic', blurb: 'Lock a secret word, crack your rivals.', soon: false },
  { id: '3599d026-942b-447e-a9bf-dffa609bd95c', name: 'Duel', blurb: 'One street, two players, fastest draw.', soon: true },
  { id: '79313477-bf76-4532-95f2-efe9ff10bc1c', name: 'Mastermind', blurb: 'Hide a word, drop clues, crack it first.', soon: true },
];

export default function HowToPlay() {
  const t = useT();
  return (
    <main className="shell narrow rules rules-comic">
      <header className="topbar">
        <Wordmark />
        <Link href="/" className="btn sm">{t('rl.play')}</Link>
      </header>
      <h1>{t('rl.title')}</h1>
      <RulesVideo />
      <section className="mode-videos" aria-label="Mode walkthroughs">
        {MODE_VIDEOS.map((v) => (
          <figure key={v.id} className="mode-video">
            <video controls playsInline preload="metadata" src={`${CDN}/${v.id}.mp4`} aria-label={`${v.name} how to play`} />
            <figcaption><b>{v.name}</b>{v.soon ? <em className="mv-soon">Coming soon</em> : null} — {v.blurb}</figcaption>
          </figure>
        ))}
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

      <h2>{t('rl.titles')}</h2>
      <div className="line"><span style={{ color: '#ffcf4a' }}><Icon name="trophy" size={24} /></span><span><Rich k="rl.t_champ" /></span></div>
      <div className="line"><span style={{ color: '#b69cff' }}><Icon name="bulb" size={24} /></span><span><Rich k="rl.t_einstein" /></span></div>
      <div className="line"><span style={{ color: '#ff7a90' }}><Icon name="horns" size={24} /></span><span><Rich k="rl.t_villain" /></span></div>
      <p className="muted small">{t('rl.points')}</p>
      <p style={{ marginTop: 30 }}><Link href="/" className="btn lg">{t('rl.start')}</Link></p>
    </main>
  );
}

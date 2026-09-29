'use client';

import Link from 'next/link';
import { CardIcon, ClassIcon, Icon } from '@/components/icons';
import { RulesVideo } from '@/components/RulesVideo';
import { Wordmark } from '@/components/ui';
import { CARD_INFO, CLASSES, CLASS_ORDER } from '@/lib/classes';
import { Rich, useT } from '@/lib/i18n/react';
import type { CardKind } from '@/lib/types';

export default function HowToPlay() {
  const t = useT();
  return (
    <main className="shell narrow rules">
      <header className="topbar">
        <Wordmark />
        <Link href="/" className="btn sm">{t('rl.play')}</Link>
      </header>
      <h1>{t('rl.title')}</h1>
      <RulesVideo />
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

      <h2>{t('rl.duel')}</h2>
      <p><Rich k="rl.duel_p" /></p>
      <h2>{t('tm.rules_title')}</h2>
      <p><Rich k="tm.rules_p" /></p>
      <h2>{t('rl.1v1')}</h2>
      <p><Rich k="rl.1v1_p" /></p>
      <h2>{t('rl.chaos')}</h2>
      <p><Rich k="rl.chaos_p" /></p>

      <h2>{t('rl.titles')}</h2>
      <div className="line"><span style={{ color: '#ffcf4a' }}><Icon name="trophy" size={24} /></span><span><Rich k="rl.t_champ" /></span></div>
      <div className="line"><span style={{ color: '#b69cff' }}><Icon name="bulb" size={24} /></span><span><Rich k="rl.t_einstein" /></span></div>
      <div className="line"><span style={{ color: '#ff7a90' }}><Icon name="horns" size={24} /></span><span><Rich k="rl.t_villain" /></span></div>
      <p className="muted small">{t('rl.points')}</p>
      <p style={{ marginTop: 30 }}><Link href="/" className="btn lg">{t('rl.start')}</Link></p>
    </main>
  );
}

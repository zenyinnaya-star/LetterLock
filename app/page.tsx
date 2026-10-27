'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { Header } from '@/components/ui';
import { audio } from '@/lib/audio';
import { burst, shake, wipe } from '@/lib/comicFx';
import { useT } from '@/lib/i18n/react';
import './comic.css';

const FLOAT = 'LOCKWORDS'.split('');

/** Landing: just the title slamming in and one big PLAY. The modes stay hidden until the Play screen. */
export default function Home() {
  const t = useT();
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  function play(e: React.MouseEvent) {
    e.preventDefault();
    audio.unlock();
    burst(e.clientX, e.clientY, 'POW!');
    shake(root.current);
    wipe(() => router.push('/play'));
  }
  return (
    <main className="cp cp-land" ref={root}>
      <div className="cp-sky" aria-hidden />
      <div className="cp-band" aria-hidden />
      <div className="cp-tear" aria-hidden />
      {FLOAT.map((c, i) => (
        <span key={i} className="cp-fl" aria-hidden style={{ left: `${(i * 41 + 6) % 92}%`, animationDuration: `${14 + (i % 4) * 4}s`, animationDelay: `${-i * 2.5}s` }}>{c}</span>
      ))}
      <Header />
      <section className="cp-center">
        <h1 className="cp-logo" aria-label="Letterlock">
          <span className="cp-pow" aria-hidden />
          {'LETTERLOCK'.split('').map((c, i) => <span key={i} style={{ ['--i' as string]: i }} aria-hidden>{c}</span>)}
        </h1>
        <div><span className="cp-plate">Same lock. Different worlds.</span></div>
        <div className="cp-playwrap">
          <Link href="/play" className="cp-btn big" onClick={play}
            onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); burst(r.left + r.width / 2, r.top); }}>
            <span>PLAY!</span>
          </Link>
        </div>
      </section>
      <nav className="cp-links">
        <Link href="/daily">{t('home.daily')}</Link>
        <Link href="/how-to-play">{t('hd.rules')}</Link>
      </nav>
    </main>
  );
}

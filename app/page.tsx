'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { ComicTop } from '@/components/ComicTop';
import { audio } from '@/lib/audio';
import { burst, shake, wipe } from '@/lib/comicFx';
import './comic.css';

// floating keycaps: desktop spots (x,y) and phone spots (px,py), tilt r
const KEYS: { c: string; x?: string; y?: string; px?: string; py?: string; r: string }[] = [
  { c: 'A', x: '11%', y: '24%', px: '15%', py: '15%', r: '-18deg' },
  { c: 'B', x: '9%', y: '70%', px: '56%', py: '8%', r: '14deg' },
  { c: 'Z', x: '91%', y: '43%', px: '90%', py: '45%', r: '18deg' },
  { c: 'C', x: '86%', y: '76%', r: '-14deg' },
  { c: 'Q', px: '8%', py: '54%', r: '-16deg' },
  { c: 'M', px: '14%', py: '66%', r: '16deg' },
  { c: 'E', px: '86%', py: '61%', r: '-12deg' },
];

/** Landing: the LETTERLOCK title slams in on a POW burst, then one big PLAY. Modes stay hidden until the play screen. */
export default function Home() {
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
      <div className="cp-wedge" aria-hidden />
      <div className="cp-tear" aria-hidden />
      {KEYS.map((k, i) => (
        <span key={k.c} aria-hidden className={`cp-key${k.x ? '' : ' ph'}${k.px ? '' : ' dk'}`}
          style={{ ['--x' as string]: k.x, ['--y' as string]: k.y, ['--px' as string]: k.px, ['--py' as string]: k.py, ['--r' as string]: k.r, ['--i' as string]: i }}>{k.c}</span>
      ))}
      <ComicTop />
      <section className="cp-stage">
        <div className="cp-hero">
          <div className="cp-burst" aria-hidden><i /><i /></div>
          <h1 className="cp-logo cp-xt" aria-label="Letterlock">
            <span className="w" aria-hidden>{'LETTER'.split('').map((c, i) => <span key={i} className="c" style={{ ['--i' as string]: i }}>{c}</span>)}</span>
            <span className="w" aria-hidden>{'LOCK'.split('').map((c, i) => <span key={i} className="c" style={{ ['--i' as string]: i + 6 }}>{c}</span>)}</span>
          </h1>
          <div className="cp-plate">Same lock. Different worlds.</div>
        </div>
        <div className="cp-playwrap">
          <Link href="/play" className="cp-play" onClick={play}
            onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); burst(r.left + r.width / 2, r.top); }}>
            <i className="sh" aria-hidden /><span>PLAY!</span>
          </Link>
        </div>
      </section>
      <nav className="cp-links">
        <Link href="/daily" className="cp-xt">Daily challenge</Link>
        <Link href="/how-to-play" className="cp-xt">How to play</Link>
      </nav>
    </main>
  );
}

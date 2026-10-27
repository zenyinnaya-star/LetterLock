'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isClassicKind } from '@/lib/modes';
import { ComicTop } from '@/components/ComicTop';
import { audio } from '@/lib/audio';
import { burst, wipe } from '@/lib/comicFx';
import { useT } from '@/lib/i18n/react';
import type { Key } from '@/lib/i18n';
import '../comic.css';

type Kind = 'create' | 'duel' | 'team' | 'mastermind' | 'story' | 'solo' | 'reverse' | 'chaos' | 'memory' | 'jester';
// Comic Pop art and hover loops (Higgsfield). Still image shows by default; the loop plays on hover / when selected.
// Comic Pop art + hover loops (made with Higgsfield, self-hosted under /art/comic). Still frame by default; the loop plays on hover / tap.
const DOORS: { kind: Kind; art: string; name: string; players: string; desc: string; cta: string; pow: string }[] = [
  { kind: 'create', art: 'classic', name: 'Classic', players: '2–10 players', desc: 'Break the vault. Grab the cash. Get out.', cta: 'Create room', pow: 'POW!' },
  { kind: 'duel', art: 'duel', name: 'Duel', players: '2 players', desc: 'High noon. Fastest word wins the draw.', cta: 'Start a duel', pow: 'BANG!' },
  { kind: 'team', art: 'siege', name: 'Siege', players: '4–8 players', desc: 'Storm the castle. Every word hits the gate.', cta: 'Start a siege', pow: 'CLANG!' },
  { kind: 'mastermind', art: 'mastermind', name: 'Mastermind', players: '3–12 players', desc: 'One lamp. One table. Crack the hidden word.', cta: 'Open a case', pow: 'ZAP!' },
];
const SVG = {
  people: <svg viewBox="0 0 24 24" aria-hidden><circle cx="8" cy="8" r="3.2" /><circle cx="16.5" cy="8.5" r="2.7" /><path d="M2 19c.4-3.6 2.9-5.6 6-5.6s5.6 2 6 5.6zM14.6 13.9c.6-.2 1.2-.3 1.9-.3 2.7 0 4.8 1.8 5.3 5.1h-6.1c-.1-1.9-.5-3.5-1.1-4.8z" /></svg>,
  key: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><circle cx="7.5" cy="12" r="4" /><path d="M11.5 12H21M17.5 12v3.5M20.5 12v2.5" /></svg>,
  book: <svg viewBox="0 0 24 24" aria-hidden><path d="M3 5.5c3-1.3 6-1 9 1 3-2 6-2.3 9-1V19c-3-1.3-6-1-9 1-3-2-6-2.3-9-1z" /><path d="M12 6.5V20" /></svg>,
  cal: <svg viewBox="0 0 24 24" aria-hidden><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.5h2M11 16.5h2" /></svg>,
  flask: <svg viewBox="0 0 24 24" aria-hidden><path d="M9.5 3h5M10.5 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5.5-10V3" /><path d="M7.5 15h9" /></svg>,
};

export default function Play() {
  const router = useRouter();
  const t = useT();
  const [sel, setSel] = useState(0);
  const [live, setLive] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const vids = useRef<(HTMLVideoElement | null)[]>([]);

  // only the "live" door plays its loop; the rest rewind to the still frame
  useEffect(() => {
    vids.current.forEach((v, i) => {
      if (!v) return;
      if (i === live) { void v.play().catch(() => undefined); }
      else { v.pause(); try { v.currentTime = 0; } catch { /* not loaded yet */ } }
    });
  }, [live]);

  function start(kind: Kind | 'join') {
    if (!isClassicKind(kind === 'create' ? 'create' : kind)) return;
    audio.unlock();
    wipe(() => {
      if (kind === 'mastermind') router.push('/mastermind');
      else router.push(kind === 'join' ? `/play/class?mode=join&code=${code}` : `/play/class?mode=${kind}`);
    });
  }
  function tilt(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType !== 'mouse') return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translateY(-12px) rotateY(${x * 16}deg) rotateX(${-y * 16}deg) scale(1.05)`;
  }
  const d = DOORS[sel];

  return (
    <main className="cp cp-pick">
      <div className="cp-sky" aria-hidden />
      <div className="cp-pwedge" aria-hidden />
      <div className="cp-tear short" aria-hidden />
      <ComicTop />
      <div className="cp-pw">
        <Link href="/" className="cp-back">‹ Back</Link>
        <h1 className="cp-title cp-xt">Pick your game</h1>

        <div className="cp-cards">
          {DOORS.map((m, i) => (
            <button key={m.kind} type="button" className={`cp-card${i === sel ? ' sel' : ''}${i === live ? ' live' : ''}${m.kind !== 'create' ? ' soon' : ''}`} style={{ ['--i' as string]: i }}
              aria-pressed={i === sel} aria-label={m.kind === 'create' ? `${m.name}, ${m.players}` : `${m.name}, coming soon`}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') { setSel(i); setLive(i); } }}
              onPointerMove={tilt}
              onPointerLeave={(e) => { e.currentTarget.style.transform = ''; if (e.pointerType === 'mouse') setLive(null); }}
              onClick={(e) => {
                e.currentTarget.style.transform = '';
                burst(e.clientX, e.clientY, m.pow);
                const mouse = (e.nativeEvent as PointerEvent).pointerType === 'mouse';
                if (m.kind !== 'create') { setSel(i); return; }
                if (i === sel && (mouse || live === i)) { start(m.kind); return; }
                setSel(i); setLive(i);
              }}>
              <span className="in">
                <span className="art">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/art/comic/${m.art}.webp`} alt="" draggable={false} />
                  <video ref={(v) => { vids.current[i] = v; }} poster={`/art/comic/${m.art}.webp`} muted loop playsInline preload="none" aria-hidden>
                    <source src={`/art/comic/${m.art}.mp4`} type="video/mp4" />
                    <source src={`/art/comic/${m.art}.webm`} type="video/webm" />
                  </video>
                </span>
                {m.kind !== 'create' && <span className="cp-soon">Coming soon</span>}
                <span className="lbl">{m.name}</span>
              </span>
              <span className="num cp-xt" aria-hidden>{i + 1}</span>
            </button>
          ))}
        </div>

        <div className="cp-bar">
          <div className="cp-info"><b>{d.name}</b><p>{d.kind === 'create' ? d.desc : 'Coming soon. Classic is the only playable mode for now.'}</p></div>
          <button type="button" className="cp-create" disabled={d.kind !== 'create'} onClick={(e) => { burst(e.clientX, e.clientY, d.pow); start(d.kind); }}>{SVG.people}<span>{d.kind === 'create' ? d.cta : 'Coming soon'}</span></button>
          <span className="cp-or">or</span>
          <label className="cp-join">
            <span>{SVG.key} Join with code</span>
            <span className="f">
              <input maxLength={4} value={code} placeholder="Enter code…" aria-label={t('home.code')}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 4) start('join'); }} />
              <button type="button" disabled={code.length !== 4} onClick={(e) => { burst(e.clientX, e.clientY, 'IN!'); start('join'); }}>Go</button>
            </span>
          </label>
          <span className="cp-div" aria-hidden />
          <div className="cp-minis">
            <button type="button" className="cp-mini soon" disabled>{SVG.book}<span>Story · soon</span></button>
            <button type="button" className="cp-mini soon" disabled>{SVG.cal}<span>Daily · soon</span></button>
            <button type="button" className="cp-mini soon" disabled>{SVG.flask}<span>Lab · soon</span></button>
          </div>
        </div>
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { pveUnlocked, tryUnlockPve } from '@/lib/pveGate';
import { Header } from '@/components/ui';
import { audio } from '@/lib/audio';
import { burst, wipe } from '@/lib/comicFx';
import { useT } from '@/lib/i18n/react';
import type { Key } from '@/lib/i18n';
import '../comic.css';

type Kind = 'create' | 'duel' | 'team' | 'mastermind' | 'story' | 'solo' | 'reverse' | 'chaos' | 'memory' | 'jester';
// Comic Pop art and hover loops (Higgsfield). Still image shows by default; the loop plays on hover / when selected.
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261027_';
const DOORS: { kind: Kind; name: string; tag: string; players: string; desc: string; cta: string; pow: string; img: string; vid: string }[] = [
  { kind: 'create', name: 'Classic', tag: 'Most played', players: '2–10 players', desc: 'Dodge your locked letters, crack everyone else’s. Last one standing wins.', cta: 'Create room', pow: 'POW!',
    img: '020055_afa4549e-7af7-484c-9c17-5a188d39a5e7', vid: '032509_1331adb8-eead-4a1e-b3a7-25ee7da27c06' },
  { kind: 'duel', name: 'Duel', tag: '1v1', players: '2 players', desc: 'High-noon showdown. Fastest word wins the draw.', cta: 'Start a duel', pow: 'BANG!',
    img: '020119_c6adde07-372f-4108-a920-edb73df4c37f', vid: '032640_3c6b1749-4c02-481b-ab78-fa6b2ffc5124' },
  { kind: 'team', name: 'Siege', tag: 'Teams', players: '4–8 players', desc: 'Two teams storm the castle. Every word is a stone on the gate.', cta: 'Start a siege', pow: 'CLANG!',
    img: '020119_ab7779df-a236-4da3-8050-10300b620648', vid: '032509_5c9290a0-260a-4969-a9e1-0865899e7e55' },
  { kind: 'mastermind', name: 'Mastermind', tag: 'Puzzle', players: '3–12 players', desc: 'One table, one lamp. Crack the hidden word before it cracks you.', cta: 'Open a case', pow: 'ZAP!',
    img: '020119_99132e11-5487-4681-b899-9a0a3b4c4707', vid: '032509_7ff61b34-31d2-4a8f-8960-a167a3279ad1' },
];
const LAB: { kind: Kind; k: string }[] = [
  { kind: 'solo', k: 'solo' }, { kind: 'reverse', k: 'reverse' }, { kind: 'chaos', k: 'chaos' }, { kind: 'memory', k: 'memory' }, { kind: 'jester', k: 'jester' },
];

export default function Play() {
  const router = useRouter();
  const t = useT();
  const [sel, setSel] = useState(0);
  const [live, setLive] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [askPw, setAskPw] = useState(false);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  useEffect(() => { setUnlocked(pveUnlocked()); }, []);

  // only the "live" door plays its loop; the rest rewind to the still frame
  useEffect(() => {
    vids.current.forEach((v, i) => {
      if (!v) return;
      if (i === live) { void v.play().catch(() => undefined); }
      else { v.pause(); try { v.currentTime = 0; } catch { /* not loaded yet */ } }
    });
  }, [live]);

  async function submitPw() {
    if (await tryUnlockPve(pw)) { setUnlocked(true); setAskPw(false); setPw(''); setPwErr(false); router.push('/play/class?mode=story'); }
    else setPwErr(true);
  }
  function start(kind: Kind | 'join') {
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
    el.style.transform = `skewX(-6deg) translateY(-12px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg) scale(1.05)`;
  }
  const d = DOORS[sel];

  return (
    <main className="cp cp-play">
      <div className="cp-sky" aria-hidden />
      <div className="cp-tear short" aria-hidden />
      <Header />
      <div className="cp-wrap">
        <div className="cp-top"><Link href="/" className="cp-back"><span>◀ {t('pl.back')}</span></Link></div>
        <h1 className="cp-h2">Pick your game</h1>
        <p className="cp-sub">Four ways to play. Tap one to see it, then jump in.</p>

        <div className="cp-doors">
          {DOORS.map((m, i) => (
            <button key={m.kind} type="button" className={`cp-door${i === sel ? ' sel' : ''}${i === live ? ' live' : ''}`} style={{ ['--i' as string]: i }}
              aria-pressed={i === sel} aria-label={`${m.name}, ${m.players}`}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') { setSel(i); setLive(i); } }}
              onPointerMove={tilt}
              onPointerLeave={(e) => { e.currentTarget.style.transform = ''; if (e.pointerType === 'mouse') setLive(null); }}
              onClick={(e) => {
                e.currentTarget.style.transform = '';
                burst(e.clientX, e.clientY, m.pow);
                const mouse = (e.nativeEvent as PointerEvent).pointerType === 'mouse';
                if (i === sel && (mouse || live === i)) { start(m.kind); return; }
                setSel(i); setLive(i);
              }}>
              <span className="tg">{m.tag}</span>
              <span className="art">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${CDN}${m.img}_min.webp`} alt="" draggable={false} loading={i < 2 ? 'eager' : 'lazy'}
                  onError={(e) => { const im = e.currentTarget; if (!im.src.endsWith('.png')) im.src = `${CDN}${m.img}.png`; }} />
                <video ref={(v) => { vids.current[i] = v; }} src={`${CDN}${m.vid}.mp4`} muted loop playsInline preload="none" aria-hidden />
              </span>
              <span className="l">{m.name}</span>
              <span className="n">{i + 1}</span>
            </button>
          ))}
        </div>

        <div className="cp-info">
          <div className="cp-infob">
            <div><b>{d.name}</b><p>{d.desc}</p><small>{d.players}</small></div>
            <button type="button" className="cp-btn pink" onClick={(e) => { burst(e.clientX, e.clientY, d.pow); start(d.kind); }}><span>{d.cta} ▶</span></button>
          </div>
        </div>

        <div className="cp-row2">
          <div className="cp-panel">
            <span className="cp-tag">Have a code?</span>
            <input className="cp-code" maxLength={4} value={code} placeholder="ABCD" aria-label={t('home.code')}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 4) start('join'); }} />
            <button type="button" className="cp-btn sm" style={{ width: '100%' }} disabled={code.length !== 4}
              onClick={(e) => { burst(e.clientX, e.clientY, 'IN!'); start('join'); }}><span>{t('pl.join')}</span></button>
          </div>
          <div>
            <div className="cp-sec">Other games to try</div>
            <div className="cp-mini">
              <button type="button" className="cp-tile" style={{ background: '#16c47f', ['--i' as string]: 0 }}
                onClick={() => (unlocked ? start('story') : (audio.unlock(), setAskPw(true)))}>
                <em>★</em><b>Story</b><small>{unlocked ? t('pl.story_d' as Key) : 'Coming soon · locked'}</small>
              </button>
              <Link href="/daily" className="cp-tile" style={{ background: '#ff2e8a', ['--i' as string]: 1 }}><em>☀</em><b>{t('pl.daily')}</b><small>One word a day</small></Link>
              <button type="button" className="cp-tile" style={{ background: '#555', ['--i' as string]: 2 }} aria-expanded={labOpen} onClick={() => setLabOpen((o) => !o)}>
                <em>⚗</em><b>{t('pl.lab')}</b><small>Experiments</small>
              </button>
            </div>
            {labOpen && (
              <div className="cp-lab">
                {LAB.map((m) => (
                  <button key={m.kind} type="button" disabled={m.kind === 'jester'} title={t(`pl.${m.k}_d` as Key)} onClick={() => start(m.kind)}>
                    {t(`pl.${m.k}` as Key)}{m.kind === 'jester' ? ' · soon' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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
  );
}

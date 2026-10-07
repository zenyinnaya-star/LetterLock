'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ACT_BG, HERO_SPRITE } from '@/lib/art';
import { HEROES, heroById, type HeroId } from '@/lib/heroes';
import type { RoomState } from '@/lib/types';
import type { Act } from './phases';
import { HeroCards } from './HeroCards';
import { rpc } from '@/lib/rpc';
import { fetchProfile, type ProfileInfo } from '@/lib/profile';

const TIPS = [
  'Words of 7+ letters hit harder. Short words fill your ultimate faster.',
  'The Book of Wisdom answers in 15 seconds. A correct answer gives a rare card.',
  'Mira’s heal removes Corruption. Keep her alive.',
  'Red Tape locks four letters. Plan your words around them.',
  'Sweep cards hit every enemy. Save them for the swarms.',
];
const QUESTS = [
  { t: 'Clear Act One', n: '0/2' },
  { t: 'Fill an ultimate (6/6)', n: '0/1' },
  { t: 'Answer the Book of Wisdom', n: '0/1' },
];

export function StoryLobby({ state, token, act, onLeave, picks, isHost }: {
  state: RoomState; token: string | null; act: Act; onLeave: () => void; picks: { player_id: string; hero: string }[]; isHost: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [going, setGoing] = useState(false);
  const [panel, setPanel] = useState<'home' | 'heroes'>('home');
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const [prof, setProf] = useState<ProfileInfo | null>(null);
  useEffect(() => { void fetchProfile().then(setProf); }, []);
  const me = state.me;
  const heroOf = (pid: string) => picks.find((x) => x.player_id === pid)?.hero as HeroId | undefined;
  const mine = me ? heroOf(me.id) ?? null : null;
  const info = mine ? heroById(mine) : null;
  const url = typeof window !== 'undefined' ? `${window.location.origin}/room/${state.room.code}` : '';
  const others = state.players.filter((p) => p.id !== me?.id);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel('home'); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }
  async function begin() {
    if (!token) return;
    setGoing(true);
    await new Promise((r) => setTimeout(r, 1800));
    await act(() => rpc.startPve(token)).catch(() => setGoing(false));
  }

  return (
    <div className="ul">
      <div className="ul-bg" style={{ backgroundImage: `url(${ACT_BG[0]})` }} />
      <div className="ul-shade" />
      <div className="ul-embers" aria-hidden>{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i % 7) * 0.9}s`, animationDuration: `${6 + (i % 5)}s` }} />)}</div>

      <div className="ul-frame">
        {/* top bar */}
        <nav className="ul-nav">
          <div className="ul-me">
            <span className="ul-lv">{prof?.level ?? 1}</span>
            <span><b>{me?.name ?? 'Hero'}</b><i><u style={{ width: `${prof ? Math.min(100, Math.round(((prof.xp - prof.level_floor) / Math.max(1, prof.level_next - prof.level_floor)) * 100)) : 0}%` }} /></i></span>
          </div>
          <div className="ul-tabs">
            <button type="button" className={panel === 'home' ? 'on' : ''} onClick={() => setPanel('home')}>PARTY</button>
            <button type="button" className={panel === 'heroes' ? 'on' : ''} onClick={() => setPanel('heroes')}>HEROES</button>
            <Link href="/skills">SKILLS</Link>
            <Link href="/stats">STATS</Link>
            <button type="button" onClick={() => void copy()}>{copied ? 'COPIED ✓' : 'INVITE'}</button>
          </div>
          <div className="ul-code"><small>CODE</small><b>{state.room.code}</b></div>
        </nav>

        {/* left: quests */}
        <aside className="ul-quests">
          <div className="ul-qh"><b>ACT ONE OBJECTIVES</b><span>5 ENCOUNTERS</span></div>
          {QUESTS.map((q) => (
            <div key={q.t} className="ul-q"><span>{q.t}</span><em>{q.n}</em><i><u /></i></div>
          ))}
        </aside>

        {/* center: hero */}
        <div className="ul-hero" style={{ ['--hc' as string]: info?.color ?? '#94a3b8' }}>
          <AnimatePresence mode="wait">
            <motion.div key={mine ?? 'none'} className="ul-fig" initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
              {mine
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={HERO_SPRITE[mine]} alt={mine} draggable={false} />
                : <button type="button" className="ul-nohero" onClick={() => setPanel('heroes')}>Choose your hero</button>}
            </motion.div>
          </AnimatePresence>
          {info && <div className="ul-hname"><small>{info.role}</small><b>{info.name}</b><span>{info.tagline}</span></div>}
        </div>

        {/* right: party */}
        <aside className="ul-partybox">
          {Array.from({ length: 3 }, (_, i) => {
            const p = others[i]; const h = p ? heroOf(p.id) : undefined; const hi = h ? heroById(h) : null;
            return p ? (
              <div key={p.id} className="ul-ally" style={{ ['--hc' as string]: hi?.color ?? '#64748b' }}>
                {h /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={HERO_SPRITE[h]} alt="" draggable={false} /> : <span>?</span>}
                <b>{p.name}</b><small>{hi?.name ?? 'Choosing…'}</small>
              </div>
            ) : (
              <button key={`e${i}`} type="button" className="ul-invite" onClick={() => void copy()}><span>+</span><small>INVITE TO PARTY</small></button>
            );
          })}
        </aside>

        {/* bottom */}
        <div className="ul-foot">
          <div className="ul-logo"><button type="button" onClick={onLeave}><kbd>Q</kbd> LEAVE</button><b>LETTERLOCK</b><small>Story · Act One</small></div>
          {isHost ? (
            <button type="button" className="ul-play" disabled={going} onClick={() => void begin()}>{going ? 'LOADING…' : 'BEGIN'}</button>
          ) : <div className="ul-play wait">WAITING FOR HOST</div>}
          <div className="ul-online">{state.players.length} / 4 IN PARTY <i /></div>
        </div>
      </div>

      {/* hero select overlay */}
      <AnimatePresence>
        {panel === 'heroes' && (
          <motion.div className="ul-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h2>SELECT HERO</h2>
            <div className="ul-modal-in">
              <HeroCards value={mine}
                taken={Object.fromEntries(picks.filter((x) => x.player_id !== me?.id).map((x) => [x.hero, state.players.find((p) => p.id === x.player_id)?.name ?? 'a player']))}
                onPick={(h) => { if (token) void act(() => rpc.setHero(token, h)); }} />
            </div>
            <div className="muted small center">{HEROES.length} heroes · unpicked heroes are assigned when the Story begins</div>
            <button type="button" className="ul-back" onClick={() => setPanel('home')}><kbd>ESC</kbd> BACK</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* loading screen */}
      <AnimatePresence>
        {going && (
          <motion.div className="ul-load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
            <div className="ul-load-bg" style={{ backgroundImage: `url(${ACT_BG[0]})` }} />
            <span className="ul-load-loc">The Outer Provinces · Act One</span>
            <div className="ul-load-tip"><b>TIP</b><p>{tip}</p><i><u /></i></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

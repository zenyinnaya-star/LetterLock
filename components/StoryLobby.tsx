'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { ACT_BG, HERO_SPRITE } from '@/lib/art';
import { heroById, type HeroId } from '@/lib/heroes';
import type { RoomState } from '@/lib/types';
import type { Act } from './phases';
import { HeroCards } from './HeroCards';
import { rpc } from '@/lib/rpc';

export function StoryLobby({ state, token, act, onLeave, picks, isHost }: {
  state: RoomState; token: string | null; act: Act; onLeave: () => void; picks: { player_id: string; hero: string }[]; isHost: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [going, setGoing] = useState(false);
  const me = state.me;
  const slots = 4;
  const heroOf = (pid: string) => picks.find((x) => x.player_id === pid)?.hero as HeroId | undefined;
  const mine = me ? heroOf(me.id) ?? null : null;
  const url = typeof window !== 'undefined' ? `${window.location.origin}/room/${state.room.code}` : '';

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }
  async function begin() {
    if (!token) return;
    setGoing(true);
    await new Promise((r) => setTimeout(r, 900));
    const r = await act(() => rpc.startPve(token));
    if (!r && r !== undefined) setGoing(false);
  }

  return (
    <div className="sl">
      <div className="sl-bg" style={{ backgroundImage: `url(${ACT_BG[0]})` }} />
      <div className="sl-shade" />
      <div className="sl-embers" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.8}s`, animationDuration: `${6 + (i % 5)}s` }} />)}</div>

      <div className="sl-in">
        <motion.header className="sl-title" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <small>CO-OP CAMPAIGN</small>
          <h1>THE STORY</h1>
          <span>Act One · The Outer Provinces</span>
        </motion.header>

        <div className="sl-code">
          <span>PARTY CODE</span>
          <b>{state.room.code}</b>
          <button type="button" onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Invite'}</button>
        </div>

        <div className="sl-party">
          {Array.from({ length: slots }, (_, i) => {
            const p = state.players[i];
            const h = p ? heroOf(p.id) : undefined;
            const info = h ? heroById(h) : null;
            return (
              <motion.div key={p?.id ?? `e${i}`} className={`sl-slot${p ? ' on' : ''}${p?.id === me?.id ? ' me' : ''}`}
                style={{ ['--hc' as string]: info?.color ?? '#64748b' }}
                initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 200, damping: 20 }}>
                {p ? (
                  <>
                    {h ? (
                      <motion.div className="sl-fig" animate={{ y: [0, -6, 0] }} transition={{ duration: 3 + i * 0.3, repeat: Infinity, ease: 'easeInOut' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={HERO_SPRITE[h]} alt={h} draggable={false} />
                      </motion.div>
                    ) : <div className="sl-fig q">?</div>}
                    <b>{p.name}{p.is_host ? ' ♛' : ''}</b>
                    <small>{info ? `${info.name} · ${info.role}` : 'Choosing a hero…'}</small>
                  </>
                ) : (
                  <><div className="sl-fig q">+</div><small>Empty slot · waiting for an ally</small></>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="sl-pick">
          <h3>Choose your hero</h3>
          <HeroCards value={mine}
            taken={Object.fromEntries(picks.filter((x) => x.player_id !== me?.id).map((x) => [x.hero, state.players.find((p) => p.id === x.player_id)?.name ?? 'a player']))}
            onPick={(h) => token && void act(() => rpc.setHero(token, h))} />
          <div className="muted small center">Unpicked heroes are assigned automatically when the Story begins.</div>
        </div>

        <div className="sl-actions">
          <Link href="/skills" className="sl-skill">✦ Skill Tree</Link>
          {isHost ? (
            <button type="button" className="sl-begin" disabled={going} onClick={() => void begin()}>
              ⚔ BEGIN ACT ONE <small>{state.players.length} {state.players.length === 1 ? 'hero' : 'heroes'} ready</small>
            </button>
          ) : <div className="sl-wait">Waiting for the host to begin the Story…</div>}
          {me && <button type="button" className="sl-leave" onClick={onLeave}>Leave</button>}
        </div>
      </div>

      <AnimatePresence>
        {going && <motion.div className="sl-flash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}><span>ENTERING ACT ONE…</span></motion.div>}
      </AnimatePresence>
    </div>
  );
}

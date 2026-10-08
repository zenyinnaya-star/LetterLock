'use client';

import { StoryNav } from '@/components/StoryNav';
import { useCallback, useEffect, useState } from 'react';
import { GLOSSARY, HEROES, STAT_INFO, heroById, type HeroId } from '@/lib/heroes';
import { fetchHeroProg, getStored, heroRespec, heroUpgrade, type HeroProg } from '@/lib/profile';

// Per-hero upgrades. Every node really changes the fight (applied when the Story begins).
const NODES: { id: string; name: string; per: string; max: number; icon: string; stat?: keyof typeof STAT_INFO }[] = [
  { id: 'vit', name: 'Vitality', per: '+6 max HP', max: 5, stat: 'VIT', icon: 'M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z' },
  { id: 'lex', name: 'Lexicon', per: '+4% word power', max: 5, stat: 'LEX', icon: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 7h7' },
  { id: 'foc', name: 'Focus', per: '+1% hit chance', max: 5, stat: 'FOC', icon: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
  { id: 'spd', name: 'Speed', per: 'Act earlier, +1.5% dodge', max: 5, stat: 'SPD', icon: 'M13 2L4 14h7l-1 8 9-12h-7z' },
  { id: 'wil', name: 'Willpower', per: '+4% resist Corruption', max: 5, stat: 'WIL', icon: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z' },
  { id: 'lck', name: 'Luck', per: '+1% crit chance', max: 5, stat: 'LUK', icon: 'M5 5h14v14H5zM9 9h.01M15 15h.01M12 12h.01M9 15h.01M15 9h.01' },
  { id: 'ult', name: 'Overflow', per: 'Start each run with +1 ultimate charge', max: 3, icon: 'M12 2l3 7 7 .6-5.4 4.7 1.7 7.2L12 17.7 5.7 21.5l1.7-7.2L2 9.6 9 9z' },
  { id: 'gold', name: 'Pocket Change', per: 'Start each run with +15 gold', max: 3, icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4' },
];
const nf = (n: number) => n.toLocaleString();

export default function Upgrades() {
  const [list, setList] = useState<HeroProg[] | null>(null);
  const [ready, setReady] = useState(false);
  const [hero, setHero] = useState<HeroId>('Shiro');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { const h = localStorage.getItem('letterlock:hero'); if (h && heroById(h)) setHero(h as HeroId); } catch { /* ignore */ }
    if (getStored()) void fetchHeroProg().then((x) => { setList(x); setReady(true); }); else setReady(true);
  }, []);

  const cur = list?.find((h) => h.hero === hero);
  const info = heroById(hero)!;
  const apply = useCallback(async (fn: () => Promise<HeroProg>) => {
    if (busy) return; setBusy(true); setMsg('');
    try { const e = await fn(); setList((l) => (l ?? []).map((h) => (h.hero === e.hero ? e : h))); }
    catch (e) { const m = (e as Error).message; setMsg(m.includes('NO_POINTS') ? 'No upgrade points. Earn XP with this hero to level up.' : m.includes('MAX_RANK') ? 'Already at max rank.' : 'Could not upgrade. Try again.'); }
    finally { setBusy(false); }
  }, [busy]);

  const pct = cur ? Math.min(100, Math.round(((cur.xp - cur.floor) / Math.max(1, cur.next - cur.floor)) * 100)) : 0;

  return (
    <main className="st-page up-page">
      <StoryNav active="skills" />
      <header className="st-top"><h1>UPGRADES</h1></header>
      <div className="st-in">
        <div className="st-pick">{HEROES.map((h) => (<button key={h.id} type="button" className={h.id === hero ? 'on' : ''} onClick={() => setHero(h.id)}>{h.name}{list?.find((x) => x.hero === h.id)?.points ? ' •' : ''}</button>))}</div>

        {!getStored() && ready && <p className="muted center" style={{ padding: 30 }}>Play a Story run with a profile to earn hero XP. Then come back to spend your upgrade points here.</p>}

        {cur && (
          <>
            <section className="st-hero" style={{ ['--hc' as string]: info.color }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={info.artFull} alt={info.name} draggable={false} />
              <div className="st-hero-r">
                <small>HERO LEVEL</small>
                <b>{info.name} · Lv {cur.level}</b>
                <span>{info.role}</span>
                <div className="xp-bar"><i style={{ width: `${cur.max ? 100 : pct}%` }} /></div>
                <small className="up-xp">{cur.max ? 'MAX LEVEL' : `${nf(cur.xp)} / ${nf(cur.next)} XP · ${nf(cur.next - cur.xp)} to level ${cur.level + 1}`}</small>
                <div className="up-pts"><b>{cur.points}</b><span>upgrade point{cur.points === 1 ? '' : 's'} to spend</span>
                  <button type="button" className="btn sm ghost" disabled={busy || Object.keys(cur.ups).length === 0} onClick={() => void apply(() => heroRespec(hero))}>Reset</button></div>
              </div>
            </section>
            {msg && <p className="up-msg">{msg}</p>}

            <section className="up-grid">
              {NODES.map((n) => {
                const r = cur.ups[n.id] ?? 0; const full = r >= n.max;
                return (
                  <div key={n.id} className={`up-card${r > 0 ? ' has' : ''}`} style={{ ['--hc' as string]: info.color }}>
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
                    <div className="up-t"><b>{n.name}</b><small>{n.per} per rank</small>
                      <div className="up-pips">{Array.from({ length: n.max }).map((_, i) => (<i key={i} className={i < r ? 'on' : ''} />))}</div></div>
                    <button type="button" className="btn sm" disabled={busy || cur.points < 1 || full} onClick={() => void apply(() => heroUpgrade(hero, n.id))}>{full ? 'MAX' : '+'}</button>
                  </div>
                );
              })}
            </section>
          </>
        )}

        <section className="up-info">
          <h3>What the stats mean</h3>
          <div className="up-stats">
            {(Object.keys(STAT_INFO) as (keyof typeof STAT_INFO)[]).map((k) => (
              <div key={k}><b>{k}</b><span><em>{STAT_INFO[k].name}</em> {STAT_INFO[k].what}{info.stats[k] ? ` ${info.name} starts at ${info.stats[k]}.` : ''}</span></div>
            ))}
          </div>
          <h3>Battle terms</h3>
          <div className="up-stats">{GLOSSARY.map((g) => (<div key={g.term}><b>{g.term}</b><span>{g.what}</span></div>))}</div>
        </section>
      </div>
    </main>
  );
}

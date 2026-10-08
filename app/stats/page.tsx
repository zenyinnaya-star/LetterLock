'use client';

import { StoryNav } from '@/components/StoryNav';
import { useEffect, useState } from 'react';
import { HEROES, STAT_INFO, heroById, type HeroId } from '@/lib/heroes';
import { fetchStoryStats, getStored, titleKey, type StoryStats } from '@/lib/profile';

const nf = (n: number) => n.toLocaleString();
const TITLE: Record<string, string> = { rookie: 'Rookie', wordsmith: 'Wordsmith', lockpicker: 'Lockpicker', vault: 'Vault Breaker', cipher: 'Cipher Master', grandmaster: 'Grandmaster' };

export default function StatsPage() {
  const [s, setS] = useState<StoryStats | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (getStored()) void fetchStoryStats().then((x) => { setS(x); setReady(true); }); else setReady(true); }, []);

  const [pick, setPick] = useState<HeroId | null>(null);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('hero') ?? localStorage.getItem('letterlock:hero');
      if (q && heroById(q)) setPick(q as HeroId);
    } catch { /* ignore */ }
  }, []);
  const hero = heroById(pick);
  const hs = s?.heroes.find((h) => h.hero === pick);
  const runs = s ? (hero ? s.recent.filter((r) => r.hero === hero.id) : s.recent) : [];

  const p = s?.profile;
  const pct = p ? Math.min(100, Math.round(((p.xp - p.level_floor) / Math.max(1, p.level_next - p.level_floor)) * 100)) : 0;
  const t = s?.totals;

  return (
    <main className="st-page">
      <StoryNav active="stats" />
      <header className="st-top"><h1>STATS</h1></header>
      {ready && !s && <p className="muted center" style={{ padding: 40 }}>No stats yet. Finish a Story run (or the stats migration is not applied) and they appear here.</p>}
      {p && t && (
        <div className="st-in">
          {hero && (
            <section className="st-hero" style={{ ['--hc' as string]: hero.color }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero.artFull} alt={hero.name} draggable={false} />
              <div className="st-hero-r">
                <small>YOUR HERO</small>
                <b>{hero.name}</b>
                <span>{hero.role}</span>
                <div className="st-bars">{Object.entries(hero.stats).map(([k, v]) => (<div key={k} title={`${STAT_INFO[k as keyof typeof STAT_INFO].name}: ${STAT_INFO[k as keyof typeof STAT_INFO].what}`}><em>{k}</em><u><i style={{ width: `${v * 12.5}%` }} /></u><b>{v}</b></div>))}</div>
                <p>{hero.signature}</p>
                <details className="st-what"><summary>What do these stats mean?</summary>{(Object.keys(STAT_INFO) as (keyof typeof STAT_INFO)[]).map((k) => (<p key={k}><b>{k}</b> {STAT_INFO[k].what}</p>))}</details>
                <div className="st-hero-c">
                  <div><b>{hs?.runs ?? 0}</b><span>Runs</span></div><div><b>{hs?.wins ?? 0}</b><span>Wins</span></div>
                  <div><b>{nf(hs?.dmg ?? 0)}</b><span>Damage</span></div><div><b>{nf(hs?.healed ?? 0)}</b><span>Healed</span></div>
                </div>
              </div>
            </section>
          )}
          <div className="st-pick">{HEROES.map((h) => (<button key={h.id} type="button" className={h.id === pick ? 'on' : ''} onClick={() => setPick(h.id === pick ? null : h.id)}>{h.name}</button>))}</div>

          <section className="st-lvl">
            <div className="st-badge">{p.level}</div>
            <div className="st-lvl-r">
              <b>{p.name}</b>
              <span>{TITLE[titleKey(p.level)]} · Level {p.level}</span>
              <div className="xp-bar"><i style={{ width: `${pct}%` }} /></div>
              <small>{nf(p.xp)} / {nf(p.level_next)} XP · {nf(p.level_next - p.xp)} to level {p.level + 1}</small>
            </div>
          </section>

          <section className="st-grid">
            {[['Runs', t.runs], ['Victories', t.wins], ['Best act clear', `${t.best_stage}/5`], ['Damage dealt', nf(t.dmg)], ['Healing', nf(t.healed)], ['Crits', nf(t.crits)],
              ['Ultimates', nf(t.ults)], ['Words cast', nf(t.words)], ['Book answers', nf(t.books)], ['Story XP', nf(t.xp)]].map(([k, v]) => (
              <div key={k as string}><b>{v}</b><span>{k}</span></div>
            ))}
          </section>

          {s.heroes.length > 0 && (
            <section>
              <h3>Heroes</h3>
              <div className="st-heroes">
                {s.heroes.map((h) => (
                  <div key={h.hero}><b>{h.hero}</b><span>{h.runs} runs · {h.wins} wins</span><small>{nf(h.dmg)} dmg · {nf(h.healed)} healed</small></div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3>{hero ? `${hero.name}'s recent runs` : 'Recent runs'}</h3>
            {runs.length === 0 && <p className="muted">No runs yet.</p>}
            {runs.map((r, i) => (
              <div key={i} className={`st-run${r.won ? ' win' : ''}`}>
                <div><b>{r.hero ?? '—'}</b><span>{r.won ? 'Victory' : `Fell in encounter ${r.stages_cleared + 1}`}</span></div>
                <div className="st-run-n">{nf(r.dmg)} dmg · {nf(r.healed)} heal · {r.crits} crits · {r.ults} ult · {r.books} book</div>
                <div className="st-run-x">+{r.xp} XP{r.lvl_after > r.lvl_before ? ` · LEVEL ${r.lvl_after}!` : ''}</div>
              </div>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}

'use client';

import { StoryNav } from '@/components/StoryNav';
import { useEffect, useState } from 'react';
import { fetchStoryStats, getStored, titleKey, type StoryStats } from '@/lib/profile';

const nf = (n: number) => n.toLocaleString();
const TITLE: Record<string, string> = { rookie: 'Rookie', wordsmith: 'Wordsmith', lockpicker: 'Lockpicker', vault: 'Vault Breaker', cipher: 'Cipher Master', grandmaster: 'Grandmaster' };

export default function StatsPage() {
  const [s, setS] = useState<StoryStats | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (getStored()) void fetchStoryStats().then((x) => { setS(x); setReady(true); }); else setReady(true); }, []);

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
            <h3>Recent runs</h3>
            {s.recent.length === 0 && <p className="muted">No runs yet.</p>}
            {s.recent.map((r, i) => (
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

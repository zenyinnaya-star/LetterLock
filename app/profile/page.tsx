'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LoadoutEditor } from '@/components/LoadoutEditor';
import { BackLink, Header } from '@/components/ui';
import { ClassIcon, Icon } from '@/components/icons';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { useT } from '@/lib/i18n/react';
import { CLASSES } from '@/lib/classes';
import { badgeLabel, nextTierXp, tierName, TIER_XP, type Mastery } from '@/lib/mastery';
import { equipBadge, fetchMastery, fetchProfile, getStored, restoreProfile, titleKey, type ProfileInfo } from '@/lib/profile';

export default function ProfilePage() {
  const t = useT();
  const [p, setP] = useState<ProfileInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [m, setM] = useState<Mastery | null>(null);

  const load = () => { void fetchProfile().then((x) => { setP(x); setReady(true); }); void fetchMastery().then(setM); };
  useEffect(() => { if (getStored()) load(); else setReady(true); }, []);

  async function restore() {
    const ok = await restoreProfile(code);
    setMsg({ ok, text: ok ? t('pf.restore_ok') : t('pf.restore_bad') });
    if (ok) { setCode(''); load(); }
  }
  const restoreBox = (
    <>
      <span className="label">{t('pf.restore')}</span>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <input className="input" value={code} placeholder={t('pf.restore_ph')} onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) void restore(); }} aria-label={t('pf.restore_ph')} style={{ flex: 1, minWidth: 0 }} />
        <button className="btn ghost" disabled={!code.trim()} onClick={() => void restore()}>{t('pf.restore_btn')}</button>
      </div>
      {msg && <div className={`note ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
    </>
  );
  const pct = p ? Math.min(100, Math.round(((p.xp - p.level_floor) / Math.max(1, p.level_next - p.level_floor)) * 100)) : 0;
  const earned = new Set(p?.achievements ?? []);

  return (
    <>
    <div className="pf-bg" aria-hidden="true" />
    <main className="shell pf-shell">
      <Header />
      <BackLink />
      <div className="sheet profile-page pf2">
        <h1 className="stage-title">{t('pf.prof')}</h1>
        {ready && !p && <p className="muted center">{t('pf.empty')}</p>}
        {p && (
          <>
            <section className="pf-hero">
              <div className="pf-ring" style={{ ['--pct' as string]: `${pct * 3.6}deg` }} role="img" aria-label={t('pf.level', { n: p.level })}>
                <div><b>{p.level}</b><span>LEVEL</span></div>
              </div>
              <div className="pf-who">
                <b className="pp-name">{p.name}</b>
                <div className="pf-pills">
                  <span className="pf-pill">{t(`ttl.${titleKey(p.level)}` as never)}</span>
                  {m?.classes[0] && <span className="pf-pill bad">{CLASSES[m.classes[0].class].name} · Tier {m.classes[0].tier}</span>}
                  {m?.badge && <span className="pf-pill bad">{badgeLabel(m.badge)}</span>}
                </div>
                <div className="xp-bar"><i style={{ width: `${pct}%` }} /></div>
                <div className="muted small">{t('pf.xp', { a: p.xp, b: p.level_next })}</div>
              </div>
            </section>

            <div className="pf-stats">
              <div><Icon name="cards" size={26} /><span className="pf-sv"><b>{p.games}</b><span>{t('pf.games')}</span></span></div>
              <div><Icon name="trophy" size={26} /><span className="pf-sv"><b>{p.wins}</b><span>{t('pf.wins')}</span></span></div>
              <div><Icon name="check" size={26} /><span className="pf-sv"><b>{p.valid_answers}</b><span>{t('pf.answers')}</span></span></div>
              <div><Icon name="bolt" size={26} /><span className="pf-sv"><b>{p.best_streak}</b><span>{t('pf.streak')}</span></span></div>
              <div><Icon name="clock" size={26} /><span className="pf-sv"><b>{p.fastest_ms == null ? '—' : `${(p.fastest_ms / 1000).toFixed(1)}s`}</b><span>{t('pf.fastest')}</span></span></div>
            </div>

            <div className="pf-cols">
              <div className="pf-col">
                <LoadoutEditor />
                {m && (
                  <>
                    <section className="pf-card">
                      <span className="label pf-h"><Icon name="crown" size={20} /> Your best</span>
                      <div className="pf-best">
                        <div><span>Favorite class</span><b>{m.classes[0] ? CLASSES[m.classes[0].class].name : '—'}</b></div>
                        <div><span>Top mode</span><b>{Object.entries(m.modes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'}</b></div>
                        <div><span>Longest word</span><b className="mono">{m.longest_word ? m.longest_word.toUpperCase() : '—'}</b></div>
                        <div><span>Win streak</span><b>{m.win_streak} <i>(best {m.best_win_streak})</i></b></div>
                      </div>
                    </section>
                    <section className="pf-card">
                      <span className="label pf-h"><Icon name="target" size={20} /> Class mastery</span>
                      <div className="mastery-list">
                        {m.classes.length === 0 && <span className="muted small">Finish a game to start ranking up a class.</span>}
                        {m.classes.map((c) => {
                          const nx = nextTierXp(c.xp);
                          const worn = m.badge === `${c.class}:${c.tier}`;
                          const prev = TIER_XP[c.tier - 1] ?? 0;
                          const cp = nx ? Math.min(100, Math.round(((c.xp - prev) / Math.max(1, nx - prev)) * 100)) : 100;
                          return (
                            <div key={c.class} className="mastery-row pf-m">
                              <span className="pf-m-ico"><ClassIcon cls={c.class} size={28} /></span>
                              <span className="pf-m-main">
                                <span className="pf-m-top"><b>{CLASSES[c.class].name}</b><span className="muted small">{tierName(c.class, c.tier)} · LVL {c.tier}</span></span>
                                <span className="xp-bar"><i style={{ width: `${cp}%` }} /></span>
                                <span className="muted small">{c.xp}{nx ? ` / ${nx}` : ' · max'} XP · {c.games} games · {c.wins} wins</span>
                              </span>
                              {c.tier >= 2 && (
                                <button className={`btn sm ${worn ? '' : 'ghost'}`} onClick={() => void equipBadge(worn ? null : `${c.class}:${c.tier}`).then(() => fetchMastery().then(setM))}>
                                  {worn ? 'Wearing' : 'Wear badge'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {m.badge && (
                        <div className="pf-wear">
                          <span className="pf-hex big"><Icon name="shield" size={30} /></span>
                          <span><span className="muted small">Wearing</span><br /><b>{badgeLabel(m.badge)}</b></span>
                          <button className="btn sm ghost" onClick={() => void equipBadge(null).then(() => fetchMastery().then(setM))}>Remove</button>
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
              <div className="pf-col">
                <section className="pf-card">
                  <span className="label pf-h"><Icon name="trophy" size={20} /> {t('pf.ach')} <em>{earned.size}/{ACHIEVEMENTS.length}</em></span>
                  <div className="ach-grid pf-ach">
                    {ACHIEVEMENTS.map((a) => (
                      <div key={a.id} className={`ach pf-a${earned.has(a.id) ? ' on' : ''}`}>
                        <span className="ach-ico pf-hex"><Icon name={earned.has(a.id) ? a.icon : 'lock'} size={22} /></span>
                        <b>{t(`ach.${a.id}` as never)}</b>
                        <span className="muted small">{t(`ach.${a.id}_d` as never)}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="pf-card">
                  <span className="label pf-h"><Icon name="lock" size={20} /> {t('pf.code')}</span>
                  <div className="code-box">
                    <code>{p.code}</code>
                    <button className="btn sm ghost" onClick={() => { void navigator.clipboard?.writeText(p.code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }}>
                      {copied ? t('pf.copied') : t('pf.copy')}
                    </button>
                  </div>
                  <span className="muted small">{t('pf.code_hint')}</span>
                  {restoreBox}
                </section>
              </div>
            </div>
          </>
        )}
        {!p && restoreBox}
        <Link className="btn ghost block" href="/">{t('pf.back')}</Link>
      </div>
    </main>
    </>
  );
}

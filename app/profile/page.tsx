'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header } from '@/components/ui';
import { Icon } from '@/components/icons';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { useT } from '@/lib/i18n/react';
import { fetchProfile, getStored, restoreProfile, titleKey, type ProfileInfo } from '@/lib/profile';

export default function ProfilePage() {
  const t = useT();
  const [p, setP] = useState<ProfileInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => { void fetchProfile().then((x) => { setP(x); setReady(true); }); };
  useEffect(() => { if (getStored()) load(); else setReady(true); }, []);

  async function restore() {
    const ok = await restoreProfile(code);
    setMsg({ ok, text: ok ? t('pf.restore_ok') : t('pf.restore_bad') });
    if (ok) { setCode(''); load(); }
  }
  const pct = p ? Math.min(100, Math.round(((p.xp - p.level_floor) / Math.max(1, p.level_next - p.level_floor)) * 100)) : 0;
  const earned = new Set(p?.achievements ?? []);

  return (
    <main className="shell narrow">
      <Header />
      <div className="sheet profile-page">
        <h1 className="stage-title">{t('pf.prof')}</h1>
        {ready && !p && <p className="muted center">{t('pf.empty')}</p>}
        {p && (
          <>
            <div className="pp-head">
              <div className="pp-level">{p.level}</div>
              <div>
                <b className="pp-name">{p.name}</b>
                <div className="muted">{t(`ttl.${titleKey(p.level)}` as never)} · {t('pf.level', { n: p.level })}</div>
              </div>
            </div>
            <div className="xp-bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="muted small center">{t('pf.xp', { a: p.xp, b: p.level_next })}</div>
            <div className="pp-grid">
              <div><b>{p.games}</b><span>{t('pf.games')}</span></div>
              <div><b>{p.wins}</b><span>{t('pf.wins')}</span></div>
              <div><b>{p.valid_answers}</b><span>{t('pf.answers')}</span></div>
              <div><b>{p.best_streak}</b><span>{t('pf.streak')}</span></div>
              <div><b>{p.fastest_ms == null ? '—' : `${(p.fastest_ms / 1000).toFixed(1)}s`}</b><span>{t('pf.fastest')}</span></div>
            </div>
            <span className="label">{t('pf.ach')} · {earned.size}/{ACHIEVEMENTS.length}</span>
            <div className="ach-grid">
              {ACHIEVEMENTS.map((a) => (
                <div key={a.id} className={`ach${earned.has(a.id) ? ' on' : ''}`}>
                  <span className="ach-ico"><Icon name={a.icon} size={20} /></span>
                  <span><b>{t(`ach.${a.id}` as never)}</b><br /><span className="muted small">{t(`ach.${a.id}_d` as never)}</span></span>
                </div>
              ))}
            </div>
            <span className="label">{t('pf.code')}</span>
            <div className="code-box">
              <code>{p.code}</code>
              <button className="btn sm ghost" onClick={() => { void navigator.clipboard?.writeText(p.code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }}>
                {copied ? t('pf.copied') : t('pf.copy')}
              </button>
            </div>
            <span className="muted small">{t('pf.code_hint')}</span>
          </>
        )}
        <span className="label">{t('pf.restore')}</span>
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <input className="input" value={code} placeholder={t('pf.restore_ph')} onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) void restore(); }} aria-label={t('pf.restore_ph')} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn ghost" disabled={!code.trim()} onClick={() => void restore()}>{t('pf.restore_btn')}</button>
        </div>
        {msg && <div className={`note ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
        <Link className="btn ghost block" href="/">{t('pf.back')}</Link>
      </div>
    </main>
  );
}

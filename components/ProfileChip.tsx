'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/react';
import { fetchProfile, getStored, type ProfileInfo } from '@/lib/profile';

/** Small level badge in the top bar; hidden until the player has a profile (it appears after their first game). */
export function ProfileChip() {
  const t = useT();
  const [p, setP] = useState<ProfileInfo | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => { if (getStored()) void fetchProfile().then((x) => { if (alive) setP(x); }); else setP(null); };
    load();
    window.addEventListener('letterlock:profile', load);
    return () => { alive = false; window.removeEventListener('letterlock:profile', load); };
  }, []);
  if (!p) return null;
  const pct = Math.min(100, Math.round(((p.xp - p.level_floor) / Math.max(1, p.level_next - p.level_floor)) * 100));
  return (
    <Link href="/profile" className="profile-chip" title={t('pf.prof')} aria-label={`${t('pf.prof')}: ${t('pf.level', { n: p.level })}`}>
      <b>{p.level}</b>
      <span className="pc-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
    </Link>
  );
}

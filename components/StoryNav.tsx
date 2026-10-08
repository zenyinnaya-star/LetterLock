'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Story hub navigation: Skills and Stats keep a `from` link so you always return to the room you left.
export function useFrom() {
  const [from, setFrom] = useState<string | null>(null);
  useEffect(() => {
    try {
      const f = new URLSearchParams(window.location.search).get('from');
      setFrom(f && f.startsWith('/') ? f : null);
    } catch { /* ignore */ }
  }, []);
  return from;
}
export const hubHref = (path: '/skills' | '/stats', from: string | null) => (from ? `${path}?from=${encodeURIComponent(from)}` : path);

export function StoryNav({ active }: { active: 'skills' | 'stats' }) {
  const from = useFrom();
  return (
    <nav className="sn">
      <Link href={from ?? '/play'} className="sn-back">← {from ? 'Back to the Story' : 'Menu'}</Link>
      <div className="sn-tabs">
        {from && <Link href={from}>Party</Link>}
        <Link href={hubHref('/skills', from)} className={active === 'skills' ? 'on' : ''}>Upgrades</Link>
        <Link href={hubHref('/stats', from)} className={active === 'stats' ? 'on' : ''}>Stats</Link>
      </div>
    </nav>
  );
}

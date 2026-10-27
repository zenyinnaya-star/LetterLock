'use client';

import Link from 'next/link';
import '@/app/comic.css';

/** Full-page stand-in for modes that are locked while Classic is the only playable mode. */
export function ComingSoon({ name = 'This mode' }: { name?: string }) {
  return (
    <main className="cp cp-pick">
      <div className="cp-sky" aria-hidden />
      <div className="cp-tear short" aria-hidden />
      <div className="cp-pw" style={{ textAlign: 'center', display: 'grid', gap: 18, justifyItems: 'center', paddingTop: '14vh' }}>
        <h1 className="cp-title cp-xt">Coming soon</h1>
        <p className="cp-info" style={{ maxWidth: 440, color: "#111", fontSize: 20 }}><b>{name}</b> is locked while we polish Classic. Break the vault in Classic for now.</p>
        <Link href="/play" className="cp-create"><span>Play Classic</span></Link>
      </div>
    </main>
  );
}

'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/** Last-resort boundary: a render crash shows a recover button instead of a blank page. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const room = window.location.pathname.match(/\/room\/([A-Za-z0-9]{4})/)?.[1] ?? null;
    void supabase().rpc('log_client_error', {
      p_room: room, p_message: `boundary: ${error.message}`, p_stack: error.stack ?? null, p_url: window.location.href, p_ua: navigator.userAgent,
    }).then(() => undefined, () => undefined);
  }, [error]);
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ maxWidth: 380 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, margin: '0 0 8px' }}>Something glitched</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>Your game is safe — the room keeps running. Tap below to jump back in.</p>
        <button className="btn lg" onClick={() => reset()}>Reconnect</button>
        <div style={{ marginTop: 12 }}><a className="textbtn" href="/">Home</a></div>
      </div>
    </main>
  );
}

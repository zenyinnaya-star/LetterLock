'use client';

import { useEffect, useState } from 'react';
import { bootLang } from '@/lib/i18n';
import { music } from '@/lib/music';

/** Applies the player's saved language and starts the site theme on any page, unless a game screen already picked a track. */
export function ThemeMusic() {
  const [dbg, setDbg] = useState<string | null>(null);
  useEffect(() => { bootLang(); }, []);
  useEffect(() => {
    if (music.current() === 'none') music.play('theme');
  }, []);
  // add ?musicdebug=1 to any page to see what the music player is doing (for phones where there is no console)
  useEffect(() => {
    let on = false;
    try { on = new URLSearchParams(window.location.search).has('musicdebug'); } catch { /* ignore */ }
    if (!on) return;
    const id = window.setInterval(() => setDbg(JSON.stringify(music.debug(), null, 1)), 700);
    return () => window.clearInterval(id);
  }, []);
  if (!dbg) return null;
  return <pre style={{ position: 'fixed', left: 4, right: 4, bottom: 4, zIndex: 99999, margin: 0, padding: 8, fontSize: 10, lineHeight: 1.25, background: 'rgba(0,0,0,.85)', color: '#8f8', borderRadius: 8, whiteSpace: 'pre-wrap', pointerEvents: 'none' }}>{dbg}</pre>;
}

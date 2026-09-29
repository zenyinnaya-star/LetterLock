'use client';

import { useEffect } from 'react';
import { bootLang } from '@/lib/i18n';
import { music } from '@/lib/music';

/** Applies the player's saved language and starts the site theme on any page, unless a game screen already picked a track. */
export function ThemeMusic() {
  useEffect(() => { bootLang(); }, []);
  useEffect(() => {
    if (music.current() === 'none') music.play('theme');
  }, []);
  return null;
}

'use client';

import { useEffect } from 'react';
import { music } from '@/lib/music';

/** Starts the site theme on any page, unless a game screen already picked a track. */
export function ThemeMusic() {
  useEffect(() => {
    if (music.current() === 'none') music.play('theme');
  }, []);
  return null;
}

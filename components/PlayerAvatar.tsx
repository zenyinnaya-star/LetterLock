'use client';

import { useState } from 'react';
import { avatarColors } from '@/lib/avatar';
import type { PlayerClass } from '@/lib/types';
import { ClassIcon } from './icons';

interface Who { name: string; avatar_url?: string | null; class?: PlayerClass | null }

/**
 * A player's face: their uploaded photo, or a generated placeholder (initial on a colour from their name).
 * `badge` adds a small class portrait in the corner — only pass it when the class is public.
 */
export function PlayerAvatar({ p, size = 36, badge = false, className }: { p: Who; size?: number; badge?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const radius = Math.max(8, size * 0.28);
  const [a, b] = avatarColors(p.name || '?');
  const initial = (p.name || '?').trim().charAt(0).toUpperCase();
  const photo = p.avatar_url && !broken;
  return (
    <span className={`pavatar${className ? ` ${className}` : ''}`} style={{ width: size, height: size }} aria-hidden>
      <span className="pavatar-face" style={{ borderRadius: radius, background: photo ? '#0e1128' : `linear-gradient(135deg, ${a}, ${b})` }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar_url!} alt="" width={size} height={size} onError={() => setBroken(true)} draggable={false} />
        ) : (
          <svg viewBox="0 0 40 40" width={size} height={size}>
            <circle cx="20" cy="16" r="7.5" fill="rgba(255,255,255,.28)" />
            <path d="M6 40c1.5-8 7-12.5 14-12.5S32.5 32 34 40z" fill="rgba(255,255,255,.28)" />
            <text x="20" y="21" textAnchor="middle" dominantBaseline="middle" fontFamily="Bungee, Impact, sans-serif"
              fontSize="17" fill="#fff" style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.25)', strokeWidth: 2 }}>{initial}</text>
          </svg>
        )}
      </span>
      {badge && p.class && size >= 28 && (
        <span className="pavatar-badge"><ClassIcon cls={p.class} size={Math.round(size * 0.42)} /></span>
      )}
    </span>
  );
}

'use client';
import { useMemo, type CSSProperties } from 'react';
import type { AnimationData } from '@/lib/combat/registry';

/**
 * Plays a sprite sheet described by { hframes, vframes, total_frames, duration } (same shape as JRPG Builder's
 * `animation_data`). Frames are read left-to-right, top-to-bottom. Pure CSS keyframes: no timers to leak.
 * loop={false} plays once and holds the last frame (attack/hit clips).
 */
export function SheetSprite({ url, data, loop = true, className, style }: { url: string; data: AnimationData; loop?: boolean; className?: string; style?: CSSProperties }) {
  const { hframes, vframes, total_frames, duration } = data;
  const name = useMemo(() => `sh${Math.abs([...`${url}${hframes}${vframes}${total_frames}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`, [url, hframes, vframes, total_frames]);
  const css = useMemo(() => {
    const pos = (i: number) => {
      const col = i % hframes, row = Math.floor(i / hframes);
      return `${hframes > 1 ? (col / (hframes - 1)) * 100 : 0}% ${vframes > 1 ? (row / (vframes - 1)) * 100 : 0}%`;
    };
    const steps = Array.from({ length: total_frames }, (_, i) => `${(i / total_frames) * 100}%{background-position:${pos(i)}}`).join('');
    return `@keyframes ${name}{${steps}100%{background-position:${pos(total_frames - 1)}}}`;
  }, [name, hframes, vframes, total_frames]);
  return (
    <>
      <style>{css}</style>
      <span className={className} aria-hidden
        style={{
          display: 'block', width: '100%', aspectRatio: '1 / 1', backgroundImage: `url(${url})`, imageRendering: 'pixelated',
          backgroundSize: `${hframes * 100}% ${vframes * 100}%`, backgroundRepeat: 'no-repeat',
          animation: `${name} ${duration}s steps(1, end) ${loop ? 'infinite' : '1 forwards'}`,
          ...style,
        }} />
    </>
  );
}

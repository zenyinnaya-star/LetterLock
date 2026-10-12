'use client';
import { useMemo, type CSSProperties } from 'react';
import type { AnimationData } from '@/lib/combat/registry';

/**
 * Plays a sprite sheet described by { hframes, vframes, total_frames, duration } (same shape as JRPG Builder's
 * `animation_data`). Frames are read left-to-right, top-to-bottom. Pure CSS keyframes: no timers to leak.
 * loop={false} plays once and holds the last frame (attack/hit clips).
 */
export function SheetSprite({ url, data, loop = true, className, style }: { url: string; data: AnimationData; loop?: boolean; className?: string; style?: CSSProperties }) {
  const { hframes, vframes, duration } = data;
  const seq = data.order ?? Array.from({ length: data.total_frames }, (_, i) => i);
  const total_frames = seq.length;
  const name = useMemo(() => `sh${Math.abs([...`${url}${hframes}${vframes}${seq.join('.')}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`, [url, hframes, vframes, seq.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const css = useMemo(() => {
    const pos = (i: number) => {
      const col = i % hframes, row = Math.floor(i / hframes);
      return `${hframes > 1 ? (col / (hframes - 1)) * 100 : 0}% ${vframes > 1 ? (row / (vframes - 1)) * 100 : 0}%`;
    };
    const steps = seq.map((f, i) => `${(i / total_frames) * 100}%{background-position:${pos(f)}}`).join('');
    return `@keyframes ${name}{${steps}100%{background-position:${pos(seq[total_frames - 1])}}}`;
  }, [name, hframes, vframes, seq.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
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

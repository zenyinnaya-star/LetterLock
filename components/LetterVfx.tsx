'use client';
import { useMemo } from 'react';
import type { LetterFx } from './useCombatDirector';

// Letters are LETTERLOCK's particles: the typed word itself becomes the effect.
export function LetterVfx({ fx, w, h }: { fx: LetterFx; w: number; h: number }) {
  const parts = useMemo(() => {
    const L = fx.word.replace(/[^A-Z]/g, '').slice(0, 10).split('');
    const dx = ((fx.to.x - fx.from.x) / 100) * w, dy = ((fx.to.y - fx.from.y) / 100) * h;
    const n = L.length; const rnd = (a: number) => (Math.random() * 2 - 1) * a;
    return L.map((ch, i) => {
      const ang = (i / n) * Math.PI * 2, R = Math.min(w, h) * 0.12;
      let p: { x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; d: number; dl: number };
      switch (fx.kind) {
        case 'orbit': p = { x0: Math.cos(ang) * R, y0: Math.sin(ang) * R - 30, x1: -Math.sin(ang) * R, y1: Math.cos(ang) * R - 30, x2: dx, y2: dy, d: 1000, dl: i * 40 }; break;
        case 'streak': p = { x0: (i - n / 2) * 18, y0: -40 + rnd(10), x1: dx * 0.5, y1: dy * 0.5 - 10, x2: dx, y2: dy, d: 520, dl: i * 35 }; break;
        case 'fill': p = { x0: Math.cos(ang) * R * 1.2, y0: Math.sin(ang) * R * 1.2 - 30, x1: rnd(w * 0.4) + dx * 0.3, y1: rnd(h * 0.4), x2: dx + rnd(w * 0.25), y2: dy + rnd(h * 0.25), d: 1700, dl: i * 90 }; break;
        case 'shatter': p = { x0: rnd(10), y0: rnd(10), x1: rnd(w * 0.12), y1: rnd(h * 0.12) - 20, x2: rnd(w * 0.3), y2: rnd(h * 0.3) + 30, d: 900, dl: i * 25 }; break;
        default: p = { x0: (i - n / 2) * 20, y0: -50, x1: (i - n / 2) * 20, y1: -80, x2: dx * 0.9, y2: dy * 0.9, d: 760, dl: i * 45 };
      }
      return { ch, ...p, sz: fx.kind === 'fill' ? 44 + (i % 3) * 14 : fx.kind === 'shatter' ? 34 : 26, rot: rnd(260) };
    });
  }, [fx.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`lv lv-${fx.kind}`} aria-hidden>
      {parts.map((p, i) => (
        <span key={`${fx.key}-${i}`} className="lv-l" style={{
          left: `${fx.from.x}%`, top: `${fx.from.y}%`, fontSize: p.sz,
          ['--x0' as string]: `${p.x0}px`, ['--y0' as string]: `${p.y0}px`, ['--x1' as string]: `${p.x1}px`, ['--y1' as string]: `${p.y1}px`,
          ['--x2' as string]: `${p.x2}px`, ['--y2' as string]: `${p.y2}px`, ['--rot' as string]: `${p.rot}deg`,
          animationDuration: `${p.d}ms`, animationDelay: `${p.dl}ms`,
        }}>{p.ch}</span>
      ))}
    </div>
  );
}

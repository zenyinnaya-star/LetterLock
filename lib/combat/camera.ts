// CameraDirector: transforms the battlefield layer (Web Animations API, eased, never linear).
// It knows nothing about combat rules; it only reacts to presets. Honours reduced motion.
import type { CameraPreset } from './registry';

type Pt = { x: number; y: number }; // percent of stage
type Ctx = { from?: Pt; to?: Pt; dir?: 1 | -1 };
type KF = { t: number; x: number; y: number; s: number; r: number };
const EASE = 'cubic-bezier(.22,.9,.28,1)';

export class CameraDirector {
  private el: HTMLElement | null = null;
  private anim: Animation | null = null;
  reduced = false;
  style = { amp: 1, speed: 1 }; // per-character camera personality
  attach(el: HTMLElement | null) {
    this.el = el;
    try { this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  }
  private run(frames: KF[], ms: number, damp = 1) {
    if (!this.el) return;
    this.anim?.cancel();
    const k = this.reduced ? 0 : damp * this.style.amp; ms = ms / this.style.speed; // reduced motion: no camera travel at all
    if (k === 0) return;
    this.anim = this.el.animate(
      frames.map((f) => ({ offset: f.t, transform: `translate(${f.x * k}%, ${f.y * k}%) scale(${1 + (f.s - 1) * k}) rotate(${f.r * k}deg)`, easing: EASE })),
      { duration: ms, fill: 'none' },
    );
  }
  /** Impact shake layered on top as small, decaying offsets. */
  private shake(amp: number, ms: number) {
    if (!this.el || this.reduced) return;
    const n = 9; const fr = [] as Keyframe[];
    for (let i = 0; i <= n; i++) { const d = (1 - i / n) * amp; fr.push({ offset: i / n, translate: i === n ? '0 0' : `${(Math.random() * 2 - 1) * d}px ${(Math.random() * 2 - 1) * d}px` }); }
    this.el.animate(fr, { duration: ms, easing: 'linear' });
  }
  play(p: CameraPreset, c: Ctx = {}) {
    const dir = c.dir ?? 1;
    const dx = c.from && c.to ? Math.max(-1, Math.min(1, (c.to.x - c.from.x) / 40)) : dir;
    const fx = c.from ? (50 - c.from.x) / 100 : 0; // lean toward the attacker
    const tx = c.to ? (50 - c.to.x) / 100 : 0;
    switch (p) {
      case 'ATTACK_SWING': // push toward attacker, swing along the blow, tiny recoil, ease home
        return this.run([{ t: 0, x: 0, y: 0, s: 1, r: 0 }, { t: .22, x: fx * 2.5, y: 0, s: 1.04, r: 0 }, { t: .5, x: -dx * 2.2, y: -.4, s: 1.06, r: dx * .4 }, { t: .62, x: -dx * 1.4, y: 0, s: 1.05, r: 0 }, { t: 1, x: 0, y: 0, s: 1, r: 0 }], 700);
      case 'HEAVY_ATTACK':
        return this.run([{ t: 0, x: 0, y: 0, s: 1, r: 0 }, { t: .2, x: fx * 3, y: 0, s: 1.06, r: 0 }, { t: .5, x: -dx * 3.4, y: -.6, s: 1.09, r: dx * .8 }, { t: 1, x: 0, y: 0, s: 1, r: 0 }], 850);
      case 'CRITICAL':
        this.run([{ t: 0, x: 0, y: 0, s: 1, r: 0 }, { t: .14, x: fx * 4, y: 0, s: 1.1, r: 0 }, { t: .4, x: -dx * 5, y: -1, s: 1.14, r: dx * 1.4 }, { t: .52, x: -dx * 4.4, y: -.8, s: 1.13, r: dx * 1.2 }, { t: 1, x: 0, y: 0, s: 1, r: 0 }], 1100);
        return setTimeout(() => this.shake(14, 380), 330);
      case 'BREAK':
        this.run([{ t: 0, x: 0, y: 0, s: 1, r: 0 }, { t: .25, x: tx * 4, y: 1, s: 1.16, r: 0 }, { t: .7, x: tx * 3, y: .6, s: 1.12, r: -dx * .8 }, { t: 1, x: 0, y: 0, s: 1, r: 0 }], 1300);
        return setTimeout(() => this.shake(18, 480), 260);
      case 'ULTIMATE_INTRO': // pull away, swing round the caster, hold
        return this.run([{ t: 0, x: 0, y: 0, s: 1, r: 0 }, { t: .35, x: 0, y: 0, s: .94, r: 0 }, { t: .75, x: fx * 6, y: -1.5, s: 1.14, r: -dx * 1.5 }, { t: 1, x: fx * 6, y: -1.5, s: 1.14, r: -dx * 1.5 }], 1100);
      case 'ULTIMATE_ATTACK': // whip across to the enemy, impact, settle
        this.run([{ t: 0, x: fx * 6, y: -1.5, s: 1.14, r: -dx * 1.5 }, { t: .3, x: tx * 5, y: 0, s: 1.1, r: dx * 1 }, { t: .45, x: tx * 5.5, y: 0, s: 1.18, r: dx * 1.2 }, { t: 1, x: 0, y: 0, s: 1, r: 0 }], 1500);
        return setTimeout(() => this.shake(20, 520), 460);
      case 'FOCUS_ENEMY':
        return this.run([{ t: 0, x: 0, y: 0, s: 1, r: 0 }, { t: .4, x: tx * 3, y: 0, s: 1.06, r: 0 }, { t: 1, x: 0, y: 0, s: 1, r: 0 }], 800);
      case 'VICTORY':
        return this.run([{ t: 0, x: 0, y: 0, s: 1, r: 0 }, { t: 1, x: 0, y: 1.2, s: 1.08, r: 0 }], 1800);
      default: return;
    }
  }
  /** Boss/elite intro: slow environmental pan, then push in on the enemy, then settle. */
  intro(kind: 'normal' | 'elite' | 'boss') {
    if (kind === 'normal') return this.run([{ t: 0, x: 3, y: 0, s: 1.08, r: 0 }, { t: 1, x: 0, y: 0, s: 1, r: 0 }], 1400);
    if (kind === 'elite') return this.run([{ t: 0, x: -2, y: 0, s: 1.04, r: 0 }, { t: .5, x: 3, y: -1, s: 1.16, r: 0 }, { t: 1, x: 0, y: 0, s: 1, r: 0 }], 2200);
    return this.run([{ t: 0, x: -4, y: 1, s: 1.12, r: 0 }, { t: .35, x: 4, y: 0, s: 1.1, r: 0 }, { t: .75, x: 3, y: -1.5, s: 1.22, r: 0 }, { t: 1, x: 0, y: 0, s: 1, r: 0 }], 3600);
  }
}

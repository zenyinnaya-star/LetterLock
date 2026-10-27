// Tiny comic VFX helpers: spark bursts, "POW!" pops, and a pink slash wipe between screens.
const COLORS = ['#ffd400', '#ff2e8a', '#ffffff', '#2e7bff'];
const GLYPHS = ['★', '✦', '✸', '⚡', '✺'];

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function burst(x: number, y: number, word?: string) {
  if (typeof document === 'undefined' || reduced()) return;
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('span');
    s.className = 'cp-sp';
    s.textContent = GLYPHS[i % GLYPHS.length];
    s.style.left = `${x}px`; s.style.top = `${y}px`; s.style.color = COLORS[i % COLORS.length];
    const a = (Math.PI * 2 * i) / 10, r = 50 + Math.random() * 50;
    s.style.setProperty('--dx', `${Math.cos(a) * r}px`); s.style.setProperty('--dy', `${Math.sin(a) * r}px`);
    document.body.appendChild(s);
    window.setTimeout(() => s.remove(), 750);
  }
  if (word) {
    const t = document.createElement('span');
    t.className = 'cp-powtxt'; t.textContent = word;
    t.style.left = `${x - 40}px`; t.style.top = `${y - 34}px`;
    document.body.appendChild(t);
    window.setTimeout(() => t.remove(), 750);
  }
}

/** Pink slash across the screen, then run `then` (e.g. a route change) while it covers the page. */
export function wipe(then: () => void) {
  if (typeof document === 'undefined' || reduced()) { then(); return; }
  const w = document.createElement('div');
  w.className = 'cp-wipe';
  document.body.appendChild(w);
  window.setTimeout(then, 380);
  window.setTimeout(() => w.remove(), 1400);
}

export function shake(el: HTMLElement | null) {
  if (!el || reduced()) return;
  el.classList.remove('cp-shake'); void el.offsetWidth; el.classList.add('cp-shake');
}

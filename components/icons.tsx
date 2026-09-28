import type { CardKind, PlayerClass } from '@/lib/types';

/* ───────────── UI line icons (24px grid, 2px stroke, currentColor) ───────────── */

export type IconName =
  | 'lock' | 'volume' | 'mute' | 'x' | 'check' | 'trophy' | 'bulb' | 'eye' | 'skull' | 'target'
  | 'crown' | 'bolt' | 'swords' | 'alert' | 'link' | 'miss' | 'burst' | 'shield' | 'sparkle' | 'horns';

const PATHS: Record<IconName, React.ReactNode> = {
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /><path d="M12 15.2v2" /></>),
  volume: (<><path d="M4 9.5h3.5L12.5 5v14l-5-4.5H4z" /><path d="M16 9.5a3.5 3.5 0 0 1 0 5" /><path d="M18.6 7a7.5 7.5 0 0 1 0 10" /></>),
  mute: (<><path d="M4 9.5h3.5L12.5 5v14l-5-4.5H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>),
  x: (<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />),
  check: (<path d="M5 12.5l4.5 4.5L19 7.5" />),
  trophy: (<><path d="M8 4h8v5.5a4 4 0 0 1-8 0z" /><path d="M8 6H5.5a2.5 2.5 0 0 0 2.6 4M16 6h2.5a2.5 2.5 0 0 1-2.6 4" /><path d="M12 13.5V17M8.5 20h7M10 17h4" /></>),
  bulb: (<><path d="M9.5 17.5h5M10.5 20.5h3" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.6v.6h5.6v-.6c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" /></>),
  eye: (<><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.8" /></>),
  skull: (<><path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4.1 3 5.1V18h8v-2.9c1.8-1 3-2.7 3-5.1a7 7 0 0 0-7-7z" /><circle cx="9.4" cy="10.6" r="1.4" fill="currentColor" stroke="none" /><circle cx="14.6" cy="10.6" r="1.4" fill="currentColor" stroke="none" /><path d="M10.5 18v3M13.5 18v3" /></>),
  target: (<><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>),
  crown: (<path d="M3.5 8.5l4.2 3.8L12 6l4.3 6.3 4.2-3.8-1.8 10H5.3z" />),
  bolt: (<path d="M13.5 2.5L5 13.5h6.2L10.5 21.5 19 10.5h-6.2z" />),
  swords: (<><path d="M4 4l10.5 10.5M20 4L9.5 14.5" /><path d="M7.5 13.5l3 3M16.5 13.5l-3 3" /><path d="M6 18l2.2-2.2M18 18l-2.2-2.2" /></>),
  alert: (<><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.2M12 17.2v.3" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1.2 1.2" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.2-1.2" /></>),
  miss: (<><circle cx="12" cy="12" r="8" strokeDasharray="2.6 2.9" /><path d="M9.2 9.2l5.6 5.6" /></>),
  burst: (<path d="M12 2.5l2 5 4.9-2.2-2 5L21.5 12l-4.6 1.7 2 5-4.9-2.2-2 5-2-5-4.9 2.2 2-5L2.5 12l4.6-1.7-2-5 4.9 2.2z" />),
  shield: (<><path d="M12 3l7.5 2.8V12c0 4.6-3.2 7.7-7.5 9-4.3-1.3-7.5-4.4-7.5-9V5.8z" /><path d="M8.7 12.2l2.3 2.3 4.3-4.6" /></>),
  sparkle: (<><path d="M11 3.5c.6 4.3 2.4 6.1 6.8 6.8-4.4.6-6.2 2.4-6.8 6.8-.6-4.4-2.4-6.2-6.8-6.8 4.4-.7 6.2-2.5 6.8-6.8z" /><path d="M18.5 15.5v5M16 18h5" /></>),
  horns: (<><path d="M7 9.5L5 3.5l5.2 3.8M17 9.5l2-6-5.2 3.8" /><circle cx="12" cy="13.5" r="6.5" /><path d="M9 12.3l2 .9M15 12.3l-2 .9M9.8 16.3c1.4 1 3 1 4.4 0" /></>),
};

export function Icon({ name, size = 18, className, title, strokeWidth = 2 }: {
  name: IconName; size?: number; className?: string; title?: string; strokeWidth?: number;
}) {
  return (
    <svg className={`ico${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

/* ───────────── Class badges (40px grid, gradient tile + white glyph) ───────────── */

export const CLASS_COLORS: Record<PlayerClass, [string, string]> = {
  ninja: ['#34d8f0', '#0b6f8a'],
  mastermind: ['#b69cff', '#5b2fd0'],
  hero: ['#ffd05a', '#d97a06'],
  villain: ['#ff7a90', '#b3123a'],
};

const INK = '#141733';

const GLYPHS: Record<PlayerClass, React.ReactNode> = {
  // masked head with headband tails
  ninja: (
    <>
      <path d="M30.5 16.5l5.5-3.2M30.5 19.5l5.8.8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="20" cy="21" r="11" fill="#fff" />
      <rect x="8.6" y="16" width="22.8" height="7.4" rx="3.7" fill={INK} />
      <path d="M13.2 19.8c1.4-1.3 3.4-1.3 4.8 0M22 19.8c1.4-1.3 3.4-1.3 4.8 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  // all-seeing eye with rays
  mastermind: (
    <>
      <path d="M20 7v3.2M11.5 9.8l1.7 2.6M28.5 9.8l-1.7 2.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6.5 22.5S11.5 14.5 20 14.5s13.5 8 13.5 8-5 8-13.5 8-13.5-8-13.5-8z" fill="#fff" />
      <circle cx="20" cy="22.5" r="5.4" fill={INK} />
      <circle cx="21.6" cy="20.9" r="1.7" fill="#fff" />
    </>
  ),
  // five-point star with speed marks
  hero: (
    <>
      <path d="M20 8.5l3.3 7.4 8 .8-6 5.4 1.7 7.9L20 26l-7 4 1.7-7.9-6-5.4 8-.8z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6.5 30.5l3-1.6M8 34.2l3.6-.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".8" />
    </>
  ),
  // horned head with a grin
  villain: (
    <>
      <path d="M11.8 15.5L8.5 6.5l7.6 5.3zM28.2 15.5l3.3-9-7.6 5.3z" fill="#fff" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="20" cy="22.5" r="10.5" fill="#fff" />
      <path d="M14.2 20.2l4 1.6M25.8 20.2l-4 1.6" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14.8 26.2c3.3 2.6 7.1 2.6 10.4 0" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
};

export function ClassIcon({ cls, size = 32, className }: { cls: PlayerClass; size?: number; className?: string }) {
  const [a, b] = CLASS_COLORS[cls];
  const id = `llg-${cls}`;
  return (
    <svg className={`class-ico${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill={`url(#${id})`} />
      <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5" />
      <g style={{ filter: 'drop-shadow(0 1.5px 0 rgba(0,0,0,.25))' }}>{GLYPHS[cls]}</g>
    </svg>
  );
}

/* ───────────── Card art ───────────── */

export const CARD_ICON: Record<CardKind, IconName> = { attack: 'burst', shield: 'shield', cleanse: 'sparkle' };

export function CardIcon({ kind, size = 40 }: { kind: CardKind; size?: number }) {
  return <Icon name={CARD_ICON[kind]} size={size} strokeWidth={1.8} className={`card-ico ${kind}`} />;
}

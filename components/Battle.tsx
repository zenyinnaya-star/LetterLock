'use client';

import { audio } from '@/lib/audio';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACT_BG, PIXEL_BG, ACT_NAME, BOOK_ART, ENEMY_SPRITE, HERO_SPRITE, HERO_BACK, HERO_WIN, HERO_STRIKE, HERO_CAST, ENEMY_STRIKE, ENEMY_PIXEL, HURT, actOf } from '@/lib/art';
import dynamic from 'next/dynamic';
import { Camp } from './Camp';
import { webglOk, type StageFx } from './Stage3D';
const Stage3D = dynamic(() => import('./Stage3D'), { ssr: false });
import { SheetSprite } from '@/components/SheetSprite';
import { heroById, HERO_PORTRAIT, type HeroId } from '@/lib/heroes';
import { fetchStoryResult, type StoryResult } from '@/lib/profile';
import { rpc, type BattleLogEntry, type BattleState, type BattleUnit } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import { useCombatDirector, breakMaxOf } from './useCombatDirector';
import { LetterVfx } from './LetterVfx';
import { actionFor, lungeTimes } from '@/lib/combat/actions';
import { BattleTutorial } from './BattleTutorial';
import { TopBar, CommandDeck, LeftParty, type WordUi, type Cmd, type Chip, type Entry, type PartyRow, type OrderItem } from './BattleHud';
import { preloadFor, SHEETS } from '@/lib/combat/registry';
import { useCountdown } from '@/hooks/useCountdown';
import type { Act } from './phases';

type ActionId = 'attack' | 'guard' | 'heal' | 'ult';
const ULT_NAME: Record<string, string> = { Shiro: 'Thousand Letters', Nero: 'Bastion Wall', Kira: 'All In', Mira: 'Bloom of Dawn', Prince: 'Crown Strike' };
const CARDS: Record<string, { label: string; glyph: string; rare?: boolean; hint: string }> = {
  sp_attack: { label: 'Special Attack', glyph: '⚔️', rare: true, hint: 'Big hit on one enemy' },
  sp_guard: { label: 'Special Guard', glyph: '🛡️', rare: true, hint: 'Shields the whole party' },
  sp_heal: { label: 'Special Heal', glyph: '💚', rare: true, hint: 'Big heal on one ally' },
  sweep: { label: 'Sweep', glyph: '🌀', hint: 'Hits all enemies' },
  heal_all: { label: 'Group Heal', glyph: '✨', hint: 'Heals the whole party' },
  cleanse: { label: 'Cleanse', glyph: '🧿', hint: 'Removes Corruption' },
  mega_sweep: { label: 'Mega Sweep', glyph: '☄️', rare: true, hint: 'Huge damage to all enemies' },
  full_heal: { label: 'Full Restore', glyph: '💖', rare: true, hint: 'Fully heals the party' },
  revive: { label: 'Revive', glyph: '🕊️', rare: true, hint: 'Raises a fallen hero' },
  overcharge: { label: 'Overcharge', glyph: '⚡', rare: true, hint: 'Fills your ultimate' },
};
const ITEM_CARDS = ['sp_heal', 'heal_all', 'full_heal', 'revive', 'cleanse', 'overcharge'];
const INTENT: Record<string, string> = {
  strike: 'Government strikes', red_tape: 'Red Tape: 4 letters locked', taxes: 'Taxes: applies Corruption', tax_season: 'TAX SEASON: huge party hit. Guard!',
};

function logLine(e: BattleLogEntry) {
  switch (e.t) {
    case 'odds': return `${e.a} calls the team's ODDS!`;
    case 'brk': return e.x === true ? `BREAK! ${e.d} is stunned and will lose its next move!` : `${e.d} Break ${e.n}/${e.mx}`;
    case 'stunned': return `${e.a} is stunned and can't act!`;
    case 'limit': return `LIMIT BREAK! ${e.a} leads the team for ${e.n} to everyone!`;
    case 'crit': if (e.sp) return `${e.a} uses ${e.sp} on ${e.d} for ${e.n}!`; return `${e.a} CRITS ${e.d} for ${e.n}${e.w ? ` (${e.w})` : ''}!`;
    case 'sweep': return `${e.a} plays Sweep: ${e.n} to every enemy!`;
    case 'mega_sweep': return `${e.a} plays Mega Sweep: ${e.n} to every enemy!`;
    case 'group_heal': return `${e.a} plays Group Heal: +${e.n} to everyone`;
    case 'full_heal': return `${e.a} plays Full Restore!`;
    case 'revive': return `${e.a} raises ${e.d ?? 'an ally'}!`;
    case 'overcharge': return `${e.a} overcharges!`;
    case 'ult': return `${e.a} unleashes their ULTIMATE${e.n ? ` (${e.n})` : ''}!`;
    case 'book': return `${e.a} reads the Book of Wisdom`;
    case 'cleanse': return `${e.a} plays Cleanse`;
    case 'season': return `${e.a} unleashes Tax Season on the whole party!`;
    case 'corrupt': return `${e.d} is Corrupted`;
    case 'resist': return `${e.d} resists Corruption`;
    case 'stage': return `Encounter ${e.n}`;
    case 'camp': return `Encounter ${e.n} cleared`;
    case 'e_aoe': return `${e.a} strikes the whole party for ${e.n}!`;
    case 'e_buff': return `${e.a} rallies the enemies (+2 attack)`;
    case 'e_debuff': return `${e.a} weakens ${e.d} (-25% Power)`;
    case 'e_heal': return `${e.a} mends ${e.d} +${e.n}`;
    case 'hit': return `${e.a} hits ${e.d} for ${e.n}${e.w ? ` (${e.w})` : ''}`;
    case 'miss': return `${e.a} misses ${e.d}`;
    case 'dodge': return `${e.d} dodges ${e.a}`;
    case 'guard': if (e.sp) return `${e.a} uses ${e.sp}: +${e.n} shield to the party`; return `${e.a} guards +${e.n}${e.w ? ` (${e.w})` : ''}`;
    case 'heal': if (e.sp) return `${e.a} uses ${e.sp} on ${e.d}: +${e.n}`; return `${e.a} heals ${e.d} +${e.n}${e.w ? ` (${e.w})` : ''}`;
  }
}

// sprites come with a plain background: key out the white connected to the edges (falls back to the raw image if CORS blocks canvas reads)
const keyed = new Map<string, string>();
function KeyedImg({ src, className, alt, style }: { src: string; className?: string; alt: string; style?: React.CSSProperties }) {
  const [s, setS] = useState(keyed.get(src) ?? src);
  useEffect(() => {
    if (!src) return;
    if (keyed.has(src)) { setS(keyed.get(src)!); return; }
    let dead = false;
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const w = im.naturalWidth, h = im.naturalHeight; if (!w || !h) return;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true }); if (!x) return;
        x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, w, h); const px = d.data;
        const bg = (i: number) => px[i + 3] > 200 && px[i] > 228 && px[i + 1] > 228 && px[i + 2] > 228;
        if (!bg(0) || !bg((w - 1) * 4)) { keyed.set(src, src); return; }  // already transparent / not a white backdrop
        const seen = new Uint8Array(w * h); const st: number[] = [0, w - 1, (h - 1) * w, h * w - 1];
        while (st.length) {
          const p = st.pop()!; if (seen[p]) continue; seen[p] = 1;
          const i = p * 4; if (!bg(i)) continue;
          px[i + 3] = 0;
          const cx = p % w, cy = (p / w) | 0;
          if (cx > 0) st.push(p - 1); if (cx < w - 1) st.push(p + 1); if (cy > 0) st.push(p - w); if (cy < h - 1) st.push(p + w);
        }
        x.putImageData(d, 0, 0);
        const url = c.toDataURL('image/png'); keyed.set(src, url); if (!dead) setS(url);
      } catch { keyed.set(src, src); }
    };
    im.src = src;
    return () => { dead = true; };
  }, [src]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={s} alt={alt} draggable={false} style={style} />;
}

export const dn = (n: string) => (n ? n.split('Intern Auditor').join('Shadow Wolf') : n);
const portrait = (u: BattleUnit) => (u.hero ? (HERO_PORTRAIT[u.hero] ?? heroById(u.hero as HeroId)?.artFull) : (ENEMY_PIXEL[u.name] ?? ENEMY_SPRITE[u.name])) ?? '';
// side-profile battle art (matches the target mockup); heroes listed here use it for every pose except hurt
const HERO_SIDE: Record<string, string> = {
  Shiro: 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261011_053202_832e01db-6edf-4ecd-a03d-d188c922fcdc.png',
};
const sprite = (u: BattleUnit, win?: boolean, pose?: 'strike' | 'cast' | 'hurt') => pose === 'hurt' && HURT[u.hero ?? u.name] ? HURT[u.hero ?? u.name] : (u.hero
  ? (HERO_SIDE[u.hero] ?? (win ? HERO_WIN[u.hero] : pose === 'cast' ? HERO_CAST[u.hero] : pose === 'strike' ? HERO_STRIKE[u.hero] : undefined) ?? HERO_BACK[u.hero] ?? HERO_SPRITE[u.hero])
  : ((pose ? ENEMY_STRIKE[u.name] : undefined) ?? ENEMY_PIXEL[u.name] ?? ENEMY_SPRITE[u.name])) ?? '';

const INTENT_ICON: Record<string, string> = { attack: '⚔', aoe: '💥', buff: '⬆', debuff: '🐌', heal: '✚', strike: '⚔', red_tape: '🔒', taxes: '☠', tax_season: '💥' };
const OLD_UI = false as boolean; // detached command bars replaced by the card menu
const EL: Record<string, string> = { fire: '🔥', ice: '❄️', storm: '⚡', earth: '⛰️', light: '✨', dark: '🌑' };


const EL_COL: Record<string, string> = { fire: '#fb923c', ice: '#7dd3fc', storm: '#facc15', earth: '#a8a29e', light: '#fef08a', dark: '#a78bfa' };
const EL_PATH: Record<string, React.ReactNode> = {
  fire: <path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z" fill="currentColor" />,
  ice: <path d="M12 2v20M4 7l16 10M20 7 4 17M9 3l3 3 3-3M9 21l3-3 3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  storm: <path d="M13 2 5 14h6l-1 8 8-12h-6z" fill="currentColor" />,
  earth: <path d="M2 20 9 8l4 6 3-4 6 10z" fill="currentColor" />,
  light: <><circle cx="12" cy="12" r="4" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  dark: <path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" fill="currentColor" />,
};
/** Stage backdrop: tries the newest art first and falls back through older backdrops so the stage is never blank. */
function StageBg({ act }: { act: number }) {
  const chain = useMemo(() => [PIXEL_BG[act], ACT_BG[act], ...(act !== 0 ? [] : [PIXEL_OLD_HARBOR])].filter(Boolean) as string[], [act]);
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [act]);
  const url = chain[Math.min(i, chain.length - 1)];
  return (
    <>
      <div className={`rg-bg${act === 0 && i === 0 ? ' paint' : ''}`} style={{ backgroundImage: `url(${url})` }} />
      <div className="rg-ground" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" style={{ display: 'none' }} onError={() => setI((n) => Math.min(n + 1, chain.length - 1))} />
    </>
  );
}
const PIXEL_OLD_HARBOR = 'https://d8j0ntlcm91z4.cloudfront.net/user_3IsYXWzYUFU3QK4KqwKxUFg4dUU/hf_20261008_131257_851376aa-3c7c-4b25-92af-b27a37825f08.png';

function ElIcon({ el, size = 14 }: { el: string; size?: number }) {
  return <svg className="rg-elsvg" width={size} height={size} viewBox="0 0 24 24" style={{ color: EL_COL[el] ?? '#fff' }} aria-label={el}>{EL_PATH[el] ?? null}</svg>;
}

type Float = { k: string; text: string; cls: string };

function Sprite({ action, elNow, u, floats, picked, onPick, style, lunge, lungeTo, t3, mine, menu, win, pose, broken }: { action?: string; broken?: boolean; lungeTo?: { x: number; y: number }; pose?: 'strike' | 'cast' | 'hurt'; win?: boolean; menu?: React.ReactNode; elNow?: string; t3?: boolean; mine?: boolean; u: BattleUnit; floats: Float[]; picked: boolean; onPick?: () => void; style: React.CSSProperties; lunge?: boolean }) {
  const pct = Math.max(0, Math.min(100, (u.hp / u.max_hp) * 100));
  const hit = floats.some((f) => f.cls === 'dmg');
  const dmgN = Math.abs(parseInt(floats.find((f) => f.cls.includes('dmg'))?.text ?? '0', 10)) || 0;
  const recoil = Math.max(8, Math.min(26, 6 + dmgN / 5));
  const sk = u.hero ?? u.name;
  const runner = !!(SHEETS[`${sk}:RUN`] && lungeTo && (action === 'hit' || action === 'crit' || action === 'miss'));
  const [ph, setPh] = useState<'run' | 'swing' | 'back'>('run');
  useEffect(() => {
    setPh('run');
    if (!(lunge && runner)) return;
    const d = actionFor({ t: action ?? 'hit' } as BattleLogEntry, false, true);
    const t1 = setTimeout(() => setPh('swing'), Math.max(0, d.anticipate + d.strike - 300));
    const t2 = setTimeout(() => setPh('back'), d.anticipate + d.strike + 120);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [lunge, runner, action]);
  return (
    <div className={`rg-unit ${u.side}${u.hp <= 0 ? ' down' : ''}${picked ? ' picked' : ''}${onPick ? ' pickable' : ''}${u.name === 'Government' ? ' boss' : ''}${t3 ? ' t3' : ''}${mine ? ' mine' : ''}${menu ? ' lift' : ''}${hit ? ' ouch' : ''}${floats.some((f) => f.text === 'DODGE') ? ' dodged' : ''}${floats.some((f) => f.cls.includes('heal')) ? ' healed' : ''}${floats.some((f) => f.cls.includes('shield')) ? ' shielded' : ''}${lunge ? ' striking' : ''}${win && u.hp > 0 ? ' cheer' : ''}${broken ? ' broken' : ''}`}
      data-u={(u.hero ?? u.name).toLowerCase().replace(/[^a-z]+/g, '-')}
      style={{ ...style, ['--idle' as string]: `${-((u.id.charCodeAt(0) + u.id.charCodeAt(3)) % 17) / 10}s` }} onClick={onPick} role={onPick ? 'button' : undefined}>
      <motion.div key={`${lunge ? 'l' : hit ? 'h' : 'i'}-${floats[0]?.k ?? ''}`}
        animate={lunge ? (lungeTo ? { x: [0, -Math.sign(lungeTo.x || 1) * 16, lungeTo.x, lungeTo.x, 0], y: [0, 4, lungeTo.y, lungeTo.y, 0], scale: [1, 0.94, 1.12, 1.12, 1] } : { x: [0, u.side === 'hero' ? 90 : -90, 0], scale: [1, 1.12, 1] }) : hit ? { x: [0, -recoil, recoil * 0.6, -recoil * 0.3, 0], filter: ['brightness(2.2)', 'brightness(1)'] } : {}}
        transition={lunge && lungeTo ? { ...lungeTimes(actionFor({ t: (action ?? 'hit') } as BattleLogEntry, u.side === 'enemy', runner)), ease: 'easeInOut' } : { duration: lunge ? 0.5 : 0.4 }}>
        <div className="rg-uc">
          {u.hp > 0 && u.intent && <span className={`rg-intent i-${u.intent}`} title={`Next: ${u.intent}`}>{INTENT_ICON[u.intent] ?? '⚔'}</span>}
          {u.hp > 0 && (u.haste ?? 0) !== 0 && <span className={`rg-haste ${(u.haste ?? 0) > 0 ? 'up' : 'dn'}`} title={(u.haste ?? 0) > 0 ? 'Hasted: acts earlier' : 'Slowed: acts later'}>{(u.haste ?? 0) > 0 ? '⚡' : '🐌'}</span>}
          <span className="rg-uc-tag">{mine ? 'YOU' : u.side === 'hero' ? (u.hero ?? 'HERO') : u.name === 'Government' ? 'BOSS' : 'FOE'}</span>
          {(() => {
            const runSh = runner && lunge && pose === 'strike' && u.hp > 0 && (ph !== 'swing' || !SHEETS[`${sk}:ATTACK`]) ? SHEETS[`${sk}:RUN`] : undefined;
            const atk = pose === 'strike' && u.hp > 0 && !runSh && (!runner || ph === 'swing') ? SHEETS[`${sk}:ATTACK`] : undefined;
            const hurtSh = !pose && hit && !win && u.hp > 0 ? SHEETS[`${sk}:HURT`] : undefined;
            const deadSh = u.hp <= 0 ? SHEETS[`${sk}:DEATH`] : undefined;
            const ultSh = pose === 'cast' && (action === 'ult' || action === 'limit') && u.hp > 0 ? SHEETS[`${sk}:ULT`] : undefined;
            const vicSh = win && !pose && u.hp > 0 ? SHEETS[`${sk}:VICTORY`] : undefined;
            const idleSh = SHEETS[`${sk}:IDLE`];
            const sh = deadSh ?? ultSh ?? runSh ?? atk ?? vicSh ?? hurtSh ?? idleSh;
            const h = sh?.h ?? (ultSh ? 133 : runSh ? 117 : atk ? 134 : 112);
            const top = sh?.top ?? (ultSh ? -50 : runSh ? -37 : 80 - h);
            const back = !!runSh && ph === 'back';
            const flip = (u.side === 'enemy' ? !back : back) ? ' scaleX(-1)' : '';
            return sh ? <SheetSprite key={deadSh ? 'dead' : vicSh ? 'vic' : ultSh ? 'ult' : runSh ? `run${ph}` : atk ? 'atk' : hurtSh ? 'hurt' : 'idle'} className="rg-img" url={sh.url} data={atk && runner ? { ...sh, duration: 0.42 } : sh} loop={!atk && !hurtSh && !deadSh && !ultSh} style={{ position: 'absolute', left: '50%', right: 'auto', top: `${top}%`, height: `${h}%`, width: 'auto', aspectRatio: sh.aspect ? String(sh.aspect) : '1 / 1', transform: `translateX(-50%)${flip}`, imageRendering: 'auto' }} /> : <KeyedImg className="rg-img" src={sprite(u, win, pose ?? (hit && u.hp > 0 ? 'hurt' : undefined))} alt={u.name} />; })()}
          <span className="rg-uname">{dn(u.name)}{u.corruption > 0 ? ` ☠${u.corruption}` : ''}</span>
          <span className="rg-uc-hp"><span className="rg-ehp"><motion.u animate={{ width: `${pct}%` }} transition={{ duration: 1.1, delay: 0.35 }} /><motion.i animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} /></span><b>{u.side === 'enemy' ? `HP ${Math.max(0, u.hp)}/${u.max_hp}` : u.hp}</b></span>
          {hit && <span className="rg-slash" key={floats[0]?.k} />}
          {u.side === 'enemy' && (u.weak_el || u.res_el) && u.hp > 0 && <span className="rg-el">{u.weak_el && <b title={`Weak to ${u.weak_el}`} className={u.weak_el === elNow ? 'hot' : ''}><ElIcon el={u.weak_el} />▼</b>}{u.res_el && <i title={`Resists ${u.res_el}`}><ElIcon el={u.res_el} />✕</i>}</span>}
        </div>
      </motion.div>
      {menu}
      <AnimatePresence>
        {floats.map((f, i) => (
          <motion.span key={f.k} className={`rg-float ${f.cls}`} style={{ top: `${-4 - i * 14}%` }}
            initial={{ opacity: 0, y: 0, scale: 0.6 }} animate={{ opacity: [0, 1, 1, 0], y: -60, scale: 1.2 }} transition={{ duration: 1.7 }}>{f.text}</motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Full-screen "ENCOUNTER CLEARED" flash that fades out by itself. */
function ClearBanner({ stage }: { stage: number }) {
  const [on, setOn] = useState(true);
  useEffect(() => { audio.fanfare(); const id = setTimeout(() => setOn(false), 2300); return () => clearTimeout(id); }, []);
  if (!on) return null;
  return (
    <div className="rg-clear fixed"><div className="rg-clear-flash" /><b>ENCOUNTER {stage} CLEARED</b><small>+{30 + 10 * stage}+ XP · rest at camp</small></div>
  );
}

export function Battle({ state, token, act, fallback, offset = 0 }: { state: RoomState; token: string | null; act: Act; fallback?: React.ReactNode; offset?: number }) {
  const [b, setB] = useState<BattleState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pend, setPend] = useState<{ kind: 'attack' } | { kind: 'ult' } | { kind: 'card'; c: string } | null>(null);
  const [sel, setSel] = useState<Cmd>('attack');
  const [wordText, setWordText] = useState('');
  const [wordMode, setWordMode] = useState<'attack' | 'guard' | 'heal'>('attack');
  const [wordMsg, setWordMsg] = useState('');
  const [oddsCalled, setOddsCalled] = useState(false);
  const [spOpen, setSpOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [intro, setIntro] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seenAct = useRef(-1);
  const stageEl = useRef<HTMLDivElement | null>(null);
  const stepped = useRef(-1);
  // battle-fetch coordination: coalesce concurrent calls, reject stale/out-of-order responses (mirrors hooks/useRoom.ts)
  const bVersionRef = useRef(-1);
  const inflightRef = useRef(false);
  const queuedRef = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  useEffect(() => { bVersionRef.current = -1; }, [token]);
  // Book of Wisdom
  const [book, setBook] = useState<{ prompt: string; ends: number } | null>(null);
  const [bookWord, setBookWord] = useState('');
  const [bookMsg, setBookMsg] = useState('');
  const [bookLeft, setBookLeft] = useState(0);
  const [bookOpenStage, setBookOpenStage] = useState(false);
  const [result, setResult] = useState<StoryResult | null>(null);
  const [active, setActive] = useState<BattleLogEntry | null>(null);
  const over = b?.step === 'won' || b?.step === 'lost';
  useEffect(() => {
    if (!over) { setResult(null); return; }
    if (!token) return;
    let n = 0; const go = () => void fetchStoryResult(token).then((r) => { if (r) setResult(r); else if (n++ < 5) setTimeout(go, 1200); });
    go();
  }, [over, token]);

  const load = useCallback(async () => {
    const tk = tokenRef.current;
    if (!tk) return;
    if (inflightRef.current) { queuedRef.current = true; return; }
    inflightRef.current = true;
    try {
      const next = await rpc.getBattle(tk);
      // a token change (new room/session) or a response older than one already applied must not clobber newer state
      if (tokenRef.current !== tk) { queuedRef.current = true; return; }
      if (!next || next.version >= bVersionRef.current) {
        if (next) bVersionRef.current = next.version;
        setB(next);
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
      inflightRef.current = false;
      if (queuedRef.current) { queuedRef.current = false; void load(); }
    }
  }, []);

  useEffect(() => { void load(); }, [load, state.room.state_version]);
  useEffect(() => { const i = setInterval(() => void load(), 3000); return () => clearInterval(i); }, [load]);

  const mine = b?.units.find((u) => u.player_id === b.me);
  useEffect(() => { if (mine?.hero) { try { localStorage.setItem('letterlock:hero', mine.hero); } catch { /* ignore */ } } }, [mine?.hero]);
  const turn = b?.turn ?? 0;
  useEffect(() => { setMsg(''); setPend(null); setOddsCalled(false); setSpOpen(false); setItemOpen(false); setSel('attack'); setWordText(''); setWordMsg(''); }, [turn]);

  // Act intro card
  useEffect(() => {
    if (!b) return;
    const a = actOf(b.stage);
    if (seenAct.current !== a) { seenAct.current = a; setIntro(a); }
  }, [b]);
  useEffect(() => {
    if (intro === null) return;
    const id = setTimeout(() => setIntro(null), 3200);
    return () => clearTimeout(id);
  }, [intro]);

  // server-adjusted countdown (matches the offset Game.tsx already applies to every other phase timer)
  const leftMs = useCountdown(b && b.step === 'input' ? b.ends_at : null, offset);
  const left = Math.ceil(leftMs / 1000);

  useEffect(() => {
    if (!b || b.step !== 'input' || !token || intro !== null) return;
    const enemiesAlive = b.units.some((u) => u.side === 'enemy' && u.hp > 0);
    const allLocked = b.units.filter((u) => u.side === 'hero' && u.hp > 0).every((u) => u.locked);
    // once I've locked in, nudge the server on every change: it resolves as soon as every *present, active* player is in
    const go = allLocked || left <= 0 || !enemiesAlive || !!mine?.locked;
    const key = b.turn * 100000 + (allLocked || left <= 0 || !enemiesAlive ? 99999 : b.version % 99999);
    if (go && stepped.current !== key) {
      // mark as sent only when it actually fires: a re-render before the timeout must not swallow the nudge
      const id = setTimeout(() => { stepped.current = key; void rpc.battleStep(token, b.turn).then(load).catch(() => {}); }, allLocked ? 400 : 300);
      return () => clearTimeout(id);
    }
  }, [b, left, token, load, intro, mine?.locked]);

  // timer expired: keep nudging the server until the turn resolves (an early no-op from clock skew must not stall the fight)
  useEffect(() => {
    // (no timer now) also keep nudging while I'm locked in and everyone present has acted, so enemies always get their turn
    const waitingOnServer = !!b && b.units.filter((u) => u.side === 'hero' && u.hp > 0).some((u) => u.player_id === b.me && u.locked);
    if (!b || b.step !== 'input' || !token || intro !== null || (left > 0 && !waitingOnServer)) return;
    const id = setInterval(() => { void rpc.battleStep(token, b.turn).then(load).catch(() => {}); }, 1500);
    return () => clearInterval(id);
  }, [b?.step, b?.turn, b?.version, left > 0, token, load, intro]); // eslint-disable-line react-hooks/exhaustive-deps

  // book timer
  useEffect(() => {
    if (!book) return;
    const tick = () => setBookLeft(Math.max(0, Math.ceil((book.ends - Date.now()) / 1000)));
    tick();
    const i = setInterval(tick, 200);
    return () => clearInterval(i);
  }, [book]);

  // HP shown on the cards follows the playback: a unit keeps its old HP until the entry that hits it plays
  const hpRef = useRef<{ ver: number; prev: Record<string, number>; cur: Record<string, number> }>({ ver: -1, prev: {}, cur: {} });
  if (b && hpRef.current.ver !== b.version) {
    hpRef.current = { ver: b.version, prev: hpRef.current.cur, cur: Object.fromEntries(b.units.map((x) => [x.id, x.hp])) };
  }
  const [applied, setApplied] = useState<{ ver: number; ids: string[]; all: boolean }>({ ver: -1, ids: [], all: true });

  // turn playback: show each log entry one at a time (attacker lunges, target flinches, caption)
  const playKey = b?.version ?? 0;
  useEffect(() => {
    const entries = b?.log ?? [];
    if (!entries.length) { setActive(null); setApplied({ ver: playKey, ids: [], all: true }); return; }
    let i = 0;
    setApplied({ ver: playKey, ids: [], all: false });
    setActive(entries[0]);
    // big moments (crit, ultimate, limit break) hold longer: a short slow-motion beat
    const enemyIds = new Set((b?.units ?? []).filter((x) => x.side === 'enemy').map((x) => x.id));
    const runnerIds = new Set((b?.units ?? []).filter((x) => SHEETS[`${x.hero ?? x.name}:RUN`]).map((x) => x.id));
    const delay = (e: BattleLogEntry) => actionFor(e, !!(e.ai && enemyIds.has(e.ai)), !!(e.ai && runnerIds.has(e.ai))).hold;
    let id: ReturnType<typeof setTimeout>;
    const next = () => { i += 1; if (i >= entries.length) { setActive(null); setApplied({ ver: playKey, ids: [], all: true }); } else { setActive(entries[i]); id = setTimeout(next, delay(entries[i])); } };
    id = setTimeout(next, delay(entries[0]));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  const effSpd = (u: BattleUnit) => u.spd + ((u.haste ?? 0) > 0 ? 4 : (u.haste ?? 0) < 0 ? -4 : 0);
  const orderUnits = useMemo(() => (b?.units ?? []).filter((u) => u.hp > 0).sort((a, c) => effSpd(c) - effSpd(a)), [b]);

  const firstNamed = (name: string | undefined, side?: 'hero' | 'enemy') => {
    const l = (b?.units ?? []).filter((x) => x.name === name && (!side || x.side === side));
    return l.find((x) => x.hp > 0) ?? l[0];
  };
  const floatsFor = (u: BattleUnit): Float[] => {
    if (!b || !active) return [];
    const e = active; const k = `${b.version}-${e.t}-${e.a}-${e.d ?? ''}-${e.n ?? ''}`;
    const dn = e.di ?? (e.d ? firstNamed(e.d)?.id : undefined);
    const an = e.ai ?? firstNamed(e.a, e.t === 'season' ? 'enemy' : undefined)?.id;
    if ((e.t === 'hit' || e.t === 'crit') && dn === u.id) return [{ k, text: `-${e.n}${e.t === 'crit' ? '!' : ''}`, cls: e.t === 'crit' ? 'dmg crit' : 'dmg' }];
    if (e.t === 'heal' && dn === u.id) return [{ k, text: `+${e.n}`, cls: 'heal' }];
    if (e.t === 'guard' && an === u.id) return [{ k, text: `🛡${e.n}`, cls: 'shield' }];
    if ((e.t === 'miss' || e.t === 'dodge') && dn === u.id) return [{ k, text: e.t === 'miss' ? 'MISS' : 'DODGE', cls: 'miss' }];
    if ((e.t === 'sweep' || e.t === 'mega_sweep') && u.side === 'enemy') return [{ k, text: `-${e.n}`, cls: 'dmg' }];
    if (e.t === 'limit' && u.side === 'enemy') return [{ k, text: `-${e.n}`, cls: 'dmg crit' }];
    if (e.t === 'ult' && u.side === 'enemy' && e.n) return [{ k, text: `-${e.n}`, cls: 'dmg crit' }];
    if (e.t === 'e_aoe' && u.side === 'hero') return [{ k, text: `-${e.n}`, cls: 'dmg' }];
    if (e.t === 'e_debuff' && dn === u.id) return [{ k, text: 'WEAK', cls: 'miss' }];
    if (e.t === 'e_heal' && dn === u.id) return [{ k, text: `+${e.n}`, cls: 'heal' }];
    if (e.t === 'e_buff' && u.side === 'enemy') return [{ k, text: 'ATK ▲', cls: 'shield' }];
    if (e.t === 'season' && u.side === 'hero') return [{ k, text: 'TAX!', cls: 'dmg crit' }];
    if ((e.t === 'group_heal' || e.t === 'full_heal') && u.side === 'hero') return [{ k, text: e.n ? `+${e.n}` : '+', cls: 'heal' }];
    return [];
  };
  const wheel = (() => {
    const alive = (b?.units ?? []).filter((u) => u.hp > 0 || (b?.log ?? []).some((e) => e.ai === u.id));
    if (!active || !b?.log?.length) return [...alive].filter((u) => u.hp > 0).sort((x, y) => effSpd(y) - effSpd(x)).slice(0, 8).map((u, i) => ({ u, cur: false, done: false }));
    const order: string[] = [];
    for (const e of b.log) if (e.ai && !order.includes(e.ai)) order.push(e.ai);
    const idx = b.log.indexOf(active);
    const acted = new Set(b.log.slice(0, Math.max(0, idx)).map((e) => e.ai).filter(Boolean) as string[]);
    acted.delete(active.ai ?? '');
    const rows = order.map((id) => alive.find((u) => u.id === id)).filter(Boolean) as BattleUnit[];
    const upcoming = rows.filter((u) => !acted.has(u.id));
    const past = rows.filter((u) => acted.has(u.id));
    return [...upcoming, ...past].slice(0, 8).map((u) => ({ u, cur: u.id === active.ai, done: acted.has(u.id) }));
  })();
  const lungeId = active && ['hit', 'crit', 'miss', 'dodge', 'guard', 'heal', 'ult', 'limit', 'season', 'sweep', 'mega_sweep', 'e_aoe', 'e_buff', 'e_debuff', 'e_heal'].includes(active.t)
    ? (active.t === 'dodge' ? (active.di ?? firstNamed(active.d)?.id) : (active.ai ?? firstNamed(active.a)?.id)) : undefined;

  useEffect(() => {
    if (!active || !b) return;
    const ids = active.di ? [active.di] : b.units.map((x) => x.id);
    setApplied((a) => (a.ver === b.version ? { ...a, ids: [...a.ids, ...ids] } : a));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active) return;
    audio.battle(active.t, (b?.units ?? []).some((e) => e.side === 'enemy' && e.name === active.a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const endSeen = useRef('');
  useEffect(() => {
    if (!b || (b.step !== 'won' && b.step !== 'lost') || endSeen.current === b.step) return;
    endSeen.current = b.step;
    audio.file(b.step === 'won' ? 'victory' : 'defeat');
  }, [b]);

  const [use3d, setUse3d] = useState(false);
  useEffect(() => { setUse3d(webglOk() && new URLSearchParams(window.location.search).has('3d')); }, []); // 2D cel-shaded sprites by default; ?3d opts into the old 3D stage
  const fxSeq = useRef(0);
  const fx = useMemo<StageFx>(() => {
    if (!active || !b) return null;
    const ids = (cls: string) => b.units.filter((u) => floatsFor(u).some((f) => f.cls.startsWith(cls))).map((u) => u.id);
    const tgt = active.di ?? (active.d ? firstNamed(active.d)?.id : undefined);
    return { key: `${b.version}-${fxSeq.current++}`, type: active.t, actor: lungeId, target: active.t === 'dodge' ? undefined : tgt, hurt: ids('dmg'), heal: ids('heal'), guard: ids('shield') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const posStore = useRef<Record<string, { x: number; y: number }>>({}).current;
  const foeNames = (b?.units ?? []).filter((x) => x.side === 'enemy').map((x) => x.name);
  const foeName = ['Government', 'The Collector', 'The Commissioner'].find((n) => foeNames.includes(n)) ?? foeNames[0];
  const dir = useCombatDirector({ active, units: b?.units ?? [], pos: posStore, stage: b?.stage ?? -1, foe: foeName, boss: foeName === 'Government', elite: foeName === 'The Collector' || foeName === 'The Commissioner', version: b?.version ?? 0 });
  useEffect(() => { if (b) preloadFor((b.units ?? []).filter((x) => x.side === 'hero').map((x) => x.hero ?? x.name), foeNames); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.stage]);

  if (loaded && !b) return loadError
    ? <div className="center muted"><p className="note bad">Could not load the battle: {loadError}</p><button type="button" className="btn" onClick={() => void load()}>Retry</button></div>
    : <>{fallback ?? null}</>;
  if (!b) return <div className="center muted">Loading battle…</div>;

  if (b.step === 'camp') return (<>
    <ClearBanner key={`cb-${b.stage}`} stage={b.stage} />
    <Camp b={b} token={token} state={{ code: state.room.code, v: state.room.state_version }} />
  </>);

  const shownHp = (u: BattleUnit) => {
    const prev = hpRef.current.prev[u.id];
    const playing = applied.ver !== b.version || !applied.all;
    if (!playing || prev === undefined) return u.hp;
    return applied.ver === b.version && applied.ids.includes(u.id) ? u.hp : prev;
  };
  const shown = b.units.map((u) => ({ ...u, hp: shownHp(u) }));
  const heroes = shown.filter((u) => u.side === 'hero');
  const enemies = shown.filter((u) => u.side === 'enemy');
  const aliveEnemies = enemies.filter((e) => e.hp > 0);
  const canAct = b.step === 'input' && !!mine && mine.hp > 0 && !mine.locked && !active;
  const won = b.step === 'won' || active?.t === 'stage' || (aliveEnemies.length === 0 && b.step === 'input');
  const poseFor = (id: string): 'strike' | 'cast' | undefined => {
    if (!active || lungeId !== id || active.t === 'dodge') return undefined;
    return active.t === 'ult' || active.t === 'limit' || active.t === 'heal' || active.t === 'group_heal' || active.t === 'full_heal' || active.t === 'revive' || active.t === 'cleanse' || active.t === 'guard' || active.t === 'e_buff' || active.t === 'e_heal' || !!active.sp ? 'cast' : 'strike';
  };
  const tgtId = target && aliveEnemies.some((e) => e.id === target) ? target : aliveEnemies.length === 1 ? aliveEnemies[0].id : null;
  const tgtUnit = enemies.find((e) => e.id === tgtId) ?? null;
  const isBoss = (e: BattleUnit) => e.name === 'Government' || e.name === 'The Collector' || e.name === 'The Commissioner';
  const lead = enemies.find((e) => e.name === 'Government') ?? enemies.find((e) => e.name === 'The Collector') ?? enemies.find((e) => e.name === 'The Commissioner') ?? enemies[0];
  const leadPct = lead ? Math.max(0, Math.round((lead.hp / lead.max_hp) * 100)) : 0;
  const ultReady = (mine?.ult ?? 0) >= 6;
  const ai = actOf(b.stage);
  const myHero = mine?.hero ? heroById(mine.hero as HeroId) : null;
  const needsEnemy = !!pend && (pend.kind === 'attack' || pend.kind === 'ult' || (pend.kind === 'card' && pend.c === 'sp_attack'));
  const needsAlly = pend?.kind === 'card' && pend.c === 'sp_heal';
  const needsDown = pend?.kind === 'card' && pend.c === 'revive';

  // side-on JRPG line: heroes on the left, enemies on the right, all standing on one dock ground line (slight stagger)
  // enemies form a diagonal (back-left to front-right); heroes mirror it (front-left to back-right)
  const ePos = (i: number, n: number): React.CSSProperties => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return { left: `${n === 1 ? 72 : 52 + t * 36}%`, top: `${n === 1 ? 74 : 74 + t * 8}%`, zIndex: 10 + Math.round(t * 10), ['--us' as string]: 0.30 } as React.CSSProperties;
  };
  const hPos = (i: number, n: number): React.CSSProperties => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return { left: `${n === 1 ? 26 : 10 + t * 32}%`, top: `${n === 1 ? 76 : 80 - t * 9}%`, zIndex: 30 - Math.round(t * 10) };
  };

  const posMap: Record<string, { x: number; y: number }> = {};
  enemies.forEach((u, i) => { const p = ePos(i, enemies.length); posMap[u.id] = { x: parseFloat(String(p.left)), y: parseFloat(String(p.top)) }; });
  heroes.forEach((u, i) => { const p = hPos(i, heroes.length); posMap[u.id] = { x: parseFloat(String(p.left)), y: parseFloat(String(p.top)) }; });

  Object.keys(posStore).forEach((k) => delete posStore[k]); Object.assign(posStore, posMap);

  // slide the attacker right up to its target so the blow visibly connects
  const lungeVec = (u: BattleUnit): { x: number; y: number } | undefined => {
    if (!active || lungeId !== u.id || !['hit', 'crit', 'miss', 'ult', 'limit', 'season', 'sweep', 'mega_sweep', 'e_aoe'].includes(active.t)) return undefined;
    const me = posMap[u.id]; if (!me) return undefined;
    const foes = u.side === 'hero' ? enemies : heroes;
    const tid = active.di ?? (active.d ? firstNamed(active.d)?.id : undefined);
    const tu = foes.find((f) => f.id === tid);
    let tx: number, ty: number;
    if (tu && posMap[tu.id]) { tx = posMap[tu.id].x; ty = posMap[tu.id].y; }
    else {
      const ps = foes.filter((f) => f.hp > 0 && posMap[f.id]).map((f) => posMap[f.id]);
      if (!ps.length) return undefined;
      tx = ps.reduce((a, p) => a + p.x, 0) / ps.length; ty = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    }
    const W = stageEl.current?.clientWidth ?? 800, H = stageEl.current?.clientHeight ?? 450;
    const k = 0.8; // stop just short so the sprites overlap at the point of contact
    return { x: ((tx - me.x) / 100) * W * k, y: ((ty - me.y) / 100) * H * k };
  };

  async function retry(sameStage: boolean) {
    if (!token || retrying) return;
    setRetrying(true);
    try { await rpc.battleRetry(token, sameStage); setResult(null); setApplied({ ver: -1, ids: [], all: true }); seenAct.current = -1; await load(); }
    catch { /* ignore, the poll will show the new battle */ }
    setRetrying(false);
  }

  async function doAction(kind: 'attack' | 'guard' | 'ult', tgt: string | null) {
    if (!token || !canAct) return;
    const r = await act(() => rpc.battleSubmit(token, '', kind, tgt));
    if (!r) return;
    if (!r.ok) setMsg('Invalid.');
    else { setMsg(kind === 'attack' ? 'Attack locked in' : kind === 'guard' ? 'Guarding' : 'Ultimate locked in'); setPend(null); setSel('attack'); void load(); }
  }
  async function doWord() {
    if (!token || !canAct) return;
    const w = wordText.trim().toLowerCase();
    if (w.length < 2) { setWordMsg('At least 2 letters.'); return; }
    const r = await act(() => rpc.battleSubmit(token, w, wordMode, wordMode === 'attack' ? tgtId : null));
    if (!r) return;
    if (r.ok) { setMsg(`"${w.toUpperCase()}" locked in · ${r.power ?? ''} power`); setWordText(''); setWordMsg(''); setSel('attack'); void load(); return; }
    setWordMsg(r.reason === 'LOCKED' ? `The letter "${(r.letter ?? '').toUpperCase()}" is locked this round.` : r.reason === 'NOT_A_WORD' ? 'Not a valid word.' : r.reason === 'OFF_TOPIC' ? 'That word does not fit the prompt.' : 'Invalid word.');
  }
  async function playCard(c: string, tgt: string | null) {
    if (!token) return;
    const r = await act(() => rpc.battlePlay(token, c, tgt));
    setPend(null); setSpOpen(false); setItemOpen(false); setSel('attack');
    if (r) void load();
  }
  // tap on a unit while something is waiting for a target
  function pickUnit(id: string) {
    if (!pend || !canAct) return;
    setTarget(id);
    if (pend.kind === 'attack') void doAction('attack', id);
    else if (pend.kind === 'ult') void doAction('ult', id);
    else void playCard(pend.c, id);
  }
  // JRPG flow: tap an enemy to target it, then pick a command
  function tapEnemy(id: string) {
    if (!canAct) return;
    if (needsEnemy) { pickUnit(id); return; }
    setTarget(id); setMsg('');
  }
  function needTarget() { setMsg('Tap an enemy to target it first'); }
  function chooseCard(c: string) {
    if (c === 'revive') {
      const down = heroes.filter((h) => h.hp <= 0);
      if (down.length === 0) { setMsg('No one has fallen'); return; }
      if (down.length === 1) { void playCard(c, down[0].id); return; }
      setPend({ kind: 'card', c }); setMsg('Tap the fallen ally'); setItemOpen(false); return;
    }
    if (c === 'sp_attack' || c === 'sp_heal') {
      if (c === 'sp_attack' && tgtId) { void playCard(c, tgtId); return; }
      setPend(pend?.kind === 'card' && pend.c === c ? null : { kind: 'card', c });
    } else void playCard(c, null);
  }
  function chooseAttack() {
    if (tgtId) { void doAction('attack', tgtId); return; }
    needTarget();
  }
  async function callOdds() {
    if (!token) return;
    const r = await act(() => rpc.battleOdds(token));
    if (r) { setOddsCalled(true); void load(); }
  }

  async function openBook() {
    if (!token) return;
    const r = await act(() => rpc.bookOpen(token));
    if (!r) { setBookMsg('The Book was already read this encounter.'); setBookOpenStage(true); return; }
    if (r.prompt) { setBook({ prompt: r.prompt, ends: r.ends_at ? new Date(r.ends_at).getTime() : Date.now() + 15000 }); setBookWord(''); setBookMsg(''); setBookOpenStage(true); void load(); }
    else setBookMsg(r.reason === 'ALREADY_USED' ? 'The Book was already read this encounter.' : 'The Book stays shut.');
  }
  async function answerBook(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !bookWord.trim()) return;
    const r = await act(() => rpc.bookAnswer(token, bookWord.trim()));
    if (!r) return;
    if (r.ok) { setBookMsg(`Wisdom granted: ${CARDS[r.card ?? '']?.label ?? 'a powerful card'}!`); setBook(null); setBookOpenStage(true); void load(); }
    else if (r.reason === 'TOO_SLOW') { setBookMsg('Too slow. The pages go dark.'); setBook(null); }
    else if (r.reason === 'WRONG') setBookMsg('The Book does not accept that. Try again!');
    else setBookMsg('Invalid.');
  }

  // ── HUD data (presentation only) ──
  const itemCards = b.cards.filter((c) => ITEM_CARDS.includes(c));
  const specialCards = b.cards.filter((c) => !ITEM_CARDS.includes(c));
  const cardLabel = (c: string) => (c === 'sp_heal' ? 'Healing Potion' : c === 'revive' ? 'Revive Potion' : CARDS[c]?.label ?? c);
  const toEntry = (c: string, i: number): Entry => ({ key: c + i, label: cardLabel(c), hint: CARDS[c]?.hint ?? '', disabled: !canAct || b.card_used, sel: pend?.kind === 'card' && pend.c === c, onUse: () => chooseCard(c) });
  const skillEntries: Entry[] = [
    ...(mine ? [{ key: 'ult', label: ULT_NAME[mine.hero ?? ''] ?? 'Ultimate', hint: ultReady ? 'Limit-break finisher' : `Charging ${mine.ult ?? 0}/6`, disabled: !canAct || !ultReady, ult: true, badge: ultReady ? 'READY' : `${mine.ult ?? 0}/6`, sel: pend?.kind === 'ult',
      onUse: () => { if (aliveEnemies.length === 1) void doAction('ult', aliveEnemies[0].id); else { setPend({ kind: 'ult' }); setMsg('Pick a target'); } } } as Entry] : []),
    ...specialCards.map(toEntry),
    ...((b.momentum ?? 0) >= 100 ? [{ key: 'odds', label: oddsCalled ? 'Odds locked' : 'Unleash Odds!', hint: 'Team finisher', disabled: !canAct || oddsCalled, onUse: () => void callOdds() } as Entry] : []),
  ];
  const itemEntries: Entry[] = b.cards.map((c, i) => [c, i] as const).filter(([c]) => ITEM_CARDS.includes(c)).map(([c, i]) => toEntry(c, i));
  const chipOf = (u: BattleUnit): Chip => ({ id: u.id, name: dn(u.name), src: portrait(u), hp: u.hp, max: u.max_hp, picked: tgtId === u.id || target === u.id, down: u.hp <= 0,
    sub: u.side === 'enemy' && u.weak_el ? `weak ${u.weak_el}` : undefined });
  const pickingAlly = needsAlly || needsDown;
  const chipMode: 'target' | 'pick' | null = pend && (needsEnemy || pickingAlly) ? 'pick' : sel === 'attack' || (sel === 'word' && wordMode === 'attack') ? 'target' : null;
  const chips: Chip[] = chipMode === 'pick' ? (needsEnemy ? aliveEnemies : heroes.filter((h) => (needsDown ? h.hp <= 0 : h.hp > 0))).map(chipOf) : aliveEnemies.map(chipOf);
  const confirmLabel = pend ? null : sel === 'attack' || sel === 'guard' ? 'Confirm' : sel === 'word' ? 'Cast' : sel === 'book' ? 'Open the Book' : null;
  const confirmDisabled = !canAct || (sel === 'attack' && !tgtId) || (sel === 'word' && (wordText.trim().length < 2 || (wordMode === 'attack' && !tgtId))) || (sel === 'book' && !!b.book_used);
  const onConfirm = () => { if (sel === 'attack') chooseAttack(); else if (sel === 'word') void doWord(); else if (sel === 'guard') void doAction('guard', null); else if (sel === 'book') void openBook(); };
  // solo vs multiplayer comes from the server (real human players), not from how many hero units exist
  const humans = heroes.filter((h) => h.human && h.hp > 0);
  const multi = b.units.filter((u) => u.side === 'hero' && u.human).length > 1;
  const deckStatus = active ? 'Enemy turn…' : mine && mine.hp <= 0 ? 'You are down. Your team fights on.' : mine?.locked ? (multi ? `${msg || 'Locked in'}. Waiting for the team…` : `${msg || 'Locked in'}. Resolving…`) : 'Waiting…';
  const hudHeroes = multi ? humans : heroes.filter((h) => h.player_id === b.me);
  const waitingNames = humans.filter((h) => !h.locked && h.player_id !== b.me).map((h) => h.hero ?? h.name);
  const pill: 'mine' | 'play' | 'wait' = active ? 'play' : canAct ? 'mine' : 'wait';
  const logIdx = active ? b.log.indexOf(active) : b.log.length - 1;
  const hudLog = b.log.slice(0, Math.max(0, logIdx + 1)).filter((e) => e.t !== 'brk' || e.x === true).slice(-7).map(logLine);
  const orderItems: OrderItem[] = wheel.map((w) => ({ id: w.u.id, name: dn(w.u.name), src: portrait(w.u), side: w.u.side, cur: w.cur, done: w.done, spd: effSpd(w.u) }));
  const partyRows: PartyRow[] = heroes.map((u) => ({ id: u.id, name: u.hero ?? u.name, src: portrait(u), hp: u.hp, max: u.max_hp, ult: u.ult ?? 0, me: u.player_id === b.me, locked: u.locked, down: u.hp <= 0, shield: u.shield, corr: u.corruption }));

  const skillDisabled = !canAct;

  return (
    <div className={`rg${active?.t === 'limit' ? ' lb' : ''}`}>
      <TopBar location={ACT_NAME[ai].split('· ')[1] ?? ACT_NAME[ai]} round={b.turn} rounds={b.stages * 5} order={orderItems} pill={pill}
        turnLabel={active ? (active.a && enemies.some((e) => e.name === active.a) ? 'ENEMY TURN' : 'RESOLVING') : canAct ? 'YOUR TURN' : mine && mine.hp <= 0 ? 'DOWN' : mine?.locked ? 'LOCKED IN' : 'WAITING'}
        turnSub={active ? 'Watch the round play out' : canAct ? 'You can act now' : mine?.locked ? (multi ? 'Waiting for allies' : 'Resolving…') : 'Hold on…'}
        multi={multi} ready={hudHeroes.filter((h) => h.locked).length} readyTotal={hudHeroes.length} waiting={multi && mine?.locked ? waitingNames.slice(0, 3).join(', ') : ''}
        timer={active || b.step !== 'input' ? '—' : left > 3600 || left > 30 ? 'No timer' : `Idle ${left}s`} warn={!active && left <= 5 && b.step === 'input'}
        skillsHref={`/skills?from=${encodeURIComponent(`/room/${state.room.code}`)}`} onLog={() => setShowLog((v) => !v)} />
      <div ref={stageEl} className={`rg-stage${use3d ? ' t3' : ''}`} data-boss={lead?.name === 'Government' ? 1 : 0} data-foes={aliveEnemies.length <= 1 ? 1 : 0}>
        <div className="rg-cam" ref={(el) => { dir.camEl.current = el; dir.cam.attach(el); }}>
        <StageBg act={ai} />
        {use3d && <Stage3D act={ai} fx={fx} pos={posMap}
          units={b.units.map((u) => ({ id: u.id, side: u.side, name: u.name, hero: u.hero, dead: u.hp <= 0 }))}
          pickedId={target} pickableIds={b.units.filter((u) => u.hp > 0 && ((needsEnemy && u.side === 'enemy') || (needsAlly && u.side === 'hero')) && canAct).map((u) => u.id)} />}
        <div className="rg-vig" />

        <LeftParty rows={partyRows} active={active?.ai} />
        {/* top-left: turn order. Idle: by speed. While a turn plays: the real order, the acting unit lit up */}
        <div className="rg-order" aria-label="Turn order">
          <span className="rg-rd">{b.turn}<small>/{b.stages * 5}</small></span>
          {wheel.map((w) => (
            <motion.div layout transition={{ type: 'spring', stiffness: 380, damping: 32 }} key={w.u.id}
              className={`rg-ord ${w.u.side}${w.cur ? ' first' : ''}${w.done ? ' done' : ''}`} title={`${dn(w.u.name)} · SPD ${effSpd(w.u)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portrait(w.u)} alt={w.u.name} draggable={false} />
              <i>{effSpd(w.u)}</i>
            </motion.div>
          ))}
        </div>

        {/* top-center: boss bar */}
        {lead && isBoss(lead) && (
          <div className="rg-boss">
            <div className="rg-boss-name"><b>{dn(lead.name)}</b><span>{leadPct}%</span></div>
            <div className="rg-boss-bar"><motion.i animate={{ width: `${leadPct}%` }} transition={{ duration: 0.6 }} /></div>
            <div className="rg-boss-sub">{aliveEnemies.length} enemies · {b.intent !== 'attack' ? `⚠ ${INTENT[b.intent] ?? b.intent}` : 'Preparing…'}
              {b.next_intent !== 'strike' && b.next_intent !== 'attack' ? ` · next: ${INTENT[b.next_intent] ?? b.next_intent}` : ''}</div>
          </div>
        )}

        {/* top-right: round / objectives */}
        <div className="rg-tr">
          <div className="rg-tr-row">
            <span className={`rg-chip${left <= 5 ? ' warn' : ''}`}>⏱ {left}s</span>
            <Link href={`/skills?from=${encodeURIComponent(`/room/${state.room.code}`)}`} className="rg-chip">✦ Skills</Link>
            <button type="button" className="rg-chip" onClick={() => setShowLog((v) => !v)}>Log</button>
          </div>
          <div className="rg-obj">
            <b>Encounter {b.stage} / {b.stages}</b>
            <span>{ACT_NAME[ai]}</span>
            <span className={aliveEnemies.length === 0 ? 'ok' : ''}>◉ Defeat all {enemies.length} enemies</span>
            <span className={heroes.every((h) => h.hp > 0) ? 'ok' : ''}>◉ Keep every hero standing</span>
            {b.drain && <span className="bad">The Collector garnishes Power (−20%)</span>}
          </div>
          {tgtUnit && isBoss(tgtUnit) && (() => { const e = tgtUnit; const p = Math.max(0, Math.min(100, (e.hp / e.max_hp) * 100)); return (
            <div className="rg-tgt"><b>{dn(e.name)}</b><span className="rg-tgt-bar"><motion.i animate={{ width: `${p}%` }} transition={{ duration: 0.4 }} /></span><em>{Math.max(0, e.hp)} / {e.max_hp}</em></div>
          ); })()}
        </div>

        {/* element banner */}
        <div className="rg-prompt">
          <div className="rg-prompt-t">{b.element ? <><span className="rg-elchip"><ElIcon el={b.element} size={16} /></span> {b.element.toUpperCase()} turn<span className="rg-prompt-sub"> · hit weaknesses for ×1.5</span></> : 'Choose your move'}</div>
        </div>

        {active && <div className={`rg-ban ${active.t === 'ult' ? 'ult' : active.t === 'crit' ? 'crit' : enemies.some((e) => e.name === active.a) ? 'e' : ''}`} key={`${active.t}-${active.a}-${active.n}-${b.version}`}><span>{logLine(active)}</span></div>}

        {OLD_UI && mine && b.step === 'input' && (b.momentum ?? 0) >= 100 && mine.hp > 0 && (
          <button type="button" className="rg-oddsbtn" disabled={oddsCalled} onClick={() => void callOdds()}>{oddsCalled ? 'ODDS LOCKED IN' : 'UNLEASH ODDS!'}</button>
        )}
        {active?.t === 'stage' && <div className="rg-clear" key={`cl-${b.version}`}><div className="rg-clear-flash" /><b>ENCOUNTER CLEARED</b><small>+{30 + 10 * (Number(active.n ?? 2) - 1)}+ XP (quick clears earn more) · the path opens…</small></div>}
        {(active?.t === 'ult' || active?.t === 'limit') && <><div className="rg-lbflash" key={`lf-${b.version}`} /><div className="rg-burst crit" key={`lb-${b.version}`}>LIMIT BREAK!</div></>}
        {active && active.x === 'resist' && <div className="rg-burst miss" key={`wk-${b.version}-${active.a}-${active.n}`}>RESIST</div>}
        {active && !active.x && active.t !== 'limit' && (active.t === 'miss' || active.t === 'dodge') && <div className={`rg-burst ${active.t}`} key={`bu-${active.t}-${active.a}-${b.version}`}>{active.t === 'miss' ? 'MISS' : active.t === 'dodge' ? 'DODGE' : active.t === 'crit' ? 'CRITICAL!' : 'ALL-OUT!'}</div>}

        <div className={`rg-turn${active ? ' play' : canAct ? ' mine' : ' wait'}`} key={active ? 'p' : canAct ? `m${b.turn}` : 'w'}>
          {active ? (active.a && enemies.some((e) => e.name === active.a) ? '⚔ Enemies attack…' : '⚔ Resolving the turn…')
            : mine && mine.hp <= 0 ? 'You are down' : canAct ? `YOUR TURN · Turn ${b.turn}` : mine?.locked ? (() => { const w = humans.filter((h) => !h.locked && h.player_id !== b.me).map((h) => h.hero ?? h.name); return w.length ? `✓ Locked in · waiting for ${w.slice(0, 3).join(', ')}` : '✓ Locked in · resolving…'; })() : 'Waiting…'}
        </div>

        {multi && mine && (mine.afk ?? 0) >= 2 && b.step === 'input' && !mine.locked && <div className="rg-idle">Idle: you are auto-guarding. Act to rejoin; the team will not wait.</div>}
        {/* units */}
        {enemies.map((u, i) => (
          <Sprite action={active?.t} key={u.id} broken={!!dir.breaks[u.id]?.broken && u.hp > 0} pose={poseFor(u.id)} elNow={b.element} t3={use3d} u={u} lunge={lungeId === u.id && !(active?.t === 'dodge')} lungeTo={lungeVec(u)} floats={floatsFor(u)} style={ePos(i, enemies.length)} picked={tgtId === u.id}
            onPick={canAct && u.hp > 0 ? () => tapEnemy(u.id) : undefined} />
        ))}
        {heroes.map((u, i) => (
          <Sprite action={active?.t} key={u.id} pose={poseFor(u.id)} menu={u.player_id === b.me && mine && b.step === 'input' && canAct && !mine.locked ? <></> : undefined} win={won} mine={u.player_id === b.me} elNow={b.element} t3={use3d} u={u} lunge={lungeId === u.id && !(active?.t === 'dodge')} lungeTo={lungeVec(u)} floats={floatsFor(u)} style={hPos(i, heroes.length)} picked={target === u.id}
            onPick={((needsAlly && u.hp > 0) || (needsDown && u.hp <= 0)) && canAct ? () => pickUnit(u.id) : undefined} />
        ))}

        {dir.fx && <LetterVfx fx={dir.fx} w={stageEl.current?.clientWidth ?? 800} h={stageEl.current?.clientHeight ?? 450} />}
        {enemies.filter((u) => u.hp > 0 && posMap[u.id]).map((u) => { const br = dir.breaks[u.id]; const v = br?.v ?? 0; return (
          <div key={`brk-${u.id}`} className={`rg-brk${br?.broken ? ' on' : ''}`} style={{ left: `${posMap[u.id].x}%`, top: `${posMap[u.id].y + 17}%` }} title="Break meter">
            {Array.from({ length: breakMaxOf(u.name) }).map((_, i) => <i key={i} className={i < v ? 'f' : ''} />)}
            {br?.broken && <b>BROKEN</b>}
          </div>); })}
        </div>
        {dir.flash && <div className={`rg-cflash ${dir.flash.cls}`} key={`fl-${dir.flash.k}`} />}
        {dir.label && <div className={`rg-lab ${dir.label.cls}`} key={`lb-${dir.label.key}`}>{dir.label.big && <b>{dir.label.big}</b>}{dir.label.rank && <span className={`rk rk-${dir.label.rank}`}>{dir.label.rank} WORD</span>}{dir.label.tag && <small className="rg-ctag">{dir.label.tag}</small>}</div>}
        {dir.combo.n >= 2 && <div className="rg-combo" key={`cb-${dir.combo.k}`}>WORD COMBO <b>x{dir.combo.n}</b></div>}
        <BattleTutorial />
        {dir.intro && <div className={`rg-cintro ${dir.intro.kind}`} key={`in-${dir.intro.k}`}><i /><small>{dir.intro.kind === 'boss' ? 'BOSS' : dir.intro.kind === 'elite' ? 'ELITE' : 'BATTLE START'}</small>{dir.intro.kind !== 'normal' && <b>{dn(dir.intro.name)}</b>}{dir.intro.kind !== 'normal' && dir.intro.title && <em>{dir.intro.title}</em>}</div>}

        {/* bottom-left: party cards */}
        <div className="rg-party">
          {heroes.map((u) => {
            const hp = Math.max(0, Math.min(100, (u.hp / u.max_hp) * 100));
            const me = u.player_id === b.me;
            return (
              <button key={u.id} type="button" className={`rg-pc${me ? ' me' : ''}${u.hp <= 0 ? ' down' : ''}${target === u.id ? ' picked' : ''}`}
                onClick={((needsAlly && u.hp > 0) || (needsDown && u.hp <= 0)) && canAct ? () => pickUnit(u.id) : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={portrait(u)} alt="" draggable={false} />
                <span className="rg-pc-ult">{u.ult ?? 0}/6</span>
                <span className="rg-pc-hp"><i style={{ width: `${hp}%` }} /></span>
                <span className="rg-pc-n">{u.hero ?? u.name}{u.locked && u.hp > 0 ? ' ✓' : ''}{u.corruption > 0 ? ` ☠${u.corruption}` : ''}</span>
                <span className="rg-pc-v">{u.hp}</span>
              </button>
            );
          })}
        </div>

        {/* bottom-right: skills + ultimate */}
        {OLD_UI && mine && b.step === 'input' && (
          <div className="rg-skills">
            <small className="rg-lab">COMMAND</small>
            <button type="button" className={`rg-sk${pend?.kind === 'attack' ? ' sel' : ''}`} disabled={skillDisabled} onClick={chooseAttack}><b>⚔</b><em>Attack</em></button>
            <button type="button" className="rg-sk" disabled={skillDisabled} onClick={() => void doAction('guard', null)}><b>🛡</b><em>Guard</em></button>
            <button type="button" className={`rg-ult${ultReady ? ' ready' : ''}`} disabled={skillDisabled || !ultReady}
              onClick={() => void doAction('ult', enemies.find((e) => e.hp > 0)?.id ?? null)} title={ULT_NAME[mine.hero ?? ''] ?? 'Ultimate'}>
              {myHero && /* eslint-disable-next-line @next/next/no-img-element */ <img src={myHero.artFull} alt="" draggable={false} />}
              <span className="rg-ult-n">{mine.ult ?? 0}/6</span>
              <em>{ultReady ? (ULT_NAME[mine.hero ?? ''] ?? 'ULT') : 'ULT'}</em>
            </button>
          </div>
        )}
      </div>

      {mine && myHero && b.step === 'input' && (
        <CommandDeck sel={sel} setSel={(c) => { setSel(c); setPend(null); setMsg(''); }} canAct={canAct} status={deckStatus} hero={myHero.name} ult={mine.ult ?? 0} ultReady={ultReady}
          chips={chips} chipMode={chipMode} chipTitle={pend ? (pickingAlly ? 'Select an ally' : 'Select a target') : 'Select a target'}
          onChip={(id) => { if (pend) pickUnit(id); else { setTarget(id); setMsg(''); } }}
          confirmLabel={confirmLabel} onConfirm={onConfirm} confirmDisabled={confirmDisabled} onCancel={() => { setPend(null); setSel('attack'); setMsg(''); }}
          word={{ prompt: b.prompt, locked: b.locked, value: wordText, onChange: setWordText, mode: wordMode, onMode: setWordMode, msg: wordMsg } satisfies WordUi} skills={skillEntries} items={itemEntries} bookDisabled={!!b.book_used} party={partyRows} log={hudLog} round={b.turn} />
      )}

      {/* hand of cards + book */}
      {OLD_UI && b.step === 'input' && mine && (
        <div className="rg-hand">
          <small className="rg-lab">BOOK &amp; SPECIALS</small>
          <button type="button" className="rg-book" disabled={!!b.book_used || mine.hp <= 0} onClick={() => void openBook()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BOOK_ART} alt="" draggable={false} />
            <b>Book of Wisdom</b><small>{b.book_used ? 'Read this turn' : 'Answer fast → special'}</small>
          </button>
          {b.cards.length === 0 && <span className="muted small">No specials yet. Read the Book of Wisdom to get Special Attack, Guard or Heal.</span>}
          {b.cards.map((c, i) => (
            <button key={c + i} type="button" className={`rg-card${CARDS[c]?.rare ? ' rare' : ''}${pend?.kind === 'card' && pend.c === c ? ' sel' : ''}`} disabled={b.card_used || mine.hp <= 0}
              onClick={() => chooseCard(c)}>
              {myHero && /* eslint-disable-next-line @next/next/no-img-element */ <img src={myHero.artFull} alt="" draggable={false} />}
              <span className="rg-card-g">{CARDS[c]?.glyph ?? '🃏'}</span>
              <b>{CARDS[c]?.label ?? c}</b><small>{CARDS[c]?.hint}</small>
            </button>
          ))}
        </div>
      )}

      {b.step === 'input' ? null : (
        <div className={`rg-result rg-end ${b.step}${active ? " wait" : ""}`}>
          <div className="rg-end-title">{b.step === 'won' ? 'VICTORY' : 'DEFEAT'}</div>
          <h2>{b.step === 'won' ? 'The Government has fallen.' : 'Your party was wiped out… the IRS wins this round.'}</h2>
          {result ? (
            <>
              {result.lvl_after > result.lvl_before && <div className="rg-lvlup">LEVEL UP! {result.lvl_before} → {result.lvl_after}</div>}
              <div className="muted">+{result.xp} XP · Level {result.lvl_after}</div>
              <div className="xp-bar" style={{ width: '100%' }}><i style={{ width: `${Math.min(100, Math.round(((result.xp_after - result.level_floor) / Math.max(1, result.level_next - result.level_floor)) * 100))}%` }} /></div>
              <div className="rg-rgrid">
                <div><b>{result.dmg}</b><span>Damage</span></div><div><b>{result.healed}</b><span>Healing</span></div>
                <div><b>{result.crits}</b><span>Crits</span></div><div><b>{result.ults}</b><span>Ultimates</span></div>
                <div><b>{result.books}</b><span>Book answers</span></div>
              </div>
            </>
          ) : <div className="muted small">Tallying your performance…</div>}
          <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn lg" disabled={retrying || !!active} onClick={() => void retry(false)}>{b.step === 'won' ? 'Play again' : 'Try again'}</button>
            {b.step === 'lost' && b.stage > 1 && <button type="button" className="btn" disabled={retrying || !!active} onClick={() => void retry(true)}>Retry encounter {b.stage}</button>}
            <Link className="btn ghost" href={`/stats?from=${encodeURIComponent(`/room/${state.room.code}`)}`}>Stats</Link>
            <a className="btn ghost" href="/">Menu</a>
          </div>
        </div>
      )}

      {showLog && <div className="bt-log">{b.log.map((e, i) => <div key={i}>{logLine(e)}</div>)}</div>}

      {/* Book of Wisdom modal */}
      <AnimatePresence>
        {(book || bookOpenStage) && (
          <motion.div className="rg-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="rg-bookbox" initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="rg-bookbg" src={BOOK_ART} alt="" draggable={false} />
              <div className="rg-bookin">
                <h3>Book of Wisdom</h3>
                {book ? (
                  <form onSubmit={answerBook}>
                    <div className="rg-bookq">{book.prompt}</div>
                    <div className={`rg-booktimer${bookLeft <= 5 ? ' warn' : ''}`}><i style={{ width: `${(bookLeft / 15) * 100}%` }} /></div>
                    <div className="muted small center">{bookLeft}s left</div>
                    <input className="input" autoFocus autoComplete="off" autoCapitalize="none" value={bookWord} maxLength={24} placeholder="Answer…" onChange={(e) => setBookWord(e.target.value)} />
                    <button className="btn" disabled={!bookWord.trim()}>Answer ▸</button>
                    {bookMsg && <div className="muted small center">{bookMsg}</div>}
                  </form>
                ) : (
                  <div className="center"><p>{bookMsg}</p><button type="button" className="btn" onClick={() => { setBookOpenStage(false); setBookMsg(''); }}>Close</button></div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Act intro */}
      <AnimatePresence>
        {intro !== null && (
          <motion.div className="rg-intro" style={{ backgroundImage: `url(${PIXEL_BG[intro]})` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4, duration: 0.7 }}>
              <small>{['ACT ONE', 'ACT TWO', 'ACT THREE'][intro]}</small>
              <h1>{ACT_NAME[intro].split('· ')[1]}</h1>
              <p>Get ready…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

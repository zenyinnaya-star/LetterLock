'use client';

import { audio } from '@/lib/audio';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACT_BG, PIXEL_BG, ACT_NAME, BOOK_ART, ENEMY_SPRITE, HERO_SPRITE, HERO_BACK, HERO_WIN, HERO_STRIKE, HERO_CAST, ENEMY_STRIKE, actOf } from '@/lib/art';
import dynamic from 'next/dynamic';
import { Camp } from './Camp';
import { webglOk, type StageFx } from './Stage3D';
const Stage3D = dynamic(() => import('./Stage3D'), { ssr: false });
import { heroById, type HeroId } from '@/lib/heroes';
import { fetchStoryResult, type StoryResult } from '@/lib/profile';
import { rpc, type BattleLogEntry, type BattleState, type BattleUnit } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
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

const portrait = (u: BattleUnit) => (u.hero ? heroById(u.hero as HeroId)?.artFull : ENEMY_SPRITE[u.name]) ?? '';
const sprite = (u: BattleUnit, win?: boolean, pose?: 'strike' | 'cast') => (u.hero
  ? ((win ? HERO_WIN[u.hero] : pose === 'cast' ? HERO_CAST[u.hero] : pose === 'strike' ? HERO_STRIKE[u.hero] : undefined) ?? HERO_BACK[u.hero] ?? HERO_SPRITE[u.hero])
  : ((pose ? ENEMY_STRIKE[u.name] : undefined) ?? ENEMY_SPRITE[u.name])) ?? '';

const INTENT_ICON: Record<string, string> = { attack: '⚔', aoe: '💥', buff: '⬆', debuff: '🐌', heal: '✚', strike: '⚔', red_tape: '🔒', taxes: '☠', tax_season: '💥' };
const OLD_UI = false as boolean; // detached command bars replaced by the card menu
const EL: Record<string, string> = { fire: '🔥', ice: '❄️', storm: '⚡', earth: '⛰️', light: '✨', dark: '🌑' };

type Float = { k: string; text: string; cls: string };

function Sprite({ elNow, u, floats, picked, onPick, style, lunge, t3, mine, menu, win, pose }: { pose?: 'strike' | 'cast'; win?: boolean; menu?: React.ReactNode; elNow?: string; t3?: boolean; mine?: boolean; u: BattleUnit; floats: Float[]; picked: boolean; onPick?: () => void; style: React.CSSProperties; lunge?: boolean }) {
  const pct = Math.max(0, Math.min(100, (u.hp / u.max_hp) * 100));
  const hit = floats.some((f) => f.cls === 'dmg');
  return (
    <div className={`rg-unit ${u.side}${u.hp <= 0 ? ' down' : ''}${picked ? ' picked' : ''}${onPick ? ' pickable' : ''}${u.name === 'Government' ? ' boss' : ''}${t3 ? ' t3' : ''}${mine ? ' mine' : ''}${menu ? ' lift' : ''}${hit ? ' ouch' : ''}${floats.some((f) => f.text === 'DODGE') ? ' dodged' : ''}${floats.some((f) => f.cls.includes('heal')) ? ' healed' : ''}${floats.some((f) => f.cls.includes('shield')) ? ' shielded' : ''}${lunge ? ' striking' : ''}${win && u.hp > 0 ? ' cheer' : ''}`}
      style={{ ...style, ['--idle' as string]: `${-((u.id.charCodeAt(0) + u.id.charCodeAt(3)) % 17) / 10}s` }} onClick={onPick} role={onPick ? 'button' : undefined}>
      <motion.div key={`${lunge ? 'l' : hit ? 'h' : 'i'}-${floats[0]?.k ?? ''}`}
        animate={lunge ? { x: [0, u.side === 'hero' ? 90 : -90, 0], scale: [1, 1.12, 1] } : hit ? { x: [0, -10, 10, -6, 0], filter: ['brightness(2.2)', 'brightness(1)'] } : {}}
        transition={{ duration: lunge ? 0.5 : 0.4 }}>
        <div className="rg-uc">
          {u.hp > 0 && u.intent && <span className={`rg-intent i-${u.intent}`} title={`Next: ${u.intent}`}>{INTENT_ICON[u.intent] ?? '⚔'}</span>}
          {u.hp > 0 && (u.haste ?? 0) !== 0 && <span className={`rg-haste ${(u.haste ?? 0) > 0 ? 'up' : 'dn'}`} title={(u.haste ?? 0) > 0 ? 'Hasted: acts earlier' : 'Slowed: acts later'}>{(u.haste ?? 0) > 0 ? '⚡' : '🐌'}</span>}
          <span className="rg-uc-tag">{mine ? 'YOU' : u.side === 'hero' ? (u.hero ?? 'HERO') : u.name === 'Government' ? 'BOSS' : 'FOE'}</span>
          <KeyedImg className="rg-img" src={sprite(u, win, pose)} alt={u.name} />
          <span className="rg-uname">{u.name}{u.corruption > 0 ? ` ☠${u.corruption}` : ''}</span>
          <span className="rg-uc-hp"><span className="rg-ehp"><motion.u animate={{ width: `${pct}%` }} transition={{ duration: 1.1, delay: 0.35 }} /><motion.i animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} /></span><b>{u.hp}</b></span>
          {hit && <span className="rg-slash" key={floats[0]?.k} />}
          {u.side === 'enemy' && (u.weak_el || u.res_el) && u.hp > 0 && <span className="rg-el">{u.weak_el && <b title={`Weak to ${u.weak_el}`} className={u.weak_el === elNow ? 'hot' : ''}>{EL[u.weak_el]}▼</b>}{u.res_el && <i title={`Resists ${u.res_el}`}>{EL[u.res_el]}✕</i>}</span>}
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

export function Battle({ state, token, act, fallback }: { state: RoomState; token: string | null; act: Act; fallback?: React.ReactNode }) {
  const [b, setB] = useState<BattleState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pend, setPend] = useState<{ kind: 'attack' } | { kind: 'card'; c: string } | null>(null);
  const [oddsCalled, setOddsCalled] = useState(false);
  const [spOpen, setSpOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [left, setLeft] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [intro, setIntro] = useState<number | null>(null);
  const seenAct = useRef(-1);
  const stepped = useRef(-1);
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
    if (!over || !token) return;
    let n = 0; const go = () => void fetchStoryResult(token).then((r) => { if (r) setResult(r); else if (n++ < 5) setTimeout(go, 1200); });
    go();
  }, [over, token]);

  const load = useCallback(async () => {
    if (!token) return;
    try { setB(await rpc.getBattle(token)); } catch { /* ignore */ }
    setLoaded(true);
  }, [token]);

  useEffect(() => { void load(); }, [load, state.room.state_version]);
  useEffect(() => { const i = setInterval(() => void load(), 3000); return () => clearInterval(i); }, [load]);

  const mine = b?.units.find((u) => u.player_id === b.me);
  useEffect(() => { if (mine?.hero) { try { localStorage.setItem('letterlock:hero', mine.hero); } catch { /* ignore */ } } }, [mine?.hero]);
  const turn = b?.turn ?? 0;
  useEffect(() => { setMsg(''); setPend(null); setOddsCalled(false); setSpOpen(false); setItemOpen(false); }, [turn]);

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

  useEffect(() => {
    if (!b || b.step !== 'input') return;
    const tick = () => setLeft(Math.max(0, Math.ceil((new Date(b.ends_at).getTime() - Date.now()) / 1000)));
    tick();
    const i = setInterval(tick, 250);
    return () => clearInterval(i);
  }, [b]);

  useEffect(() => {
    if (!b || b.step !== 'input' || !token || intro !== null) return;
    const enemiesAlive = b.units.some((u) => u.side === 'enemy' && u.hp > 0);
    const allLocked = b.units.filter((u) => u.side === 'hero' && u.hp > 0).every((u) => u.locked);
    // once I've locked in, nudge the server on every change: it resolves as soon as every *present, active* player is in
    const go = allLocked || left <= 0 || !enemiesAlive || !!mine?.locked;
    const key = b.turn * 100000 + (allLocked || left <= 0 || !enemiesAlive ? 99999 : b.version % 99999);
    if (go && stepped.current !== key) {
      stepped.current = key;
      const id = setTimeout(() => { void rpc.battleStep(token, b.turn).then(load).catch(() => {}); }, allLocked ? 400 : 300);
      return () => clearTimeout(id);
    }
  }, [b, left, token, load, intro, mine?.locked]);

  // timer expired: keep nudging the server until the turn resolves (an early no-op from clock skew must not stall the fight)
  useEffect(() => {
    if (!b || b.step !== 'input' || !token || intro !== null || left > 0) return;
    const id = setInterval(() => { void rpc.battleStep(token, b.turn).then(load).catch(() => {}); }, 1500);
    return () => clearInterval(id);
  }, [b?.step, b?.turn, left, token, load, intro]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const delay = (e: BattleLogEntry) => (e.t === 'crit' || e.t === 'ult' || e.t === 'limit' ? 1150 : (e.ai && enemyIds.has(e.ai)) ? 450 : 650);
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

  if (loaded && !b) return <>{fallback ?? null}</>;
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
  const lead = enemies.find((e) => e.name === 'Government') ?? enemies.find((e) => e.name === 'The Collector') ?? enemies.find((e) => e.name === 'The Commissioner') ?? enemies[0];
  const leadPct = lead ? Math.max(0, Math.round((lead.hp / lead.max_hp) * 100)) : 0;
  const ultReady = (mine?.ult ?? 0) >= 6;
  const ai = actOf(b.stage);
  const myHero = mine?.hero ? heroById(mine.hero as HeroId) : null;
  const needsEnemy = !!pend && (pend.kind === 'attack' || pend.c === 'sp_attack');
  const needsAlly = pend?.kind === 'card' && pend.c === 'sp_heal';
  const needsDown = pend?.kind === 'card' && pend.c === 'revive';

  // enemy field layout: spread across the right half, staggered rows
  const ePos = (i: number, n: number): React.CSSProperties => {
    // one clean row across the upper-right two thirds, evenly spaced
    const x = n === 1 ? 52 : 40 + (i * 52) / (n - 1);
    return { left: `${x}%`, top: '40%', zIndex: 10 };
  };
  // heroes: one even row along the lower-left, same baseline
  const hPos = (i: number, n: number): React.CSSProperties => ({ left: `${n === 1 ? 22 : 10 + (i * 34) / (n - 1)}%`, top: '74%', zIndex: 20 });

  const posMap: Record<string, { x: number; y: number }> = {};
  enemies.forEach((u, i) => { const p = ePos(i, enemies.length); posMap[u.id] = { x: parseFloat(String(p.left)), y: parseFloat(String(p.top)) }; });
  heroes.forEach((u, i) => { const p = hPos(i, heroes.length); posMap[u.id] = { x: parseFloat(String(p.left)), y: parseFloat(String(p.top)) }; });

  async function doAction(kind: 'attack' | 'guard' | 'ult', tgt: string | null) {
    if (!token || !canAct) return;
    const r = await act(() => rpc.battleSubmit(token, '', kind, tgt));
    if (!r) return;
    if (!r.ok) setMsg('Invalid.');
    else { setMsg(kind === 'attack' ? 'Attack locked in' : kind === 'guard' ? 'Guarding' : 'Ultimate locked in'); setPend(null); void load(); }
  }
  async function playCard(c: string, tgt: string | null) {
    if (!token) return;
    const r = await act(() => rpc.battlePlay(token, c, tgt));
    setPend(null); setSpOpen(false); setItemOpen(false);
    if (r) void load();
  }
  // tap on a unit while something is waiting for a target
  function pickUnit(id: string) {
    if (!pend || !canAct) return;
    setTarget(id);
    if (pend.kind === 'attack') void doAction('attack', id);
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

  const cardMenu = mine ? (
    <div className="rg-cm" onClick={(e) => e.stopPropagation()}>
      {itemOpen ? (<>
        {b.cards.filter((c) => ITEM_CARDS.includes(c)).length === 0 && <span className="rg-cm-empty">No items. Buy potions at camp or read the Book of Wisdom.</span>}
        {b.cards.map((c, i) => ITEM_CARDS.includes(c) && (
          <button key={c + i} type="button" className={`rg-cmb${pend?.kind === 'card' && pend.c === c ? ' sel' : ''}`} disabled={!canAct || b.card_used} title={CARDS[c]?.hint} onClick={() => chooseCard(c)}><i>▶</i>{c === 'sp_heal' ? 'Healing Potion' : c === 'revive' ? 'Revive Potion' : CARDS[c]?.label ?? c}</button>
        ))}
        <button type="button" className="rg-cmb back" onClick={() => { setItemOpen(false); setPend(null); }}><i>◀</i>Back</button>
      </>) : !spOpen ? (<>
        <button type="button" className="rg-cmb" disabled={!canAct} onClick={() => { setSpOpen(false); chooseAttack(); }}><i>▶</i>Attack</button>
        <button type="button" className="rg-cmb" disabled={!canAct} onClick={() => void doAction('guard', null)}><i>▶</i>Guard</button>
        <button type="button" className="rg-cmb ult" disabled={!canAct || !ultReady} onClick={() => { if (!tgtId) needTarget(); else void doAction('ult', tgtId); }}><i>▶</i>{ULT_NAME[mine.hero ?? ''] ?? 'Ultimate'}<em>{ultReady ? 'READY' : `${mine.ult ?? 0}/6`}</em></button>
        <button type="button" className="rg-cmb" disabled={!canAct || !!b.book_used} onClick={() => void openBook()}><i>▶</i>Book of Wisdom</button>
        <button type="button" className="rg-cmb" disabled={!canAct} onClick={() => setItemOpen(true)}><i>▶</i>Item<em>{b.cards.filter((c) => ITEM_CARDS.includes(c)).length}</em></button>
        {b.cards.some((c) => !ITEM_CARDS.includes(c)) && <button type="button" className="rg-cmb" disabled={!canAct} onClick={() => setSpOpen(true)}><i>▶</i>Specials<em>{b.cards.filter((c) => !ITEM_CARDS.includes(c)).length}</em></button>}
        {(b.momentum ?? 0) >= 100 && <button type="button" className="rg-cmb odds" disabled={!canAct || oddsCalled} onClick={() => void callOdds()}><i>★</i>{oddsCalled ? 'Odds locked' : 'Unleash Odds!'}</button>}
      </>) : (<>
        {b.cards.map((c, i) => !ITEM_CARDS.includes(c) && (
          <button key={c + i} type="button" className={`rg-cmb${pend?.kind === 'card' && pend.c === c ? ' sel' : ''}`} disabled={!canAct || b.card_used} onClick={() => chooseCard(c)}><i>▶</i>{CARDS[c]?.label ?? c}</button>
        ))}
        <button type="button" className="rg-cmb back" onClick={() => setSpOpen(false)}><i>◀</i>Back</button>
      </>)}
    </div>
  ) : undefined;

  const skillDisabled = !canAct;

  return (
    <div className={`rg${active?.t === 'limit' ? ' lb' : ''}`}>
      <div className={`rg-stage${use3d ? ' t3' : ''}`} data-boss={lead?.name === 'Government' ? 1 : 0} data-foes={aliveEnemies.length <= 1 ? 1 : 0}>
        <div className="rg-bg" style={{ backgroundImage: `url(${PIXEL_BG[ai]})` }} />
        {use3d && <Stage3D act={ai} fx={fx} pos={posMap}
          units={b.units.map((u) => ({ id: u.id, side: u.side, name: u.name, hero: u.hero, dead: u.hp <= 0 }))}
          pickedId={target} pickableIds={b.units.filter((u) => u.hp > 0 && ((needsEnemy && u.side === 'enemy') || (needsAlly && u.side === 'hero')) && canAct).map((u) => u.id)} />}
        <div className="rg-vig" />

        {/* top-left: turn order */}
        <div className="rg-order" aria-label="Turn order">
          <span className="rg-rd">{b.turn}<small>/{b.stages * 5}</small></span>
          {orderUnits.slice(0, 7).map((u, i) => (
            <div key={u.id} className={`rg-ord ${u.side}${i === 0 ? ' first' : ''}`} title={u.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portrait(u)} alt={u.name} draggable={false} />
            </div>
          ))}
        </div>

        {/* top-center: boss bar */}
        {lead && (
          <div className="rg-boss">
            <div className="rg-boss-name"><b>{lead.name}</b><span>{leadPct}%</span></div>
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
          {(tgtUnit ?? lead) && (() => { const e = (tgtUnit ?? lead)!; const p = Math.max(0, Math.min(100, (e.hp / e.max_hp) * 100)); return (
            <div className="rg-tgt"><b>{e.name}</b><span className="rg-tgt-bar"><motion.i animate={{ width: `${p}%` }} transition={{ duration: 0.4 }} /></span><em>{Math.max(0, e.hp)} / {e.max_hp}</em></div>
          ); })()}
        </div>

        {/* element banner */}
        <div className="rg-prompt">
          <div className="rg-prompt-t">{b.element ? <><span className="rg-elchip">{EL[b.element]}</span> {b.element.toUpperCase()} turn · hit weaknesses for ×1.5</> : 'Choose your move'}</div>
        </div>

        {active && <div className={`rg-ban ${active.t === 'ult' ? 'ult' : active.t === 'crit' ? 'crit' : enemies.some((e) => e.name === active.a) ? 'e' : ''}`} key={`${active.t}-${active.a}-${active.n}-${b.version}`}><span>{logLine(active)}</span></div>}
        <div className={`rg-mom${(b.momentum ?? 0) >= 100 ? ' full' : ''}`} title="Odds: each basic attack +1, each special +3 (scaled by party size). When full, unleash the Limit Break.">
          <em>ODDS</em>
          <span><i style={{ width: `${Math.min(100, b.momentum ?? 0)}%` }} /></span>
          <b>{Math.min(10, Math.floor((b.momentum ?? 0) / 10))}/10</b>
        </div>
        {OLD_UI && mine && b.step === 'input' && (b.momentum ?? 0) >= 100 && mine.hp > 0 && (
          <button type="button" className="rg-oddsbtn" disabled={oddsCalled} onClick={() => void callOdds()}>{oddsCalled ? 'ODDS LOCKED IN' : 'UNLEASH ODDS!'}</button>
        )}
        {active?.t === 'stage' && <div className="rg-clear" key={`cl-${b.version}`}><div className="rg-clear-flash" /><b>ENCOUNTER CLEARED</b><small>+{30 + 10 * (Number(active.n ?? 2) - 1)}+ XP (quick clears earn more) · the path opens…</small></div>}
        {(active?.t === 'ult' || active?.t === 'limit') && <><div className="rg-lbflash" key={`lf-${b.version}`} /><div className="rg-burst crit" key={`lb-${b.version}`}>LIMIT BREAK!</div></>}
        {active && (active.x === 'weak' || active.x === 'resist') && <div className={`rg-burst ${active.x === 'weak' ? 'crit' : 'miss'}`} key={`wk-${b.version}-${active.a}-${active.n}`}>{active.x === 'weak' ? 'WEAKNESS!' : 'RESIST'}</div>}
        {active && !active.x && active.t !== 'limit' && (active.t === 'miss' || active.t === 'dodge' || active.t === 'crit' || active.t === 'ult') && <div className={`rg-burst ${active.t}`} key={`bu-${active.t}-${active.a}-${b.version}`}>{active.t === 'miss' ? 'MISS' : active.t === 'dodge' ? 'DODGE' : active.t === 'crit' ? 'CRITICAL!' : 'ALL-OUT!'}</div>}

        <div className={`rg-turn${active ? ' play' : canAct ? ' mine' : ' wait'}`} key={active ? 'p' : canAct ? `m${b.turn}` : 'w'}>
          {active ? (active.a && enemies.some((e) => e.name === active.a) ? '⚔ Enemies attack…' : '⚔ Resolving the turn…')
            : mine && mine.hp <= 0 ? 'You are down' : canAct ? `YOUR TURN · Turn ${b.turn}` : mine?.locked ? 'Locked in · waiting for the team' : 'Waiting…'}
        </div>

        {mine && (mine.afk ?? 0) >= 2 && b.step === 'input' && !mine.locked && <div className="rg-idle">You've been idle, so you're auto-guarding. Cast a word to rejoin. The team won't wait for idle players.</div>}
        {/* units */}
        {enemies.map((u, i) => (
          <Sprite key={u.id} pose={poseFor(u.id)} elNow={b.element} t3={use3d} u={u} lunge={lungeId === u.id && !(active?.t === 'dodge')} floats={floatsFor(u)} style={ePos(i, enemies.length)} picked={tgtId === u.id}
            onPick={canAct && u.hp > 0 ? () => tapEnemy(u.id) : undefined} />
        ))}
        {heroes.map((u, i) => (
          <Sprite key={u.id} pose={poseFor(u.id)} menu={u.player_id === b.me && mine && b.step === 'input' && canAct && !mine.locked ? <></> : undefined} win={won} mine={u.player_id === b.me} elNow={b.element} t3={use3d} u={u} lunge={lungeId === u.id && !(active?.t === 'dodge')} floats={floatsFor(u)} style={hPos(i, heroes.length)} picked={target === u.id}
            onPick={((needsAlly && u.hp > 0) || (needsDown && u.hp <= 0)) && canAct ? () => pickUnit(u.id) : undefined} />
        ))}

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

      {mine && myHero && (
        <div className="rg-bottom">
        {b.step === 'input' && (
          <div className={`rg-cmd${canAct ? '' : ' lock'}`}>
            <div className="rg-cmd-h">{canAct ? (needsAlly || needsDown ? 'Tap an ally' : tgtUnit ? `Target: ${tgtUnit.name}` : 'Tap an enemy to target') : active ? 'Enemy turn…' : mine.hp <= 0 ? 'Down' : mine.locked ? 'Waiting…' : '…'}</div>
            {cardMenu}
          </div>
        )}
        <div className={`rg-hud${mine.hp <= 0 ? ' down' : ''}`}>
          <div className="rg-hud-id">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={myHero.artFull} alt="" draggable={false} />
          </div>
          <div className="rg-hud-hp">
            <div className="rg-hud-name"><b>{myHero.name}</b><span>{myHero.role}</span><em>ULT {mine.ult ?? 0}/6</em></div>
            <div className="rg-hud-bar">
              <motion.u animate={{ width: `${Math.max(0, Math.min(100, ((heroes.find((x) => x.id === mine.id)?.hp ?? mine.hp) / mine.max_hp) * 100))}%` }} transition={{ duration: 1.2, delay: 0.35 }} />
              <motion.i animate={{ width: `${Math.max(0, Math.min(100, ((heroes.find((x) => x.id === mine.id)?.hp ?? mine.hp) / mine.max_hp) * 100))}%` }} transition={{ duration: 0.35 }} />
              <strong>{Math.max(0, heroes.find((x) => x.id === mine.id)?.hp ?? mine.hp)} / {mine.max_hp}</strong>
            </div>
            <div className="rg-hud-ult"><em>ULT</em><span><i style={{ width: `${Math.min(100, ((mine.ult ?? 0) / 6) * 100)}%` }} /></span></div>
            <div className="rg-hud-sub">{mine.shield ? <span>🛡 {mine.shield}</span> : null}{mine.corruption > 0 ? <span>☠ {mine.corruption}</span> : null}<span>{b.step !== 'input' ? 'Resolving…' : mine.hp <= 0 ? 'Down' : mine.locked ? (msg || 'Locked in') : canAct ? (pend ? `Tap ${needsAlly ? 'an ally' : 'an enemy'}` : 'Your command') : 'Waiting…'}</span></div>
          </div>
        </div>
        </div>
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

      {b.step === 'input' ? (
        <div className="rg-panel">
          {mine && mine.hp <= 0 ? <div className="muted center">You&apos;re down. Your team fights on…</div> : mine?.locked ? (
            <div className="muted center">{msg || 'Locked in'}. Waiting for the team…</div>
          ) : (
            <div className="muted center">{pend ? `Tap ${needsAlly ? 'an ally' : 'an enemy'} to ${pend.kind === 'attack' ? 'attack it' : 'use ' + (CARDS[pend.c]?.label ?? 'it')}` : 'Tap an enemy, then choose a command'}</div>
          )}
          {msg && !mine?.locked && <div className="muted small center">{msg}</div>}
        </div>
      ) : (
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
          <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
            <Link className="btn" href={`/stats?from=${encodeURIComponent(`/room/${state.room.code}`)}`}>Stats</Link>
            <a className="btn ghost" href="/">Back to menu</a>
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

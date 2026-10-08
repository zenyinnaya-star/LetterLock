'use client';
// Combat director: turns each resolved log entry into CombatEvents on the bus, and lets the
// animation / camera / VFX / audio / UI controllers react. Battle.tsx only feeds it data.
import { useEffect, useRef, useState } from 'react';
import type { BattleLogEntry, BattleUnit } from '@/lib/rpc';
import { audio } from '@/lib/audio';
import { CombatBus, eventsFor, type CombatEvent } from '@/lib/combat/events';
import { CameraDirector } from '@/lib/combat/camera';
import { scoreWord, isLong, isRare, type WordScore } from '@/lib/combat/score';
import type { CameraPreset } from '@/lib/combat/registry';
import { DEFAULT_PROFILE, ENEMY_PROFILE, HERO_PROFILE } from '@/lib/combat/profiles';

export type LetterFx = { key: string; kind: 'pop' | 'orbit' | 'streak' | 'fill' | 'shatter'; word: string; glow?: string; core?: string; from: { x: number; y: number }; to: { x: number; y: number }; };
export type Label = { key: string; big?: string; cls: string; rank?: string; tag?: string };
export const BREAK_MAX = 6; // default; enemies override via ENEMY_PROFILE
export const breakMaxOf = (name?: string) => (name && ENEMY_PROFILE[name]?.breakMax) || BREAK_MAX;

type Pos = Record<string, { x: number; y: number }>;
type In = { active: BattleLogEntry | null; units: BattleUnit[]; pos: Pos; stage: number; foe?: string; boss: boolean; elite: boolean; version: number };

export function useCombatDirector(inp: In) {
  const bus = useRef(new CombatBus()).current;
  const cam = useRef(new CameraDirector()).current;
  const camEl = useRef<HTMLDivElement | null>(null);
  const latest = useRef(inp); latest.current = inp;
  const [combo, setCombo] = useState({ n: 0, k: 0 });
  const [label, setLabel] = useState<Label | null>(null);
  const [fx, setFx] = useState<LetterFx | null>(null);
  const [flash, setFlash] = useState<{ k: number; cls: string } | null>(null);
  const [breaks, setBreaks] = useState<Record<string, { v: number; broken: boolean }>>({});
  const [intro, setIntro] = useState<{ k: number; kind: 'normal' | 'elite' | 'boss'; name: string; title?: string } | null>(null);
  const comboRef = useRef(0); const brkRef = useRef<Record<string, { v: number; broken: boolean }>>({});
  const seq = useRef(0); const introFor = useRef(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  // battle intro: once per encounter
  useEffect(() => {
    const { stage, foe, boss, elite } = latest.current;
    if (!foe || introFor.current === stage) return;
    introFor.current = stage;
    brkRef.current = {}; setBreaks({}); comboRef.current = 0; setCombo({ n: 0, k: 0 });
    const kind = boss ? 'boss' : elite ? 'elite' : 'normal';
    cam.intro(kind);
    bus.emit({ type: 'BATTLE_INTRO', data: { kind } });
    setIntro({ k: ++seq.current, kind, name: foe, title: ENEMY_PROFILE[foe]?.title });
    later(() => setIntro(null), kind === 'boss' ? 3600 : kind === 'elite' ? 2400 : 1500);
    if (kind !== 'normal') audio.file(kind === 'boss' ? 'siren' : 'metal-clang', 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inp.stage, inp.foe]);

  // controllers subscribe once
  useEffect(() => {
    const off = [
      // CAMERA
      bus.on('*', (e) => {
        const { pos } = latest.current;
        const from = e.actorId ? pos[e.actorId] : undefined, to = e.targetId ? pos[e.targetId] : undefined;
        const ctx = { from, to };
        const go = (p: CameraPreset) => cam.play(p, ctx);
        if (e.type === 'ULTIMATE_STARTED') { go('ULTIMATE_INTRO'); later(() => go('ULTIMATE_ATTACK'), 1100); }
        else if (e.type === 'BREAK_TRIGGERED') later(() => go('BREAK'), 250);
        else if (e.type === 'CRITICAL_HIT') go('CRITICAL');
        else if (e.type === 'WEAKNESS_HIT') go('HEAVY_ATTACK');
      }),
      // AUDIO
      bus.on('WEAKNESS_HIT', () => audio.file('metal-clang', 120, 0.7)),
      bus.on('WORD_LONG', (e) => { if (e.heroSide) audio.file('mystical-harp', 80, 0.5); }),
      bus.on('COMBO_INCREASED', (e) => { if ((e.amount ?? 0) >= 3) audio.file('coin-swipe', 60, 0.6); }),
      bus.on('BREAK_TRIGGERED', () => { audio.file('cannon', 100, 0.9); audio.gong(); }),
      bus.on('ULTIMATE_STARTED', () => audio.file('mystical-harp', 0, 0.8)),
    ];
    return () => { off.forEach((f) => f()); timers.current.forEach(clearTimeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // feed every resolved log entry through the bus
  useEffect(() => {
    const { active: e, units, pos } = latest.current;
    if (!e) return;
    const evs = eventsFor(e, units);
    const has = (t: CombatEvent['type']) => evs.find((x) => x.type === t);
    const hero = evs.some((x) => x.heroSide);
    const word = e.w ? e.w.toUpperCase() : undefined;
    const actor = evs[0]?.actorId ?? units.find((u) => u.name === e.a)?.id;
    const target = evs[0]?.targetId;
    const prof = HERO_PROFILE[units.find((u) => u.id === actor)?.hero ?? ''] ?? DEFAULT_PROFILE;
    cam.style = prof.cam;

    // an enemy acting ends its Break
    const actingFoe = units.find((u) => u.id === (e.ai ?? actor) && u.side === 'enemy');
    if (actingFoe && brkRef.current[actingFoe.id]?.broken) { brkRef.current = { ...brkRef.current, [actingFoe.id]: { v: 0, broken: false } }; setBreaks(brkRef.current); }

    // COMBO
    const correct = has('WORD_CORRECT') && hero, wrong = has('WORD_INCORRECT');
    if (correct) { comboRef.current += 1; setCombo({ n: comboRef.current, k: ++seq.current }); bus.emit({ type: 'COMBO_INCREASED', amount: comboRef.current, heroSide: true }); }
    else if (wrong) { comboRef.current = 0; setCombo({ n: 0, k: ++seq.current }); }

    // BREAK meter
    let broke = false;
    const foe = units.find((u) => u.id === target && u.side === 'enemy');
    if (foe && hero && has('DAMAGE_DEALT') && (correct || has('CRITICAL_HIT') || has('ULTIMATE_SUCCESS'))) {
      const pts = 1 + (has('WORD_LONG') ? 1 : 0) + (has('WORD_RARE') ? 1 : 0) + (has('WEAKNESS_HIT') ? 2 : 0) + (has('CRITICAL_HIT') ? 3 : 0) + (has('ULTIMATE_SUCCESS') ? 3 : 0)
        + prof.breakBonus({ long: !!has('WORD_LONG'), rare: !!has('WORD_RARE'), weak: !!has('WEAKNESS_HIT'), crit: !!has('CRITICAL_HIT'), len: (word ?? '').length });
      const max = breakMaxOf(foe.name);
      const cur = brkRef.current[foe.id] ?? { v: 0, broken: false };
      if (!cur.broken) {
        const v = Math.min(max, cur.v + pts);
        broke = v >= max;
        brkRef.current = { ...brkRef.current, [foe.id]: { v, broken: broke } };
        setBreaks(brkRef.current);
        if (broke) bus.emit({ type: 'BREAK_TRIGGERED', actorId: actor, targetId: foe.id, heroSide: true });
      }
    }
    evs.forEach((x) => bus.emit(x));

    // normal swing for plain hits (bigger presets already fired from the bus)
    if (!has('CRITICAL_HIT') && !has('WEAKNESS_HIT') && !has('ULTIMATE_STARTED') && (has('DAMAGE_DEALT') || has('DAMAGE_RECEIVED'))) {
      const f = actor ? pos[actor] : undefined, t = target ? pos[target] : undefined;
      cam.play('ATTACK_SWING', { from: f, to: t });
    }

    // UI label: only the single most important result
    const wctx = { long: isLong(word), rare: isRare(word), weak: !!has('WEAKNESS_HIT'), crit: !!has('CRITICAL_HIT'), len: (word ?? '').length };
    const classBonus = hero ? prof.scoreBonus(wctx) : 0;
    const classTag = hero && correct ? prof.tag?.(wctx) : undefined;
    const sc: WordScore = scoreWord({ word, ok: !!correct, crit: !!has('CRITICAL_HIT'), weak: !!has('WEAKNESS_HIT'), ult: !!has('ULTIMATE_STARTED'), combo: comboRef.current, classBonus });
    const k = `${++seq.current}`;
    const rank = hero && correct && ['B', 'A', 'S', 'SS'].includes(sc.rank) ? sc.rank : undefined;
    if (broke) setLabel({ key: k, big: 'BREAK!', cls: 'brk', rank, tag: classTag });
    else if (has('ULTIMATE_STARTED')) setLabel({ key: k, big: prof.ult, cls: 'ult', rank, tag: classTag });
    else if (has('CRITICAL_HIT')) setLabel({ key: k, big: 'CRITICAL', cls: 'crit', rank, tag: classTag });
    else if (has('WEAKNESS_HIT')) setLabel({ key: k, big: 'WEAKNESS', cls: 'weak', rank, tag: classTag });
    else if (rank || classTag) setLabel({ key: k, cls: 'rank', rank, tag: classTag });
    else setLabel(null);

    // screen flash + letter VFX (the game's visual language)
    setFlash(has('CRITICAL_HIT') || has('ULTIMATE_STARTED') || broke ? { k: ++seq.current, cls: broke ? 'brk' : has('ULTIMATE_STARTED') ? 'ult' : 'crit' } : null);
    const a = actor ? pos[actor] : undefined, t = target ? pos[target] : undefined;
    if (hero && word && a) {
      const tp = t ?? { x: 55, y: 40 };
      const kind: LetterFx['kind'] = has('ULTIMATE_STARTED') ? 'fill' : has('CRITICAL_HIT') ? 'streak' : (has('WORD_LONG') || has('WORD_RARE')) ? 'orbit' : prof.popKind;
      setFx({ key: k, kind, word, glow: prof.glow, core: prof.core, from: a, to: tp });
    } else if (broke && t) setFx({ key: k, kind: 'shatter', word: 'BREAK', from: t, to: t });
    else setFx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inp.active]);

  return { camEl, cam, combo, label, fx, flash, breaks, intro };
}

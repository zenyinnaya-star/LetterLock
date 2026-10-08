'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { StageFx } from '@/components/Stage3D';
const Stage3D = dynamic(() => import('@/components/Stage3D'), { ssr: false });

const units = [
  { id: 'h1', side: 'hero' as const, name: 'Shiro', hero: 'Shiro', dead: false },
  { id: 'h2', side: 'hero' as const, name: 'Nero', hero: 'Nero', dead: false },
  { id: 'h3', side: 'hero' as const, name: 'Kira', hero: 'Kira', dead: false },
  { id: 'h4', side: 'hero' as const, name: 'Mira', hero: 'Mira', dead: false },
  { id: 'e1', side: 'enemy' as const, name: 'Intern Auditor', hero: null, dead: false },
  { id: 'e2', side: 'enemy' as const, name: 'The Collector', hero: null, dead: false },
  { id: 'e3', side: 'enemy' as const, name: 'Tax Drone', hero: null, dead: false },
];
const pos: Record<string, { x: number; y: number }> = {
  h1: { x: 14, y: 66 }, h2: { x: 24, y: 78 }, h3: { x: 33, y: 66 }, h4: { x: 42, y: 78 },
  e1: { x: 56, y: 42 }, e2: { x: 72, y: 56 }, e3: { x: 88, y: 42 },
};
export default function Demo() {
  const [act, setAct] = useState(0);
  const [fx, setFx] = useState<StageFx>(null);
  const [n, setN] = useState(0);
  const go = (f: Omit<NonNullable<StageFx>, 'key'>) => { setN(n + 1); setFx({ key: 'k' + n, ...f }); };
  const [gov, setGov] = useState(false);
  const us = gov ? [...units.slice(0, 4), { id: 'e1', side: 'enemy' as const, name: 'Government', hero: null, dead: false }] : units;
  const p = gov ? { ...pos, e1: { x: 66, y: 46 } } : pos;
  return (
    <div style={{ padding: 8 }}>
      <div className="rg-stage t3" style={{ height: '70vh' }}>
        <Stage3D act={act} fx={fx} pos={p} units={us} pickedId={null} pickableIds={[]} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <button onClick={() => go({ type: 'hit', actor: 'h1', target: 'e1', hurt: ['e1'], heal: [], guard: [] })}>Shiro hits</button>
        <button onClick={() => go({ type: 'crit', actor: 'h2', target: 'e2', hurt: ['e2'], heal: [], guard: [] })}>Nero crit</button>
        <button onClick={() => go({ type: 'ult', actor: 'h3', target: 'e3', hurt: ['e1', 'e2', 'e3'], heal: [], guard: [] })}>Ult</button>
        <button onClick={() => go({ type: 'heal', actor: 'h4', target: 'h1', hurt: [], heal: ['h1'], guard: [] })}>Heal</button>
        <button onClick={() => go({ type: 'ehit', actor: 'e1', target: 'h1', hurt: ['h1'], heal: [], guard: [] })}>Enemy hits</button>
        <button onClick={() => go({ type: 'e_aoe', actor: 'e2', hurt: ['h1', 'h2', 'h3', 'h4'], heal: [], guard: [] })}>Enemy AoE</button>
        {[0, 1, 2].map((a) => <button key={a} onClick={() => setAct(a)}>Act {a + 1}</button>)}
        <button onClick={() => setGov(!gov)}>Boss</button>
      </div>
    </div>
  );
}

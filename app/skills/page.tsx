'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Branch = 'power' | 'resolve' | 'wit' | 'path';
interface Node { id: string; branch: Branch; name: string; desc: string; x: number; y: number; req: string[]; big?: boolean; cost: number }

const BR: Record<Branch, { label: string; color: string; sub: string }> = {
  power: { label: 'POWER', color: '#f87171', sub: 'Hit harder, crit more' },
  resolve: { label: 'RESOLVE', color: '#38bdf8', sub: 'Shields, healing, endurance' },
  wit: { label: 'WIT', color: '#fbbf24', sub: 'Words, cards, the Book' },
  path: { label: 'PATHWAY', color: '#c084fc', sub: 'Ultimates and specials' },
};

// Hand-laid web. Root at (500,880). Each branch fans out; "big" nodes are keystones.
const N: Node[] = [];
const add = (id: string, branch: Branch, name: string, desc: string, x: number, y: number, req: string[], cost = 1, big = false) => N.push({ id, branch, name, desc, x, y, req, cost, big });

// POWER (left)
add('p1', 'power', 'Sharp Quill', '+5% Power on every word.', 420, 800, []);
add('p2', 'power', 'Heavy Ink', '+8% attack damage.', 330, 740, ['p1']);
add('p3', 'power', 'Long Word', 'Words of 7+ letters hit +10% more.', 240, 690, ['p2']);
add('p4', 'power', 'Keen Eye', '+4% hit chance.', 340, 640, ['p2']);
add('p5', 'power', 'Lucky Strike', 'Crit chance +4%.', 150, 640, ['p3']);
add('p6', 'power', 'Executioner', 'Deal +15% to enemies under 40% HP.', 250, 570, ['p3', 'p4'], 2);
add('p7', 'power', 'Rend', 'Crits ignore 30% of enemy shields.', 100, 540, ['p5']);
add('p8', 'power', 'Whirlwind', 'Sweep cards deal +25%.', 170, 470, ['p6']);
add('p9', 'power', 'Annihilator', 'Keystone: every 3rd attack is a guaranteed crit.', 90, 380, ['p7', 'p8'], 3, true);
// RESOLVE (right)
add('r1', 'resolve', 'Thick Skin', '+5% max HP.', 580, 800, []);
add('r2', 'resolve', 'Bulwark', 'Guard shields +10%.', 670, 740, ['r1']);
add('r3', 'resolve', 'Soft Landing', 'Take 5% less damage.', 760, 690, ['r2']);
add('r4', 'resolve', 'Gentle Hands', 'Heals +10%.', 660, 640, ['r2']);
add('r5', 'resolve', 'Second Wind', 'First time you drop, return at 15% HP.', 850, 640, ['r3'], 2);
add('r6', 'resolve', 'Purity', 'Resist Corruption 25% of the time.', 750, 570, ['r3', 'r4']);
add('r7', 'resolve', 'Aegis', 'Guard also shields the weakest ally for 30%.', 900, 540, ['r5'], 2);
add('r8', 'resolve', 'Renewal', 'Heal-over-time at the end of every turn.', 830, 470, ['r6']);
add('r9', 'resolve', 'Unbroken', 'Keystone: survive a lethal hit once per fight.', 910, 380, ['r7', 'r8'], 3, true);
// WIT (top)
add('w1', 'wit', 'Quick Read', '+2s on the turn timer.', 500, 780, []);
add('w2', 'wit', 'Deep Hand', 'Hand size +1.', 440, 700, ['w1']);
add('w3', 'wit', 'Lucky Draw', 'Card draw chance +15%.', 560, 700, ['w1']);
add('w4', 'wit', 'Scholar', 'Book of Wisdom gets +5s.', 440, 610, ['w2']);
add('w5', 'wit', 'Cardsharp', 'Rare cards appear 10% more.', 560, 610, ['w3']);
add('w6', 'wit', 'Lexicon', 'Letter locks cost you 50% less.', 500, 530, ['w4', 'w5'], 2);
add('w7', 'wit', 'Archivist', 'Book answers can be reused once per stage.', 430, 440, ['w6']);
add('w8', 'wit', 'Foresight', 'See the next enemy move one turn earlier.', 570, 440, ['w6']);
add('w9', 'wit', 'Omniscient', 'Keystone: the Book always gives a rare card.', 500, 330, ['w7', 'w8'], 3, true);
// PATHWAY (center-up)
add('u1', 'path', 'Spark', 'Ultimate charges +1 on valid words.', 500, 730, ['w1'], 2);
add('u2', 'path', 'Overflow', 'Start every fight with 2 ult charge.', 500, 660, ['u1'], 2);
add('u3', 'path', 'Echo', 'Ultimates repeat at 40% power.', 500, 590, ['u2'], 2);
add('u4', 'path', 'Finale', 'Keystone: ultimate cannot miss and always crits.', 500, 220, ['w9', 'u3'], 4, true);


// 24x24 stroke icons (lucide-style paths)
const IC: Record<string, string> = {
  quill: 'M20 4c-6 0-11 4-13 11l-3 5 5-3c7-2 11-7 11-13zM9 15l6-6',
  ink: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  ruler: 'M3 17 17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  clover: 'M12 12c-3-5-8-2-6 1s6 1 6-1zm0 0c5-3 2-8-1-6s-1 6 1 6zm0 0c3 5 8 2 6-1s-6-1-6 1zm0 0c-5 3-2 8 1 6s1-6-1-6zM12 12v9',
  skull: 'M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14zM9 12h.01M15 12h.01M10 17v3M14 17v3',
  claw: 'M4 20c2-6 4-11 8-16M9 20c1-5 3-9 6-13M14 20c1-4 2-7 5-10',
  swirl: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5zM5 21h14',
  heart: 'M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 10c0 5.5-8 11-8 11z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  feather: 'M20 4c-8 0-14 5-14 12l-2 4 4-2c7 0 12-6 12-14zM8 16l7-7',
  cross: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
  drop: 'M12 3c4 5 7 8 7 12a7 7 0 0 1-14 0c0-4 3-7 7-12z',
  wind: 'M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  cards: 'M7 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h5M9 13h5',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21h15M8 7h7',
  star: 'M12 3l2.8 6 6.2.7-4.6 4.2 1.3 6.1L12 17l-5.7 3 1.3-6.1L3 9.7 9.2 9z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 12h.01',
  fire: 'M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4 1-6 1-9z',
};
const NI: Record<string, string> = {
  p1: 'quill', p2: 'ink', p3: 'ruler', p4: 'eye', p5: 'clover', p6: 'skull', p7: 'claw', p8: 'swirl', p9: 'crown',
  r1: 'heart', r2: 'shield', r3: 'feather', r4: 'cross', r5: 'sun', r6: 'drop', r7: 'shield', r8: 'wind', r9: 'star',
  w1: 'clock', w2: 'cards', w3: 'clover', w4: 'book', w5: 'star', w6: 'eye', w7: 'repeat', w8: 'target', w9: 'book',
  u1: 'bolt', u2: 'fire', u3: 'repeat', u4: 'crown',
};

const KEY = 'letterlock:skills';
const POINTS = 12;

export default function Skills() {
  const [owned, setOwned] = useState<string[]>([]);
  const [sel, setSel] = useState<string>('p1');
  const [view, setView] = useState({ x: 0, y: 150, w: 1000, h: 800 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(KEY) ?? '[]'); if (Array.isArray(s)) setOwned(s); } catch { /* ignore */ } }, []);
  const save = (o: string[]) => { setOwned(o); try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } };

  const byId = useMemo(() => Object.fromEntries(N.map((n) => [n.id, n])), []);
  const spent = owned.reduce((a, id) => a + (byId[id]?.cost ?? 0), 0);
  const left = POINTS - spent;
  const node = byId[sel];
  const unlockable = (n: Node) => !owned.includes(n.id) && n.cost <= left && (n.req.length === 0 || n.req.some((r) => owned.includes(r)));
  const refund = (n: Node) => owned.includes(n.id) && !N.some((m) => owned.includes(m.id) && m.req.includes(n.id) && !m.req.some((r) => r !== n.id && owned.includes(r)));

  const zoom = useCallback((f: number) => setView((v) => {
    const w = Math.max(300, Math.min(1400, v.w * f)), h = w * 0.8;
    return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
  }), []);

  const down = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; const el = svgRef.current; if (!d || !el) return;
    const k = view.w / el.clientWidth;
    setView((v) => ({ ...v, x: d.vx - (e.clientX - d.x) * k, y: d.vy - (e.clientY - d.y) * k }));
  };
  const up = () => { drag.current = null; };

  const edges = N.flatMap((n) => n.req.map((r) => ({ a: byId[r], b: n })));

  return (
    <main className="sk-page">
      <header className="sk-top">
        <Link href="/play" className="sk-back">← Back</Link>
        <h1>SKILL TREE</h1>
        <div className="sk-pts"><b>{left}</b> / {POINTS} points</div>
      </header>

      <div className="sk-body">
        <svg ref={svgRef} className="sk-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          onWheel={(e) => zoom(e.deltaY > 0 ? 1.1 : 0.9)}>
          <defs><filter id="skglow"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          {edges.map((e, i) => {
            const on = owned.includes(e.a.id) && owned.includes(e.b.id);
            const c = BR[e.b.branch].color;
            const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2 + 10;
            return <path key={i} d={`M${e.a.x} ${e.a.y} Q${mx} ${my} ${e.b.x} ${e.b.y}`} fill="none" stroke={on ? c : '#374151'} strokeWidth={on ? 3 : 2} opacity={on ? 1 : 0.8} />;
          })}
          {/* trunk */}
          <path d="M500 940 L500 880" stroke="#fde047" strokeWidth="4" />
          {(['power', 'resolve', 'wit', 'path'] as Branch[]).map((b) => {
            const first = N.find((n) => n.branch === b && n.req.length === 0);
            if (!first) return null;
            return <path key={b} d={`M500 880 Q${(500 + first.x) / 2} 880 ${first.x} ${first.y}`} fill="none" stroke={BR[b].color} strokeWidth="3" opacity=".7" />;
          })}
          {N.map((n) => {
            const own = owned.includes(n.id); const can = unlockable(n); const c = BR[n.branch].color; const r = n.big ? 30 : 19;
            return (
              <g key={n.id} onClick={() => setSel(n.id)} style={{ cursor: 'pointer' }} filter={own ? 'url(#skglow)' : undefined}>
                <circle cx={n.x} cy={n.y} r={r} fill={own ? c : '#0b1020'} stroke={sel === n.id ? '#fff' : c} strokeWidth={sel === n.id ? 4 : can ? 3 : 2} opacity={own || can ? 1 : 0.5} />
                <g transform={`translate(${n.x - (n.big ? 15 : 10)} ${n.y - (n.big ? 15 : 10)}) scale(${n.big ? 1.25 : 0.83})`}>
                  <path d={IC[NI[n.id] ?? 'star']} fill="none" stroke={own ? '#0b1020' : c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </g>
                {n.cost > 1 && <text x={n.x + r - 2} y={n.y + r} textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" stroke="#000" strokeWidth="3" paintOrder="stroke">{n.cost}</text>}
              </g>
            );
          })}
          {(Object.keys(BR) as Branch[]).map((b) => {
            const pos = { power: [120, 900], resolve: [880, 900], wit: [500, 120], path: [640, 540] }[b] as [number, number];
            return <text key={b} x={pos[0]} y={pos[1]} textAnchor="middle" fontSize="28" fontWeight="800" fill={BR[b].color} opacity=".9">{BR[b].label}</text>;
          })}
          <circle cx="500" cy="880" r="22" fill="#fde047" />
        </svg>

        <div className="sk-zoom"><button type="button" onClick={() => zoom(0.8)}>＋</button><button type="button" onClick={() => zoom(1.25)}>－</button></div>

        {node && (
          <aside className="sk-detail" style={{ borderColor: BR[node.branch].color }}>
            <small style={{ color: BR[node.branch].color }}>{BR[node.branch].label} · {node.big ? 'KEYSTONE' : 'NODE'}</small>
            <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden><path d={IC[NI[node.id] ?? 'star']} fill="none" stroke={BR[node.branch].color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <h2>{node.name}</h2>
            <p>{node.desc}</p>
            <p className="muted">Cost {node.cost} · {node.req.length ? `Needs ${node.req.map((r) => byId[r].name).join(' or ')}` : 'Starting node'}</p>
            {owned.includes(node.id)
              ? <button type="button" className="btn" disabled={!refund(node)} onClick={() => save(owned.filter((x) => x !== node.id))}>Refund</button>
              : <button type="button" className="btn" disabled={!unlockable(node)} onClick={() => save([...owned, node.id])}>Unlock</button>}
          </aside>
        )}
      </div>
    </main>
  );
}

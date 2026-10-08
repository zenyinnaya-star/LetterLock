'use client';

// Full 3D battle stage: every hero, enemy and the environment are real three.js scenes built from
// articulated low-poly parts (torso / head / arms / weapon) so attacks are real swings, not slides.
// Units are placed so they land exactly under the DOM overlay (HP bars, floats, click targets):
// the DOM gives each unit a screen-% anchor, we ray-cast it onto the ground plane.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';

export type StageUnit = { id: string; side: 'hero' | 'enemy'; name: string; hero: string | null; dead: boolean };
export type StageFx = { key: string; type: string; actor?: string; target?: string; hurt: string[]; heal: string[]; guard: string[] } | null;
type P = { x: number; y: number };

const STRIKE = ['limit', 'hit', 'crit', 'miss', 'ult', 'season', 'sweep', 'mega_sweep', 'e_aoe', 'ehit'];
const CAST = ['heal', 'guard', 'e_buff', 'e_debuff', 'e_heal', 'group_heal', 'full_heal', 'cleanse', 'revive', 'overcharge'];
const AOE = ['limit', 'season', 'sweep', 'mega_sweep', 'e_aoe'];

export function webglOk(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(location.search).has('2d')) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const rand = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => ({ color, flatShading: true, roughness: 0.8, metalness: 0.05, ...o });

const camFov = (aspect: number) => Math.min(78, Math.max(30, (2 * Math.atan(Math.tan((56 * Math.PI) / 360) / aspect) * 180) / Math.PI));
const BASE_CAM = { pos: new THREE.Vector3(0, 5.6, 10.5), look: new THREE.Vector3(0, 0.9, -0.5), fov: 40 };
function makeBase(aspect: number) {
  const c = new THREE.PerspectiveCamera(camFov(aspect), aspect, 0.1, 200);
  c.position.copy(BASE_CAM.pos); c.lookAt(BASE_CAM.look); c.updateMatrixWorld(); c.updateProjectionMatrix();
  return c;
}
function groundAt(cam: THREE.PerspectiveCamera, p: P): THREE.Vector3 {
  const ndc = new THREE.Vector3((p.x / 100) * 2 - 1, 1 - ((p.y + 7) / 100) * 2, 0.5).unproject(cam);
  const dir = ndc.sub(cam.position).normalize();
  const t = dir.y < -0.01 ? -cam.position.y / dir.y : 30;
  return cam.position.clone().add(dir.multiplyScalar(Math.min(t, 40)));
}

/* ───────────────────────── per-unit animation state ───────────────────────── */
type Rig = { root: THREE.Group | null; body: THREE.Group | null; arm: THREE.Group | null; arm2: THREE.Group | null; mats: THREE.MeshStandardMaterial[]; extra: THREE.Object3D[] };
type Anim = { atk?: { t0: number; to: THREE.Vector3; aoe: boolean }; cast?: { t0: number; kind: string }; hurt?: { t0: number }; dodge?: { t0: number }; };

function useRig() {
  return useRef<Rig>({ root: null, body: null, arm: null, arm2: null, mats: [], extra: [] });
}

/* ─────────────────────────────── heroes ─────────────────────────────── */
const HERO_LOOK: Record<string, { body: string; accent: string; hair: string; skin: string; weapon: 'sword' | 'hammer' | 'dagger' | 'staff' }> = {
  Shiro: { body: '#c8d0e6', accent: '#e11d48', hair: '#f4f4f5', skin: '#f2c9a5', weapon: 'sword' },
  Nero: { body: '#334a8a', accent: '#93a8e8', hair: '#20242e', skin: '#c99874', weapon: 'hammer' },
  Kira: { body: '#3b1d5c', accent: '#c084fc', hair: '#8b5cf6', skin: '#e9c0a0', weapon: 'dagger' },
  Mira: { body: '#e8f5ec', accent: '#34d399', hair: '#fde68a', skin: '#f6d5b8', weapon: 'staff' },
  Prince: { body: '#7c2d12', accent: '#fbbf24', hair: '#451a03', skin: '#d9a77e', weapon: 'sword' },
};

function Weapon({ kind, accent }: { kind: string; accent: string }) {
  if (kind === 'sword') return (<group position={[0, -0.55, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
    <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.1, 1.0, 0.04]} /><meshStandardMaterial {...mat('#e5e7eb', { metalness: 0.7, roughness: 0.25, emissive: accent, emissiveIntensity: 0.25 })} /></mesh>
    <mesh><boxGeometry args={[0.32, 0.07, 0.07]} /><meshStandardMaterial {...mat('#facc15')} /></mesh></group>);
  if (kind === 'hammer') return (<group position={[0, -0.55, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
    <mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.05, 0.05, 1.0, 6]} /><meshStandardMaterial {...mat('#7c4a21')} /></mesh>
    <mesh position={[0, 0.98, 0]}><boxGeometry args={[0.5, 0.3, 0.3]} /><meshStandardMaterial {...mat('#94a3b8', { metalness: 0.6 })} /></mesh></group>);
  if (kind === 'dagger') return (<group position={[0, -0.5, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
    <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.07, 0.6, 0.03]} /><meshStandardMaterial {...mat('#d8b4fe', { metalness: 0.7, emissive: accent, emissiveIntensity: 0.5 })} /></mesh></group>);
  return (<group position={[0, -0.5, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
    <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.04, 0.05, 1.5, 6]} /><meshStandardMaterial {...mat('#92400e')} /></mesh>
    <mesh position={[0, 1.3, 0]}><icosahedronGeometry args={[0.16, 0]} /><meshStandardMaterial {...mat(accent, { emissive: accent, emissiveIntensity: 1.2 })} /></mesh></group>);
}

function Hero({ id, rig }: { id: string; rig: MutableRefObject<Rig> }) {
  const L = HERO_LOOK[id] ?? HERO_LOOK.Shiro;
  return (
    <group ref={(g) => { rig.current.body = g; }}>
      {/* legs */}
      {[-0.17, 0.17].map((x) => (<mesh key={x} position={[x, 0.42, 0]}><boxGeometry args={[0.24, 0.84, 0.28]} /><meshStandardMaterial {...mat('#1f2937')} /></mesh>))}
      {/* torso */}
      <mesh position={[0, 1.18, 0]}><boxGeometry args={[0.78, 0.8, 0.42]} /><meshStandardMaterial {...mat(L.body)} /></mesh>
      <mesh position={[0, 0.82, 0]}><boxGeometry args={[0.82, 0.12, 0.46]} /><meshStandardMaterial {...mat(L.accent)} /></mesh>
      {id === 'Nero' && <mesh position={[0, 1.22, 0.26]}><boxGeometry args={[0.5, 0.6, 0.08]} /><meshStandardMaterial {...mat('#1e3a8a', { metalness: 0.6 })} /></mesh>}
      {id === 'Mira' && <mesh position={[0, 0.5, 0]}><coneGeometry args={[0.55, 0.9, 7]} /><meshStandardMaterial {...mat(L.body)} /></mesh>}
      {/* head */}
      <mesh position={[0, 1.88, 0]}><icosahedronGeometry args={[0.33, 1]} /><meshStandardMaterial {...mat(L.skin)} /></mesh>
      <mesh position={[0, 1.99, -0.03]}><sphereGeometry args={[0.36, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55]} /><meshStandardMaterial {...mat(L.hair)} /></mesh>
      {id === 'Kira' && <mesh position={[0, 2.12, -0.05]} rotation={[-0.2, 0, 0]}><coneGeometry args={[0.28, 0.5, 6]} /><meshStandardMaterial {...mat(L.hair)} /></mesh>}
      {id === 'Nero' && <mesh position={[0, 2.0, 0]}><cylinderGeometry args={[0.37, 0.37, 0.24, 8]} /><meshStandardMaterial {...mat('#94a3b8', { metalness: 0.6 })} /></mesh>}
      {id === 'Mira' && <mesh position={[0, 1.7, -0.22]}><boxGeometry args={[0.6, 0.9, 0.12]} /><meshStandardMaterial {...mat(L.hair)} /></mesh>}
      {[-0.12, 0.12].map((x) => (<mesh key={x} position={[x, 1.9, 0.3]}><boxGeometry args={[0.07, 0.1, 0.04]} /><meshStandardMaterial {...mat('#0f172a', { emissive: L.accent, emissiveIntensity: 0.6 })} /></mesh>))}
      {/* scarf / cape */}
      <mesh position={[0, 1.58, -0.26]} rotation={[0.15, 0, 0]}><boxGeometry args={[0.7, 0.9, 0.06]} /><meshStandardMaterial {...mat(L.accent)} /></mesh>
      {/* arms */}
      <group ref={(g) => { rig.current.arm2 = g; }} position={[-0.52, 1.5, 0]}>
        <mesh position={[0, -0.35, 0]}><boxGeometry args={[0.2, 0.7, 0.22]} /><meshStandardMaterial {...mat(L.body)} /></mesh>
      </group>
      <group ref={(g) => { rig.current.arm = g; }} position={[0.52, 1.5, 0]} rotation={[-0.3, 0, 0]}>
        <mesh position={[0, -0.35, 0]}><boxGeometry args={[0.2, 0.7, 0.22]} /><meshStandardMaterial {...mat(L.body)} /></mesh>
        <mesh position={[0, -0.72, 0]}><sphereGeometry args={[0.12, 6, 5]} /><meshStandardMaterial {...mat(L.skin)} /></mesh>
        <Weapon kind={L.weapon} accent={L.accent} />
      </group>
    </group>
  );
}

/* ─────────────────────────────── enemies ─────────────────────────────── */
const PAL: Record<string, [string, string]> = {
  'Intern Auditor': ['#64748b', '#ef4444'], Clerk: ['#78716c', '#f59e0b'], 'Filer Alpha': ['#475569', '#38bdf8'], 'Filer Beta': ['#52525b', '#a78bfa'],
  Bailiff: ['#1f2937', '#facc15'], 'The Commissioner': ['#4c1d95', '#f43f5e'],
};
function Bureaucrat({ name, rig }: { name: string; rig: MutableRefObject<Rig> }) {
  const [suit, tie] = PAL[name] ?? ['#64748b', '#ef4444'];
  const big = name === 'Bailiff' || name === 'The Commissioner';
  const s = big ? 1.2 : 1;
  return (
    <group scale={s} ref={(g) => { rig.current.body = g; }}>
      {[-0.17, 0.17].map((x) => (<mesh key={x} position={[x, 0.4, 0]}><boxGeometry args={[0.24, 0.8, 0.28]} /><meshStandardMaterial {...mat('#111827')} /></mesh>))}
      <mesh position={[0, 1.15, 0]}><boxGeometry args={[0.85, 0.85, 0.46]} /><meshStandardMaterial {...mat(suit)} /></mesh>
      <mesh position={[0, 1.22, 0.24]}><boxGeometry args={[0.14, 0.62, 0.04]} /><meshStandardMaterial {...mat(tie, { emissive: tie, emissiveIntensity: 0.25 })} /></mesh>
      <mesh position={[0, 1.82, 0]}><boxGeometry args={[0.62, 0.6, 0.55]} /><meshStandardMaterial {...mat('#d4b896')} /></mesh>
      {[-0.15, 0.15].map((x) => (<group key={x} position={[x, 1.88, 0.29]}><mesh><torusGeometry args={[0.1, 0.02, 5, 10]} /><meshStandardMaterial {...mat('#0f172a')} /></mesh>
        <mesh position={[0, 0, -0.01]}><circleGeometry args={[0.08, 8]} /><meshBasicMaterial color={tie} /></mesh></group>))}
      <mesh position={[0, 1.65, 0.29]}><boxGeometry args={[0.3, 0.05, 0.03]} /><meshStandardMaterial {...mat('#3f1d1d')} /></mesh>
      {name === 'The Commissioner' && <mesh position={[0, 2.3, 0]}><cylinderGeometry args={[0.28, 0.4, 0.4, 6]} /><meshStandardMaterial {...mat('#facc15', { metalness: 0.6 })} /></mesh>}
      {name === 'Bailiff' && <mesh position={[0.25, 1.4, 0.25]}><cylinderGeometry args={[0.1, 0.1, 0.04, 6]} /><meshStandardMaterial {...mat('#facc15', { metalness: 0.7 })} /></mesh>}
      <group ref={(g) => { rig.current.arm2 = g; }} position={[-0.56, 1.5, 0]}><mesh position={[0, -0.35, 0]}><boxGeometry args={[0.2, 0.7, 0.22]} /><meshStandardMaterial {...mat(suit)} /></mesh></group>
      <group ref={(g) => { rig.current.arm = g; }} position={[0.56, 1.5, 0]} rotation={[-0.3, 0, 0]}>
        <mesh position={[0, -0.35, 0]}><boxGeometry args={[0.2, 0.7, 0.22]} /><meshStandardMaterial {...mat(suit)} /></mesh>
        <mesh position={[0, -0.8, 0.18]}><boxGeometry args={[0.55, 0.05, 0.7]} /><meshStandardMaterial {...mat('#f8fafc', { emissive: '#f8fafc', emissiveIntensity: 0.15 })} /></mesh>
        <mesh position={[0, -0.75, 0.18]}><boxGeometry args={[0.5, 0.05, 0.64]} /><meshStandardMaterial {...mat('#e2e8f0')} /></mesh>
      </group>
    </group>
  );
}

function Collector({ rig }: { rig: MutableRefObject<Rig> }) {
  return (
    <group scale={1.35} ref={(g) => { rig.current.body = g; }}>
      <mesh position={[0, 0.9, 0]} scale={[1.15, 1, 1]}><icosahedronGeometry args={[0.8, 1]} /><meshStandardMaterial {...mat('#7c2d12')} /></mesh>
      <mesh position={[0, 0.95, 0.5]} scale={[1, 1, 0.5]}><icosahedronGeometry args={[0.5, 0]} /><meshStandardMaterial {...mat('#fcd34d', { metalness: 0.5 })} /></mesh>
      <mesh position={[0, 1.95, 0.05]}><icosahedronGeometry args={[0.45, 1]} /><meshStandardMaterial {...mat('#d4a373')} /></mesh>
      <mesh position={[0, 2.35, 0]}><cylinderGeometry args={[0.32, 0.4, 0.55, 8]} /><meshStandardMaterial {...mat('#111827')} /></mesh>
      <mesh position={[0, 2.12, 0]}><cylinderGeometry args={[0.6, 0.6, 0.06, 10]} /><meshStandardMaterial {...mat('#111827')} /></mesh>
      {[-0.17, 0.17].map((x) => (<mesh key={x} position={[x, 1.98, 0.4]}><sphereGeometry args={[0.07, 6, 5]} /><meshBasicMaterial color="#fde047" /></mesh>))}
      <mesh position={[0, 1.78, 0.42]}><boxGeometry args={[0.4, 0.08, 0.04]} /><meshStandardMaterial {...mat('#fff')} /></mesh>
      {Array.from({ length: 7 }).map((_, i) => (<mesh key={i} position={[Math.sin(i * 0.9 - 2.7) * 0.5, 1.45 - Math.cos(i * 0.9 - 2.7) * 0.15, 0.55]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.1, 0.1, 0.03, 8]} /><meshStandardMaterial {...mat('#fbbf24', { metalness: 0.8, emissive: '#fbbf24', emissiveIntensity: 0.4 })} /></mesh>))}
      <group ref={(g) => { rig.current.arm2 = g; }} position={[-0.95, 1.3, 0]}><mesh position={[0, -0.3, 0]}><boxGeometry args={[0.3, 0.7, 0.3]} /><meshStandardMaterial {...mat('#7c2d12')} /></mesh></group>
      <group ref={(g) => { rig.current.arm = g; }} position={[0.95, 1.3, 0]}>
        <mesh position={[0, -0.3, 0]}><boxGeometry args={[0.3, 0.7, 0.3]} /><meshStandardMaterial {...mat('#7c2d12')} /></mesh>
        <mesh position={[0, -0.85, 0.1]}><icosahedronGeometry args={[0.32, 0]} /><meshStandardMaterial {...mat('#a16207')} /></mesh>
      </group>
    </group>
  );
}

function Drone({ rig }: { rig: MutableRefObject<Rig> }) {
  const rot = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (rot.current) rot.current.rotation.y += dt * 14; });
  return (
    <group ref={(g) => { rig.current.body = g; }} position={[0, 1.5, 0]}>
      <mesh><icosahedronGeometry args={[0.55, 1]} /><meshStandardMaterial {...mat('#334155', { metalness: 0.6, roughness: 0.4 })} /></mesh>
      <mesh position={[0, 0, 0.45]}><sphereGeometry args={[0.2, 8, 8]} /><meshBasicMaterial color="#ef4444" /></mesh>
      <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.05, 0.05, 0.3, 5]} /><meshStandardMaterial {...mat('#94a3b8')} /></mesh>
      <group ref={rot} position={[0, 0.68, 0]}>
        {[0, 1, 2, 3].map((i) => (<mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]} position={[Math.cos((i * Math.PI) / 2) * 0.5, 0, Math.sin((i * Math.PI) / 2) * 0.5]}><boxGeometry args={[0.6, 0.03, 0.12]} /><meshStandardMaterial {...mat('#cbd5e1')} /></mesh>))}
      </group>
      <group ref={(g) => { rig.current.arm = g; }} position={[0, -0.5, 0.2]}><mesh position={[0, -0.2, 0]}><cylinderGeometry args={[0.07, 0.1, 0.4, 5]} /><meshStandardMaterial {...mat('#ef4444', { emissive: '#ef4444', emissiveIntensity: 0.8 })} /></mesh></group>
    </group>
  );
}

function Government({ rig }: { rig: MutableRefObject<Rig> }) {
  return (
    <group scale={1.9} ref={(g) => { rig.current.body = g; }}>
      <mesh position={[0, 0.15, 0]}><boxGeometry args={[2.6, 0.3, 1.4]} /><meshStandardMaterial {...mat('#cbd5e1')} /></mesh>
      <mesh position={[0, 0.4, 0]}><boxGeometry args={[2.3, 0.2, 1.2]} /><meshStandardMaterial {...mat('#e2e8f0')} /></mesh>
      {[-0.9, -0.3, 0.3, 0.9].map((x) => (<mesh key={x} position={[x, 1.3, 0.2]}><cylinderGeometry args={[0.18, 0.2, 1.6, 8]} /><meshStandardMaterial {...mat('#f1f5f9')} /></mesh>))}
      <mesh position={[0, 2.25, 0.2]}><boxGeometry args={[2.4, 0.3, 1.1]} /><meshStandardMaterial {...mat('#cbd5e1')} /></mesh>
      <mesh position={[0, 2.8, 0.2]} rotation={[Math.PI / 2, Math.PI / 2, 0]} scale={[1, 1.1, 1]}><cylinderGeometry args={[0.8, 0.8, 1.0, 3]} /><meshStandardMaterial {...mat('#94a3b8')} /></mesh>
      <mesh position={[0, 3.55, 0.2]}><sphereGeometry args={[0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial {...mat('#fbbf24', { metalness: 0.7, roughness: 0.3 })} /></mesh>
      {[-0.28, 0.28].map((x) => (<mesh key={x} position={[x, 2.75, 0.8]}><boxGeometry args={[0.28, 0.12, 0.06]} /><meshBasicMaterial color="#ff2a2a" /></mesh>))}
      <mesh position={[0, 2.45, 0.8]}><boxGeometry args={[0.7, 0.06, 0.04]} /><meshBasicMaterial color="#7f1d1d" /></mesh>
      <group ref={(g) => { rig.current.arm2 = g; }} position={[-1.5, 1.8, 0.2]}><mesh position={[0, -0.6, 0]}><boxGeometry args={[0.5, 1.4, 0.5]} /><meshStandardMaterial {...mat('#475569')} /></mesh></group>
      <group ref={(g) => { rig.current.arm = g; }} position={[1.5, 1.8, 0.2]}>
        <mesh position={[0, -0.6, 0]}><boxGeometry args={[0.5, 1.4, 0.5]} /><meshStandardMaterial {...mat('#475569')} /></mesh>
        <mesh position={[0, -1.4, 0.1]}><cylinderGeometry args={[0.35, 0.35, 0.5, 8]} /><meshStandardMaterial {...mat('#b91c1c', { emissive: '#b91c1c', emissiveIntensity: 0.4 })} /></mesh>
      </group>
    </group>
  );
}

function EnemyBody({ name, rig }: { name: string; rig: MutableRefObject<Rig> }) {
  if (name === 'Government') return <Government rig={rig} />;
  if (name === 'The Collector') return <Collector rig={rig} />;
  if (name === 'Tax Drone') return <Drone rig={rig} />;
  return <Bureaucrat name={name} rig={rig} />;
}

/* ─────────────────────────────── one unit ─────────────────────────────── */
function Unit({ u, home, world, fx, picked, pickable, scale }: {
  u: StageUnit; home: THREE.Vector3; world: MutableRefObject<Map<string, THREE.Vector3>>; fx: StageFx; picked: boolean; pickable: boolean; scale: number;
}) {
  const rig = useRig();
  const anim = useRef<Anim>({});
  const spawn = useRef(-1);
  const groupRef = useRef<THREE.Group>(null);
  const { clock } = useThree();
  const facing = u.side === 'hero' ? -1 : 1; // heroes look into the screen (-z), enemies toward camera

  useEffect(() => { world.current.set(u.id, home); }, [u.id, home, world]);

  // collect materials once for hit-flash
  useEffect(() => {
    const g = groupRef.current; if (!g) return;
    const ms: THREE.MeshStandardMaterial[] = [];
    g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && 'emissive' in m && !(m as unknown as { userData: { keep?: boolean } }).userData.keep) ms.push(m); });
    rig.current.mats = ms.map((m) => { m.userData.base = { e: m.emissive.clone(), i: m.emissiveIntensity }; return m; });
  }, [u.name, rig]);

  useEffect(() => {
    if (!fx) return;
    const now = clock.elapsedTime;
    if (fx.actor === u.id) {
      if (fx.type === 'dodge') anim.current.dodge = { t0: now };
      else if (CAST.includes(fx.type)) anim.current.cast = { t0: now, kind: fx.type };
      else if (STRIKE.includes(fx.type)) {
        const tw = fx.target ? world.current.get(fx.target) : undefined;
        const to = tw ? tw.clone() : new THREE.Vector3(0, 0, u.side === 'hero' ? -1 : 2.2);
        anim.current.atk = { t0: now, to, aoe: AOE.includes(fx.type) || !tw };
      }
    }
    if (fx.hurt.includes(u.id)) anim.current.hurt = { t0: now + (fx.type === 'ult' ? 0.5 : 0.32) };
    if ([...fx.heal, ...fx.guard].includes(u.id) && fx.actor !== u.id) anim.current.cast = { t0: now + 0.1, kind: 'recv' };
  }, [fx?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock: c }) => {
    const r = rig.current; const g = groupRef.current; if (!g || !r.body) return;
    const t = c.elapsedTime; const a = anim.current;
    if (spawn.current < 0) spawn.current = t;
    const grow = Math.min(1, (t - spawn.current) * 3);
    let px = home.x, pz = home.z, py = 0, lean = 0, armX = u.side === 'hero' ? -0.3 : -0.3, arm2X = 0, spin = 0, glow = 0, red = 0;
    const bob = Math.sin(t * 2.2 + home.x) * 0.04;
    py += bob;
    if (u.name === 'Tax Drone') py += 0.2 + Math.sin(t * 3 + home.x) * 0.12;
    armX += Math.sin(t * 2.2 + home.x) * 0.05; arm2X = Math.sin(t * 2.2 + 1) * 0.06;

    if (a.atk) {
      const k = (t - a.atk.t0) / 0.95;
      if (k >= 1) a.atk = undefined;
      else {
        const wind = k < 0.25 ? k / 0.25 : 1;
        const dash = k < 0.25 ? 0 : k < 0.45 ? (k - 0.25) / 0.2 : k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        const toX = a.atk.aoe ? home.x : home.x + (a.atk.to.x - home.x) * 0.78;
        const toZ = a.atk.aoe ? home.z + facing * 1.4 : home.z + (a.atk.to.z - home.z) * 0.78;
        px = home.x + (toX - home.x) * dash; pz = home.z + (toZ - home.z) * dash;
        if (k < 0.25) { pz -= facing * 0.25 * wind; lean = -0.35 * wind; armX = -2.4 * wind; }
        else if (k < 0.55) { const s = (k - 0.25) / 0.3; lean = 0.5 * Math.min(1, s * 2); armX = -2.4 + 3.6 * Math.min(1, s * 1.6); }
        else { const s = (k - 0.55) / 0.45; lean = 0.5 * (1 - s); armX = 1.2 - 1.5 * s; }
        if (a.atk.aoe) { const j = Math.sin(Math.min(1, k * 1.4) * Math.PI); py += j * 1.0; if (k > 0.42 && k < 0.5) lean = 0.4; }
        glow = k > 0.25 && k < 0.6 ? 0.8 : 0;
      }
    }
    if (a.cast) {
      const k = (t - a.cast.t0) / 1.0;
      if (k >= 1) a.cast = undefined;
      else if (k > 0) { const s = Math.sin(k * Math.PI); if (a.cast.kind !== 'recv') { armX = -2.5 * s - 0.3; arm2X = -2.2 * s; py += s * 0.25; } glow = s * 1.4; }
    }
    if (a.dodge) {
      const k = (t - a.dodge.t0) / 0.6;
      if (k >= 1) a.dodge = undefined; else { px += Math.sin(k * Math.PI) * 1.1; lean = Math.sin(k * Math.PI) * -0.4; }
    }
    if (a.hurt) {
      const k = (t - a.hurt.t0) / 0.5;
      if (k >= 1) a.hurt = undefined;
      else if (k > 0) { px += Math.sin(k * 40) * 0.12 * (1 - k); pz += -facing * 0.35 * Math.sin(k * Math.PI); red = (1 - k); lean = -0.25 * (1 - k); }
    }
    // dead: collapse
    const deadK = u.dead ? 1 : 0;
    const cur = (g.userData.dead ?? 0) as number;
    const nd = cur + (deadK - cur) * 0.08;
    g.userData.dead = nd;
    g.position.set(px, py * (1 - nd), pz);
    g.scale.setScalar(scale * grow);
    g.rotation.y = facing < 0 ? Math.PI - 0.45 : 0.25;
    r.body.rotation.x = lean * (1 - nd) + nd * (u.side === 'hero' ? -1.45 : 1.45) * (u.name === 'Tax Drone' ? 0.5 : 1);
    r.body.position.y = -nd * 0.55;
    if (r.arm) r.arm.rotation.x = armX;
    if (r.arm2) r.arm2.rotation.x = arm2X;
    for (const m of r.mats) {
      const b = m.userData.base as { e: THREE.Color; i: number } | undefined; if (!b) continue;
      if (red > 0.01) { m.emissive.set('#ff1f1f'); m.emissiveIntensity = red * 1.6; }
      else if (glow > 0.01) { m.emissive.set(u.side === 'hero' ? '#ffd35a' : '#ff6a3d'); m.emissiveIntensity = glow * 0.55; }
      else { m.emissive.copy(b.e); m.emissiveIntensity = b.i; }
      m.opacity = 1 - nd * 0.65; m.transparent = nd > 0.02;
    }
  });

  return (
    <group>
      {/* blob shadow + select ring (stay on the ground) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[home.x, 0.02, home.z]} scale={scale}>
        <circleGeometry args={[0.85, 20]} /><meshBasicMaterial color="#000" transparent opacity={u.dead ? 0.1 : 0.4} depthWrite={false} />
      </mesh>
      {(picked || pickable) && !u.dead && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[home.x, 0.04, home.z]} scale={scale}>
          <ringGeometry args={[0.95, 1.1, 28]} /><meshBasicMaterial color={picked ? '#ef4444' : '#fde047'} transparent opacity={picked ? 0.95 : 0.55} depthWrite={false} />
        </mesh>
      )}
      <group ref={groupRef} position={[home.x, 0, home.z]}>
        {u.side === 'hero' ? <Hero id={u.hero ?? 'Shiro'} rig={rig} /> : <EnemyBody name={u.name} rig={rig} />}
      </group>
    </group>
  );
}

/* ─────────────────────────────── effects ─────────────────────────────── */
function Burst({ fx, world, ids }: { fx: StageFx; world: MutableRefObject<Map<string, THREE.Vector3>>; ids: string[] }) {
  const ref = useRef<THREE.Group>(null);
  const st = useRef<{ t0: number; vel: THREE.Vector3[]; color: string; origin: THREE.Vector3[] } | null>(null);
  const { clock } = useThree();
  useEffect(() => {
    if (!fx || !ids.length) return;
    const rnd = rand(fx.key.length * 977 + 13);
    const col = fx.type === 'crit' || fx.type === 'ult' || fx.type === 'limit' ? '#ffd24a' : fx.type.includes('heal') || fx.type === 'full_heal' || fx.type === 'revive' ? '#4ade80' : fx.type === 'guard' ? '#60a5fa' : '#ff5a4a';
    const origin = ids.map((id) => (world.current.get(id) ?? new THREE.Vector3()).clone().setY(1.1));
    const vel = Array.from({ length: ids.length * 14 }, () => new THREE.Vector3((rnd() - 0.5) * 4, rnd() * 3.2 + 0.6, (rnd() - 0.5) * 4));
    st.current = { t0: clock.elapsedTime + (fx.type === 'ult' ? 0.5 : 0.3), vel, color: col, origin };
  }, [fx?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock: c }) => {
    const g = ref.current; const s = st.current; if (!g) return;
    if (!s) { g.visible = false; return; }
    const k = (c.elapsedTime - s.t0) / 0.8;
    if (k < 0) { g.visible = false; return; }
    if (k > 1) { g.visible = false; st.current = null; return; }
    g.visible = true;
    g.children.forEach((ch, i) => {
      const o = s.origin[Math.floor(i / 14)]; const v = s.vel[i]; if (!o || !v) { ch.visible = false; return; }
      ch.visible = true;
      ch.position.set(o.x + v.x * k, o.y + v.y * k - 4.2 * k * k, o.z + v.z * k);
      ch.scale.setScalar(0.1 * (1 - k) + 0.02);
      ((ch as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(s.color);
    });
  });
  return (
    <group ref={ref} visible={false}>
      {Array.from({ length: 70 }).map((_, i) => (<mesh key={i}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color="#fff" /></mesh>))}
    </group>
  );
}

/* ─────────────────────────────── environment ─────────────────────────────── */
const SKY: [string, string, string][] = [['#0b1230', '#4a3a78', '#f2a36b'], ['#2a1233', '#a14a3a', '#f6c06a'], ['#080616', '#3a1252', '#a8244a']];
const GROUND = ['#26402f', '#5c4a25', '#2a2a3c'];
const FOG = ['#2a3358', '#6b4636', '#2a1a40'];

function Sky({ act }: { act: number }) {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(80, 24, 16);
    const [top, mid, low] = SKY[act].map((c) => new THREE.Color(c));
    const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 80; const c = y > 0.1 ? top.clone().lerp(mid, 1 - Math.min(1, (y - 0.1) / 0.6)) : mid.clone().lerp(low, Math.min(1, (0.1 - y) / 0.25));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  }, [act]);
  return <mesh geometry={geo}><meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} /></mesh>;
}

function Motes({ act }: { act: number }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const r = rand(77 + act); const n = 90; const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = (r() - 0.5) * 22; a[i * 3 + 1] = r() * 6 + 0.3; a[i * 3 + 2] = (r() - 0.7) * 18; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
  }, [act]);
  useFrame(({ clock }) => { if (ref.current) { ref.current.rotation.y = clock.elapsedTime * 0.02; ref.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.2; } });
  return <points ref={ref} geometry={geo}><pointsMaterial size={act === 2 ? 0.16 : 0.09} color={act === 0 ? '#fde68a' : act === 1 ? '#fcd34d' : '#f8fafc'} transparent opacity={0.8} depthWrite={false} /></points>;
}

function Env({ act }: { act: number }) {
  const props = useMemo(() => {
    const r = rand(1234 + act * 51); const out: { x: number; z: number; s: number; k: number }[] = [];
    for (let i = 0; i < 26; i++) { const side = r() > 0.5 ? 1 : -1; out.push({ x: side * (5.5 + r() * 9), z: -14 + r() * 24, s: 0.7 + r() * 1.1, k: Math.floor(r() * 3) }); }
    return out;
  }, [act]);
  return (
    <>
      <Sky act={act} />
      <fog attach="fog" args={[FOG[act], 16, 60]} />
      <ambientLight intensity={act === 2 ? 0.55 : 0.7} color={act === 2 ? '#b9a8ff' : '#ffe9d0'} />
      <hemisphereLight args={['#9fb8ff', GROUND[act], 0.55]} />
      <directionalLight position={[-6, 12, 8]} intensity={act === 1 ? 2.1 : 1.7} color={act === 1 ? '#ffd9a0' : '#ffe8c8'} />
      <pointLight position={[0, 4, -4]} intensity={act === 2 ? 60 : 25} color={act === 2 ? '#ff3a5a' : '#ffb870'} distance={22} />
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -4]}><circleGeometry args={[46, 40]} /><meshStandardMaterial {...mat(GROUND[act], { roughness: 1 })} /></mesh>
      {act === 2 ? (<>
        {Array.from({ length: 12 }).map((_, i) => (<mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[(i % 2 ? 1 : -1) * 0, 0.01, -10 + i * 2]}><planeGeometry args={[3.2, 2]} /><meshStandardMaterial {...mat(i % 2 ? '#7f1d1d' : '#991b1b')} /></mesh>))}
      </>) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -3]}><planeGeometry args={[3.6, 40]} /><meshStandardMaterial {...mat(act === 0 ? '#5b5348' : '#8a7447')} /></mesh>
      )}
      {props.map((p, i) => act === 0 ? (
        p.k === 0 ? (<group key={i} position={[p.x, 0, p.z]} scale={p.s}><mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.15, 0.2, 1.2, 5]} /><meshStandardMaterial {...mat('#5b3a1a')} /></mesh><mesh position={[0, 2, 0]}><coneGeometry args={[1, 2.4, 6]} /><meshStandardMaterial {...mat('#1f5a3a')} /></mesh><mesh position={[0, 3, 0]}><coneGeometry args={[0.7, 1.6, 6]} /><meshStandardMaterial {...mat('#2a7a4a')} /></mesh></group>)
          : p.k === 1 ? (<mesh key={i} position={[p.x, 0.4 * p.s, p.z]} scale={p.s}><dodecahedronGeometry args={[0.7, 0]} /><meshStandardMaterial {...mat('#6b7280')} /></mesh>)
          : (<group key={i} position={[p.x, 0, p.z]} scale={p.s}><mesh position={[0, 0.5, 0]}><boxGeometry args={[0.12, 1, 0.12]} /><meshStandardMaterial {...mat('#7c4a21')} /></mesh><mesh position={[0, 1.05, 0]}><boxGeometry args={[0.9, 0.4, 0.06]} /><meshStandardMaterial {...mat('#e5e7eb')} emissive="#fff" emissiveIntensity={0.1} /></mesh></group>)
      ) : act === 1 ? (
        p.k === 0 ? (<group key={i} position={[p.x, 0, p.z]} scale={p.s}><mesh position={[0, 1.2, 0]}><boxGeometry args={[0.6, 2.4, 0.6]} /><meshStandardMaterial {...mat('#a8a29e')} /></mesh><mesh position={[0, 2.5, 0]}><boxGeometry args={[0.9, 0.2, 0.9]} /><meshStandardMaterial {...mat('#d6d3d1')} /></mesh></group>)
          : p.k === 1 ? (<mesh key={i} position={[p.x, 0.5 * p.s, p.z]} scale={p.s}><boxGeometry args={[1.3, 1, 1.3]} /><meshStandardMaterial {...mat('#a16207')} /></mesh>)
          : (<group key={i} position={[p.x, 0, p.z]} scale={p.s}><mesh position={[0, 1, 0]}><cylinderGeometry args={[0.1, 0.12, 2, 5]} /><meshStandardMaterial {...mat('#57534e')} /></mesh><mesh position={[0, 2.1, 0]}><boxGeometry args={[0.2, 0.6, 0.2]} /><meshBasicMaterial color="#fde047" /></mesh></group>)
      ) : (
        p.k === 1 ? (<mesh key={i} position={[p.x, 1.6 * p.s, p.z]} scale={p.s}><boxGeometry args={[0.5, 3.2, 0.5]} /><meshStandardMaterial {...mat('#1e1b2e')} /></mesh>)
          : (<group key={i} position={[p.x, 0, p.z]} scale={p.s * 1.2}><mesh position={[0, 1.8, 0]}><cylinderGeometry args={[0.35, 0.4, 3.6, 8]} /><meshStandardMaterial {...mat('#cbd5e1')} /></mesh><mesh position={[0, 3.7, 0]}><boxGeometry args={[1, 0.25, 1]} /><meshStandardMaterial {...mat('#e2e8f0')} /></mesh>{p.k === 2 && <mesh position={[0, 3, 0.45]}><boxGeometry args={[0.5, 1.2, 0.04]} /><meshStandardMaterial {...mat('#b91c1c')} emissive="#7f1d1d" emissiveIntensity={0.6} /></mesh>}</group>)
      ))}
      <Motes act={act} />
    </>
  );
}

/* ─────────────────────────────── camera ─────────────────────────────── */
function Rig({ fx, world }: { fx: StageFx; world: MutableRefObject<Map<string, THREE.Vector3>> }) {
  const shake = useRef({ t0: -9, amp: 0, push: 0 });
  const cine = useRef<{ t0: number; pos: THREE.Vector3; look: THREE.Vector3; dur: number; punch: number; full: boolean } | null>(null);
  const { clock, camera, size } = useThree();
  useEffect(() => {
    if (!fx) return;
    const t = clock.elapsedTime;
    if (fx.hurt.length) shake.current = { t0: t + 0.3, amp: fx.type === 'limit' ? 0.6 : fx.type === 'crit' || fx.type === 'season' || fx.type === 'ult' ? 0.35 : 0.14, push: fx.type === 'ult' || fx.type === 'limit' ? 1 : 0 };
    else if (fx.type === 'ult' || fx.type === 'limit') shake.current = { t0: t, amp: 0.1, push: 1 };
    // cinematic framing: attacker -> target close-up, wide low angle for team moves
    const A = fx.actor ? world.current.get(fx.actor) : undefined;
    const T = fx.target ? world.current.get(fx.target) : undefined;
    if (fx.type === 'limit' || fx.type === 'ult' || AOE.includes(fx.type)) {
      cine.current = { t0: t, pos: new THREE.Vector3(0, 1.3, 6.2), look: new THREE.Vector3(0, 1.9, -3), dur: fx.type === 'limit' ? 1.8 : 1.3, punch: fx.type === 'limit' ? 9 : 5, full: true };
    } else if (A && T) {
      const mid = A.clone().lerp(T, 0.5);
      const side = A.x <= T.x ? -1 : 1;
      cine.current = { t0: t, pos: new THREE.Vector3(mid.x + side * 3.4, 1.7, Math.max(mid.z, A.z) + 4.6), look: mid.clone().setY(1.2), dur: 1.25, punch: fx.type === 'crit' ? 6 : 3, full: false };
    } else if (A) {
      cine.current = { t0: t, pos: new THREE.Vector3(A.x * 0.6, 2.3, A.z + 5.5), look: A.clone().setY(1.3), dur: 1.1, punch: 0, full: false };
    }
  }, [fx?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const tmp = useRef({ p: new THREE.Vector3(), l: new THREE.Vector3(), lk: new THREE.Vector3() });
  useFrame(({ clock: c }) => {
    const t = c.elapsedTime; const s = shake.current; const k = (t - s.t0) / 0.6;
    const e = k > 0 && k < 1 ? (1 - k) * s.amp : 0;
    const sway = Math.sin(t * 0.35) * 0.35;
    const push = s.push ? Math.sin(Math.min(1, Math.max(0, (t - s.t0 + 0.5) / 1.6)) * Math.PI) * 2 : 0;
    const { p, l, lk } = tmp.current;
    p.set(BASE_CAM.pos.x + sway, BASE_CAM.pos.y - push * 0.6, BASE_CAM.pos.z - push);
    l.copy(BASE_CAM.look);
    let fovAdd = 0;
    const c0 = cine.current;
    if (c0) {
      const u = (t - c0.t0) / c0.dur;
      if (u >= 1) cine.current = null;
      else {
        const w = u < 0.18 ? u / 0.18 : u < 0.72 ? 1 : 1 - (u - 0.72) / 0.28;
        const ease = w * w * (3 - 2 * w) * (c0.full ? 1 : 0.5); // partial for single targets so DOM bars/numbers stay aligned
        p.lerp(c0.pos, ease); l.lerp(c0.look, ease);
        const imp = (t - c0.t0 - 0.38) / 0.25; // impact punch-in on the hit frame
        if (imp > 0 && imp < 1) fovAdd = -c0.punch * Math.sin(imp * Math.PI);
      }
    }
    camera.position.set(p.x + Math.sin(t * 60) * e, p.y + Math.cos(t * 55) * e, p.z);
    const pc = camera as THREE.PerspectiveCamera; const f = camFov(size.width / Math.max(1, size.height)) + fovAdd;
    if (Math.abs(pc.fov - f) > 0.01) { pc.fov = f; pc.updateProjectionMatrix(); }
    lk.copy(l); camera.lookAt(lk);
  });
  return null;
}

/* ─────────────────────────────── scene ─────────────────────────────── */
function Scene({ units, pos, act, fx, pickedId, pickableIds }: { units: StageUnit[]; pos: Record<string, P>; act: number; fx: StageFx; pickedId: string | null; pickableIds: string[] }) {
  const { size } = useThree();
  const world = useRef(new Map<string, THREE.Vector3>());
  const base = useMemo(() => makeBase(size.width / Math.max(1, size.height)), [size.width, size.height]);
  const homes = useMemo(() => {
    const m: Record<string, THREE.Vector3> = {};
    for (const u of units) { const p = pos[u.id]; if (p) m[u.id] = groundAt(base, p); }
    return m;
  }, [units, pos, base]);
  const hurtIds = fx ? fx.hurt : [];
  const burstIds = fx ? [...fx.hurt, ...fx.heal, ...fx.guard] : [];
  void hurtIds;
  return (
    <>
      <Env act={act} />
      <Rig fx={fx} world={world} />
      {units.map((u) => homes[u.id] && (
        <Unit key={u.id} u={u} home={homes[u.id]} world={world} fx={fx} picked={pickedId === u.id} pickable={pickableIds.includes(u.id)}
          scale={u.name === 'Government' ? 0.95 : u.name === 'The Collector' ? 0.8 : u.side === 'hero' ? 0.95 : 0.9} />
      ))}
      <Burst fx={fx} world={world} ids={burstIds} />
    </>
  );
}

export default function Stage3D(p: { units: StageUnit[]; pos: Record<string, P>; act: number; fx: StageFx; pickedId: string | null; pickableIds: string[] }) {
  return (
    <Canvas className="rg-3d" dpr={[1, 1.6]} gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: BASE_CAM.pos.toArray(), fov: BASE_CAM.fov, near: 0.1, far: 200 }}
      onCreated={({ camera }) => camera.lookAt(BASE_CAM.look)}>
      <Scene {...p} />
    </Canvas>
  );
}

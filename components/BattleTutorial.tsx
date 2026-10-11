'use client';
import { useEffect, useState } from 'react';

const KEY = 'letterlock:tut:battle1';
const TIPS = [
  ['Type a word', 'Words are your weapon. Longer and rarer letters (J, Q, X, Z, K, V) hit harder.'],
  ['Chain words', 'Each valid word in a row adds a combo: +4% power per stack, up to 5.'],
  ['Hit weaknesses', 'Match the element on the turn banner for ×1.5, and fill the enemy Break meter to stagger it.'],
  ['Know your hero', 'Shiro likes short words, Nero long ones, Kira rare letters. Open a hero card for details.'],
];

/** One-time, dismissible first-battle tips. */
export function BattleTutorial() {
  const [i, setI] = useState<number | null>(null);
  useEffect(() => { try { if (!localStorage.getItem(KEY)) setI(0); } catch { /* ignore */ } }, []);
  if (i === null) return null;
  const done = () => { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } setI(null); };
  const [h, p] = TIPS[i];
  return (
    <div className="bt-tut" role="dialog" aria-label="Tutorial">
      <small>{i + 1} / {TIPS.length}</small>
      <b>{h}</b>
      <p>{p}</p>
      <div>
        <button type="button" onClick={done}>Skip</button>
        <button type="button" className="go" onClick={() => (i + 1 >= TIPS.length ? done() : setI(i + 1))}>{i + 1 >= TIPS.length ? 'Got it' : 'Next'}</button>
      </div>
    </div>
  );
}

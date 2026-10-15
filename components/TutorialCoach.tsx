'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CLASS_GUIDE } from '@/lib/classGuide';
import { CLASSES } from '@/lib/classes';
import type { RoomState } from '@/lib/types';
import { ClassIcon } from './icons';

/** Tutorial mode: the class you picked talks you through its own kit in text bubbles while you play the bots. */
export function TutorialCoach({ state }: { state: RoomState }) {
  const code = state.room.code;
  const [on, setOn] = useState(false);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try { setOn(sessionStorage.getItem(`letterlock:tutorial:${code}`) === '1'); } catch { setOn(false); }
  }, [code]);

  const cls = state.me?.class ?? null;
  if (!on || !cls || state.room.phase === 'finished') return null;
  const info = CLASSES[cls];
  const g = CLASS_GUIDE[cls];
  const steps: string[] = [
    `I'm the ${info.name}. ${info.tagline} Let me show you how to play me, step by step, while you practise on the bots.`,
    g.how,
    `What I do: ${info.perk}`,
    ...g.tips.map((tip, i) => `Tip ${i + 1}: ${tip}`),
    `How others beat me: ${g.counter}`,
    `That's my whole kit. Keep playing the bots, and tap my icon any time you want to hear it again.`,
  ];
  const last = step >= steps.length - 1;
  function close() {
    setOpen(false);
  }

  return (
    <div className="coach" aria-live="polite">
      <AnimatePresence>
        {open && (
          <motion.div className="coach-card" key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
            <p>{steps[step]}</p>
            <div className="coach-row">
              <span className="coach-count">{step + 1} / {steps.length}</span>
              <button type="button" className="textbtn" onClick={close}>Hide</button>
              {step > 0 && <button type="button" className="textbtn" onClick={() => setStep(step - 1)}>Back</button>}
              <button type="button" className="btn" onClick={() => (last ? close() : setStep(step + 1))}>{last ? 'Got it' : 'Next'}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button type="button" className="coach-face" aria-label={`${info.name} coach`} onClick={() => { setStep(0); setOpen(true); }}>
        <ClassIcon cls={cls} size={56} />
      </button>
    </div>
  );
}

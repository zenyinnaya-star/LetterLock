'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/react';
import { rpc, type Recap as RecapData } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import { Icon } from './icons';
import { nameOf, spring } from './ui';

/** Draws the share card to a canvas and returns a PNG blob. */
function drawCard(state: RoomState, recap: RecapData, winner: string): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1080;
  const g = c.getContext('2d');
  if (!g) return Promise.resolve(null);
  const grad = g.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, '#1b1440'); grad.addColorStop(1, '#4b1f6e');
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1080);
  g.textAlign = 'center';
  g.fillStyle = '#ffcf5c'; g.font = '900 64px system-ui, sans-serif'; g.fillText('LETTERLOCK', 540, 140);
  g.fillStyle = '#fff'; g.font = '700 40px system-ui, sans-serif'; g.fillText(`${winner} wins!`, 540, 250);
  if (recap.best) {
    g.fillStyle = 'rgba(255,255,255,.65)'; g.font = '600 30px system-ui, sans-serif'; g.fillText('Best word of the game', 540, 380);
    g.fillStyle = '#ffd86b'; g.font = '900 120px system-ui, sans-serif'; g.fillText(recap.best.word.toUpperCase(), 540, 510);
    g.fillStyle = '#fff'; g.font = '600 36px system-ui, sans-serif'; g.fillText(`${recap.best.name} · +${recap.best.points} pts`, 540, 580);
  }
  const rows = [...state.players].sort((a, b) => b.points - a.points).slice(0, 5);
  g.textAlign = 'left'; g.font = '700 38px system-ui, sans-serif';
  rows.forEach((p, i) => {
    const y = 700 + i * 60;
    g.fillStyle = i === 0 ? '#ffd86b' : '#fff'; g.fillText(`${i + 1}. ${p.name}`, 260, y);
    g.textAlign = 'right'; g.fillText(`${p.points}`, 820, y); g.textAlign = 'left';
  });
  g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '600 28px system-ui, sans-serif';
  g.fillText('letterlock-theta.vercel.app', 540, 1030);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

export function Recap({ state }: { state: RoomState }) {
  const t = useT();
  const code = state.room.code;
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    void rpc.getRecap(code).then((r) => { if (alive) setRecap(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    if (!playing || !recap) return;
    timer.current = setInterval(() => {
      setStep((s) => {
        if (s + 1 >= recap.rounds.length) { setPlaying(false); return s; }
        return s + 1;
      });
    }, 3500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, recap]);

  if (!recap || recap.rounds.length === 0) return null;
  const winner = nameOf(state, state.room.winner_id);
  const rd = recap.rounds[Math.min(step, recap.rounds.length - 1)];

  const share = async () => {
    const text = `LETTERLOCK — ${winner} won!${recap.best ? ` Best word: ${recap.best.word.toUpperCase()} (+${recap.best.points}) by ${recap.best.name}.` : ''} Play: https://letterlock-theta.vercel.app`;
    try {
      const blob = await drawCard(state, recap, winner);
      const file = blob ? new File([blob], 'letterlock.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      if (blob) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'letterlock.png'; a.click();
        setMsg(t('rc.saved')); return;
      }
      await navigator.clipboard.writeText(text); setMsg(t('rc.copied'));
    } catch { /* user cancelled the share sheet */ }
  };

  return (
    <div className="recap">
      <div className="row" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => { setOpen((o) => !o); setStep(0); setPlaying(!open); }}>
          <Icon name="sparkle" size={16} /> {open ? t('rc.hide') : t('rc.replay')}
        </button>
        <button className="btn" onClick={() => void share()}><Icon name="bolt" size={16} /> {t('rc.share')}</button>
      </div>
      {msg && <div className="muted small center">{msg}</div>}
      <AnimatePresence>
        {open && (
          <motion.div className="recap-body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost" disabled={step === 0} onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }}>‹</button>
              <b>{t('ph.round', { n: rd.round })}{rd.prompt ? ` · “${rd.prompt}”` : ''}</b>
              <button className="btn ghost" disabled={step >= recap.rounds.length - 1} onClick={() => { setPlaying(false); setStep((s) => Math.min(recap.rounds.length - 1, s + 1)); }}>›</button>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={rd.round} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                {rd.answers.map((a) => (
                  <div key={a.player_id} className={`reveal-row${a.valid ? '' : ' bad'}`}>
                    <div>
                      <div className="small muted">{a.name}</div>
                      <div className="word">{a.word ? a.word.toUpperCase() : '— — —'}</div>
                      {a.legend && <div className="legend-tag"><Icon name="sparkle" size={13} /> {t('ph.legend')}</div>}
                    </div>
                    <div className="score" style={{ color: a.valid ? 'var(--ok)' : 'var(--lock)' }}>{a.valid ? `+${a.points}` : '✕'}</div>
                  </div>
                ))}
                {rd.events.length > 0 && (
                  <div className="muted small" style={{ marginTop: 8 }}>
                    {rd.events.map((e) => <div key={e.id}>{t(`rc.ev.${e.type}` as Parameters<typeof t>[0], { name: e.name ?? '' })}</div>)}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

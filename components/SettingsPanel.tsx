'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { getPrefs, setPref, type Prefs } from '@/lib/prefs';
import { rpc } from '@/lib/rpc';
import type { RoomSettings, RoomState } from '@/lib/types';
import { Icon, type IconName } from './icons';
import type { Act } from './phases';

type NumKey = 'answer_seconds' | 'guess_seconds' | 'react_seconds' | 'duel_seconds' | 'strikes';
const OPTIONS: { key: NumKey; label: string; icon: IconName; values: number[]; unit: string; hint?: string }[] = [
  { key: 'answer_seconds', label: 'Answer time', icon: 'clock', values: [30, 45, 60, 90, 120], unit: 's' },
  { key: 'guess_seconds', label: 'Guess time', icon: 'target', values: [10, 15, 20, 30, 45], unit: 's' },
  { key: 'react_seconds', label: 'Cards phase', icon: 'cards', values: [5, 8, 12, 20], unit: 's' },
  { key: 'duel_seconds', label: 'Duel rounds', icon: 'swords', values: [15, 20, 30, 45], unit: 's' },
  { key: 'strikes', label: 'Strikes to go out', icon: 'x', values: [1, 2, 3], unit: '' },
];

export function SettingsButton({ state, token, act }: { state: RoomState | null; token: string | null; act?: Act }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="iconbtn" aria-label="Settings" title="Settings" onClick={() => setOpen(true)}>
        <Icon name="gear" />
      </button>
      <AnimatePresence>
        {open && <SettingsSheet state={state} token={token} act={act} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

function SettingsSheet({ state, token, act, onClose }: { state: RoomState | null; token: string | null; act?: Act; onClose: () => void }) {
  const s = state?.room.settings;
  const isHost = !!state?.me && state.me.id === state.room.host_id;
  const editable = isHost && state?.room.phase === 'lobby' && !!token && !!act;
  const [local, setLocal] = useState<RoomSettings | undefined>(s);
  const [prefs, setPrefs] = useState<Prefs>(getPrefs());
  useEffect(() => { setLocal(s); }, [s]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function change(patch: Partial<RoomSettings>) {
    if (!editable || !local || !token || !act) return;
    setLocal({ ...local, ...patch });
    void act(() => rpc.updateSettings(token, patch));
  }
  function pref<K extends keyof Prefs>(k: K) {
    setPref(k, !prefs[k]);
    setPrefs(getPrefs());
  }
  const minPlayers = Math.max(2, state?.players.length ?? 2);

  return (
    <motion.div className="sheet-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="sheet" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
        <div className="sheet-head">
          <h2><Icon name="gear" size={20} /> Settings</h2>
          <button className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>

        {local && (
          <section>
            <div className="sheet-sub">
              <span className="label">Room rules</span>
              <span className="muted small">
                {editable ? 'You’re the host — changes apply to everyone.' : state?.room.phase === 'lobby' ? 'Only the host can change these.' : 'Locked while a game is running.'}
              </span>
            </div>

            <div className="set-row">
              <span className="set-label"><Icon name="users" size={16} /> Max players</span>
              <div className="stepper">
                <button disabled={!editable || local.max_players <= minPlayers} onClick={() => change({ max_players: local.max_players - 1 })} aria-label="Fewer players">−</button>
                <b>{local.max_players}</b>
                <button disabled={!editable || local.max_players >= 12} onClick={() => change({ max_players: local.max_players + 1 })} aria-label="More players">+</button>
              </div>
            </div>

            {OPTIONS.map((o) => (
              <div className="set-row" key={o.key}>
                <span className="set-label"><Icon name={o.icon} size={16} /> {o.label}</span>
                <div className="seg" role="radiogroup" aria-label={o.label}>
                  {o.values.map((v) => (
                    <button key={v} role="radio" aria-checked={local[o.key] === v} className={local[o.key] === v ? 'on' : ''}
                      disabled={!editable} onClick={() => change({ [o.key]: v } as Partial<RoomSettings>)}>
                      {v}{o.unit}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <Toggle label="Answer time shrinks each round" icon="clock" on={local.shrink} disabled={!editable} onClick={() => change({ shrink: !local.shrink })} />
            <Toggle label="Cards (Attack / Shield / Cleanse)" icon="cards" on={local.cards} disabled={!editable} onClick={() => change({ cards: !local.cards })} />
            <Toggle label="Class perks" icon="bolt" on={local.perks} disabled={!editable} onClick={() => change({ perks: !local.perks })} />
          </section>
        )}

        <section>
          <div className="sheet-sub"><span className="label">This device</span></div>
          <Toggle label="Music" icon="volume" on={prefs.music} onClick={() => pref('music')} />
          <Toggle label="Sound effects" icon="burst" on={prefs.sfx} onClick={() => pref('sfx')} />
          <Toggle label="Announcer voice" icon="bulb" on={prefs.voice} onClick={() => pref('voice')} />
        </section>
        <a className="btn ghost block" href="/how-to-play" target="_blank" rel="noreferrer"><Icon name="play" size={16} /> How to play (video)</a>
      </motion.div>
    </motion.div>
  );
}

function Toggle({ label, icon, on, disabled, onClick }: { label: string; icon: IconName; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <div className="set-row">
      <span className="set-label"><Icon name={icon} size={16} /> {label}</span>
      <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}>
        <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 32 }} />
      </button>
    </div>
  );
}

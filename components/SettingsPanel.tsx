'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { getPrefs, setPref, type Prefs } from '@/lib/prefs';
import { getLang, setLang, UI_LANGS, WORD_LANGS, type Key, type UiLang, type WordLang } from '@/lib/i18n';
import { useT } from '@/lib/i18n/react';
import { rpc } from '@/lib/rpc';
import type { RoomSettings, RoomState } from '@/lib/types';
import { Icon, type IconName } from './icons';
import type { Act } from './phases';

type NumKey = 'answer_seconds' | 'guess_seconds' | 'react_seconds' | 'duel_seconds' | 'strikes';
const OPTIONS: { key: NumKey; label: Key; icon: IconName; values: number[]; unit: string; hint?: string }[] = [
  { key: 'answer_seconds', label: 'st.answer', icon: 'clock', values: [15, 30, 45, 60, 90, 120], unit: 's' },
  { key: 'guess_seconds', label: 'st.guess', icon: 'target', values: [10, 15, 20, 30, 45], unit: 's' },
  { key: 'react_seconds', label: 'st.cards_phase', icon: 'cards', values: [5, 8, 12, 20], unit: 's' },
  { key: 'duel_seconds', label: 'st.duel_rounds', icon: 'swords', values: [15, 20, 30, 45], unit: 's' },
  { key: 'strikes', label: 'st.strikes', icon: 'x', values: [1, 2, 3], unit: '' },
];

const TWISTS = ['none', 'reverse', 'chaos', 'memory'] as const;
const PACKS = ['all', 'classic', 'meme', 'fantasy', 'cyber', 'comedy'] as const;
const PRESETS: { id: string; label: Key; patch: Partial<RoomSettings> }[] = [
  { id: 'classic', label: 'st.p_classic', patch: { answer_seconds: 60, guess_seconds: 20, react_seconds: 8, strikes: 2, shrink: true } },
  { id: 'blitz', label: 'st.p_blitz', patch: { answer_seconds: 15, guess_seconds: 10, react_seconds: 5, strikes: 2, shrink: false } },
  { id: 'sudden', label: 'st.p_sudden', patch: { answer_seconds: 45, guess_seconds: 15, react_seconds: 6, strikes: 1, shrink: true } },
];
const PRESETS_ON = (cur: RoomSettings, patch: Partial<RoomSettings>) =>
  (Object.keys(patch) as (keyof RoomSettings)[]).every((k) => cur[k] === patch[k]);

export function SettingsButton({ state, token, act }: { state: RoomState | null; token: string | null; act?: Act }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="iconbtn" aria-label={t('hd.settings')} title={t('hd.settings')} onClick={() => setOpen(true)}>
        <Icon name="gear" />
      </button>
      <AnimatePresence>
        {open && <SettingsSheet state={state} token={token} act={act} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

function SettingsSheet({ state, token, act, onClose }: { state: RoomState | null; token: string | null; act?: Act; onClose: () => void }) {
  const t = useT();
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
      <motion.div className="msheet" role="dialog" aria-modal="true" aria-label={t('st.title')} onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
        <div className="sheet-head">
          <h2><Icon name="gear" size={20} /> {t('st.title')}</h2>
          <button className="iconbtn" aria-label={t('cs.close')} onClick={onClose}><Icon name="x" /></button>
        </div>

        {local && (
          <section>
            <div className="sheet-sub">
              <span className="label">{t('st.rules')}</span>
              <span className="muted small">
                {editable ? t('st.host_note') : state?.room.phase === 'lobby' ? t('st.only_host') : t('st.locked')}
              </span>
            </div>

            <div className="set-row">
              <span className="set-label"><Icon name="swords" size={16} /> {t('st.mode')}</span>
              <div className="seg" role="radiogroup" aria-label={t('st.mode')}>
                <button role="radio" aria-checked={local.mode === 'classic'} className={local.mode === 'classic' ? 'on' : ''} disabled={!editable}
                  onClick={() => change({ mode: 'classic' })}>{t('st.classic')}</button>
                <button role="radio" aria-checked={local.mode === 'duel'} className={local.mode === 'duel' ? 'on duel' : ''}
                  disabled={!editable || (state?.players.length ?? 0) > 2}
                  title={(state?.players.length ?? 0) > 2 ? t('st.duel_needs2') : undefined}
                  onClick={() => change({ mode: 'duel', max_players: 2 })}>{t('st.duel')}</button>
                <button role="radio" aria-checked={local.mode === 'team'} className={local.mode === 'team' ? 'on' : ''}
                  disabled={!editable || (state?.players.length ?? 0) > 6}
                  onClick={() => change({ mode: 'team' })}>{t('st.team')}</button>
              </div>
            </div>

            {local.mode === 'team' && (
              <>
                <div className="set-row">
                  <span className="set-label"><Icon name="users" size={16} /> {t('st.team_size')}</span>
                  <div className="seg" role="radiogroup" aria-label={t('st.team_size')}>
                    {([2, 3] as const).map((n) => (
                      <button key={n} role="radio" aria-checked={(local.team_size ?? 2) === n} className={(local.team_size ?? 2) === n ? 'on' : ''}
                        disabled={!editable || (state?.players.length ?? 0) > n * 2} onClick={() => change({ team_size: n })}>
                        {n === 2 ? t('st.2v2') : t('st.3v3')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="set-row">
                  <span className="set-label"><Icon name="target" size={16} /> {t('st.rounds')}</span>
                  <div className="stepper">
                    <button disabled={!editable || (local.rounds ?? 5) <= 1} onClick={() => change({ rounds: (local.rounds ?? 5) - 1 })} aria-label={t('st.fewer')}>−</button>
                    <b>{local.rounds ?? 5}</b>
                    <button disabled={!editable || (local.rounds ?? 5) >= 8} onClick={() => change({ rounds: (local.rounds ?? 5) + 1 })} aria-label={t('st.more')}>+</button>
                  </div>
                </div>
                <span className="muted small">{t('st.team_hint')}</span>
              </>
            )}

            {local.mode !== 'team' && (
              <div className="set-row col-row">
                <span className="set-label"><Icon name="bolt" size={16} /> {t('st.presets')}</span>
                <div className="seg wrap" role="group" aria-label={t('st.presets')}>
                  {PRESETS.map((p) => (
                    <button key={p.id} className={PRESETS_ON(local, p.patch) ? 'on' : ''} disabled={!editable} onClick={() => change(p.patch)}>{t(p.label)}</button>
                  ))}
                </div>
                <span className="muted small">{t('st.p_hint')}</span>
              </div>
            )}

            {local.mode !== 'team' && (
              <div className="set-row col-row">
                <span className="set-label"><Icon name="dice" size={16} /> {t('st.twist')}</span>
                <div className="seg wrap" role="group" aria-label={t('st.twist')}>
                  {TWISTS.map((w) => (
                    <button key={w} className={(local.twist ?? 'none') === w ? 'on' : ''} disabled={!editable} onClick={() => change({ twist: w })}>{t(`st.tw_${w}` as Key)}</button>
                  ))}
                </div>
                <span className="muted small">{t(`st.twh_${local.twist ?? 'none'}` as Key)}</span>
              </div>
            )}

            {(local.lang ?? 'en') === 'en' && (
              <div className="set-row col-row">
                <span className="set-label"><Icon name="dice" size={16} /> {t('st.pack')}</span>
                <div className="seg wrap" role="group" aria-label={t('st.pack')}>
                  {PACKS.map((k) => (
                    <button key={k} className={(local.pack ?? 'all') === k ? 'on' : ''} disabled={!editable} onClick={() => change({ pack: k })}>{t(`st.pk_${k}` as Key)}</button>
                  ))}
                </div>
              </div>
            )}

            {local.mode === 'classic' && <div className="set-row">
              <span className="set-label"><Icon name="users" size={16} /> {t('st.max')}</span>
              <div className="stepper">
                <button disabled={!editable || local.max_players <= minPlayers} onClick={() => change({ max_players: local.max_players - 1 })} aria-label={t('st.fewer')}>−</button>
                <b>{local.max_players}</b>
                <button disabled={!editable || local.max_players >= 12} onClick={() => change({ max_players: local.max_players + 1 })} aria-label={t('st.more')}>+</button>
              </div>
            </div>}

            {OPTIONS.filter((o) => !(local.mode === 'team' && (o.key === 'strikes' || o.key === 'duel_seconds'))).map((o) => (
              <div className="set-row" key={o.key}>
                <span className="set-label"><Icon name={o.icon} size={16} /> {t(o.label)}</span>
                <div className="seg" role="radiogroup" aria-label={t(o.label)}>
                  {o.values.map((v) => (
                    <button key={v} role="radio" aria-checked={local[o.key] === v} className={local[o.key] === v ? 'on' : ''}
                      disabled={!editable} onClick={() => change({ [o.key]: v } as Partial<RoomSettings>)}>
                      {v}{o.unit}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <Toggle label={t('st.shrink')} icon="clock" on={local.shrink} disabled={!editable} onClick={() => change({ shrink: !local.shrink })} />
            <Toggle label={t('st.cards')} icon="cards" on={local.cards} disabled={!editable} onClick={() => change({ cards: !local.cards })} />
            <Toggle label={t('st.perks')} icon="bolt" on={local.perks} disabled={!editable} onClick={() => change({ perks: !local.perks })} />
            {local.mode !== 'team' && <Toggle label={t('st.mind')} icon="eye" on={!!local.mindgames} disabled={!editable} onClick={() => change({ mindgames: !local.mindgames })} />}
            <Toggle label={t('st.weekly')} icon="dice" on={!!local.weekly} disabled={!editable} onClick={() => change({ weekly: !local.weekly })} />
            {local.mode !== 'team' && <Toggle label={t('st.ults')} icon="bolt" on={!!local.ultimates} disabled={!editable} onClick={() => change({ ultimates: !local.ultimates })} />}
          </section>
        )}

        <section>
          <div className="sheet-sub"><span className="label">{t('st.lang')}</span></div>
          <div className="set-row">
            <span className="set-label"><Icon name="globe" size={16} /> {t('st.ui_lang')}</span>
            <select className="lang-select" value={getLang()} aria-label={t('st.ui_lang')}
              onChange={(e) => setLang(e.target.value as UiLang)}>
              {UI_LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          {local && (
            <div className="set-row col-row">
              <span className="set-label"><Icon name="lock" size={16} /> {t('st.word_lang')}</span>
              <div className="seg wrap" role="radiogroup" aria-label={t('st.word_lang')}>
                {WORD_LANGS.map((l) => (
                  <button key={l.code} role="radio" aria-checked={(local.lang ?? 'en') === l.code}
                    className={(local.lang ?? 'en') === l.code ? 'on' : ''} disabled={!editable}
                    onClick={() => change({ lang: l.code as WordLang })}>{l.name}</button>
                ))}
              </div>
              <span className="muted small">{t('st.word_lang_hint')}</span>
            </div>
          )}
        </section>

        <section>
          <div className="sheet-sub"><span className="label">{t('st.device')}</span></div>
          <Toggle label={t('st.music')} icon="volume" on={prefs.music} onClick={() => pref('music')} />
          <Toggle label={t('st.sfx')} icon="burst" on={prefs.sfx} onClick={() => pref('sfx')} />
          <Toggle label={t('st.voice')} icon="bulb" on={prefs.voice} onClick={() => pref('voice')} />
        </section>
        <a className="btn ghost block" href="/how-to-play" target="_blank" rel="noreferrer"><Icon name="play" size={16} /> {t('st.howto')}</a>
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

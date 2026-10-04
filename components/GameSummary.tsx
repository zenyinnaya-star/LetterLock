'use client';

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { useT } from '@/lib/i18n/react';
import { levelFloor, levelOf, titleKey } from '@/lib/profile';
import { rpc, type GameStat } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import { Icon } from './icons';
import { softSpring, spring } from './ui';

/** Finish screen: per-player stats, then my XP result (bar, level-ups, new achievements). */
export function GameSummary({ state }: { state: RoomState }) {
  const t = useT();
  const [stats, setStats] = useState<GameStat[] | null>(null);
  const code = state.room.code;
  useEffect(() => {
    let alive = true;
    void rpc.gameStats(code).then((s) => { if (alive) setStats(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [code]);
  if (!stats || stats.length === 0) return null;
  const me = state.me ? stats.find((s) => s.player_id === state.me!.id) : undefined;
  const fastest = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`);
  const solo = state.players.some((p) => (stats.find((s) => s.player_id === p.id) as (GameStat & { bot?: boolean }) | undefined)?.bot);

  return (
    <>
      {me && me.xp_gained > 0 && me.xp_after != null && <XpCard me={me} solo={solo} />}
      <div className="stats-table" role="table" aria-label={t('pf.stats')}>
        <div className="label">{t('pf.stats')}</div>
        <div className="st-row st-head" role="row">
          <span />
          <span>{t('pf.s_correct')}</span><span>{t('pf.s_wrong')}</span><span>{t('pf.s_streak')}</span><span>{t('pf.s_fast')}</span><span>{t('pf.s_hits')}</span>
        </div>
        {stats.map((s, i) => (
          <motion.div key={s.player_id} className={`st-row${s.player_id === state.me?.id ? ' me' : ''}`} role="row"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 + i * 0.07 }}>
            <b className="st-name">{s.name}</b>
            <span>{s.correct}</span><span>{s.wrong}</span><span>{s.best_streak}</span><span>{fastest(s.fastest_ms)}</span>
            <span>{s.hits}/{s.shots}</span>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function XpCard({ me, solo }: { me: GameStat & { xp_gained: number; xp_after: number | null; new_ach?: string[] }; solo: boolean }) {
  const t = useT();
  const after = me.xp_after ?? 0;
  const before = after - me.xp_gained;
  const lvB = levelOf(before);
  const lvA = levelOf(after);
  const pctAt = (xp: number, lv: number) => Math.min(100, ((xp - levelFloor(lv)) / (levelFloor(lv + 1) - levelFloor(lv))) * 100);
  const [pct, setPct] = useState(pctAt(before, lvB));
  useEffect(() => {
    const id = window.setTimeout(() => setPct(lvA > lvB ? 100 : pctAt(after, lvA)), 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ach = me.new_ach ?? [];
  return (
    <motion.div className="xp-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay: 0.5 }}>
      <div className="xp-top">
        <span className="xp-gain">{t('pf.xp_gain', { n: me.xp_gained })}</span>
        <span className="muted small">{t('pf.level', { n: lvB })} · {t(`ttl.${titleKey(lvB)}` as never)}</span>
      </div>
      <div className="xp-bar"><motion.i animate={{ width: `${pct}%` }} transition={{ duration: 1.1, ease: 'easeOut' }} /></div>
      {lvA > lvB && (
        <motion.div className="levelup" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: 1.7 }}>
          <Icon name="sparkle" size={18} /> {t('pf.level_up', { n: lvA })}
        </motion.div>
      )}
      {ach.length > 0 && (
        <div className="new-ach">
          {ach.map((id, i) => {
            const a = ACHIEVEMENTS.find((x) => x.id === id);
            if (!a) return null;
            return (
              <motion.div key={id} className="ach-pop" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 1.2 + i * 0.25 }}>
                <span className="ach-ico"><Icon name={a.icon} size={18} /></span>
                <span><b>{t(`ach.${id}` as never)}</b><br /><span className="muted small">{t(`ach.${id}_d` as never)}</span></span>
              </motion.div>
            );
          })}
        </div>
      )}
      {solo && <div className="muted small center">{t('pf.solo_half')}</div>}
    </motion.div>
  );
}

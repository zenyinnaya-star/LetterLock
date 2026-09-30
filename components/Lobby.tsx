'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { saveAvatar } from '@/lib/avatar';
import { rpc } from '@/lib/rpc';
import { WORD_LANGS } from '@/lib/i18n';
import { useT } from '@/lib/i18n/react';
import type { RoomState } from '@/lib/types';
import { CLASSES } from '@/lib/classes';
import { Icon } from './icons';
import { AvatarPicker } from './AvatarPicker';
import { PlayerAvatar } from './PlayerAvatar';
import { TeamLobby } from './team';
import type { Act } from './phases';
import { SettingsButton } from './SettingsPanel';
import { ClassPicker, softSpring, spring } from './ui';

export function Lobby({ state, token, act, onLeave, bots = [], pingBots }: {
  state: RoomState; token: string | null; act: Act; onLeave: () => void; bots?: string[]; pingBots?: () => Promise<void>;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const me = state.me;
  const isHost = !!me && me.id === state.room.host_id;
  const count = state.players.length;
  const cfg = state.room.settings;
  const max = cfg?.max_players ?? 8;
  const duelMode = cfg?.mode === 'duel';
  const teamMode = cfg?.mode === 'team';
  const teamSize = cfg?.team_size ?? 2;
  const teamsReady = teamMode && (state.teams ?? []).length === 2 && state.players.every((p) => p.team_id)
    && (state.teams ?? []).every((tm) => state.players.filter((p) => p.team_id === tm.id).length >= 2);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/room/${state.room.code}` : '';

  async function copy() {
    try {
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) {
        await navigator.share({ title: t('lb.share_title'), text: t('lb.share_text', { code: state.room.code }), url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    } catch { /* cancelled */ }
  }

  return (
    <>
      <div className="col" style={{ alignItems: 'center', gap: 10 }}>
        <span className="label">{t('lb.code')}</span>
        <div className="lobby-code">
          {state.room.code.split('').map((c, i) => (
            <motion.span key={i} className="tile" initial={{ y: -60, rotate: -20, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }}
              transition={{ ...spring, delay: i * 0.08 }}>{c}</motion.span>
          ))}
        </div>
        <button className="btn sm ghost" onClick={copy}>
          <Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? t('lb.copied') : t('lb.share')}
        </button>
      </div>

      {teamMode ? (
        <TeamLobby state={state} token={token} act={act} />
      ) : duelMode ? (
        <div className="duel-lobby">
          <DuelSeat p={state.players[0]} meId={me?.id} side="left" />
          <motion.span className="dl-vs" initial={{ scale: 3, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 16, delay: 0.3 }}>VS</motion.span>
          <DuelSeat p={state.players[1]} meId={me?.id} side="right" />
        </div>
      ) : (
      <div className="seats">
          <AnimatePresence initial={false}>
            {state.players.map((p) => (
              <motion.div key={p.id} layout className={`seat${p.id === me?.id ? ' me' : ''}`}
                initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring}>
                <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={softSpring}>
                  <PlayerAvatar p={p} size={56} />
                </motion.div>
                <b>{p.name}{bots.includes(p.id) && <span className="bot-tag">{t('solo.tag')}</span>}{p.is_host && <span style={{ color: 'var(--accent)' }} title={t('lb.host')}><Icon name="crown" size={14} /></span>}</b>
                {isHost && bots.includes(p.id) && <button className="bot-x" aria-label={t('solo.remove')} title={t('solo.remove')}
                  onClick={() => token && void act(() => rpc.removeBot(token, p.id).then(() => pingBots?.()))}><Icon name="x" size={12} /></button>}
                {p.class ? <span className="muted small">{CLASSES[p.class].name}</span>
                  : <span className="class-hidden"><Icon name="mask" size={12} /> {t('lb.secret')}</span>}
              </motion.div>
            ))}
            {Array.from({ length: Math.max(0, Math.min(max, Math.max(4, count + 1)) - count) }, (_, i) => (
              <motion.div key={`empty-${i}`} layout className="seat empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {t('lb.waiting_seat')}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {me && (
        <div className="narrow-col">
          <span className="label">{t('lb.avatar')}</span>
          <AvatarPicker name={me.name} url={state.players.find((p) => p.id === me.id)?.avatar_url ?? null}
            onChange={(url) => { saveAvatar(url); if (token) void act(() => rpc.setAvatar(token, url)); }} />
        </div>
      )}

      {me && (
        <div className="narrow-col">
          <span className="label">{t('lb.class')}</span>
          <ClassPicker value={me.class} onChange={(c) => token && void act(() => rpc.setClass(token, c))} />
        </div>
      )}

      {isHost && !teamMode && (
        <div className="bot-row">
          <span className="label">{t('solo.add')}</span>
          {([1, 2, 3] as const).map((lv) => (
            <button key={lv} className="btn sm ghost" disabled={count >= max || (duelMode && count >= 2)}
              onClick={() => token && void act(() => rpc.addBot(token, lv).then(() => pingBots?.()))}>
              + {t(lv === 1 ? 'solo.easy' : lv === 2 ? 'solo.medium' : 'solo.hard')}
            </button>
          ))}
        </div>
      )}

      {cfg && (
        <div className="rules-strip">
          {teamMode && <span className="duel-tag"><Icon name="users" size={14} /> {t('tm.rules_strip', { size: teamSize, n: cfg.rounds ?? 5 })}</span>}
          {duelMode && <span className="duel-tag"><Icon name="swords" size={14} /> {t('lb.duel_tag')}</span>}
          <span><Icon name="users" size={14} /> {count}/{max}</span>
          <span><Icon name="clock" size={14} /> {t('lb.answers', { n: cfg.answer_seconds })}{cfg.shrink ? t('lb.shrinking') : ''}</span>
          <span><Icon name="target" size={14} /> {t('lb.guesses', { n: cfg.guess_seconds })}</span>
          <span><Icon name="x" size={14} /> {teamMode ? t('tm.no_strikes') : cfg.strikes > 1 ? t('lb.strikes', { n: cfg.strikes }) : t('lb.strike1')}</span>
          <span className={cfg.cards ? '' : 'off'}><Icon name="cards" size={14} /> {cfg.cards ? t('lb.cards_on') : t('lb.cards_off')}</span>
          <span className={cfg.perks ? '' : 'off'}><Icon name="bolt" size={14} /> {cfg.perks ? t('lb.perks_on') : t('lb.perks_off')}</span>
          <span className="lang-chip"><Icon name="globe" size={14} /> {t('lb.words_in', { lang: WORD_LANGS.find((l) => l.code === (cfg.lang ?? 'en'))?.name ?? 'English' })}</span>
          {isHost && <SettingsButton state={state} token={token} act={act} />}
        </div>
      )}

      <div className="narrow-col">
        {isHost ? (
          <>
            <button className="btn lg block" disabled={teamMode ? !teamsReady : count < 2} onClick={() => token && void act(() => rpc.start(token))}>
              {teamMode ? (teamsReady ? t('tm.start', { n: count }) : t('tm.need_full')) : count < 2 ? (duelMode ? t('lb.wait_challenger') : t('lb.wait_more')) : duelMode ? t('lb.fight') : t('lb.start', { n: count })}
            </button>
            <div className="muted small center">{t('lb.host_hint')}</div>
          </>
        ) : (
          <div className="center muted">{t('lb.wait_host', { n: count, max })}</div>
        )}
        {me && (
          <button className="btn ghost block" onClick={onLeave}>
            <Icon name="logout" size={18} /> {t('lb.leave')}
          </button>
        )}
      </div>
    </>
  );
}

function DuelSeat({ p, meId, side }: { p: RoomState['players'][number] | undefined; meId: string | undefined; side: 'left' | 'right' }) {
  const t = useT();
  if (!p) {
    return (
      <motion.div className={`dl-seat empty ${side}`} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.8 }}>
        <span className="dl-q">?</span>
        <b>{t('lb.wait_challenger')}</b>
        <span className="muted small">{t('lb.share_code')}</span>
      </motion.div>
    );
  }
  return (
    <motion.div className={`dl-seat ${side}${p.id === meId ? ' me' : ''}`}
      initial={{ x: side === 'left' ? -120 : 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
      <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }}><PlayerAvatar p={p} size={120} className="dl-av" /></motion.div>
      <b>{p.name}{p.is_host && <span style={{ color: 'var(--accent)' }}><Icon name="crown" size={14} /></span>}</b>
      <span className="muted small">{p.id === meId ? t('lb.your_secret') : t('lb.secret_class')}</span>
    </motion.div>
  );
}

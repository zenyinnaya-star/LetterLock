'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { saveAvatar } from '@/lib/avatar';
import { rpc } from '@/lib/rpc';
import { WORD_LANGS } from '@/lib/i18n';
import { useT } from '@/lib/i18n/react';
import type { RoomState } from '@/lib/types';
import { CLASSES } from '@/lib/classes';
import { ClassIcon, Icon } from './icons';
import { AvatarPicker } from './AvatarPicker';
import { PlayerAvatar } from './PlayerAvatar';
import { TeamLobby } from './team';
import type { Act } from './phases';
import { SettingsButton } from './SettingsPanel';
import { HeroCards } from './HeroCards';
import type { HeroId } from '@/lib/heroes';
import { softSpring, spring } from './ui';

const STYLE_KEYS = ['solo.s0', 'solo.s1', 'solo.s2', 'solo.s3'] as const;

export function Lobby({ state, token, act, onLeave, bots = [], botInfo, pingBots }: {
  state: RoomState; token: string | null; act: Act; onLeave: () => void; bots?: string[]; botInfo?: Record<string, { l: number; s: number }>; pingBots?: () => Promise<void>;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [botStyle, setBotStyle] = useState(0);
  const [story, setStory] = useState(false);
  const [picks, setPicks] = useState<{ player_id: string; hero: string }[]>([]);
  useEffect(() => {
    try { if (sessionStorage.getItem(`letterlock:story:${state.room.code}`) === '1') setStory(true); } catch { /* ignore */ }
  }, [state.room.code]);
  useEffect(() => {
    if (!token) return;
    rpc.storyInfo(token).then((i) => { if (i.story) setStory(true); setPicks(i.picks); }).catch(() => undefined);
  }, [token, state.room.state_version]);
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
                {bots.includes(p.id) && botInfo?.[p.id] && (() => {
                  const bi = botInfo[p.id];
                  const cycle = (l: number, s: number) => token && void act(() => rpc.setBot(token, p.id, l, s).then(() => pingBots?.()));
                  return (
                    <span className="bot-chips">
                      <button className="bot-chip" disabled={!isHost} title={t('solo.tap_level')}
                        onClick={() => cycle(bi.l % 3 + 1, bi.s)}>{t(bi.l === 1 ? 'solo.easy' : bi.l === 2 ? 'solo.medium' : 'solo.hard')}</button>
                      <button className="bot-chip sty" disabled={!isHost} title={t('solo.tap_style')}
                        onClick={() => cycle(bi.l, (bi.s + 1) % 4)}>{t(STYLE_KEYS[bi.s])}</button>
                    </span>
                  );
                })()}
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
          {me.class && (
            <div className="class-chosen locked" aria-label={CLASSES[me.class].name}>
              <ClassIcon cls={me.class} size={44} />
              <span className="col" style={{ gap: 0, textAlign: 'left' }}><b>{CLASSES[me.class].name}</b><span className="muted small">{CLASSES[me.class].tagline}</span></span>
              <Icon name="lock" size={16} />
            </div>
          )}
        </div>
      )}

      {isHost && !teamMode && (
        <div className="bot-row">
          <span className="label">{t('solo.add')}</span>
          <span className="bot-styles" role="group" aria-label={t('solo.style')}>
            {[0, 1, 2, 3].map((s) => (
              <button key={s} className={`chip${botStyle === s ? ' on' : ''}`} aria-pressed={botStyle === s} onClick={() => setBotStyle(s)}>{t(STYLE_KEYS[s])}</button>
            ))}
          </span>
          {([1, 2, 3] as const).map((lv) => (
            <button key={lv} className="btn sm ghost" disabled={count >= max || (duelMode && count >= 2)}
              onClick={() => token && void act(() => rpc.addBot(token, lv, botStyle).then(() => pingBots?.()))}>
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

      {story && (
        <div className="hc-lobby">
          <HeroCards value={(picks.find((x) => x.player_id === state.me?.id)?.hero as HeroId) ?? null}
            taken={Object.fromEntries(picks.filter((x) => x.player_id !== state.me?.id).map((x) => [x.hero, state.players.find((p) => p.id === x.player_id)?.name ?? 'a player']))}
            onPick={(h) => token && void act(() => rpc.setHero(token, h))} />
          <div className="muted small center">Pick your hero. Unpicked heroes are assigned automatically when the Story begins.</div>
        </div>
      )}

      <div className="narrow-col">
        {isHost ? (
          <>
            {story ? (
              <button className="btn lg block" onClick={() => token && void act(() => rpc.startPve(token))}>
                ⚔ Begin the Story ({count} {count === 1 ? 'hero' : 'heroes'})
              </button>
            ) : (
              <>
            <button className="btn lg block" disabled={teamMode ? !teamsReady : count < 2} onClick={() => token && void act(() => rpc.start(token))}>
              {teamMode ? (teamsReady ? t('tm.start', { n: count }) : t('tm.need_full')) : count < 2 ? (duelMode ? t('lb.wait_challenger') : t('lb.wait_more')) : duelMode ? t('lb.fight') : t('lb.start', { n: count })}
            </button>
              </>
            )}
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

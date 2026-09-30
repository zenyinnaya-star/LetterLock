'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { announcer } from '@/lib/announcer';
import { audio } from '@/lib/audio';
import { CHAOS_INFO, CLASSES } from '@/lib/classes';
import { t as tr } from '@/lib/i18n';
import { Rich, useT } from '@/lib/i18n/react';
import type { FeedItem, PlayerClass, RoomState } from '@/lib/types';
import { ClassIcon, Icon, type IconName } from './icons';
import { TeamImage, teamLabel } from './team';
import { PlayerAvatar } from './PlayerAvatar';

const LOOK: Record<FeedItem['type'], { icon: IconName; tone: string; sfx: () => void }> = {
  attack: { icon: 'burst', tone: 'hit', sfx: () => audio.hit() },
  hack: { icon: 'terminal', tone: 'hack', sfx: () => audio.hack() },
  block: { icon: 'shield', tone: 'block', sfx: () => audio.block() },
  cleanse: { icon: 'sparkle', tone: 'cleanse', sfx: () => audio.cleanse() },
  absorb: { icon: 'shield', tone: 'absorb', sfx: () => audio.absorb() },
  caught: { icon: 'alert', tone: 'caught', sfx: () => audio.caught() },
  trace_miss: { icon: 'miss', tone: 'miss', sfx: () => audio.denied() },
  chicken: { icon: 'feather', tone: 'chicken', sfx: () => audio.chicken() },
  bet: { icon: 'coin', tone: 'gold', sfx: () => audio.coin() },
  bet_win: { icon: 'coin', tone: 'gold', sfx: () => audio.cashout() },
  bet_lose: { icon: 'coin', tone: 'hit', sfx: () => audio.bust() },
  steal: { icon: 'hand', tone: 'thief', sfx: () => audio.swipe() },
  drop: { icon: 'hand', tone: 'miss', sfx: () => audio.swipe() },
  latch: { icon: 'link2', tone: 'parasite', sfx: () => audio.squelch() },
  drain: { icon: 'drop', tone: 'parasite', sfx: () => audio.squelch() },
  host_down: { icon: 'skull', tone: 'hit', sfx: () => audio.buzzer() },
  mimic: { icon: 'mask', tone: 'mimic', sfx: () => audio.morph() },
  oracle: { icon: 'orb', tone: 'oracle', sfx: () => audio.mystic() },
  swap: { icon: 'swap', tone: 'jester', sfx: () => audio.whoosh() },
  chaos: { icon: 'dice', tone: 'chaos', sfx: () => audio.wheel() },
};

const ARROW_TYPES = ['attack', 'hack', 'block', 'absorb', 'caught', 'trace_miss', 'steal', 'drop', 'latch', 'drain', 'host_down', 'mimic', 'swap'];

/**
 * Big "who did what to whom" banners with a sound for every attack, hack, block, cleanse and rage quit.
 * Driven by the server's action feed, so every screen in the room sees the same thing.
 */
export function ActionFeed({ state }: { state: RoomState }) {
  const seen = useRef<number | null>(null);
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [current, setCurrent] = useState<FeedItem | null>(null);
  const playersRef = useRef(state.players);
  playersRef.current = state.players;
  const stateRef = useRef(state);
  stateRef.current = state;
  const meId = state.me?.id ?? null;

  // collect new items (skip everything already there on first load / reconnect)
  useEffect(() => {
    const maxId = state.feed.reduce((m, f) => Math.max(m, f.id), 0);
    if (seen.current === null) { seen.current = maxId; return; }
    const fresh = state.feed.filter((f) => f.id > (seen.current ?? 0));
    if (fresh.length) {
      seen.current = maxId;
      setQueue((q) => [...q, ...fresh].slice(-8));
    }
  }, [state.feed]);

  // play them one at a time
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    // recorded effects: hit by a character's attack / hack, and the Gambler's bet
    const cur = stateRef.current;
    const target = cur.players.find((p) => p.id === next.to);
    const aimedAtMe = !!meId && (next.to === meId || (cur.room.settings?.mode === 'team' && !!target?.team_id && target.team_id === cur.me?.team_id));
    if (next.type === 'attack' && aimedAtMe) {
      audio.file((next.amount ?? 1) >= 2 ? 'cannon' : 'sword-slash');
      if (next.from_class === 'villain') audio.file('villain-laugh', 0.35);
    } else if (next.type === 'hack' && aimedAtMe) audio.file('access-denied');
    else if (next.type === 'bet') audio.file('money');
    else if (next.type === 'block') audio.file('metal-clang');
    else if (next.type === 'steal') audio.file('coin-swipe');
    else if (next.type === 'oracle') audio.file('mystical-harp');
    else LOOK[next.type].sfx();
    const name = (id?: string | null) => playersRef.current.find((p) => p.id === id)?.name
      ?? (id === next.from && next.from_class ? tr('an.The', { cls: CLASSES[next.from_class].name }) : undefined);
    if (next.type === 'chicken') announcer.say(tr('an.chicken', { name: next.name ?? name(next.from) ?? tr('an.someone') }), { hype: true, delay: 900 });
    if (next.type === 'caught') announcer.say(tr('an.caught', { name: name(next.to) ?? tr('an.them') }), { hype: true, delay: 700 });
    const tmSt = stateRef.current;
    if (tmSt.room.settings?.mode === 'team' && next.type === 'attack') {
      const tt = tmSt.teams?.find((x) => x.id === tmSt.players.find((p) => p.id === next.to)?.team_id);
      if (tt) announcer.say(tr('an.team_hit', { team: teamLabel(tr as never, tt) }), { hype: true, delay: 300 });
    }
    if (next.type === 'hack' && next.to === meId) announcer.say(tr('an.hacked'), { urgent: true, delay: 500 });
    if (next.type === 'chaos' && next.what) announcer.say(tr('an.wild', { name: CHAOS_INFO[next.what]?.name ?? '', text: CHAOS_INFO[next.what]?.text ?? '' }), { hype: true, delay: 1200 });
    if (next.type === 'mimic' && next.what) announcer.say(tr('an.mimic', { a: name(next.from) ?? tr('an.the_mimic'), cls: CLASSES[next.what as PlayerClass]?.name ?? next.what }), { delay: 600 });
    if (next.type === 'swap') announcer.say(tr('an.swap'), { hype: true, delay: 400 });
    if (next.type === 'bet_lose') announcer.say(tr('an.bust', { name: name(next.from) ?? tr('an.the_gambler') }), { delay: 500 });
    const long = ['chicken', 'caught', 'chaos', 'mimic', 'swap'].includes(next.type);
    const id = window.setTimeout(() => setCurrent(null), long ? 2800 : 1900);
    return () => window.clearTimeout(id);
  }, [queue, current, meId]);

  return (
    <div className="action-feed" aria-live="polite">
      <AnimatePresence>
        {current && <Banner key={current.id} item={current} state={state} meId={meId} />}
      </AnimatePresence>
    </div>
  );
}

function Banner({ item, state, meId }: { item: FeedItem; state: RoomState; meId: string | null }) {
  const t = useT();
  const p = (id?: string | null) => state.players.find((x) => x.id === id);
  const from = p(item.from);
  const to = p(item.to);
  const look = LOOK[item.type];
  const nm = (x: ReturnType<typeof p>, fallback: string) => (x ? (x.id === meId ? t('fd.you') : x.name) : fallback);
  // classic mode hides who did it — you only learn the class ("The Ninja attacked Ava")
  const actor: string = from ? nm(from, '?') : item.from_class ? t('fd.the', { cls: CLASSES[item.from_class].name }) : t('fd.someone');

  let text: React.ReactNode;
  const teamMode = state.room.settings?.mode === 'team';
  const toTeam = teamMode && to?.team_id ? state.teams?.find((x) => x.id === to.team_id) : undefined;
  const b = toTeam ? teamLabel(t, toTeam) : nm(to, '?');
  const n = item.amount ?? 1;
  const R = (k: Parameters<typeof Rich>[0]['k'], extra?: React.ReactNode) => <><Rich k={k} vars={{ a: actor, b }} />{extra}</>;
  switch (item.type) {
    case 'attack': text = R('fd.attacked', <em>{n > 1 ? t('fd.locks', { n }) : t('fd.lock1')}</em>); break;
    case 'hack': text = <><Rich k="fd.got" vars={{ b }} /> <span className="glitch-word">{t('fd.hacked_word')}</span><em>{from ? t('fd.by', { name: from.name }) : t('fd.by_someone')}</em></>; break;
    case 'block': text = item.what === 'ninja' ? R('fd.blocked_ninja') : <Rich k="fd.blocked" vars={{ a: actor, b: toTeam ? b : to ? to.name : t('fd.a_hack') }} />; break;
    case 'cleanse': text = R('fd.cleansed'); break;
    case 'absorb': text = R('fd.absorbed', <em>+5</em>); break;
    case 'caught': text = R('fd.caught', <em>{t('fd.exposed')}</em>); break;
    case 'trace_miss': text = R('fd.traced', <em>{t('fd.wrong')}</em>); break;
    case 'chicken': text = <><Rich k="fd.chicken" vars={{ a: item.name ?? nm(from, t('fd.someone')) }} /><em>{t('fd.rage')}</em></>; break;
    case 'bet': text = R('fd.bet', <em>{t('fd.bet_sub')}</em>); break;
    case 'bet_win': text = R('fd.cashout', <em>{t('fd.plus_pts', { n: item.amount ?? 0 })}</em>); break;
    case 'bet_lose': text = R('fd.bust', <em>{t('fd.minus_pts', { n: item.amount ?? 0 })}</em>); break;
    case 'steal': text = R('fd.steal'); break;
    case 'drop': text = R('fd.drop'); break;
    case 'latch': text = R('fd.latch', <em>{t('fd.parasite')}</em>); break;
    case 'drain': text = R('fd.drain', <em>{n > 1 ? t('fd.minus_locks', { n }) : t('fd.minus_lock1')}</em>); break;
    case 'host_down': text = R('fd.host_down', <em>{t('fd.strike')}</em>); break;
    case 'mimic': text = R('fd.mimic', <em>{t('fd.now_a', { cls: CLASSES[item.what as PlayerClass]?.name ?? item.what ?? '' })}</em>); break;
    case 'oracle': text = R('fd.oracle', <em>{t('fd.oracle_sub')}</em>); break;
    case 'swap': text = R('fd.swap', <em>{t('fd.switcheroo')}</em>); break;
    case 'chaos': text = <><b>{t('fd.wildcard')}</b> {CHAOS_INFO[item.what ?? '']?.name ?? 'chaos'}<em>{CHAOS_INFO[item.what ?? '']?.text}</em></>; break;
  }
  const showArrow = ARROW_TYPES.includes(item.type);
  const hidden = item.type === 'hack' && !from;

  return (
    <motion.div className={`action-banner ${look.tone}`}
      initial={{ y: -60, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, opacity: 1, scale: 1, x: item.type === 'attack' || item.type === 'hack' ? [0, -8, 8, -5, 0] : 0 }}
      exit={{ y: -30, opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 520, damping: 24 }}>
      <div className="who">
        {hidden ? <span className="anon"><Icon name="terminal" size={22} /></span>
          : from && item.type !== 'chicken' ? <PlayerAvatar p={from} size={40} />
          : item.from_class ? <ClassIcon cls={item.from_class} size={40} /> : null}
        {item.type === 'chicken' && <motion.span className="chicken" animate={{ rotate: [0, -18, 14, -10, 0], y: [0, -6, 0] }} transition={{ repeat: 2, duration: 0.5 }}><Icon name="feather" size={30} /></motion.span>}
        {showArrow && (
          <motion.span className="arrow" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.1, duration: 0.25 }}>
            <Icon name={look.icon} size={22} />
          </motion.span>
        )}
        {!showArrow && item.type !== 'chicken' && <span className="arrow solo"><Icon name={look.icon} size={22} /></span>}
        {showArrow && to && <motion.span initial={{ scale: 1 }} animate={{ scale: [1, 1.25, 1] }} transition={{ delay: 0.3 }}>{toTeam ? <TeamImage team={toTeam} size={40} /> : <PlayerAvatar p={to} size={40} />}</motion.span>}
      </div>
      <div className="txt">{text}</div>
    </motion.div>
  );
}

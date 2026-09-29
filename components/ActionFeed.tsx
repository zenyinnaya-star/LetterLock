'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { announcer } from '@/lib/announcer';
import { audio } from '@/lib/audio';
import { CHAOS_INFO, CLASSES } from '@/lib/classes';
import type { FeedItem, PlayerClass, RoomState } from '@/lib/types';
import { ClassIcon, Icon, type IconName } from './icons';
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
    LOOK[next.type].sfx();
    const name = (id?: string | null) => playersRef.current.find((p) => p.id === id)?.name
      ?? (id === next.from && next.from_class ? `The ${CLASSES[next.from_class].name}` : undefined);
    if (next.type === 'chicken') announcer.say(`${next.name ?? name(next.from) ?? 'Someone'} chickened out! Bawk bawk!`, { hype: true, delay: 900 });
    if (next.type === 'caught') announcer.say(`Hacker caught! It was ${name(next.to) ?? 'them'}!`, { hype: true, delay: 700 });
    if (next.type === 'hack' && next.to === meId) announcer.say("You've been hacked!", { urgent: true, delay: 500 });
    if (next.type === 'chaos' && next.what) announcer.say(`Wildcard! ${CHAOS_INFO[next.what]?.name ?? ''}! ${CHAOS_INFO[next.what]?.text ?? ''}`, { hype: true, delay: 1200 });
    if (next.type === 'mimic' && next.what) announcer.say(`${name(next.from) ?? 'The Mimic'} became the ${CLASSES[next.what as PlayerClass]?.name ?? next.what}!`, { delay: 600 });
    if (next.type === 'swap') announcer.say('Switcheroo!', { hype: true, delay: 400 });
    if (next.type === 'bet_lose') announcer.say(`${name(next.from) ?? 'The Gambler'} busts!`, { delay: 500 });
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
  const p = (id?: string | null) => state.players.find((x) => x.id === id);
  const from = p(item.from);
  const to = p(item.to);
  const look = LOOK[item.type];
  const nm = (x: ReturnType<typeof p>, fallback: string) => (x ? (x.id === meId ? 'You' : x.name) : fallback);
  // classic mode hides who did it — you only learn the class ("The Ninja attacked Ava")
  const actor: string = from ? nm(from, '?') : item.from_class ? `The ${CLASSES[item.from_class].name}` : 'Someone';

  let text: React.ReactNode;
  switch (item.type) {
    case 'attack': text = <><b>{actor}</b> attacked <b>{nm(to, '?')}</b><em>+{item.amount ?? 1} lock{(item.amount ?? 1) > 1 ? 's' : ''}</em></>; break;
    case 'hack': text = <><b>{nm(to, '?')}</b> got <span className="glitch-word">HACKED</span><em>{from ? `by ${from.name}` : 'by someone…'}</em></>; break;
    case 'block': text = <><b>{actor}</b> blocked {item.what === 'ninja' ? 'the Ninja penalty' : <b>{to ? to.name : 'a hack'}</b>}</>; break;
    case 'cleanse': text = <><b>{actor}</b> cleansed a lock</>; break;
    case 'absorb': text = <><b>{actor}</b> took the hit for <b>{nm(to, '?')}</b><em>+5</em></>; break;
    case 'caught': text = <><b>{actor}</b> caught the Hacker: <b>{nm(to, '?')}</b><em>exposed</em></>; break;
    case 'trace_miss': text = <><b>{actor}</b> traced <b>{nm(to, '?')}</b><em>wrong guess</em></>; break;
    case 'chicken': text = <><b>{item.name ?? nm(from, 'Someone')}</b> chickened out<em>rage quit</em></>; break;
    case 'bet': text = <><b>{actor}</b> went <b>all in</b><em>double or bust</em></>; break;
    case 'bet_win': text = <><b>{actor}</b> cashed out<em>+{item.amount} points</em></>; break;
    case 'bet_lose': text = <><b>{actor}</b> busted<em>−{item.amount} points</em></>; break;
    case 'steal': text = <><b>{actor}</b> stole a card from <b>{nm(to, '?')}</b></>; break;
    case 'drop': text = <><b>{actor}</b> fumbled a card to <b>{nm(to, '?')}</b></>; break;
    case 'latch': text = <><b>{actor}</b> latched onto <b>{nm(to, '?')}</b><em>parasite</em></>; break;
    case 'drain': text = <><b>{actor}</b> fed on <b>{nm(to, '?')}</b><em>−{item.amount} lock{(item.amount ?? 1) > 1 ? 's' : ''}</em></>; break;
    case 'host_down': text = <><b>{actor}</b> lost their host <b>{nm(to, '?')}</b><em>strike</em></>; break;
    case 'mimic': text = <><b>{actor}</b> copied <b>{nm(to, '?')}</b><em>now a {CLASSES[item.what as PlayerClass]?.name ?? item.what}</em></>; break;
    case 'oracle': text = <><b>{actor}</b> saw the future<em>their next word goes public</em></>; break;
    case 'swap': text = <><b>{actor}</b> swapped locks with <b>{nm(to, '?')}</b><em>switcheroo</em></>; break;
    case 'chaos': text = <><b>WILDCARD:</b> {CHAOS_INFO[item.what ?? '']?.name ?? 'chaos'}<em>{CHAOS_INFO[item.what ?? '']?.text}</em></>; break;
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
        {showArrow && to && <motion.span initial={{ scale: 1 }} animate={{ scale: [1, 1.25, 1] }} transition={{ delay: 0.3 }}><PlayerAvatar p={to} size={40} /></motion.span>}
      </div>
      <div className="txt">{text}</div>
    </motion.div>
  );
}

'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AvatarPicker } from '@/components/AvatarPicker';
import { CLASS_COLORS, ClassIcon, Icon, type IconName } from '@/components/icons';
import { audio } from '@/lib/audio';
import { loadAvatar, saveAvatar } from '@/lib/avatar';
import { actionSources } from '@/lib/classAction';
import { CLASSES, CLASS_ORDER } from '@/lib/classes';
import { CLASS_GUIDE } from '@/lib/classGuide';
import { friendlyError } from '@/lib/errors';
import { useT } from '@/lib/i18n/react';
import type { Key } from '@/lib/i18n';
import { narrator } from '@/lib/narrator';
import { linkProfile } from '@/lib/profile';
import { rpc } from '@/lib/rpc';
import { comicKitVars } from '@/lib/comicKit';
import { loadName, saveName, saveSession } from '@/lib/session';
import type { PlayerClass, RoomSettings } from '@/lib/types';
import { ComingSoon } from '@/components/ComingSoon';
import { isClassicKind, isLockedRoom } from '@/lib/modes';
import { STARTERS, fetchHeroState } from '@/lib/loadout';
import '@/app/class-comic.css';
import '@/app/comic.css';
import '@/app/class-ref.css';
import '@/app/comic-kit.css';

type Kind = 'create' | 'duel' | 'team' | 'story' | 'solo' | 'reverse' | 'chaos' | 'memory' | 'join';
const META: Record<Kind, { icon: IconName; k: string }> = {
  create: { icon: 'users', k: 'classic' }, duel: { icon: 'swords', k: 'duel' }, team: { icon: 'shield', k: 'team' }, story: { icon: 'crown', k: 'story' },
  solo: { icon: 'terminal', k: 'solo' }, reverse: { icon: 'swap', k: 'reverse' }, chaos: { icon: 'dice', k: 'chaos' },
  memory: { icon: 'eye', k: 'memory' }, join: { icon: 'users', k: 'classic' },
};
const LAST = 'letterlock:lastclass';

function Art({ cls }: { cls: PlayerClass }) {
  const [a, b] = CLASS_COLORS[cls];
  return <div className="sel-bg" style={{ ['--ca' as string]: a, ['--cb' as string]: b }} aria-hidden />;
}

function PortraitArt({ cls }: { cls: PlayerClass }) {
  const srcs = actionSources(cls);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [cls]);
  if (i >= srcs.length) return <div className="sp-fallback"><ClassIcon cls={cls} size={200} /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="sp-img" src={srcs[i]} alt="" draggable={false} onError={() => setI((n) => n + 1)} />;
}

function CardArt({ cls }: { cls: PlayerClass }) {
  const srcs = actionSources(cls);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [cls]);
  if (i >= srcs.length) return <ClassIcon cls={cls} size={56} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="sel-card-art" src={srcs[i]} alt="" draggable={false} onError={() => setI((n) => n + 1)} />;
}

function Select() {
  const router = useRouter();
  // warm the room screen while the player is choosing, so Lock in lands without a script download
  useEffect(() => {
    router.prefetch('/room/AAAA');
    const id = window.setTimeout(() => { void import('@/components/Game'); }, 300);
    return () => window.clearTimeout(id);
  }, [router]);
  const t = useT();
  const sp = useSearchParams();
  const kind = (META[sp.get('mode') as Kind] ? sp.get('mode') : 'create') as Kind;
  const code = (sp.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const [cls, setCls] = useState<PlayerClass>('ninja');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [hostOnly, setHostOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // only the heroes the player put in their loadout (profile page); guests / offline get the three starters
  const [pool, setPool] = useState<PlayerClass[]>(STARTERS);

  useEffect(() => {
    setName(loadName()); setAvatar(loadAvatar());
    let last: PlayerClass | null = null;
    try { last = window.localStorage.getItem(LAST) as PlayerClass | null; } catch { /* ignore */ }
    void fetchHeroState().then((st) => {
      const lo = st && st.loadout.length >= 3 ? st.loadout.filter((c) => CLASS_ORDER.includes(c)) : STARTERS;
      setPool(lo);
      setCls(last && lo.includes(last) ? last : lo[0]);
    });
    narrator.say('choose', { delay: 300 });
  }, []);

  const guide = CLASS_GUIDE[cls];
  const info = CLASSES[cls];
  const [ca, cb] = CLASS_COLORS[cls];
  const meta = META[kind];

  function pick(c: PlayerClass) {
    if (c === cls) return;
    setCls(c); audio.tick(false);
    narrator.say(`cl_${c}` as never);
  }

  async function lockIn() {
    if (!isClassicKind(kind)) return;
    if (!name.trim()) { setErr(t('home.err_name')); return; }
    if (kind === 'join' && code.length !== 4) { router.replace('/play'); return; }
    audio.unlock(); audio.success();
    try { window.localStorage.setItem(LAST, cls); } catch { /* ignore */ }
    setBusy(true); setErr(null);
    try {
      if (kind === 'join') {
        // refuse locked rooms (Duel, Siege, twists) before taking a seat in them
        const peek = await rpc.getState(code, null).catch(() => null);
        if (peek && isLockedRoom(peek.room.settings)) { setErr('That room is a mode that is coming soon. Classic only for now.'); setBusy(false); return; }
      }
      const r = kind === 'join' ? await rpc.joinRoom(code, name.trim(), cls) : await rpc.createRoom(name.trim(), hostOnly ? 'hero' : cls);
      if (hostOnly) await rpc.setHostMode(r.token, false);
      if (kind === 'duel') await rpc.updateSettings(r.token, { mode: 'duel', max_players: 2 });
      if (kind === 'team') await rpc.updateSettings(r.token, { mode: 'team' });
      if (kind === 'story') await rpc.updateSettings(r.token, { max_players: 4 });
      if (kind === 'solo') for (let i = 0; i < 3; i++) await rpc.addBot(r.token, 2, [1, 2, 3][i]);
      if (kind === 'reverse' || kind === 'chaos' || kind === 'memory') await rpc.updateSettings(r.token, { twist: kind } as Partial<RoomSettings>);
      // profile + avatar bookkeeping runs in the background so Lock in lands on the room immediately
      if (avatar) void rpc.setAvatar(r.token, avatar).catch(() => undefined);
      void linkProfile(r.token, name.trim()).catch(() => undefined);
      saveName(name.trim());
      saveSession(r.code, { token: r.token, playerId: r.player_id });
      if (kind === 'solo') { try { sessionStorage.setItem(`letterlock:tutorial:${r.code}`, '1'); } catch { /* ignore */ } }
      if (kind === 'story') { try { sessionStorage.setItem(`letterlock:story:${r.code}`, '1'); } catch { /* ignore */ } }
      router.push(`/room/${r.code}`);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const i = Math.max(0, pool.indexOf(cls));
      if (e.key === 'ArrowRight') pick(pool[(i + 1) % pool.length]);
      if (e.key === 'ArrowLeft') pick(pool[(i - 1 + pool.length) % pool.length]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className={`selpage${hostOnly ? ' host-only' : ''}`} style={{ ['--ca' as string]: ca, ['--cb' as string]: cb, ...comicKitVars }}>
      <Art cls={cls} />
      <header className="sel-top">
        <Link href="/play" className="play-back" aria-label={t('pl.back')}><Icon name="logout" size={18} /> {t('pl.back')}</Link>
        <div className="sel-titlebox"><h1>Pick Your Class</h1><p className="sel-sub">One hero. Your legend.</p></div>
      </header>

      <div className="sel-main">
        <div className="sel-leftcol">
        <figure key={`p${cls}`} className="sel-portrait" aria-label={info.name}>
          <PortraitArt cls={cls} />
          <figcaption className="sp-tag"><span className="sp-name">{info.name}</span><span className="sp-line">{info.tagline}</span></figcaption>
          <div className="sp-diff" aria-label={`Difficulty: ${guide.difficulty === 1 ? t('cs.easy') : guide.difficulty === 2 ? t('cs.medium') : t('cs.hard')}`}>
            {[1, 2, 3].map((n) => <span key={n} className={`cs-dot${n <= guide.difficulty ? ' on' : ''}`} />)}
            <span>{guide.difficulty === 1 ? t('cs.easy') : guide.difficulty === 2 ? t('cs.medium') : t('cs.hard')}</span>
          </div>
        </figure>
          <div className="sel-left">
          <div className="sel-mode">
            <span className="mc-ico"><Icon name={meta.icon} size={20} /></span>
            <span className="col" style={{ gap: 2 }}>
              <span className="label">{t('sel.mode')}</span>
              <b>{kind === 'join' ? t('sel.room', { code }) : t(`pl.${meta.k}` as Key)}</b>
            </span>
          </div>
          <div className="sel-you">
            <AvatarPicker name={name} url={avatar} compact onChange={(u) => { setAvatar(u); saveAvatar(u); }} />
            <label className="col" style={{ flex: 1, minWidth: 0 }}>
              <span className="label">{t('sel.you')}</span>
              <input className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('home.name_ph')} autoComplete="nickname" />
            </label>
          </div>
          {kind === 'create' && (
            <div className="sel-who" role="radiogroup" aria-label="Play or just host">
              <button type="button" role="radio" aria-checked={!hostOnly} className={!hostOnly ? 'on' : ''} onClick={() => setHostOnly(false)}>
                <b>Play</b><span>Pick a hero and join in</span>
              </button>
              <button type="button" role="radio" aria-checked={hostOnly} className={hostOnly ? 'on' : ''} onClick={() => setHostOnly(true)}>
                <b>Just host</b><span>Run the room, no hero needed</span>
              </button>
            </div>
          )}
          {err && <motion.div className="note bad" initial={{ x: -8 }} animate={{ x: [8, -6, 4, 0] }}>{err}</motion.div>}
        </div>
        </div>

        <section className="sel-right">
          <div key={cls} className="sel-info">
            <span className="sel-role">{guide.style}</span>
            <div className="sel-facts">
              <div className="sel-box perk"><span className="sel-ico"><ClassIcon cls={cls} size={44} /></span><div><b>Perk</b><p>{info.perk}</p></div></div>
              <div className="sel-box price"><span className="sel-ico coin" aria-hidden>$</span><div><b>{t('cs.price')}</b><p>{info.cost}</p><em className="own">In your loadout</em></div></div>
              <div className="sel-box how"><div><b><Icon name="play" size={14} /> {t('cs.how')}</b><p>{guide.how}</p></div></div>
            </div>
            <details className="cs-more sel-more">
              <summary>{t('cs.counter')} &amp; {t('cs.tips')} <Icon name="eye" size={14} /></summary>
              <div className="sel-box counter"><b><Icon name="target" size={14} /> {t('cs.counter')}</b><p>{guide.counter}</p></div>
              <div className="sel-box">
                <b>{t('cs.tips')}</b>
                <ol className="cs-tips">{guide.tips.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ol>
              </div>
            </details>
          </div>
        </section>
      </div>

      <footer className="sel-strip">
        <div className="sel-cards" role="radiogroup" aria-label={t('home.class')}>
          {pool.map((c) => {
            const on = c === cls; const [a, b] = CLASS_COLORS[c];
            return (
              <button key={c} type="button" role="radio" aria-checked={on} className={`sel-card${on ? ' on' : ''}`}
                style={{ ['--ca' as string]: a, ['--cb' as string]: b }} onClick={() => pick(c)}>
                <CardArt cls={c} />
                <b>{CLASSES[c].name}</b>
              </button>
            );
          })}
        </div>
        <Link href="/profile" className="sel-change">Change heroes on your profile</Link>
        <motion.button type="button" className="sel-lock" disabled={busy} onClick={() => void lockIn()} whileTap={{ scale: 0.96 }}>
          <Icon name="lock" size={18} /> {hostOnly ? 'Create room' : `${t('sel.lock')} · ${info.name}`}
        </motion.button>
      </footer>
    </main>
  );
}

function Router() {
  const sp = useSearchParams();
  const mode = sp.get('mode');
  if (!isClassicKind(mode)) return <ComingSoon name="This mode" />;
  return <Select />;
}

export default function ClassSelect() {
  return <Suspense fallback={null}><Router /></Suspense>;
}

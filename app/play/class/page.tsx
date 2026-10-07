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
import { loadName, saveName, saveSession } from '@/lib/session';
import type { PlayerClass, RoomSettings } from '@/lib/types';

type Kind = 'create' | 'duel' | 'team' | 'story' | 'solo' | 'reverse' | 'chaos' | 'memory' | 'join';
const META: Record<Kind, { icon: IconName; k: string }> = {
  create: { icon: 'users', k: 'classic' }, duel: { icon: 'swords', k: 'duel' }, team: { icon: 'shield', k: 'team' }, story: { icon: 'crown', k: 'story' },
  solo: { icon: 'terminal', k: 'solo' }, reverse: { icon: 'swap', k: 'reverse' }, chaos: { icon: 'dice', k: 'chaos' },
  memory: { icon: 'eye', k: 'memory' }, join: { icon: 'users', k: 'classic' },
};
const LAST = 'letterlock:lastclass';

function Art({ cls }: { cls: PlayerClass }) {
  const [a, b] = CLASS_COLORS[cls];
  const srcs = actionSources(cls);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [cls]);
  const ok = i < srcs.length;
  return (
    <div className="sel-bg" style={{ ['--ca' as string]: a, ['--cb' as string]: b }} aria-hidden>
      <AnimatePresence>
        <motion.div key={cls} className="sel-bg-img" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1.0 }} exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 0.5 }, scale: { duration: 7, ease: 'easeOut' } }}>
          {ok
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={srcs[i]} alt="" draggable={false} onError={() => setI((n) => n + 1)} />
            : <div className="sel-bg-fallback"><ClassIcon cls={cls} size={260} /></div>}
        </motion.div>
      </AnimatePresence>
      <div key={`f${cls}`} className="sel-flash" />
      <div className="sel-shade" />
    </div>
  );
}

function Select() {
  const router = useRouter();
  const t = useT();
  const sp = useSearchParams();
  const kind = (META[sp.get('mode') as Kind] ? sp.get('mode') : 'create') as Kind;
  const code = (sp.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const [cls, setCls] = useState<PlayerClass>('ninja');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setName(loadName()); setAvatar(loadAvatar());
    try { const l = window.localStorage.getItem(LAST) as PlayerClass | null; if (l && CLASS_ORDER.includes(l)) setCls(l); } catch { /* ignore */ }
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
    if (!name.trim()) { setErr(t('home.err_name')); return; }
    if (kind === 'join' && code.length !== 4) { router.replace('/play'); return; }
    audio.unlock(); audio.success();
    try { window.localStorage.setItem(LAST, cls); } catch { /* ignore */ }
    setBusy(true); setErr(null);
    try {
      const r = kind === 'join' ? await rpc.joinRoom(code, name.trim(), cls) : await rpc.createRoom(name.trim(), cls);
      if (kind === 'duel') await rpc.updateSettings(r.token, { mode: 'duel', max_players: 2 });
      if (kind === 'team') await rpc.updateSettings(r.token, { mode: 'team' });
      if (kind === 'story') await rpc.updateSettings(r.token, { max_players: 4 });
      if (kind === 'solo') for (let i = 0; i < 3; i++) await rpc.addBot(r.token, 2, [1, 2, 3][i]);
      if (kind === 'reverse' || kind === 'chaos' || kind === 'memory') await rpc.updateSettings(r.token, { twist: kind } as Partial<RoomSettings>);
      if (avatar) await rpc.setAvatar(r.token, avatar).catch(() => undefined);
      await linkProfile(r.token, name.trim());
      saveName(name.trim());
      saveSession(r.code, { token: r.token, playerId: r.player_id });
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
      const i = CLASS_ORDER.indexOf(cls);
      if (e.key === 'ArrowRight') pick(CLASS_ORDER[(i + 1) % CLASS_ORDER.length]);
      if (e.key === 'ArrowLeft') pick(CLASS_ORDER[(i - 1 + CLASS_ORDER.length) % CLASS_ORDER.length]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className="selpage" style={{ ['--ca' as string]: ca, ['--cb' as string]: cb }}>
      <Art cls={cls} />
      <header className="sel-top">
        <Link href="/play" className="play-back" aria-label={t('pl.back')}><Icon name="logout" size={18} /> {t('pl.back')}</Link>
        <h1>{t('sel.title')}</h1>
      </header>

      <div className="sel-main">
        <aside className="sel-left">
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
          {err && <motion.div className="note bad" initial={{ x: -8 }} animate={{ x: [8, -6, 4, 0] }}>{err}</motion.div>}
        </aside>

        <div className="sel-spacer" />

        <section className="sel-right">
                      <div key={cls} className="sel-info">
              <span className="sel-role">{guide.style}</span>
              <h2 className="sel-name">{info.name}</h2>
              <div className="sel-diff">
                {[1, 2, 3].map((n) => <span key={n} className={`cs-dot${n <= guide.difficulty ? ' on' : ''}`} />)}
                <span>{guide.difficulty === 1 ? t('cs.easy') : guide.difficulty === 2 ? t('cs.medium') : t('cs.hard')}</span>
              </div>
              <p className="sel-tag">{info.tagline}</p>
              <div className="sel-pp">
                <div className="cs-box plus"><b>{t('cs.power')}</b><p>{info.perk}</p></div>
                <div className="cs-box minus"><b>{t('cs.price')}</b><p>{info.cost}</p></div>
              </div>
              <div className="sel-box"><b>{t('cs.how')}</b><p>{guide.how}</p></div>
              <div className="sel-box">
                <b>{t('cs.tips')}</b>
                <ol className="cs-tips">{guide.tips.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ol>
              </div>
              <div className="sel-box counter"><b><Icon name="target" size={14} /> {t('cs.counter')}</b><p>{guide.counter}</p></div>
            </div>
        </section>
      </div>

      <footer className="sel-strip">
        <div className="sel-cards" role="radiogroup" aria-label={t('home.class')}>
          {CLASS_ORDER.map((c) => {
            const on = c === cls; const [a, b] = CLASS_COLORS[c];
            return (
              <button key={c} type="button" role="radio" aria-checked={on} className={`sel-card${on ? ' on' : ''}`}
                style={{ ['--ca' as string]: a, ['--cb' as string]: b }} onClick={() => pick(c)}>
                <ClassIcon cls={c} size={56} />
                <b>{CLASSES[c].name}</b>
              </button>
            );
          })}
        </div>
        <motion.button type="button" className="sel-lock" disabled={busy} onClick={() => void lockIn()} whileTap={{ scale: 0.96 }}>
          <Icon name="lock" size={18} /> {t('sel.lock')} · {info.name}
        </motion.button>
      </footer>
    </main>
  );
}

export default function ClassSelect() {
  return <Suspense fallback={null}><Select /></Suspense>;
}

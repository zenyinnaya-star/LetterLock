'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvatarPicker } from '@/components/AvatarPicker';
import { ClassIcon, Icon, type IconName } from '@/components/icons';
import { ClassPicker, Header, spring } from '@/components/ui';
import { audio } from '@/lib/audio';
import { loadAvatar, saveAvatar } from '@/lib/avatar';
import { CLASSES } from '@/lib/classes';
import { friendlyError } from '@/lib/errors';
import { useT } from '@/lib/i18n/react';
import type { Key } from '@/lib/i18n';
import { linkProfile } from '@/lib/profile';
import { rpc } from '@/lib/rpc';
import { loadName, saveName, saveSession } from '@/lib/session';
import type { PlayerClass, RoomSettings } from '@/lib/types';

type Kind = 'create' | 'duel' | 'team' | 'solo' | 'reverse' | 'chaos' | 'memory';
interface Mode { kind: Kind; icon: IconName; k: string; tone: string }

const MODES: Mode[] = [
  { kind: 'create', icon: 'users', k: 'classic', tone: 'amber' },
  { kind: 'duel', icon: 'swords', k: 'duel', tone: 'red' },
  { kind: 'team', icon: 'shield', k: 'team', tone: 'cyan' },
  { kind: 'solo', icon: 'terminal', k: 'solo', tone: 'violet' },
];
const LAB: Mode[] = [
  { kind: 'reverse', icon: 'swap', k: 'reverse', tone: 'green' },
  { kind: 'chaos', icon: 'dice', k: 'chaos', tone: 'pink' },
  { kind: 'memory', icon: 'eye', k: 'memory', tone: 'blue' },
];

export default function Play() {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState('');
  const [cls, setCls] = useState<PlayerClass | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pickClass, setPickClass] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setName(loadName()); setAvatar(loadAvatar()); }, []);

  async function go(kind: Kind | 'join') {
    if (!cls) { setErr(t('home.err_class')); setPickClass(true); return; }
    if (!name.trim()) { setErr(t('home.err_name')); return; }
    if (kind === 'join' && code.trim().length !== 4) { setErr(t('home.err_code')); return; }
    audio.unlock();
    setBusy(true); setErr(null);
    try {
      const r = kind === 'join'
        ? await rpc.joinRoom(code.trim().toUpperCase(), name.trim(), cls)
        : await rpc.createRoom(name.trim(), cls);
      if (kind === 'duel') await rpc.updateSettings(r.token, { mode: 'duel', max_players: 2 });
      if (kind === 'team') await rpc.updateSettings(r.token, { mode: 'team' });
      if (kind === 'solo') for (let i = 0; i < 3; i++) await rpc.addBot(r.token, 2, [1, 2, 3][i]);
      if (kind === 'reverse' || kind === 'chaos' || kind === 'memory') await rpc.updateSettings(r.token, { twist: kind } as Partial<RoomSettings>);
      if (avatar) await rpc.setAvatar(r.token, avatar).catch(() => undefined);
      await linkProfile(r.token, name.trim());
      saveName(name.trim());
      saveSession(r.code, { token: r.token, playerId: r.player_id });
      router.push(`/room/${r.code}`);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  const card = (m: Mode, i: number) => (
    <motion.button key={m.kind} className={`mode-card tone-${m.tone}`} disabled={busy}
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 + i * 0.05 }}
      whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => void go(m.kind)}>
      <span className="mc-ico"><Icon name={m.icon} size={22} /></span>
      <b>{t(`pl.${m.k}` as Key)}</b>
      <span className="mc-desc">{t(`pl.${m.k}_d` as Key)}</span>
    </motion.button>
  );

  return (
    <main className="shell play-shell">
      <Header />
      <div className="play-head">
        <Link href="/" className="play-back" aria-label={t('pl.back')}><Icon name="logout" size={18} /> {t('pl.back')}</Link>
        <h1 className="stage-title">{t('pl.title')}</h1>
      </div>

      <div className="play-grid">
        <section className="play-you sheet">
          <div className="you-row">
            <AvatarPicker name={name} url={avatar} compact onChange={(u) => { setAvatar(u); saveAvatar(u); }} />
            <label className="col you-name">
              <span className="label">{t('home.name')}</span>
              <input className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('home.name_ph')} autoComplete="nickname" />
            </label>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <span className="label">{t('home.class')}</span>
            {cls && !pickClass ? (
              <button className="class-chosen" onClick={() => setPickClass(true)}>
                <ClassIcon cls={cls} size={44} />
                <span className="col" style={{ gap: 0, textAlign: 'left' }}><b>{CLASSES[cls].name}</b><span className="muted small">{CLASSES[cls].tagline}</span></span>
                <span className="cc-change">{t('pl.change')}</span>
              </button>
            ) : (
              <ClassPicker value={cls} onChange={(c) => { setCls(c); setPickClass(false); }} />
            )}
          </div>
        </section>

        <section className="play-modes">
          <span className="label">{t('pl.modes')}</span>
          <div className="mode-grid">
            {MODES.map(card)}
            <Link href="/daily" className="mode-card wide tone-gold">
              <span className="mc-ico"><Icon name="trophy" size={22} /></span>
              <span className="mc-txt"><b>{t('pl.daily')}</b><span className="mc-desc">{t('pl.daily_d')}</span></span>
            </Link>
          </div>

          <span className="label lab-label"><Icon name="bolt" size={14} /> {t('pl.lab')}</span>
          <div className="mode-grid three">{LAB.map((m, i) => card(m, i + 4))}</div>

          <div className="join-bar">
            <input className="input code" maxLength={4} value={code} placeholder={t('home.code_ph')} aria-label={t('home.code')}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') void go('join'); }} />
            <button className="btn lg" disabled={busy || code.length !== 4} onClick={() => void go('join')}>{t('pl.join')}</button>
          </div>
          {err && <motion.div className="note bad" initial={{ x: -8 }} animate={{ x: [8, -6, 4, 0] }}>{err}</motion.div>}
        </section>
      </div>
    </main>
  );
}

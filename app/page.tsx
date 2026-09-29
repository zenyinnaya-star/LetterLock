'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvatarPicker } from '@/components/AvatarPicker';
import { Icon } from '@/components/icons';
import { loadAvatar, saveAvatar } from '@/lib/avatar';
import { ClassPicker, Header, spring } from '@/components/ui';
import { audio } from '@/lib/audio';
import { friendlyError } from '@/lib/errors';
import { useT } from '@/lib/i18n/react';
import { rpc } from '@/lib/rpc';
import { loadName, saveName, saveSession } from '@/lib/session';
import type { PlayerClass } from '@/lib/types';

const TITLE = 'LETTERLOCK';

export default function Home() {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState('');
  const [cls, setCls] = useState<PlayerClass | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => { setName(loadName()); setAvatar(loadAvatar()); }, []);

  const ready = name.trim().length > 0 && cls !== null;

  async function go(kind: 'create' | 'join' | 'duel' | 'team') {
    if (!cls) { setErr(t('home.err_class')); return; }
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
      if (avatar) await rpc.setAvatar(r.token, avatar).catch(() => undefined);
      saveName(name.trim());
      saveSession(r.code, { token: r.token, playerId: r.player_id });
      router.push(`/room/${r.code}`);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <main className="shell narrow">
      <Header />
      <div className="hero-stack">
      <motion.div className="hero-art" aria-hidden initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
      <h1 className="hero-tiles" aria-label="Letterlock">
        {TITLE.split('').map((c, i) => (
          <motion.span key={i} className="tile" aria-hidden
            style={i >= 6 ? { backgroundColor: 'var(--lock)', color: '#fff', boxShadow: '0 4px 0 #9e1f3a, 0 8px 16px rgba(0,0,0,.35)' } : undefined}
            initial={{ y: -120, rotate: (i % 2 ? 1 : -1) * 25, opacity: 0 }}
            animate={{ y: 0, rotate: (i % 3 - 1) * 3, opacity: 1 }}
            whileHover={{ y: -6, rotate: 0 }}
            transition={{ ...spring, delay: 0.1 + i * 0.06 }}>
            {c}
          </motion.span>
        ))}
      </h1>
      </div>
      <motion.p className="tagline" style={{ marginTop: 34 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
        {t('home.tag1')}<br />{t('home.tag2')}
      </motion.p>

      <motion.div className="sheet" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.9 }}>
        <label className="col" style={{ gap: 8 }}>
          <span className="label">{t('home.name')}</span>
          <input className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t('home.name_ph')} autoComplete="nickname" />
        </label>
        <div className="col" style={{ gap: 8 }}>
          <span className="label">{t('home.avatar')}</span>
          <AvatarPicker name={name} url={avatar} onChange={(u) => { setAvatar(u); saveAvatar(u); }} />
        </div>
        <div className="col" style={{ gap: 8 }}>
          <span className="label">{t('home.class')}</span>
          <ClassPicker value={cls} onChange={setCls} />
        </div>
        <div className="create-row">
          <button className="btn lg block" disabled={busy || !ready} onClick={() => go('create')}>{t('home.create')}</button>
          <motion.button className="btn lg block duel-btn" disabled={busy || !ready} onClick={() => go('duel')}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Icon name="swords" size={20} /> {t('home.duel')}
          </motion.button>
          <motion.button className="btn lg block team-btn" disabled={busy || !ready} onClick={() => go('team')}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Icon name="users" size={20} /> {t('home.team')}
          </motion.button>
        </div>
        <div className="divider">{t('home.or_join')}</div>
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <input className="input code" maxLength={4} value={code} placeholder={t('home.code_ph')}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') void go('join'); }} aria-label={t('home.code')} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn ghost lg" disabled={busy || !ready || code.length !== 4} onClick={() => go('join')}>{t('home.join')}</button>
        </div>
        {err && <motion.div className="note bad" initial={{ x: -8 }} animate={{ x: [8, -6, 4, 0] }}>{err}</motion.div>}
      </motion.div>

      <p className="center muted small" style={{ marginTop: 6 }}>
        {t('home.footer')} <Link href="/how-to-play">{t('home.rules')}</Link>
      </p>
    </main>
  );
}

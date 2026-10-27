'use client';

import Link from 'next/link';
import { linkProfile } from '@/lib/profile';
import { STARTERS, fetchHeroState } from '@/lib/loadout';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvatarPicker } from '@/components/AvatarPicker';
import { Game } from '@/components/Game';
import { loadAvatar, saveAvatar } from '@/lib/avatar';
import { ClassPicker, Header } from '@/components/ui';
import { HeroPicker } from '@/components/HeroPicker';
import type { HeroId } from '@/lib/heroes';
import { useRoom } from '@/hooks/useRoom';
import { audio } from '@/lib/audio';
import { friendlyError } from '@/lib/errors';
import { useT } from '@/lib/i18n/react';
import { rpc } from '@/lib/rpc';
import { clearSession, loadName, loadSession, saveName, saveSession } from '@/lib/session';
import type { PlayerClass } from '@/lib/types';
import '@/app/comic.css';
import { ComingSoon } from '@/components/ComingSoon';
import { isLockedRoom } from '@/lib/modes';

/**
 * One prebuilt page serves every room: next.config rewrites /room/:code here, so entering a room is a CDN hit
 * instead of an on-demand server render. The code comes from the address bar.
 */
export default function RoomRoute() {
  const pn = usePathname();
  const router = useRouter();
  const t = useT();
  const [code, setCode] = useState('');
  useEffect(() => {
    const seg = (window.location.pathname.split('/')[2] ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (!seg) { router.replace('/play'); return; }
    setCode(seg);
  }, [pn, router]);
  if (!code) return <RoomBoot label={t('room.loading', { code: '' })} />;
  return <RoomPage key={code} code={code} />;
}

function RoomPage({ code }: { code: string }) {
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setToken(loadSession(code)?.token ?? null);
    setLoaded(true);
  }, [code]);

  const { state, error, refresh, offset, stateToken, botIds, botInfo, pingBots } = useRoom(code, loaded ? token : null);

  // our saved seat no longer exists (e.g. removed after a rematch) → forget it.
  // Only judge a snapshot fetched WITH this token — right after joining, the old token-less snapshot is still on screen.
  useEffect(() => {
    if (state && token && stateToken === token && !state.me) { clearSession(code); setToken(null); }
  }, [state, token, stateToken, code]);

  if (error && !state) {
    return (
      <main className="shell narrow">
        <Header />
        <div className="sheet center" style={{ alignItems: 'center' }}>
          <h2 className="stage-title">{error.includes('ROOM_NOT_FOUND') ? t('room.not_found') : t('room.conn')}</h2>
          <p className="muted">{friendlyError(error)}</p>
          <Link className="btn" href="/">{t('room.back')}</Link>
        </div>
      </main>
    );
  }

  if (!state || !loaded) {
    return <RoomBoot label={t('room.loading', { code })} />;
  }

  if (token && stateToken !== token) {
    return <RoomBoot label={t('room.seat')} />;
  }

  if (isLockedRoom(state.room.settings)) return <ComingSoon name={state.room.settings.mode === 'duel' ? 'Duel' : state.room.settings.mode === 'team' ? 'Siege' : 'Twist rooms'} />;

  if (!state.me && state.room.phase === 'lobby') {
    return <JoinRedirect code={code} />;
  }

  return <Game state={state} token={state.me ? token : null} offset={offset} refresh={refresh} bots={botIds} botInfo={botInfo} pingBots={pingBots} />;
}

/** Comic-skinned boot screen so the old global backdrop never flashes between class select and the lobby. */
function RoomBoot({ label }: { label: string }) {
  return <main className="room-boot" role="status"><span className="room-boot-spin" aria-hidden /><b>{label}</b></main>;
}

/** QR / link joins use the comic class-select screen so every entry path looks the same. */
function JoinRedirect({ code }: { code: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(`/play/class?mode=join&code=${code}`); }, [router, code]);
  return <main className="cp cp-pick"><div className="cp-sky" aria-hidden /></main>;
}

// kept for reference of the old join form; no longer rendered
function JoinHere({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [cls, setCls] = useState<PlayerClass | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [story, setStory] = useState(false);
  const [hero, setHero] = useState<HeroId | null>(null);
  const [taken, setTaken] = useState<Record<string, string>>({});
  const [pool, setPool] = useState<PlayerClass[]>(STARTERS);
  useEffect(() => { setName(loadName()); setAvatar(loadAvatar()); void fetchHeroState().then((st) => { if (st && st.loadout.length >= 3) setPool(st.loadout); }); }, []);
  useEffect(() => {
    let live = true;
    const load = () => rpc.roomStoryPublic(code).then((r) => {
      if (!live || !r) return;
      setStory(!!r.story);
      setTaken(Object.fromEntries((r.taken ?? []).map((x) => [x.hero, x.name])));
    }).catch(() => undefined);
    void load();
    const iv = setInterval(load, 3000);
    return () => { live = false; clearInterval(iv); };
  }, [code]);

  const ready = story ? !!hero : !!cls;
  async function join() {
    if (!ready || !name.trim()) { setErr(t('room.err')); return; }
    audio.unlock();
    setBusy(true); setErr(null);
    try {
      const r = await rpc.joinRoom(code, name.trim(), story ? 'hero' : cls!);
      if (story && hero) await rpc.setHero(r.token, hero);
      saveName(name.trim());
      saveSession(r.code, { token: r.token, playerId: r.player_id });
      if (avatar) await rpc.setAvatar(r.token, avatar).catch(() => undefined);
      await linkProfile(r.token, name.trim());
      onJoined(r.token);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <main className="shell narrow">
      <Header />
      <div className="sheet">
        <div className="col" style={{ alignItems: 'center', gap: 10 }}>
          <span className="label">{t('room.joining')}</span>
          <div className="lobby-code">{code.split('').map((c, i) => <span key={i} className="tile">{c}</span>)}</div>
        </div>
        <label className="col" style={{ gap: 8 }}>
          <span className="label">{t('home.name')}</span>
          <input className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('home.name_ph')} />
        </label>
        <span className="label">{t('home.avatar')}</span>
        <AvatarPicker name={name} url={avatar} onChange={(u) => { setAvatar(u); saveAvatar(u); }} />
        {story ? (
          <>
            <span className="label">Choose your hero</span>
            <HeroPicker value={hero} onPick={setHero} taken={taken} />
          </>
        ) : (
          <>
            <span className="label">{t('home.class')}</span>
            <ClassPicker value={cls} onChange={setCls} only={pool} />
          </>
        )}
        <button className="btn lg block" disabled={busy || !ready || !name.trim()} onClick={join}>{t('room.join')}</button>
        {err && <div className="note bad">{err}</div>}
      </div>
    </main>
  );
}

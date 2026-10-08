'use client';
import { HERO_BG } from '@/lib/art';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvatarPicker } from './AvatarPicker';
import { HeroCards } from './HeroCards';
import { Icon } from './icons';
import { audio } from '@/lib/audio';
import { loadAvatar, saveAvatar } from '@/lib/avatar';
import { friendlyError } from '@/lib/errors';
import { HEROES, heroById, type HeroId } from '@/lib/heroes';
import { linkProfile } from '@/lib/profile';
import { rpc } from '@/lib/rpc';
import { loadName, saveName, saveSession } from '@/lib/session';

// Story mode entry: pick a hero (not a class). Creates the room, flags it as a story, and locks the hero in.
export function StoryHeroSelect() {
  const router = useRouter();
  const [hero, setHero] = useState<HeroId>('Shiro');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setName(loadName()); setAvatar(loadAvatar()); }, []);
  const h = heroById(hero) ?? HEROES[0];

  async function lockIn() {
    if (!name.trim()) { setErr('Enter a name first.'); return; }
    audio.unlock(); audio.success();
    setBusy(true); setErr(null);
    try {
      const r = await rpc.createRoom(name.trim(), 'hero');
      await rpc.updateSettings(r.token, { max_players: 4 });
      await rpc.setStory(r.token).catch(() => undefined);
      await rpc.setHero(r.token, hero).catch(() => undefined);
      if (avatar) await rpc.setAvatar(r.token, avatar).catch(() => undefined);
      await linkProfile(r.token, name.trim());
      saveName(name.trim());
      saveSession(r.code, { token: r.token, playerId: r.player_id });
      try { sessionStorage.setItem(`letterlock:story:${r.code}`, '1'); } catch { /* ignore */ }
      router.push(`/room/${r.code}`);
    } catch (e) { setErr(friendlyError(e)); setBusy(false); }
  }

  return (
    <main className="hs-page" style={{ ['--hc' as string]: h.color }}>
      <div className="hs-bgimg" style={{ backgroundImage: `url(${HERO_BG})` }} />
      <header className="hs-top">
        <Link href="/play" className="play-back"><Icon name="logout" size={18} /> Back</Link>
        <h1>Choose your hero</h1>
      </header>
      <div className="hs-you">
        <AvatarPicker name={name} url={avatar} compact onChange={(u) => { setAvatar(u); saveAvatar(u); }} />
        <label className="col" style={{ flex: 1, minWidth: 0 }}>
          <span className="label">You</span>
          <input className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="nickname" />
        </label>
      </div>
      <HeroCards value={hero} onPick={(x) => { setHero(x); audio.tick(false); }} />
      {err && <div className="note bad">{err}</div>}
      <button type="button" className="sel-lock hs-lock" disabled={busy} onClick={() => void lockIn()}>
        <Icon name="lock" size={18} /> Begin as {h.name}
      </button>
    </main>
  );
}

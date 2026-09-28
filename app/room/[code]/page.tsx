'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvatarPicker } from '@/components/AvatarPicker';
import { Game } from '@/components/Game';
import { loadAvatar, saveAvatar } from '@/lib/avatar';
import { ClassPicker, Header } from '@/components/ui';
import { useRoom } from '@/hooks/useRoom';
import { audio } from '@/lib/audio';
import { friendlyError } from '@/lib/errors';
import { rpc } from '@/lib/rpc';
import { clearSession, loadName, loadSession, saveName, saveSession } from '@/lib/session';
import type { PlayerClass } from '@/lib/types';

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = String(params.code ?? '').toUpperCase();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setToken(loadSession(code)?.token ?? null);
    setLoaded(true);
  }, [code]);

  const { state, error, refresh, offset, stateToken } = useRoom(code, loaded ? token : null);

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
          <h2 className="stage-title">{error.includes('ROOM_NOT_FOUND') ? 'Room not found' : 'Connection problem'}</h2>
          <p className="muted">{friendlyError(error)}</p>
          <Link className="btn" href="/">Back home</Link>
        </div>
      </main>
    );
  }

  if (!state || !loaded) {
    return <main className="shell narrow"><Header /><div className="sheet center muted">Loading room {code}…</div></main>;
  }

  if (token && stateToken !== token) {
    return <main className="shell narrow"><Header /><div className="sheet center muted">Taking your seat…</div></main>;
  }

  if (!state.me && state.room.phase === 'lobby') {
    return <JoinHere code={code} onJoined={(t) => { setToken(t); void refresh(); }} />;
  }

  return <Game state={state} token={state.me ? token : null} offset={offset} refresh={refresh} />;
}

function JoinHere({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const [name, setName] = useState('');
  const [cls, setCls] = useState<PlayerClass | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => { setName(loadName()); setAvatar(loadAvatar()); }, []);

  async function join() {
    if (!cls || !name.trim()) { setErr('Enter a name and pick a class.'); return; }
    audio.unlock();
    setBusy(true); setErr(null);
    try {
      const r = await rpc.joinRoom(code, name.trim(), cls);
      saveName(name.trim());
      saveSession(r.code, { token: r.token, playerId: r.player_id });
      if (avatar) await rpc.setAvatar(r.token, avatar).catch(() => undefined);
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
          <span className="label">Joining room</span>
          <div className="lobby-code">{code.split('').map((c, i) => <span key={i} className="tile">{c}</span>)}</div>
        </div>
        <label className="col" style={{ gap: 8 }}>
          <span className="label">Your name</span>
          <input className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zab" />
        </label>
        <span className="label">Your avatar</span>
        <AvatarPicker name={name} url={avatar} onChange={(u) => { setAvatar(u); saveAvatar(u); }} />
        <span className="label">Pick your class</span>
        <ClassPicker value={cls} onChange={setCls} />
        <button className="btn lg block" disabled={busy || !cls || !name.trim()} onClick={join}>Join game</button>
        {err && <div className="note bad">{err}</div>}
      </div>
    </main>
  );
}

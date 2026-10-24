'use client';

import { useState } from 'react';
import { friendlyError } from '@/lib/errors';
import { rpc } from '@/lib/rpc';
import { loadName, saveName, saveSession } from '@/lib/session';
import type { RoomState } from '@/lib/types';
import type { Act } from './phases';
import { Icon } from './icons';

/** Floating pill: watch-only status, "join as spectator" for outsiders, and the host's sit-out button. */
export function Spectate({ state, token, act }: { state: RoomState; token: string | null; act: Act }) {
  const phase = state.room.phase;
  const me = state.me;
  const [name, setName] = useState(() => (typeof window === 'undefined' ? '' : loadName()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (phase === 'lobby' || phase === 'battle') return null;

  // outsider watching a game in progress → offer a named spectator seat
  if (!me) {
    async function join() {
      if (!name.trim()) { setErr('Enter a name'); return; }
      setBusy(true); setErr(null);
      try {
        const r = await rpc.joinSpectator(state.room.code, name.trim());
        saveName(name.trim());
        saveSession(r.code, { token: r.token, playerId: r.player_id });
        window.location.reload();
      } catch (e) { setErr(friendlyError(e)); setBusy(false); }
    }
    return (
      <div className="spec-pill">
        <Icon name="eye" size={15} />
        <input className="input" maxLength={20} value={name} placeholder="Your name" aria-label="Your name" onChange={(e) => setName(e.target.value)} />
        <button className="btn sm" disabled={busy} onClick={() => void join()}>Watch as spectator</button>
        {err && <span className="spec-err">{err}</span>}
      </div>
    );
  }

  if (me.is_spectator) {
    return (
      <div className="spec-pill">
        <Icon name="eye" size={15} />
        <span>{me.id === state.room.host_id ? 'You’re hosting from the sidelines' : 'You’re watching'}</span>
      </div>
    );
  }

  const team = state.room.settings?.mode === 'team';
  const canSit = me.id === state.room.host_id && !team && phase !== 'answer' && phase !== 'finished' && !me.eliminated;
  if (!canSit) return null;
  return (
    <div className="spec-pill">
      {confirm ? (
        <>
          <span>Sit out for the rest of this game?</span>
          <button className="btn sm danger" onClick={() => { setConfirm(false); if (token) void act(() => rpc.setHostMode(token, false)); }}>Sit out</button>
          <button className="btn sm ghost" onClick={() => setConfirm(false)}>Stay in</button>
        </>
      ) : (
        <button className="btn sm ghost" onClick={() => setConfirm(true)}><Icon name="eye" size={14} /> Sit out (keep hosting)</button>
      )}
    </div>
  );
}

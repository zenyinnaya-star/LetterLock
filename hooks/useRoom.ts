'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import type { RoomState } from '@/lib/types';

/**
 * Keeps a room snapshot in sync:
 * - realtime INSERTs on `events` trigger a refetch
 * - a 2.5s poll backs that up if the socket drops
 * - whoever sees the clock hit zero calls advance_phase (server is time-gated + idempotent)
 */
export function useRoom(code: string, token: string | null) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // serverNow - clientNow (ms)
  const versionRef = useRef(-1);
  const inflight = useRef(false);
  const queued = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    if (inflight.current) { queued.current = true; return; }
    inflight.current = true;
    try {
      const sent = Date.now();
      const usedToken = tokenRef.current;
      const s = await rpc.getState(code, usedToken);
      const recv = Date.now();
      if (usedToken !== tokenRef.current) { queued.current = true; return; } // token changed mid-flight
      setOffset(new Date(s.server_time).getTime() - (sent + recv) / 2);
      if (s.room.state_version >= versionRef.current) {
        versionRef.current = s.room.state_version;
        setState(s);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inflight.current = false;
      if (queued.current) { queued.current = false; void refresh(); }
    }
  }, [code]);

  // initial load + poll
  useEffect(() => {
    versionRef.current = -1;
    void refresh();
    const id = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(id);
  }, [refresh, token]);

  // realtime
  useEffect(() => {
    let cancelled = false;
    const sb = supabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    void (async () => {
      try {
        const roomId = await rpc.getRoomId(code);
        if (!roomId || cancelled) return;
        channel = sb
          .channel(`room-${roomId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `room_id=eq.${roomId}` },
            () => void refresh())
          .subscribe();
      } catch { /* polling covers it */ }
    })();
    return () => {
      cancelled = true;
      if (channel) void sb.removeChannel(channel);
    };
  }, [code, refresh]);

  // heartbeat
  useEffect(() => {
    if (!token) return;
    const beat = () => void rpc.heartbeat(token).catch(() => undefined);
    beat();
    const id = window.setInterval(beat, 8000);
    return () => window.clearInterval(id);
  }, [token]);

  // auto-advance when the clock runs out
  const endsAt = state?.room.phase_ends_at ? new Date(state.room.phase_ends_at).getTime() : null;
  const phaseKey = `${state?.room.phase}-${state?.room.round}-${state?.room.phase_ends_at}`;
  useEffect(() => {
    if (!endsAt) return;
    let timer: number;
    let tries = 0;
    const attempt = async () => {
      const serverNow = Date.now() + offset;
      if (serverNow < endsAt) { timer = window.setTimeout(attempt, Math.min(endsAt - serverNow + 50, 1000)); return; }
      try {
        const r = await rpc.advance(code);
        if (r.ok) { void refresh(); return; }
      } catch { /* retry */ }
      void refresh();
      if (++tries < 15) timer = window.setTimeout(attempt, 700 + Math.random() * 500);
    };
    timer = window.setTimeout(attempt, Math.max(0, endsAt - (Date.now() + offset)) + Math.random() * 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey, offset, code]);

  return { state, error, refresh, offset };
}

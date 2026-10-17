'use client';

import { useEffect, useState } from 'react';
import { rpc, type TeamExtra } from '@/lib/rpc';

/**
 * Team-private data (calls, my clue, voice key). One shared poll per token, however many components listen.
 * Returns null outside team mode, or when the server doesn't have migration 079 yet.
 */
type Entry = { data: TeamExtra | null; subs: Set<(d: TeamExtra | null) => void>; timer: number | null; dead: boolean };
const entries = new Map<string, Entry>();

function start(token: string, e: Entry) {
  const tick = async () => {
    if (e.dead) return;
    try {
      e.data = await rpc.teamExtra(token);
    } catch (err) {
      // function missing (old server): stop polling quietly
      if (String(err).includes('Could not find the function') || String(err).includes('does not exist')) { e.dead = true; e.data = null; }
    }
    e.subs.forEach((f) => f(e.data));
  };
  void tick();
  e.timer = window.setInterval(tick, 1100);
}

export function useTeamExtra(token: string | null, enabled: boolean): TeamExtra | null {
  const [data, setData] = useState<TeamExtra | null>(() => (token ? entries.get(token)?.data ?? null : null));
  useEffect(() => {
    if (!token || !enabled) { setData(null); return; }
    let e = entries.get(token);
    if (!e) { e = { data: null, subs: new Set(), timer: null, dead: false }; entries.set(token, e); }
    e.subs.add(setData);
    if (e.timer === null && !e.dead) start(token, e);
    setData(e.data);
    const entry = e;
    return () => {
      entry.subs.delete(setData);
      if (entry.subs.size === 0 && entry.timer !== null) { window.clearInterval(entry.timer); entry.timer = null; entries.delete(token); }
    };
  }, [token, enabled]);
  return data;
}

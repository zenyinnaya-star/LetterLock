'use client';

import { useEffect, useState } from 'react';

/** Milliseconds left until `endsAt` on the server clock. */
export function useCountdown(endsAt: string | null, offset: number): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) { setLeft(0); return; }
    const end = new Date(endsAt).getTime();
    const tick = () => setLeft(Math.max(0, end - (Date.now() + offset)));
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [endsAt, offset]);
  return left;
}

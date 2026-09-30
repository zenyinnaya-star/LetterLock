'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/** Sends uncaught client errors to the log table (throttled, best effort). */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const report = (message: string, stack?: string) => {
      if (sent++ >= 5) return; // per page load
      const room = window.location.pathname.match(/\/room\/([A-Za-z0-9]{4})/)?.[1] ?? null;
      void supabase().rpc('log_client_error', {
        p_room: room, p_message: message, p_stack: stack ?? null, p_url: window.location.href, p_ua: navigator.userAgent,
      }).then(() => undefined, () => undefined);
    };
    const onErr = (e: ErrorEvent) => report(e.message, e.error?.stack);
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); };
  }, []);
  return null;
}

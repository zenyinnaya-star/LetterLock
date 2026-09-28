import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Publishable (public) values — safe to ship to the browser. Env vars override them.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://cnzdjksuracagdsjbosj.supabase.co';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_5ICvJNrlXL2sfFJr1CBe2A_JUKT-Ho0';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

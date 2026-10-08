-- 051: multiplayer pacing (applied as Supabase migration 051_multiplayer_afk, by patching function text).
-- battle_units.afk = consecutive auto-guarded turns; reset to 0 on battle_submit.
-- battle_step only waits for heroes whose player is human, not quit, seen in the last 25s, and afk < 3.
-- get_battle exposes 'afk' so the client can tell idle players they are auto-guarding.
alter table battle_units add column if not exists afk int not null default 0;

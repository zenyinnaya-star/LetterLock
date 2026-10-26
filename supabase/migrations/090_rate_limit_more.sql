-- Extend the per-IP throttle (_rate_limit, see 085) to joins, bots, feedback, error logs and profile endpoints.
-- Limits are generous because a whole club may share one wifi IP.
-- Each function is patched in place: `perform _rate_limit(...)` goes right after its first `begin`.
do $$
declare
  r record; d text; n int := 0;
begin
  for r in select * from (values
    ('join_room', 60, 60), ('join_spectator', 60, 60), ('mm_join', 60, 60), ('add_bot', 60, 60),
    ('submit_feedback', 10, 600), ('log_client_error', 60, 60),
    ('profile_create', 30, 600), ('profile_restore', 30, 600), ('profile_link', 30, 600),
    ('start_pve', 60, 600), ('daily_start', 60, 600)
  ) as t(fn, mx, secs) loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.fn;
    continue when d is null or d like '%_rate_limit(%';
    d := regexp_replace(d, '\mbegin\M', format('begin perform _rate_limit(%L, %s, %s);', r.fn, r.mx, r.secs));
    execute d; n := n + 1;
  end loop;
  raise notice 'patched % functions', n;
end $$;

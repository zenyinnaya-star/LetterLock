-- per-IP throttle (60 / 10 min) on create_room and mm_create; applied to the live DB by patching each function's first `begin`
create table if not exists rate_hits (k text not null, at timestamptz not null default now());
create index if not exists rate_hits_k_at on rate_hits (k, at);
alter table rate_hits enable row level security;
create or replace function _rate_limit(p_fn text, p_max int, p_secs int) returns void
language plpgsql security definer set search_path = public as $$
declare v_ip text; v_k text; v_n int;
begin
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := ''; end;
  if v_ip is null or btrim(v_ip) = '' then return; end if;
  v_k := p_fn || ':' || btrim(v_ip);
  delete from rate_hits where at < now() - interval '1 hour';
  select count(*) into v_n from rate_hits where k = v_k and at > now() - make_interval(secs => p_secs);
  if v_n >= p_max then raise exception 'RATE_LIMITED'; end if;
  insert into rate_hits (k) values (v_k);
end $$;
revoke execute on function _rate_limit(text, int, int) from public, anon, authenticated;
-- then: add `perform _rate_limit('create_room', 60, 600);` / `perform _rate_limit('mm_create', 60, 600);` as the first statement of those functions

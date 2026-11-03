-- Mastermind: (1) a kicked device cannot rejoin the same room under a new name; (2) fair Mastermind rotation.
alter table mm_players add column if not exists device text;
alter table mm_players add column if not exists turns int not null default 0;
alter table mm_rooms add column if not exists banned text[] not null default '{}';

-- join now records the device; a kicked device is refused with KICKED
drop function if exists mm_join(text, text);
create or replace function mm_join(p_code text, p_name text, p_device text default null) returns json
language plpgsql security definer set search_path to 'public' as $$
declare r mm_rooms; v_p mm_players; nm text; n int; dev text;
begin perform _rate_limit('mm_join', 60, 60);
  nm := left(trim(coalesce(p_name, '')), 20);
  dev := left(nullif(trim(coalesce(p_device, '')), ''), 64);
  if length(nm) < 1 then raise exception 'NAME'; end if;
  select * into r from mm_rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if dev is not null and dev = any(r.banned) then raise exception 'KICKED'; end if;
  if r.status <> 'lobby' then raise exception 'ALREADY_STARTED'; end if;
  select count(*) into n from mm_players where room_id = r.id and not gone;
  if n >= 8 then raise exception 'ROOM_FULL'; end if;
  insert into mm_players (room_id, name, seat, device) values (r.id, nm, coalesce((select max(seat) + 1 from mm_players where room_id = r.id), 0), dev) returning * into v_p;
  return json_build_object('code', r.code, 'token', v_p.token, 'player_id', v_p.id);
end $$;
grant execute on function mm_join(text, text, text) to anon, authenticated;

-- kicking bans that device from this room
create or replace function mm_kick(p_token uuid, p_target uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players; t mm_players;
begin
  me := _mm_player(p_token);
  if not me.is_host then raise exception 'NOT_HOST'; end if;
  select * into t from mm_players where id = p_target and room_id = me.room_id and not gone;
  if t.id is null or t.id = me.id then raise exception 'BAD_TARGET'; end if;
  if t.device is not null then update mm_rooms set banned = array_append(banned, t.device) where id = me.room_id; end if;
  perform _mm_remove(t.id);
end $$;

-- rotation: the next Mastermind is whoever has had the fewest turns (ties by seat), so leavers never double anyone up
create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in % : %', p_name, p_from; end if;
  execute replace(d, p_from, p_to);
end $$;
select _patch_fn('_mm_begin_round', 'order by seat offset (r.round % n) limit 1;', 'order by turns, seat limit 1;
  update mm_players set turns = turns + 1 where id = mid;');
select _patch_fn('mm_again', 'update mm_players set points = 0,', 'update mm_players set turns = 0, points = 0,');
drop function _patch_fn(text, text, text);

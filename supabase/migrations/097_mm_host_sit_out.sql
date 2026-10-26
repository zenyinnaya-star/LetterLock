-- Mastermind: the host can sit out (watch + keep hosting) like every other mode.
alter table mm_players add column if not exists sitting boolean not null default false;

create or replace function mm_sit(p_token uuid, p_sit boolean) returns json
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players; r mm_rooms; others int; alive int;
begin
  me := _mm_player(p_token);
  select * into r from mm_rooms where id = me.room_id for update;
  if not me.is_host then raise exception 'NOT_HOST'; end if;
  if p_sit then
    if me.sitting then return json_build_object('sitting', true); end if;
    if r.status = 'round' and r.mastermind_id = me.id then raise exception 'NOT_NOW'; end if;
    select count(*) into others from mm_players where room_id = r.id and id <> me.id and not sitting;
    if r.status <> 'lobby' and others < 2 then raise exception 'NEED_PLAYERS'; end if;
    update mm_players set sitting = true, is_out = true, backing = null where id = me.id;
    if r.status = 'round' then
      select count(*) into alive from mm_players where room_id = r.id and id <> r.mastermind_id and not is_out;
      if alive = 0 then perform _mm_end_round(r.id, null); end if;
    end if;
  else
    if not me.sitting then return json_build_object('sitting', false); end if;
    if r.status not in ('lobby', 'between', 'finished') then raise exception 'WRONG_PHASE'; end if;
    if (select count(*) from mm_players where room_id = r.id and not sitting) >= 8 then raise exception 'ROOM_FULL'; end if;
    update mm_players set sitting = false, is_out = false where id = me.id;
  end if;
  return json_build_object('sitting', p_sit);
end $$;
grant execute on function mm_sit(uuid, boolean) to anon, authenticated;

create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in % : %', p_name, p_from; end if;
  execute replace(d, p_from, p_to);
end $$;

-- a sitting host is skipped by the mastermind rotation, round count, resets and backer points
select _patch_fn('_mm_begin_round', 'select count(*) into n from mm_players where room_id = p_room;', 'select count(*) into n from mm_players where room_id = p_room and not sitting;');
select _patch_fn('_mm_begin_round', 'select id into mid from mm_players where room_id = p_room order by seat offset (r.round % n) limit 1;', 'select id into mid from mm_players where room_id = p_room and not sitting order by seat offset (r.round % n) limit 1;');
select _patch_fn('_mm_begin_round', 'update mm_players set hp = 3, is_out = false, backing = null where room_id = p_room;', 'update mm_players set hp = 3, is_out = sitting, backing = null where room_id = p_room;');
select _patch_fn('mm_start', 'select count(*) into n from mm_players where room_id = r.id;', 'select count(*) into n from mm_players where room_id = r.id and not sitting;');
select _patch_fn('mm_again', 'update mm_players set points = 0, hp = 3, is_out = false, backing = null where room_id = me.room_id;', 'update mm_players set points = 0, hp = 3, is_out = sitting, backing = null where room_id = me.room_id;');
select _patch_fn('_mm_end_round', 'update mm_players set points = points + 3 where room_id = p_room and is_out and backing = p_solver;', 'update mm_players set points = points + 3 where room_id = p_room and is_out and not sitting and backing = p_solver;');
select _patch_fn('mm_state', '''is_mastermind'', r.mastermind_id = me.id, ''backing'', me.backing)', '''is_mastermind'', r.mastermind_id = me.id, ''backing'', me.backing, ''sitting'', me.sitting)');
select _patch_fn('mm_state', '''is_host'', p.is_host, ''is_mastermind'', p.id = r.mastermind_id)', '''is_host'', p.is_host, ''is_mastermind'', p.id = r.mastermind_id, ''sitting'', p.sitting)');
drop function _patch_fn(text, text, text);

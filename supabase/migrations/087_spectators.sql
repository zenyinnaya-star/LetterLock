-- Spectators + host-only seats.
-- Invariant: is_spectator => eliminated = true, so every "not eliminated" loop already skips them.
alter table players add column if not exists is_spectator boolean not null default false;

create or replace function public._patch_fn(p_name text, p_from text, p_to text) returns void
language plpgsql as $f$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p
    where p.proname = p_name and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'no function %', p_name; end if;
  n := replace(d, p_from, p_to);
  if n = d then raise exception 'patch did not apply: % / %', p_name, left(p_from, 60); end if;
  execute n;
end $f$;

-- state: spectators see the public view (no hidden letters, no secret classes)
select public._patch_fn('_state_base',
  $q$v_show_all := v_room.phase = 'finished' or coalesce(v_me.eliminated, false);$q$,
  $q$v_show_all := v_room.phase = 'finished' or (coalesce(v_me.eliminated, false) and not coalesce(v_me.is_spectator, false));$q$);
select public._patch_fn('_state_base',
  $q$v_hide := v_room.phase <> 'finished' and not coalesce(v_me.eliminated, false);$q$,
  $q$v_hide := v_room.phase <> 'finished' and not (coalesce(v_me.eliminated, false) and not coalesce(v_me.is_spectator, false));$q$);
select public._patch_fn('_state_base', $q$'eliminated', v_me.eliminated,$q$,
  $q$'eliminated', v_me.eliminated, 'is_spectator', v_me.is_spectator,$q$);
select public._patch_fn('_state_base', $q$'eliminated', p.eliminated, 'perk_used'$q$,
  $q$'eliminated', p.eliminated, 'is_spectator', p.is_spectator, 'perk_used'$q$);

-- start_game: spectators don't count and don't get letters / teams
select public._patch_fn('start_game', $q$select count(*) into v_count from players where room_id = v_room.id;$q$,
  $q$select count(*) into v_count from players where room_id = v_room.id and not is_spectator;$q$);
select public._patch_fn('start_game', $q$exists (select 1 from players where room_id = v_room.id and team_id is null)$q$,
  $q$exists (select 1 from players where room_id = v_room.id and team_id is null and not is_spectator)$q$);
select public._patch_fn('start_game', $q$for v_p in select id from players where room_id = v_room.id loop$q$,
  $q$for v_p in select id from players where room_id = v_room.id and not is_spectator loop$q$);

-- join_room: room-full counts players only
select public._patch_fn('join_room', $q$(select count(*) from players where room_id = v_room.id) >=$q$,
  $q$(select count(*) from players where room_id = v_room.id and not is_spectator) >=$q$);
select public._patch_fn('_settings_base', $q$select count(*) into v_count from players where room_id = v_room.id;$q$,
  $q$select count(*) into v_count from players where room_id = v_room.id and not is_spectator;$q$);

-- host hand-over prefers real players over spectators
select public._patch_fn('leave_room', 'order by joined_at limit 1', 'order by is_spectator, joined_at limit 1');
select public._patch_fn('heartbeat', 'order by joined_at limit 1', 'order by is_spectator, joined_at limit 1');

-- rematch: late spectators become players, host keeps their choice, spectators stay "out"
select public._patch_fn('_again_base', 'declare v_me players; v_room rooms;', 'declare v_me players; v_room rooms; v_x record;');
select public._patch_fn('_again_base', 'update players set strikes = 0,',
  'update players set is_spectator = false where room_id = v_room.id and id <> v_room.host_id;' || chr(10) || '  update players set strikes = 0,');
select public._patch_fn('_again_base', 'eliminated = false, eliminated_round = null,', 'eliminated = is_spectator, eliminated_round = null,');
select public._patch_fn('_again_base', 'if _is_team(v_room.id) then perform _team_fix_leaders(v_room.id); end if;',
  'if _is_team(v_room.id) then' || chr(10) ||
  '    for v_x in select id from players where room_id = v_room.id and team_id is null and not is_spectator loop' || chr(10) ||
  '      perform _team_autoplace(v_room.id, v_x.id);' || chr(10) ||
  '    end loop;' || chr(10) ||
  '    perform _team_fix_leaders(v_room.id);' || chr(10) ||
  '  end if;');

-- XP: spectators earn nothing and don't count as humans
select public._patch_fn('_award_xp', 'from players where room_id = p_room_id;', 'from players where room_id = p_room_id and not is_spectator;');
select public._patch_fn('_award_xp', 'and profile_id is not null and bot = 0 loop', 'and profile_id is not null and bot = 0 and not is_spectator loop');

-- join as a spectator (game already started)
create or replace function public.join_spectator(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_room rooms; v_player players; v_name text := trim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 1 or char_length(v_name) > 20 then raise exception 'BAD_NAME'; end if;
  select * into v_room from rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.phase = 'lobby' then raise exception 'USE_JOIN'; end if;
  if (select count(*) from players where room_id = v_room.id and is_spectator) >= 30 then raise exception 'ROOM_FULL'; end if;
  begin
    insert into players (room_id, name, class, is_spectator, eliminated) values (v_room.id, v_name, 'hero', true, true)
      returning * into v_player;
  exception when unique_violation then raise exception 'NAME_TAKEN';
  end;
  perform _bump(v_room.id, 'player_joined', jsonb_build_object('player_id', v_player.id));
  return jsonb_build_object('code', v_room.code, 'player_id', v_player.id, 'token', v_player.token, 'spectator', true);
end $$;

-- host steps out / back in
create or replace function public.set_host_mode(p_token uuid, p_play boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_me players; v_room rooms; v_mode text;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  v_mode := coalesce(_cfg(v_room.id)->>'mode', 'classic');
  if v_mode = 'team' then raise exception 'NOT_SUPPORTED'; end if;
  if p_play then
    if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
    if not v_me.is_spectator then return jsonb_build_object('play', true); end if;
    if (select count(*) from players where room_id = v_room.id and not is_spectator) >= (_cfg(v_room.id)->>'max_players')::int then
      raise exception 'ROOM_FULL';
    end if;
    update players set is_spectator = false, eliminated = false where id = v_me.id;
  else
    if v_me.is_spectator then return jsonb_build_object('play', false); end if;
    if v_room.phase = 'answer' then raise exception 'WRONG_PHASE'; end if;
    update players set is_spectator = true, eliminated = true, eliminated_round = null, quit = false where id = v_me.id;
    if v_room.phase not in ('lobby', 'finished') and _alive(v_room.id) <= 1 then
      perform _finish(v_room.id);
    end if;
  end if;
  perform _bump(v_room.id, 'host_mode', jsonb_build_object('player_id', v_me.id, 'play', p_play));
  return jsonb_build_object('play', p_play);
end $$;

grant execute on function public.join_spectator(text, text) to anon, authenticated;
grant execute on function public.set_host_mode(uuid, boolean) to anon, authenticated;
drop function public._patch_fn(text, text, text);

-- Team mode (2v2 / 3v3): two teams with a name, image and leader. Each team shares ONE rack of banned letters
-- (mirrored onto every member so all the existing per-player logic keeps working), there are no strikes,
-- attacks and abilities hit the enemy team, and the game runs a host-set number of rounds (1-8): most points wins.
-- Classic and 1v1 are untouched: every change below is behind `mode = 'team'`.

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  idx int not null check (idx in (0, 1)),
  name text not null,
  image_url text,
  leader_id uuid,
  unique (room_id, idx)
);
alter table teams enable row level security;
alter table players add column if not exists team_id uuid references teams(id) on delete set null;
alter table rooms add column if not exists winner_team int;

create or replace function _defaults() returns jsonb
language sql immutable set search_path = public as $$
  select '{"mode":"classic","max_players":8,"answer_seconds":60,"shrink":true,"guess_seconds":20,"react_seconds":8,
           "duel_seconds":20,"cards":true,"perks":true,"strikes":2,"lang":"en","team_size":2,"rounds":5}'::jsonb;
$$;

-- ───────────── helpers ─────────────
create or replace function _is_team(p_room_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(_cfg(p_room_id)->>'mode', 'classic') = 'team';
$$;

-- the member whose rack stands for the whole team (racks are mirrored, so any member would do)
create or replace function _team_ref(p_team_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where team_id = p_team_id order by joined_at, id limit 1;
$$;

-- one new lock for the whole team: same letter on every member. Round 0 = consonant, max 2 vowels.
create or replace function _team_add_letter(p_team_id uuid, p_round int, p_source text) returns char(1)
language plpgsql security definer set search_path = public as $$
declare v_ref uuid; v_letter text; v_vowels int; v_m uuid;
begin
  v_ref := _team_ref(p_team_id);
  if v_ref is null then return null; end if;
  select count(*) into v_vowels from banned_letters where player_id = v_ref and letter in ('A','E','I','O','U');
  select l into v_letter from (select chr(65 + i) as l from generate_series(0, 25) i) a
  where l not in (select letter::text from banned_letters where player_id = v_ref)
    and not (l in ('A','E','I','O','U') and (p_round = 0 or v_vowels >= 2))
  order by random() limit 1;
  if v_letter is null then return null; end if;
  for v_m in select id from players where team_id = p_team_id loop
    insert into banned_letters (player_id, letter, added_round, source) values (v_m, v_letter, p_round, p_source);
  end loop;
  return v_letter;
end $$;

create or replace function _team_del_letter(p_team_id uuid, p_letter text) returns void
language sql security definer set search_path = public as $$
  delete from banned_letters where letter = p_letter
    and player_id in (select id from players where team_id = p_team_id);
$$;

create or replace function _team_fix_leaders(p_room_id uuid) returns void
language sql security definer set search_path = public as $$
  update teams t set leader_id = (
    select p.id from players p where p.team_id = t.id and not p.quit order by p.joined_at, p.id limit 1)
  where t.room_id = p_room_id
    and (t.leader_id is null or not exists (select 1 from players p where p.id = t.leader_id and p.team_id = t.id));
$$;

-- seat a player on the emptier team (Team A first on a tie), if there is room
create or replace function _team_autoplace(p_room_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_size int; v_t uuid;
begin
  v_size := (_cfg(p_room_id)->>'team_size')::int;
  select t.id into v_t from teams t
    where t.room_id = p_room_id and (select count(*) from players p where p.team_id = t.id) < v_size
    order by (select count(*) from players p where p.team_id = t.id), t.idx limit 1;
  if v_t is not null then update players set team_id = v_t where id = p_player_id; end if;
end $$;

-- make sure both teams exist and everyone has a seat
create or replace function _team_setup(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_p record; v_size int;
begin
  v_size := (_cfg(p_room_id)->>'team_size')::int;
  insert into teams (room_id, idx, name)
    select p_room_id, i, case when i = 0 then 'Team A' else 'Team B' end from generate_series(0, 1) i
  on conflict (room_id, idx) do nothing;
  -- a smaller team size bumps the extras out of their seats
  update players set team_id = null where id in (
    select id from (select id, row_number() over (partition by team_id order by joined_at, id) rn
                    from players where room_id = p_room_id and team_id is not null) x where rn > v_size);
  for v_p in select id from players where room_id = p_room_id and team_id is null order by joined_at loop
    perform _team_autoplace(p_room_id, v_p.id);
  end loop;
  perform _team_fix_leaders(p_room_id);
end $$;

-- End of game: most points wins; tie → fewer locks; still tied → a draw. A team with nobody left loses.
create or replace function _team_finish(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t record; v_b_id uuid; v_b_idx int; v_b_pts int; v_b_locks int; v_b_alive boolean; v_tie boolean := false;
  v_winner uuid;
begin
  for v_t in select t.id, t.idx,
      (select coalesce(sum(p.points), 0) from players p where p.team_id = t.id)::int as pts,
      (select count(*) from banned_letters bl where bl.player_id = _team_ref(t.id))::int as locks,
      exists (select 1 from players p where p.team_id = t.id and not p.eliminated) as alive
    from teams t where t.room_id = p_room_id order by t.idx loop
    if v_b_id is null then
      v_b_id := v_t.id; v_b_idx := v_t.idx; v_b_pts := v_t.pts; v_b_locks := v_t.locks; v_b_alive := v_t.alive;
    elsif v_t.alive and not v_b_alive then
      v_b_id := v_t.id; v_b_idx := v_t.idx; v_b_pts := v_t.pts; v_b_locks := v_t.locks; v_b_alive := v_t.alive; v_tie := false;
    elsif v_t.alive = v_b_alive then
      if v_t.pts > v_b_pts or (v_t.pts = v_b_pts and v_t.locks < v_b_locks) then
        v_b_id := v_t.id; v_b_idx := v_t.idx; v_b_pts := v_t.pts; v_b_locks := v_t.locks; v_b_alive := v_t.alive; v_tie := false;
      elsif v_t.pts = v_b_pts and v_t.locks = v_b_locks then
        v_tie := true;
      end if;
    end if;
  end loop;
  select id into v_winner from players where team_id = v_b_id order by points desc, joined_at limit 1;
  update rooms set phase = 'finished', phase_ends_at = null,
    winner_team = case when v_tie then null else v_b_idx end,
    winner_id = case when v_tie then null else v_winner end
  where id = p_room_id;
end $$;

-- ───────────── settings: mode 'team', team_size, rounds ─────────────
create or replace function update_settings(p_token uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_cur jsonb; v_in jsonb := coalesce(p_settings, '{}'::jsonb); v_new jsonb; v_count int;
  v_mode text; v_size int;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  v_cur := _defaults() || v_room.settings;
  select count(*) into v_count from players where room_id = v_room.id;
  v_mode := case when v_in->>'mode' in ('classic', 'duel', 'team') then v_in->>'mode' else v_cur->>'mode' end;
  v_size := _clamp(coalesce(v_in->'team_size', v_cur->'team_size'), 2, 3, 2);
  if v_mode = 'duel' and v_count > 2 then raise exception 'TOO_MANY_FOR_DUEL'; end if;
  if v_mode = 'team' and v_count > 2 * v_size then raise exception 'TOO_MANY_FOR_TEAM'; end if;
  v_new := jsonb_build_object(
    'mode', v_mode,
    'max_players',    case when v_mode = 'duel' then 2
                           when v_mode = 'team' then 2 * v_size
                           else _clamp(coalesce(v_in->'max_players', case when v_cur->>'mode' <> 'classic' then '8'::jsonb else v_cur->'max_players' end),
                                       greatest(2, v_count), 12, 8) end,
    'answer_seconds', _clamp(coalesce(v_in->'answer_seconds', v_cur->'answer_seconds'), 20, 120, 60),
    'guess_seconds',  _clamp(coalesce(v_in->'guess_seconds', v_cur->'guess_seconds'), 10, 45, 20),
    'react_seconds',  _clamp(coalesce(v_in->'react_seconds', v_cur->'react_seconds'), 5, 20, 8),
    'duel_seconds',   _clamp(coalesce(v_in->'duel_seconds', v_cur->'duel_seconds'), 10, 60, 20),
    'strikes',        _clamp(coalesce(v_in->'strikes', v_cur->'strikes'), 1, 3, 2),
    'shrink', case when jsonb_typeof(v_in->'shrink') = 'boolean' then v_in->'shrink' else v_cur->'shrink' end,
    'cards',  case when jsonb_typeof(v_in->'cards') = 'boolean' then v_in->'cards' else v_cur->'cards' end,
    'perks',  case when jsonb_typeof(v_in->'perks') = 'boolean' then v_in->'perks' else v_cur->'perks' end,
    'lang',   case when v_in->>'lang' in ('en', 'es', 'fr', 'de', 'ja', 'zh') then v_in->>'lang'
                   else coalesce(v_cur->>'lang', 'en') end,
    'team_size', v_size,
    'rounds', _clamp(coalesce(v_in->'rounds', v_cur->'rounds'), 1, 8, 5)
  );
  update rooms set settings = v_new where id = v_room.id;
  if v_mode = 'team' then
    perform _team_setup(v_room.id);
  else
    delete from teams where room_id = v_room.id;   -- players.team_id goes back to null
  end if;
  perform _bump(v_room.id, 'settings');
  return v_new;
end $$;

-- ───────────── team management ─────────────
create or replace function team_join(p_token uuid, p_idx int) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_team teams; v_size int;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  if not _is_team(v_room.id) then raise exception 'NOT_TEAM_MODE'; end if;
  if p_idx is null then
    update players set team_id = null where id = v_me.id;
  else
    select * into v_team from teams where room_id = v_room.id and idx = p_idx;
    if not found then raise exception 'TEAM_NOT_FOUND'; end if;
    v_size := (_cfg(v_room.id)->>'team_size')::int;
    if v_me.team_id is distinct from v_team.id
       and (select count(*) from players where team_id = v_team.id) >= v_size then
      raise exception 'TEAM_FULL';
    end if;
    update players set team_id = v_team.id where id = v_me.id;
  end if;
  perform _team_fix_leaders(v_room.id);
  perform _bump(v_room.id, 'team');
end $$;

create or replace function team_update(p_token uuid, p_name text, p_image_url text default null, p_clear_image boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_team teams; v_name text := trim(coalesce(p_name, ''));
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  if v_me.team_id is null then raise exception 'NO_TEAM'; end if;
  select * into v_team from teams where id = v_me.team_id;
  if v_team.leader_id is distinct from v_me.id then raise exception 'NOT_LEADER'; end if;
  if v_name <> '' then
    if char_length(v_name) > 20 then raise exception 'BAD_NAME'; end if;
    if exists (select 1 from teams where room_id = v_room.id and id <> v_team.id and lower(name) = lower(v_name)) then
      raise exception 'NAME_TAKEN';
    end if;
    update teams set name = v_name where id = v_team.id;
  end if;
  if p_clear_image then
    update teams set image_url = null where id = v_team.id;
  elsif p_image_url is not null then
    if p_image_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}\.(jpg|png|webp|gif)$' then
      raise exception 'BAD_AVATAR';
    end if;
    update teams set image_url = p_image_url where id = v_team.id;
  end if;
  perform _bump(v_room.id, 'team');
end $$;

create or replace function team_set_leader(p_token uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_team teams;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  if v_me.team_id is null then raise exception 'NO_TEAM'; end if;
  select * into v_team from teams where id = v_me.team_id;
  if v_team.leader_id is distinct from v_me.id then raise exception 'NOT_LEADER'; end if;
  if not exists (select 1 from players where id = p_player_id and team_id = v_team.id) then
    raise exception 'TARGET_NOT_FOUND';
  end if;
  update teams set leader_id = p_player_id where id = v_team.id;
  perform _bump(v_room.id, 'team');
end $$;

-- ───────────── joining / leaving / starting ─────────────
create or replace function join_room(p_code text, p_name text, p_class player_class) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_player players;
  v_name text := trim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 1 or char_length(v_name) > 20 then raise exception 'BAD_NAME'; end if;
  if p_class is null then raise exception 'CLASS_REQUIRED'; end if;
  select * into v_room from rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.phase <> 'lobby' then raise exception 'GAME_IN_PROGRESS'; end if;
  if (select count(*) from players where room_id = v_room.id) >= (_cfg(v_room.id)->>'max_players')::int then
    raise exception 'ROOM_FULL';
  end if;
  begin
    insert into players (room_id, name, class) values (v_room.id, v_name, p_class) returning * into v_player;
  exception when unique_violation then
    raise exception 'NAME_TAKEN';
  end;
  if _is_team(v_room.id) then
    perform _team_autoplace(v_room.id, v_player.id);
    perform _team_fix_leaders(v_room.id);
  end if;
  perform _bump(v_room.id, 'player_joined', jsonb_build_object('player_id', v_player.id));
  return jsonb_build_object('code', v_room.code, 'player_id', v_player.id, 'token', v_player.token);
end $$;

create or replace function leave_room(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_next uuid;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase = 'lobby' then
    delete from players where id = v_me.id;
    if not exists (select 1 from players where room_id = v_room.id) then
      delete from rooms where id = v_room.id;
      return;
    end if;
    perform _team_fix_leaders(v_room.id);
  elsif v_room.phase <> 'finished' and not v_me.eliminated then
    -- rage quit: out of the game, and everyone hears about it
    update players set eliminated = true, eliminated_round = v_room.round, quit = true,
      last_seen = now() - interval '1 hour'
      where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'chicken', 'from', v_me.id, 'name', v_me.name));
    if _is_team(v_room.id) then
      -- a team with nobody left forfeits
      if exists (select 1 from teams t where t.room_id = v_room.id
                 and not exists (select 1 from players p where p.team_id = t.id and not p.eliminated)) then
        perform _team_finish(v_room.id);
      end if;
    elsif _alive(v_room.id) <= 1 then
      perform _finish(v_room.id);
    end if;
  else
    update players set last_seen = now() - interval '1 hour' where id = v_me.id;
  end if;
  if v_room.host_id = v_me.id then
    select id into v_next from players
      where room_id = v_room.id and id <> v_me.id and last_seen > now() - interval '20 seconds'
      order by joined_at limit 1;
    if v_next is null then
      select id into v_next from players where room_id = v_room.id and id <> v_me.id order by joined_at limit 1;
    end if;
    update rooms set host_id = v_next where id = v_room.id;
  end if;
  perform _bump(v_room.id, 'player_left', jsonb_build_object('player_id', v_me.id));
end $$;

create or replace function start_game(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_p record; v_count int; v_t record;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  select count(*) into v_count from players where room_id = v_room.id;
  if v_count < 2 then raise exception 'NEED_TWO_PLAYERS'; end if;
  if _cfg(v_room.id)->>'mode' = 'duel' and v_count <> 2 then raise exception 'TOO_MANY_FOR_DUEL'; end if;
  if _cfg(v_room.id)->>'mode' = 'team' then
    if (select count(*) from teams where room_id = v_room.id) <> 2
       or exists (select 1 from players where room_id = v_room.id and team_id is null)
       or exists (select 1 from teams t where t.room_id = v_room.id
                  and (select count(*) from players p where p.team_id = t.id) < 2) then
      raise exception 'TEAMS_NOT_READY';
    end if;
    for v_t in select id from teams where room_id = v_room.id loop
      perform _team_add_letter(v_t.id, 0, 'start');
    end loop;
    perform _start_round(v_room.id);
    perform _bump(v_room.id, 'game_started', jsonb_build_object('mode', 'team'));
    return;
  end if;
  for v_p in select id from players where room_id = v_room.id loop
    perform _add_letter(v_p.id, 0, 'start');
  end loop;
  if _cfg(v_room.id)->>'mode' = 'duel' then
    -- straight to the VS screen; the duel intro then deals the usual duel lock (Hero stays at 1)
    update rooms set duel = true where id = v_room.id;
    perform _set_phase(v_room.id, 'duel_intro', 7);
    perform _bump(v_room.id, 'game_started', jsonb_build_object('mode', 'duel'));
    return;
  end if;
  perform _start_round(v_room.id);
  perform _bump(v_room.id, 'game_started');
end $$;

-- ───────────── Wildcard chaos: team versions of the two twists that move locks around ─────────────
create or replace function _chaos(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_kind text; v_ids uuid[]; v_n int; i int; v_letter text; v_card record; v_k int := 0;
  v_moves jsonb := '[]'::jsonb; v_m jsonb;
  v_team boolean; v_tids uuid[]; v_l1 text; v_l2 text; v_t record; v_lr text; v_r0 uuid; v_r1 uuid;
begin
  select * into v_room from rooms where id = p_room_id;
  v_team := _is_team(p_room_id);
  v_kind := (array['swap','no_e','shuffle','double','amnesty','speed'])[1 + floor(random() * 6)::int];
  select array_agg(id order by joined_at) into v_ids from players where room_id = p_room_id and not eliminated;
  v_n := coalesce(array_length(v_ids, 1), 0);

  if v_team and v_kind = 'swap' then
    -- the two teams trade one lock
    select array_agg(id order by idx) into v_tids from teams where room_id = p_room_id;
    if coalesce(array_length(v_tids, 1), 0) = 2 then
      v_r0 := _team_ref(v_tids[1]); v_r1 := _team_ref(v_tids[2]);
      select letter::text into v_l1 from banned_letters where player_id = v_r0
        and (select count(*) from banned_letters b2 where b2.player_id = v_r0) > 1 order by revealed asc, random() limit 1;
      select letter::text into v_l2 from banned_letters where player_id = v_r1
        and (select count(*) from banned_letters b2 where b2.player_id = v_r1) > 1 order by revealed asc, random() limit 1;
      if v_l1 is not null and v_l2 is not null and v_l1 <> v_l2
         and not exists (select 1 from banned_letters where player_id = v_r0 and letter = v_l2)
         and not exists (select 1 from banned_letters where player_id = v_r1 and letter = v_l1) then
        perform _team_del_letter(v_tids[1], v_l1);
        perform _team_del_letter(v_tids[2], v_l2);
        insert into banned_letters (player_id, letter, added_round, source)
          select p.id, v_l2, v_room.round, 'swap' from players p where p.team_id = v_tids[1];
        insert into banned_letters (player_id, letter, added_round, source)
          select p.id, v_l1, v_room.round, 'swap' from players p where p.team_id = v_tids[2];
      end if;
    end if;
  elsif v_team and v_kind = 'amnesty' then
    for v_t in select id from teams where room_id = p_room_id loop
      v_r0 := _team_ref(v_t.id);
      if (select count(*) from banned_letters where player_id = v_r0) > 1 then
        select letter::text into v_lr from banned_letters where player_id = v_r0 order by random() limit 1;
        perform _team_del_letter(v_t.id, v_lr);
      end if;
    end loop;
  elsif v_kind = 'swap' and v_n >= 2 then
    -- everyone passes one random lock to the player on their left
    for i in 1..v_n loop
      select letter::text into v_letter from banned_letters
        where player_id = v_ids[i] and (select count(*) from banned_letters b2 where b2.player_id = v_ids[i]) > 1
        order by revealed asc, random() limit 1;
      if v_letter is not null then
        v_moves := v_moves || jsonb_build_object('from', v_ids[i], 'to', v_ids[1 + (i % v_n)], 'letter', v_letter);
      end if;
    end loop;
    for v_m in select * from jsonb_array_elements(v_moves) loop
      if not exists (select 1 from banned_letters where player_id = (v_m->>'to')::uuid and letter = v_m->>'letter') then
        update banned_letters set player_id = (v_m->>'to')::uuid, revealed = false
          where player_id = (v_m->>'from')::uuid and letter = v_m->>'letter';
      end if;
    end loop;
  elsif v_kind = 'shuffle' and v_n >= 2 then
    for v_card in select c.id from cards c join players p on p.id = c.owner_id
                  where c.room_id = p_room_id and not c.used and not p.eliminated order by random() loop
      update cards set owner_id = v_ids[1 + (v_k % v_n)] where id = v_card.id;
      v_k := v_k + 1;
    end loop;
  elsif v_kind = 'amnesty' then
    delete from banned_letters where id in (
      select distinct on (bl.player_id) bl.id from banned_letters bl
      where bl.player_id = any(v_ids) and (select count(*) from banned_letters b2 where b2.player_id = bl.player_id) > 1
      order by bl.player_id, random());
  elsif v_kind = 'speed' then
    update rooms set phase_ends_at = now() + make_interval(secs => greatest(15, _answer_secs(_cfg(p_room_id), round, duel) / 2))
      where id = p_room_id;
  end if;

  update rooms set chaos = v_kind, chaos_round = round where id = p_room_id;
  perform _feed(p_room_id, jsonb_build_object('type', 'chaos', 'what', v_kind));
end $$;

-- ───────────── guessing: a team cracks the ENEMY team's shared rack ─────────────
create or replace function submit_guess(p_token uuid, p_target_id uuid, p_letter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_target players;
  v_letter text := upper(substr(trim(coalesce(p_letter, '')), 1, 1));
  v_correct boolean; v_kind card_kind; v_held int; v_cards boolean; v_card bigint; v_stole boolean := false;
  v_team boolean; v_ninja uuid;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'guess' then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  v_team := _is_team(v_room.id);
  select * into v_target from players where id = p_target_id and room_id = v_room.id;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
  if v_team and v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
  if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
  if v_letter !~ '^[A-Z]$' then raise exception 'BAD_LETTER'; end if;
  if exists (select 1 from guesses where guesser_id = v_me.id and round = v_room.round) then
    raise exception 'ALREADY_GUESSED';
  end if;
  if exists (select 1 from banned_letters where player_id = v_target.id and letter = v_letter and revealed) then
    raise exception 'ALREADY_REVEALED';
  end if;

  v_cards := (_cfg(v_room.id)->>'cards')::boolean;
  v_correct := exists (select 1 from banned_letters where player_id = v_target.id and letter = v_letter);
  insert into guesses (room_id, round, guesser_id, target_id, letter, correct)
    values (v_room.id, v_room.round, v_me.id, v_target.id, v_letter, v_correct);
  select count(*) into v_held from cards where owner_id = v_me.id and not used;

  if v_correct then
    if v_team then
      update banned_letters set revealed = true where letter = v_letter
        and player_id in (select id from players where team_id = v_target.team_id);
    else
      update banned_letters set revealed = true where player_id = v_target.id and letter = v_letter;
    end if;
    if v_held < 2 and v_cards then
      if v_me.class = 'thief' then
        -- the Thief lifts a card straight out of the victim's hand (any card on the enemy team)
        select id into v_card from cards where not used and (
            (not v_team and owner_id = v_target.id)
            or (v_team and owner_id in (select id from players where team_id = v_target.team_id)))
          order by random() limit 1;
        if v_card is not null then
          update cards set owner_id = v_me.id where id = v_card returning kind into v_kind;
          v_stole := true;
          perform _feed(v_room.id, jsonb_build_object('type', 'steal', 'from', v_me.id, 'to', v_target.id));
        end if;
      end if;
      if not v_stole then
        if v_me.class = 'villain' then
          v_kind := (array['attack','cleanse']::card_kind[])[1 + floor(random() * 2)::int];
        else
          v_kind := (array['attack','shield','cleanse']::card_kind[])[1 + floor(random() * 3)::int];
        end if;
        insert into cards (room_id, owner_id, kind) values (v_room.id, v_me.id, v_kind);
      end if;
    end if;
    if v_team then
      -- Ninja's price, team edition: a crack on the Ninja's team costs the whole team 2 locks (once a round)
      select id into v_ninja from players where team_id = v_target.team_id and class = 'ninja' and not eliminated limit 1;
      if v_ninja is not null and not exists (
        select 1 from pending_additions pa where pa.room_id = v_room.id and pa.round = v_room.round and pa.kind = 'ninja'
          and pa.target_id in (select id from players where team_id = v_target.team_id)
      ) then
        insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
          values (v_room.id, v_room.round, v_ninja, null, 'ninja', 2);
      end if;
    elsif v_target.class = 'ninja' and not exists (
      select 1 from pending_additions where room_id = v_room.id and round = v_room.round
        and target_id = v_target.id and kind = 'ninja'
    ) then
      insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
        values (v_room.id, v_room.round, v_target.id, null, 'ninja', 3);
    end if;
  elsif v_me.class = 'thief' and v_cards then
    -- a botched job: the Thief drops one of their own cards into the target's hand
    select id into v_card from cards where owner_id = v_me.id and not used order by random() limit 1;
    if v_card is not null and (select count(*) from cards where owner_id = v_target.id and not used) < 2 then
      update cards set owner_id = v_target.id where id = v_card;
      perform _feed(v_room.id, jsonb_build_object('type', 'drop', 'from', v_me.id, 'to', v_target.id));
    end if;
  end if;

  perform _bump(v_room.id, 'guessed', jsonb_build_object('player_id', v_me.id));
  return jsonb_build_object('correct', v_correct, 'card', v_kind, 'letter', v_letter, 'stole', v_stole);
end $$;

-- ───────────── cards ─────────────
create or replace function play_card(p_token uuid, p_card_id bigint, p_target_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_card cards; v_target players;
  v_amount int; v_removed text; v_blocked pending_additions; v_kind text; v_attacker uuid; v_team boolean;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  v_team := _is_team(v_room.id);
  select * into v_card from cards where id = p_card_id for update;
  if not found or v_card.owner_id <> v_me.id or v_card.used then raise exception 'CARD_NOT_AVAILABLE'; end if;

  if v_card.kind = 'attack' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_team and v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    v_amount := case when v_me.class = 'villain' then 2 else 1 end;
    v_kind := case when v_me.class = 'hacker' then 'hack' else 'attack' end;
    insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
      values (v_room.id, v_room.round, v_target.id, v_me.id, v_kind, v_amount);
    if v_kind = 'hack' then
      -- anonymous unless this hacker has already been exposed
      perform _feed(v_room.id, jsonb_build_object('type', 'hack', 'to', v_target.id,
        'from', case when v_me.exposed then v_me.id end));
    else
      perform _feed(v_room.id, jsonb_build_object('type', 'attack', 'from', v_me.id, 'to', v_target.id,
        'amount', v_amount));
    end if;

  elsif v_card.kind = 'shield' then
    if v_room.phase <> 'react' then raise exception 'WRONG_PHASE'; end if;
    if v_me.class = 'villain' then raise exception 'VILLAIN_NO_SHIELD'; end if;
    select * into v_blocked from pending_additions
      where room_id = v_room.id and round = v_room.round and status = 'pending'
        and (case when v_team then target_id in (select id from players where team_id = v_me.team_id)
                  else target_id = v_me.id end)
      order by amount desc, id limit 1;
    if v_blocked.id is null then raise exception 'NOTHING_TO_BLOCK'; end if;
    update pending_additions set status = 'blocked' where id = v_blocked.id;
    v_attacker := case when v_blocked.kind = 'hack'
                         and not coalesce((select exposed from players where id = v_blocked.source_id), false)
                       then null else v_blocked.source_id end;
    perform _feed(v_room.id, jsonb_build_object('type', 'block', 'from', v_me.id, 'to', v_attacker,
      'what', v_blocked.kind));

  elsif v_card.kind = 'cleanse' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    if (select count(*) from banned_letters where player_id = v_me.id) <= 1 then raise exception 'AT_MINIMUM'; end if;
    if v_team then
      select letter::text into v_removed from banned_letters where player_id = v_me.id order by revealed desc, random() limit 1;
      perform _team_del_letter(v_me.team_id, v_removed);
    else
      delete from banned_letters where id = (
        select id from banned_letters where player_id = v_me.id order by revealed desc, random() limit 1
      ) returning letter::text into v_removed;
    end if;
    perform _feed(v_room.id, jsonb_build_object('type', 'cleanse', 'from', v_me.id));
  end if;

  update cards set used = true where id = v_card.id;
  perform _bump(v_room.id, 'card_played', jsonb_build_object('kind', v_card.kind));
  return jsonb_build_object('kind', coalesce(v_kind, v_card.kind::text), 'removed', v_removed, 'amount', v_amount);
end $$;

-- ───────────── class perks (team-aware) ─────────────
create or replace function use_perk(p_token uuid, p_target_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_target players;
  v_letters jsonb; v_hint text; v_pending bigint; v_result jsonb; v_prompt bigint; v_mine jsonb; v_theirs jsonb;
  v_team boolean; v_ref_me uuid; v_ref_th uuid;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase in ('lobby','finished') then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  if not (_cfg(v_room.id)->>'perks')::boolean then raise exception 'PERKS_OFF'; end if;
  v_team := _is_team(v_room.id);

  if v_me.class = 'gambler' then
    if v_room.phase <> 'answer' then raise exception 'WRONG_PHASE'; end if;
    if v_me.bet_round = v_room.round then raise exception 'ALREADY_BET'; end if;
    update players set bet_round = v_room.round where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'bet', 'from', v_me.id));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
    return jsonb_build_object('kind', 'gambler', 'round', v_room.round);
  elsif v_me.class = 'parasite' then
    if v_room.phase not in ('answer','reveal','guess') then raise exception 'WRONG_PHASE'; end if;
    if v_me.latch_round = v_room.round then raise exception 'ALREADY_LATCHED'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    if v_team and v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
    update players set latch_target = v_target.id, latch_round = v_room.round where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'latch', 'from', v_me.id, 'to', v_target.id));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
    return jsonb_build_object('kind', 'parasite', 'target_id', v_target.id);
  end if;

  if v_me.perk_used then raise exception 'PERK_USED'; end if;

  if v_me.class = 'ninja' then
    if v_room.round < 3 then raise exception 'PERK_NOT_READY'; end if;
    select coalesce(jsonb_agg(distinct bl.letter::text), '[]'::jsonb) into v_letters
      from banned_letters bl join players p on p.id = bl.player_id
      where p.room_id = v_room.id and not p.eliminated and p.id <> v_me.id
        and (not v_team or p.team_id is distinct from v_me.team_id);
    v_result := jsonb_build_object('kind','ninja','round',v_room.round,'letters',v_letters);
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);

  elsif v_me.class = 'mastermind' then
    if v_room.phase not in ('answer','reveal','guess') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_team and v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    select coalesce(jsonb_agg(letter::text order by id), '[]'::jsonb) into v_letters
      from banned_letters where player_id = v_target.id;
    select letter::text into v_hint from banned_letters
      where player_id = v_target.id order by revealed asc, random() limit 1;
    v_result := jsonb_build_object('kind','mastermind','round',v_room.round,
      'target_id',v_target.id,'target_name',v_target.name,'letters',v_letters,'leaked',v_hint);
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);
    insert into hints (room_id, round, text)
      values (v_room.id, v_room.round, 'Intel leak: somebody is locked out of "' || v_hint || '".');
    update players set perk_round = v_room.round where id = v_me.id;

  elsif v_me.class = 'hero' then
    if v_room.phase <> 'react' then raise exception 'WRONG_PHASE'; end if;
    if v_team then
      -- team edition: take an incoming attack on your team off the table for +5 points
      select pa.id into v_pending from pending_additions pa
        where pa.room_id = v_room.id and pa.round = v_room.round and pa.status = 'pending'
          and pa.target_id in (select id from players where team_id = v_me.team_id)
        order by pa.amount desc, pa.id limit 1;
      if v_pending is null then raise exception 'NOTHING_TO_ABSORB'; end if;
      update pending_additions set status = 'blocked', absorbed_by = v_me.id where id = v_pending;
    else
      select id into v_pending from pending_additions
        where room_id = v_room.id and round = v_room.round and target_id = p_target_id
          and target_id <> v_me.id and status = 'pending'
        order by amount desc, id limit 1;
      if v_pending is null then raise exception 'NOTHING_TO_ABSORB'; end if;
      update pending_additions set target_id = v_me.id, absorbed_by = v_me.id where id = v_pending;
    end if;
    update players set points = points + 5 where id = v_me.id;
    v_result := jsonb_build_object('kind','hero','absorbed_from',p_target_id,'bonus',5);
    perform _feed(v_room.id, jsonb_build_object('type', 'absorb', 'from', v_me.id,
      'to', case when v_team then (select target_id from pending_additions where id = v_pending) else p_target_id end));

  elsif v_me.class = 'mimic' then
    if v_room.phase = 'duel_intro' then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    if v_target.class = 'mimic' then raise exception 'CANNOT_MIMIC_MIMIC'; end if;
    update players set class = v_target.class, orig_class = 'mimic', perk_used = false, perk_round = null
      where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'mimic', 'from', v_me.id, 'to', v_target.id, 'what', v_target.class));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', 'mimic'));
    return jsonb_build_object('kind', 'mimic', 'became', v_target.class);

  elsif v_me.class = 'oracle' then
    if v_room.phase not in ('reveal','guess','react') then raise exception 'WRONG_PHASE'; end if;
    v_prompt := _pick_prompt(v_room.id);
    update rooms set next_prompt_id = v_prompt where id = v_room.id;
    update players set oracle_round = v_room.round + 1 where id = v_me.id;
    v_result := jsonb_build_object('kind','oracle','round',v_room.round + 1,
      'prompt', (select text from prompts where id = v_prompt));
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);
    perform _feed(v_room.id, jsonb_build_object('type', 'oracle', 'from', v_me.id));

  elsif v_me.class = 'jester' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    if v_team then
      -- team edition: the two teams swap their whole racks; what the Jester's team receives is revealed to all
      if v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
      v_ref_me := _team_ref(v_me.team_id); v_ref_th := _team_ref(v_target.team_id);
      select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
        into v_mine from banned_letters where player_id = v_ref_me;
      select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
        into v_theirs from banned_letters where player_id = v_ref_th;
      delete from banned_letters where player_id in (select id from players where team_id in (v_me.team_id, v_target.team_id));
      insert into banned_letters (player_id, letter, added_round, source, revealed)
        select p.id, x->>'l', (x->>'a')::int, x->>'s', true
        from players p, jsonb_array_elements(v_theirs) x where p.team_id = v_me.team_id;
      insert into banned_letters (player_id, letter, added_round, source, revealed)
        select p.id, x->>'l', (x->>'a')::int, x->>'s', (x->>'r')::boolean
        from players p, jsonb_array_elements(v_mine) x where p.team_id = v_target.team_id;
    else
      select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
        into v_mine from banned_letters where player_id = v_me.id;
      select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
        into v_theirs from banned_letters where player_id = v_target.id;
      delete from banned_letters where player_id in (v_me.id, v_target.id);
      insert into banned_letters (player_id, letter, added_round, source, revealed)
        select v_me.id, x->>'l', (x->>'a')::int, x->>'s', true from jsonb_array_elements(v_theirs) x;
      insert into banned_letters (player_id, letter, added_round, source, revealed)
        select v_target.id, x->>'l', (x->>'a')::int, x->>'s', (x->>'r')::boolean from jsonb_array_elements(v_mine) x;
    end if;
    v_result := jsonb_build_object('kind','jester','target_id',v_target.id);
    perform _feed(v_room.id, jsonb_build_object('type', 'swap', 'from', v_me.id, 'to', v_target.id));

  else
    raise exception 'NO_ACTIVE_PERK';
  end if;

  update players set perk_used = true where id = v_me.id;
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
  return v_result;
end $$;

-- ───────────── the round loop, team edition ─────────────
create or replace function _team_advance(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_p record; v_a record; v_pts int; v_i int; v_t record; v_cfg jsonb; n int;
  v_team uuid; v_gained int; v_drained int; v_host_team uuid; v_l text;
begin
  select * into v_room from rooms where id = p_room_id;
  v_cfg := _cfg(v_room.id);

  if v_room.phase = 'answer' then
    -- points for valid words; an invalid one just scores 0 (no strikes in team mode)
    for v_p in select * from players where room_id = v_room.id and not eliminated order by joined_at loop
      insert into answers (room_id, player_id, round, word, valid, reason, points)
        values (v_room.id, v_p.id, v_room.round, '', false, 'BLANK', 0)
        on conflict (player_id, round) do nothing;
      select * into v_a from answers where player_id = v_p.id and round = v_room.round;
      if v_a.valid then
        v_pts := v_a.points;
        if v_room.chaos = 'double' and v_room.chaos_round = v_room.round then v_pts := v_pts * 2; end if;
        if v_p.bet_round = v_room.round then
          v_pts := v_pts * 2;
          perform _feed(v_room.id, jsonb_build_object('type', 'bet_win', 'from', v_p.id, 'amount', v_pts));
        end if;
        if v_pts <> v_a.points then update answers set points = v_pts where id = v_a.id; end if;
        update players set points = points + v_pts where id = v_p.id;
      elsif v_p.bet_round = v_room.round then
        update players set points = greatest(0, points - 10) where id = v_p.id;
        perform _feed(v_room.id, jsonb_build_object('type', 'bet_lose', 'from', v_p.id, 'amount', 10));
      end if;
    end loop;
    perform _set_phase(v_room.id, 'reveal', 6);

  elsif v_room.phase = 'reveal' then
    perform _set_phase(v_room.id, 'guess', (v_cfg->>'guess_seconds')::int);

  elsif v_room.phase = 'guess' then
    -- the Mastermind's price without strikes: -5 points if nobody else cracked a lock this round
    for v_p in select * from players
      where room_id = v_room.id and class = 'mastermind' and perk_round = v_room.round and not eliminated loop
      if not exists (select 1 from guesses where room_id = v_room.id and round = v_room.round
                       and correct and guesser_id <> v_p.id) then
        update players set points = greatest(0, points - 5) where id = v_p.id;
      end if;
    end loop;
    update players set react_ready = false where room_id = v_room.id;
    perform _set_phase(v_room.id, 'react', (v_cfg->>'react_seconds')::int);

  elsif v_room.phase = 'react' then
    -- attacks land on the target's whole team
    for v_a in select pa.* from pending_additions pa
      where pa.room_id = v_room.id and pa.round = v_room.round and pa.status = 'pending'
      order by pa.id loop
      select team_id into v_team from players where id = v_a.target_id;
      v_i := 0;
      for n in 1..v_a.amount loop
        if _team_add_letter(v_team, v_room.round, v_a.kind) is not null then v_i := v_i + 1; end if;
      end loop;
      update pending_additions set status = 'applied' where id = v_a.id;
      if v_a.kind = 'hack' then
        update players set hacked_round = v_room.round + 1, hacked_by = v_a.source_id, traced_round = null
          where team_id = v_team and not eliminated;
      end if;
      if v_a.source_id is not null then
        update players set letters_stacked = letters_stacked + v_i where id = v_a.source_id;
      end if;
    end loop;
    -- every team picks up one new lock per round
    for v_t in select id from teams where room_id = v_room.id loop
      perform _team_add_letter(v_t.id, v_room.round, 'survive');
    end loop;
    -- Parasite: every lock the host's team gained this round, the Parasite's team sheds one (never below 1)
    for v_p in select p.id, p.team_id, p.latch_target from players p
      where p.room_id = v_room.id and p.class = 'parasite' and not p.eliminated
        and p.latch_round = v_room.round and p.latch_target is not null loop
      select team_id into v_host_team from players where id = v_p.latch_target;
      if v_host_team is not null and v_host_team is distinct from v_p.team_id then
        select count(*) into v_gained from banned_letters
          where player_id = _team_ref(v_host_team) and added_round = v_room.round and source <> 'start';
        v_drained := 0;
        for n in 1..v_gained loop
          exit when (select count(*) from banned_letters where player_id = _team_ref(v_p.team_id)) <= 1;
          select letter::text into v_l from banned_letters where player_id = _team_ref(v_p.team_id)
            order by revealed desc, random() limit 1;
          perform _team_del_letter(v_p.team_id, v_l);
          v_drained := v_drained + 1;
        end loop;
        if v_drained > 0 then
          perform _feed(v_room.id, jsonb_build_object('type', 'drain', 'from', v_p.id, 'to', v_p.latch_target, 'amount', v_drained));
        end if;
      end if;
    end loop;
    if v_room.round >= (v_cfg->>'rounds')::int then
      perform _team_finish(v_room.id);
    else
      perform _start_round(v_room.id);
    end if;
  end if;
end $$;

create or replace function advance_phase(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_p record; v_a record; v_i int; v_cfg jsonb; v_pts int; v_gained int; v_drained int;
begin
  select * into v_room from rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.phase in ('lobby','finished') then return jsonb_build_object('ok', false, 'reason', 'NOT_RUNNING'); end if;
  if v_room.phase_ends_at is not null and now() < v_room.phase_ends_at - interval '250 milliseconds' then
    return jsonb_build_object('ok', false, 'reason', 'TOO_EARLY');
  end if;
  v_cfg := _cfg(v_room.id);

  if v_cfg->>'mode' = 'team' then
    perform _team_advance(v_room.id);
    select * into v_room from rooms where id = v_room.id;
    perform _bump(v_room.id, 'phase', jsonb_build_object('phase', v_room.phase));
    return jsonb_build_object('ok', true, 'phase', v_room.phase);
  end if;

  if v_room.phase = 'answer' then
    for v_p in select * from players where room_id = v_room.id and not eliminated order by joined_at loop
      insert into answers (room_id, player_id, round, word, valid, reason, points)
        values (v_room.id, v_p.id, v_room.round, '', false, 'BLANK', 0)
        on conflict (player_id, round) do nothing;
      select * into v_a from answers where player_id = v_p.id and round = v_room.round;
      if v_a.valid then
        v_pts := v_a.points;
        if v_room.chaos = 'double' and v_room.chaos_round = v_room.round then v_pts := v_pts * 2; end if;
        if v_p.bet_round = v_room.round then
          v_pts := v_pts * 2;
          perform _feed(v_room.id, jsonb_build_object('type', 'bet_win', 'from', v_p.id, 'amount', v_pts));
        end if;
        if v_pts <> v_a.points then update answers set points = v_pts where id = v_a.id; end if;
        update players set points = points + v_pts,
          strikes = case when v_room.duel then strikes else 0 end
        where id = v_p.id;
      else
        perform _strike(v_p.id, v_room.round);
        if v_p.bet_round = v_room.round then
          update players set points = greatest(0, points - 10) where id = v_p.id;
          perform _feed(v_room.id, jsonb_build_object('type', 'bet_lose', 'from', v_p.id, 'amount', 10));
        end if;
      end if;
    end loop;
    perform _parasite_host_check(v_room.id, v_room.round);
    perform _set_phase(v_room.id, 'reveal', 6);

  elsif v_room.phase = 'reveal' then
    if _alive(v_room.id) <= 1 then
      perform _finish(v_room.id);
    else
      perform _set_phase(v_room.id, 'guess', (v_cfg->>'guess_seconds')::int);
    end if;

  elsif v_room.phase = 'guess' then
    for v_p in select * from players
      where room_id = v_room.id and class = 'mastermind' and perk_round = v_room.round and not eliminated loop
      if not exists (select 1 from guesses where room_id = v_room.id and round = v_room.round
                       and correct and guesser_id <> v_p.id) then
        perform _strike(v_p.id, v_room.round);
      end if;
    end loop;
    perform _parasite_host_check(v_room.id, v_room.round);
    if _alive(v_room.id) <= 1 then
      perform _finish(v_room.id);
    else
      update players set react_ready = false where room_id = v_room.id;
      perform _set_phase(v_room.id, 'react', (v_cfg->>'react_seconds')::int);
    end if;

  elsif v_room.phase = 'react' then
    for v_a in select pa.* from pending_additions pa join players p on p.id = pa.target_id
      where pa.room_id = v_room.id and pa.round = v_room.round and pa.status = 'pending' and not p.eliminated
      order by pa.id loop
      v_i := 0;
      for n in 1..v_a.amount loop
        if _add_letter(v_a.target_id, v_room.round, v_a.kind) is not null then v_i := v_i + 1; end if;
      end loop;
      update pending_additions set status = 'applied' where id = v_a.id;
      if v_a.kind = 'hack' then
        update players set hacked_round = v_room.round + 1, hacked_by = v_a.source_id, traced_round = null
          where id = v_a.target_id;
      end if;
      if v_a.source_id is not null and v_a.source_id <> v_a.target_id then
        update players set letters_stacked = letters_stacked + v_i where id = v_a.source_id;
      end if;
    end loop;
    for v_p in select p.id from players p join answers a on a.player_id = p.id and a.round = v_room.round
      where p.room_id = v_room.id and not p.eliminated and a.valid loop
      perform _add_letter(v_p.id, v_room.round, 'survive');
    end loop;
    -- Parasite: every lock the host gained this round, the Parasite sheds one (never below 1)
    for v_p in select p.id, p.latch_target from players p
      where p.room_id = v_room.id and p.class = 'parasite' and not p.eliminated
        and p.latch_round = v_room.round and p.latch_target is not null loop
      select count(*) into v_gained from banned_letters
        where player_id = v_p.latch_target and added_round = v_room.round and source <> 'start';
      v_drained := 0;
      for n in 1..v_gained loop
        exit when (select count(*) from banned_letters where player_id = v_p.id) <= 1;
        delete from banned_letters where id = (
          select id from banned_letters where player_id = v_p.id order by revealed desc, random() limit 1);
        v_drained := v_drained + 1;
      end loop;
      if v_drained > 0 then
        perform _feed(v_room.id, jsonb_build_object('type', 'drain', 'from', v_p.id, 'to', v_p.latch_target, 'amount', v_drained));
      end if;
    end loop;
    if _alive(v_room.id) = 2 and not v_room.duel then
      perform _set_phase(v_room.id, 'duel_intro', 6);
    else
      perform _start_round(v_room.id);
    end if;

  elsif v_room.phase = 'duel_intro' then
    update rooms set duel = true where id = v_room.id;
    for v_p in select * from players where room_id = v_room.id and not eliminated loop
      if v_p.class = 'hero' then
        delete from banned_letters where player_id = v_p.id and id <> (
          select id from banned_letters where player_id = v_p.id order by revealed asc, id limit 1);
      else
        perform _add_letter(v_p.id, v_room.round, 'duel');
      end if;
    end loop;
    update players set hacked_round = hacked_round + 1
      where room_id = v_room.id and hacked_round = v_room.round + 1;
    update players set oracle_round = oracle_round + 1
      where room_id = v_room.id and oracle_round = v_room.round + 1;
    perform _start_round(v_room.id);
  end if;

  select * into v_room from rooms where id = v_room.id;
  perform _bump(v_room.id, 'phase', jsonb_build_object('phase', v_room.phase));
  return jsonb_build_object('ok', true, 'phase', v_room.phase);
end $$;

create or replace function play_again(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'finished' then raise exception 'WRONG_PHASE'; end if;
  delete from banned_letters where player_id in (select id from players where room_id = v_room.id);
  delete from answers where room_id = v_room.id;
  delete from guesses where room_id = v_room.id;
  delete from cards where room_id = v_room.id;
  delete from pending_additions where room_id = v_room.id;
  delete from intel where room_id = v_room.id;
  delete from hints where room_id = v_room.id;
  delete from players where room_id = v_room.id and (quit or last_seen < now() - interval '60 seconds') and id <> v_me.id;
  update players set strikes = 0, points = 0, letters_stacked = 0, eliminated = false, eliminated_round = null,
    perk_used = false, perk_round = null, react_ready = false, quit = false,
    hacked_round = null, hacked_by = null, traced_round = null, exposed = false,
    class = coalesce(orig_class, class), orig_class = null,
    bet_round = null, latch_target = null, latch_round = null, oracle_round = null
    where room_id = v_room.id;
  update rooms set phase = 'lobby', round = 0, duel = false, winner_id = null, winner_team = null,
    prompt_id = null, next_prompt_id = null,
    chaos = null, chaos_round = null, used_prompts = '{}', phase_ends_at = null where id = v_room.id;
  if _is_team(v_room.id) then perform _team_fix_leaders(v_room.id); end if;
  perform _bump(v_room.id, 'reset');
end $$;

-- ───────────── room snapshot (teams, team-aware hiding) ─────────────
create or replace function get_room_state(p_code text, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me players; v_show_all boolean; v_me_json jsonb := null; v_titles jsonb := null;
  v_cfg jsonb; v_live boolean; v_dark boolean; v_chaos text; v_secs int; v_hide boolean; v_mt uuid;
begin
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  v_cfg := _defaults() || v_room.settings;
  v_live := v_room.phase not in ('lobby','finished');
  v_chaos := case when v_live and v_room.chaos_round = v_room.round then v_room.chaos end;
  v_secs := _answer_secs(v_cfg, v_room.round, v_room.duel);
  if v_chaos = 'speed' then v_secs := greatest(15, v_secs / 2); end if;
  if p_token is not null then
    select * into v_me from players where token = p_token and room_id = v_room.id;
  end if;
  v_mt := v_me.team_id;   -- my team (null outside team mode)
  v_show_all := v_room.phase = 'finished' or coalesce(v_me.eliminated, false);
  -- Everyone's class is secret (you only learn "the Ninja attacked Ava") until the game ends — teammates excepted.
  v_hide := v_room.phase <> 'finished' and not coalesce(v_me.eliminated, false);

  if v_me.id is not null then
    v_dark := coalesce(v_live and not v_me.eliminated and v_me.hacked_round = v_room.round, false);
    v_me_json := jsonb_build_object(
      'id', v_me.id, 'name', v_me.name, 'class', v_me.class, 'strikes', v_me.strikes,
      'points', v_me.points, 'eliminated', v_me.eliminated, 'perk_used', v_me.perk_used,
      'team_id', v_me.team_id,
      'hacked', v_dark,
      'can_trace', v_dark and v_me.hacked_by is not null and v_me.traced_round is distinct from v_room.round
                   and v_room.phase <> 'duel_intro',
      'bet_active', coalesce(v_me.bet_round = v_room.round, false),
      'latched_to', case when v_me.latch_round = v_room.round then v_me.latch_target end,
      'letters', coalesce((select jsonb_agg(
                             case when v_dark then jsonb_build_object('letter', '?', 'revealed', false, 'hidden', true)
                                  else jsonb_build_object('letter', letter::text, 'revealed', revealed) end
                             order by id)
                           from banned_letters where player_id = v_me.id), '[]'::jsonb),
      'cards', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind) order by id)
                         from cards where owner_id = v_me.id and not used), '[]'::jsonb),
      'answer', (select jsonb_build_object('word', word, 'valid', valid, 'reason', reason, 'points', points)
                 from answers where player_id = v_me.id and round = v_room.round),
      'guess', (select jsonb_build_object('target_id', target_id, 'letter', letter::text, 'correct', correct)
                from guesses where guesser_id = v_me.id and round = v_room.round),
      'intel', coalesce((select jsonb_agg(payload order by id) from intel where player_id = v_me.id), '[]'::jsonb),
      'used_words', coalesce((select jsonb_agg(word order by round) from answers
                              where player_id = v_me.id and valid and round < v_room.round), '[]'::jsonb)
    );
  end if;

  if v_room.phase = 'finished' then
    v_titles := jsonb_build_object(
      'champion', v_room.winner_id,
      'einstein', (select a.player_id from answers a where a.room_id = v_room.id and a.valid
                   group by a.player_id order by sum(char_length(a.word)) desc, max(a.points) desc limit 1),
      'villain', (select id from players where room_id = v_room.id and letters_stacked > 0
                  order by letters_stacked desc, points desc limit 1)
    );
  end if;

  return jsonb_build_object(
    'server_time', now(),
    'room', jsonb_build_object(
      'code', v_room.code, 'phase', v_room.phase, 'round', v_room.round, 'duel', v_room.duel,
      'state_version', v_room.state_version, 'host_id', v_room.host_id, 'winner_id', v_room.winner_id,
      'winner_team', v_room.winner_team,
      'phase_ends_at', v_room.phase_ends_at,
      'answer_seconds', v_secs,
      'chaos', v_chaos,
      'settings', v_cfg),
    'prompt', (select text from prompts where id = v_room.prompt_id),
    'me', v_me_json,
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'idx', t.idx, 'name', t.name, 'image_url', t.image_url, 'leader_id', t.leader_id,
        'points', (select coalesce(sum(p.points), 0) from players p where p.team_id = t.id),
        'letter_count', (select count(*) from banned_letters bl where bl.player_id = _team_ref(t.id))
      ) order by t.idx) from teams t where t.room_id = v_room.id), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'avatar_url', p.avatar_url, 'team_id', p.team_id,
        'class', case when v_hide and p.id is distinct from v_me.id and not (v_mt is not null and p.team_id = v_mt) then null else p.class end,
        'orig_class', case when v_hide and p.id is distinct from v_me.id and not (v_mt is not null and p.team_id = v_mt) then null else p.orig_class end,
        'strikes', p.strikes, 'points', p.points,
        'eliminated', p.eliminated, 'perk_used', p.perk_used, 'is_host', p.id = v_room.host_id,
        'connected', p.last_seen > now() - interval '20 seconds',
        'react_ready', p.react_ready,
        'letters_stacked', p.letters_stacked,
        'quit', p.quit,
        'exposed', p.exposed,
        'hacked', coalesce(v_live and not p.eliminated and p.hacked_round = v_room.round, false),
        'betting', coalesce(v_live and p.bet_round = v_room.round, false),
        'latched_to', case when v_live and p.latch_round = v_room.round then p.latch_target end,
        -- the Oracle's price: their word is public the moment they lock it in
        'oracle_word', case when v_room.phase = 'answer' and p.oracle_round = v_room.round
                            then (select a.word from answers a where a.player_id = p.id and a.round = v_room.round) end,
        'letter_count', (select count(*) from banned_letters bl where bl.player_id = p.id),
        'revealed', coalesce((select jsonb_agg(bl.letter::text order by bl.id) from banned_letters bl
                              where bl.player_id = p.id and bl.revealed), '[]'::jsonb),
        'letters', case when v_show_all then coalesce((select jsonb_agg(bl.letter::text order by bl.id)
                              from banned_letters bl where bl.player_id = p.id), '[]'::jsonb) else null end,
        'answered', exists (select 1 from answers a where a.player_id = p.id and a.round = v_room.round),
        'guessed', exists (select 1 from guesses g where g.guesser_id = p.id and g.round = v_room.round)
      ) order by p.joined_at)
      from players p where p.room_id = v_room.id), '[]'::jsonb),
    'hints', coalesce((select jsonb_agg(jsonb_build_object('round', round, 'text', text) order by id)
                       from hints where room_id = v_room.id), '[]'::jsonb),
    'reveal', case when v_room.phase in ('reveal','guess','react','duel_intro','finished') then coalesce((
      select jsonb_agg(jsonb_build_object('player_id', a.player_id, 'word', a.word, 'valid', a.valid,
                                          'reason', a.reason, 'points', a.points) order by a.points desc, a.id)
      from answers a where a.room_id = v_room.id and a.round = v_room.round), '[]'::jsonb) else '[]'::jsonb end,
    'guess_results', case when v_room.phase in ('react','duel_intro','finished') then coalesce((
      select jsonb_agg(jsonb_build_object('guesser_id', g.guesser_id, 'target_id', g.target_id, 'correct', g.correct,
                                          'letter', case when g.correct then g.letter::text end) order by g.id)
      from guesses g where g.room_id = v_room.id and g.round = v_room.round), '[]'::jsonb) else '[]'::jsonb end,
    'pending', case when v_room.phase = 'react' then coalesce((
      select jsonb_agg(jsonb_build_object('id', pa.id, 'target_id', pa.target_id,
                                          'source_id', case when pa.kind = 'hack' and not coalesce(src.exposed, false) then null
                                                            when v_hide and pa.source_id is distinct from v_me.id
                                                                 and not (v_mt is not null and src.team_id = v_mt) then null
                                                            else pa.source_id end,
                                          'source_class', case when pa.source_id is not null then coalesce(src.orig_class, src.class) end,
                                          'kind', pa.kind, 'amount', pa.amount, 'status', pa.status,
                                          'absorbed_by', pa.absorbed_by) order by pa.id)
      from pending_additions pa left join players src on src.id = pa.source_id
      where pa.room_id = v_room.id and pa.round = v_room.round), '[]'::jsonb)
      else '[]'::jsonb end,
    'feed', coalesce((select jsonb_agg(
                        case when v_hide and f.payload->>'from' is distinct from v_me.id::text
                                  and not (v_mt is not null and fp.team_id = v_mt)
                                  and f.payload->>'type' not in ('chicken', 'caught', 'trace_miss', 'chaos')
                             then (f.payload - 'from' - 'what') || jsonb_build_object('from', null)
                             else f.payload end
                        || jsonb_build_object('id', f.id, 'round', f.round,
                             'from_class', case when f.payload->>'type' = 'mimic' then 'mimic' else fp.class::text end)
                        order by f.id)
                      from (select * from events where room_id = v_room.id and kind = 'action'
                            order by id desc limit 15) f
                      left join players fp on fp.id::text = f.payload->>'from'), '[]'::jsonb),
    'titles', v_titles
  );
end $$;

-- ───────────── permissions ─────────────
revoke execute on function _is_team(uuid), _team_ref(uuid), _team_add_letter(uuid, int, text), _team_del_letter(uuid, text),
  _team_fix_leaders(uuid), _team_autoplace(uuid, uuid), _team_setup(uuid), _team_finish(uuid), _team_advance(uuid)
  from public, anon, authenticated;
revoke execute on function team_join(uuid, int), team_update(uuid, text, text, boolean), team_set_leader(uuid, uuid) from public;
grant execute on function team_join(uuid, int), team_update(uuid, text, text, boolean), team_set_leader(uuid, uuid) to anon, authenticated;

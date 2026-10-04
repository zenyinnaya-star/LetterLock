-- Persistent anonymous profiles: XP, levels, achievements. No login: the browser keeps a secret, and a
-- recovery code restores the profile on another device. XP is awarded server-side when a room finishes.

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  secret uuid not null unique default gen_random_uuid(),
  code text not null unique,
  name text not null default 'Player',
  xp int not null default 0,
  games int not null default 0,
  wins int not null default 0,
  valid_answers int not null default 0,
  best_streak int not null default 0,
  fastest_ms int,
  achievements text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;

alter table players add column if not exists profile_id uuid references profiles(id) on delete set null;
alter table players add column if not exists xp_gained int not null default 0;
alter table players add column if not exists xp_after int;
alter table players add column if not exists new_ach text[] not null default '{}';

create or replace function _level(p_xp int) returns int
language sql immutable set search_path = public as $$ select 1 + floor(sqrt(greatest(p_xp, 0) / 60.0))::int; $$;

create or replace function _title(p_level int) returns text
language sql immutable set search_path = public as $$
  select case when p_level >= 22 then 'Grandmaster' when p_level >= 15 then 'Cipher Master'
              when p_level >= 10 then 'Vault Breaker' when p_level >= 6 then 'Lockpicker'
              when p_level >= 3 then 'Wordsmith' else 'Rookie' end;
$$;

create or replace function _profile_json(p profiles) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'name', p.name, 'xp', p.xp, 'level', _level(p.xp), 'title', _title(_level(p.xp)),
    'level_floor', 60 * (_level(p.xp) - 1) * (_level(p.xp) - 1), 'level_next', 60 * _level(p.xp) * _level(p.xp),
    'games', p.games, 'wins', p.wins, 'valid_answers', p.valid_answers, 'best_streak', p.best_streak,
    'fastest_ms', p.fastest_ms, 'achievements', to_jsonb(p.achievements), 'code', p.code);
$$;

create or replace function profile_create(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_p profiles; v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if (select count(*) from profiles where created_at > now() - interval '1 minute') > 200 then raise exception 'BUSY'; end if;
  loop
    v_code := '';
    for i in 1..10 loop v_code := v_code || substr(v_alpha, 1 + floor(random() * 32)::int, 1); end loop;
    begin
      insert into profiles (code, name) values (v_code, left(coalesce(nullif(trim(p_name), ''), 'Player'), 20)) returning * into v_p;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('secret', v_p.secret, 'code', v_p.code);
end $$;

create or replace function profile_get(p_secret uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_p profiles;
begin
  select * into v_p from profiles where secret = p_secret;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  return _profile_json(v_p);
end $$;

create or replace function profile_restore(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_p profiles; v_c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into v_p from profiles where code = v_c;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  return jsonb_build_object('secret', v_p.secret, 'code', v_p.code);
end $$;

-- Attach this seat to a profile (once per profile per room, so nobody farms XP with two tabs)
create or replace function profile_link(p_token uuid, p_secret uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_me players; v_p profiles;
begin
  v_me := _me(p_token);
  select * into v_p from profiles where secret = p_secret;
  if not found then return false; end if;
  if exists (select 1 from players where room_id = v_me.room_id and profile_id = v_p.id and id <> v_me.id) then return false; end if;
  update players set profile_id = v_p.id where id = v_me.id;
  update profiles set name = left(v_me.name, 20), updated_at = now() where id = v_p.id;
  return true;
end $$;

-- ───────────── awarding ─────────────
create or replace function _award_xp(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_mode text; v_p record; v_prof profiles; v_win boolean; v_xp int; v_surv int;
  v_valid int; v_best int; v_fast int; v_hits int; v_locks int; v_humans int; v_bots int; v_hard int;
  v_ach text[]; v_wint int;
begin
  select * into v_room from rooms where id = p_room_id;
  v_mode := coalesce(v_room.settings->>'mode', 'classic');
  select count(*) filter (where bot = 0), count(*) filter (where bot > 0), count(*) filter (where bot = 3)
    into v_humans, v_bots, v_hard from players where room_id = p_room_id;
  select idx into v_wint from teams where room_id = p_room_id and idx = v_room.winner_team;

  for v_p in select * from players where room_id = p_room_id and profile_id is not null and bot = 0 loop
    update players set xp_gained = 0, new_ach = '{}', xp_after = null where id = v_p.id;
    if v_p.quit or v_room.round < 2 then continue; end if;
    select * into v_prof from profiles where id = v_p.profile_id for update;
    if not found then continue; end if;

    v_win := case when v_mode = 'team' then v_wint is not null and exists (select 1 from teams t where t.id = v_p.team_id and t.idx = v_wint)
                  else v_room.winner_id = v_p.id end;
    v_surv := coalesce(v_p.eliminated_round, v_room.round);
    select count(*) filter (where valid), min(elapsed_ms) filter (where valid) into v_valid, v_fast
      from answers where player_id = v_p.id;
    select coalesce(max(c), 0) into v_best from (
      select count(*) c from (
        select round - row_number() over (order by round) grp from answers where player_id = v_p.id and valid) x group by grp) y;
    select count(*) into v_hits from guesses where guesser_id = v_p.id and correct;
    select count(*) into v_locks from banned_letters where player_id = case when v_mode = 'team' then _team_ref(v_p.team_id) else v_p.id end;

    v_xp := 20 + 5 * least(v_surv, 10) + 3 * least(v_valid, 15) + 2 * least(v_hits, 10) + 2 * least(v_best, 5);
    if v_win then v_xp := v_xp + 30 + case when v_humans >= 4 then 10 else 0 end; end if;
    if v_bots > 0 then v_xp := v_xp / 2; end if;   -- solo practice pays half

    v_ach := '{}';
    if v_prof.games = 0 then v_ach := array_append(v_ach, 'first_game'::text); end if;
    if v_win and v_prof.wins = 0 then v_ach := array_append(v_ach, 'first_win'::text); end if;
    if v_fast is not null and v_fast <= 2000 then v_ach := array_append(v_ach, 'speedy'::text); end if;
    if v_best >= 5 then v_ach := array_append(v_ach, 'hot_streak'::text); end if;
    if v_hits >= 4 then v_ach := array_append(v_ach, 'sharpshooter'::text); end if;
    if v_win and v_locks >= 7 then v_ach := array_append(v_ach, 'under_pressure'::text); end if;
    if v_win and v_humans >= 4 then v_ach := array_append(v_ach, 'last_standing'::text); end if;
    if v_win and v_mode = 'team' then v_ach := array_append(v_ach, 'team_player'::text); end if;
    if v_win and v_mode = 'duel' then v_ach := array_append(v_ach, 'duelist'::text); end if;
    if v_win and v_hard >= 2 then v_ach := array_append(v_ach, 'machine_breaker'::text); end if;
    if v_prof.games + 1 >= 10 then v_ach := array_append(v_ach, 'regular'::text); end if;
    if v_prof.valid_answers + v_valid >= 100 then v_ach := array_append(v_ach, 'wordsmith'::text); end if;
    -- only the ones not already earned
    select coalesce(array_agg(a), '{}') into v_ach from unnest(v_ach) a where not (a = any (v_prof.achievements));

    update profiles set
      xp = xp + v_xp, games = games + 1, wins = wins + case when v_win then 1 else 0 end,
      valid_answers = valid_answers + v_valid, best_streak = greatest(best_streak, v_best),
      fastest_ms = case when v_fast is null then fastest_ms else least(coalesce(fastest_ms, v_fast), v_fast) end,
      achievements = achievements || v_ach, updated_at = now()
    where id = v_prof.id;
    update players set xp_gained = v_xp, xp_after = v_prof.xp + v_xp, new_ach = v_ach where id = v_p.id;
  end loop;
end $$;
revoke execute on function _award_xp(uuid) from public, anon, authenticated;

create or replace function _rooms_award() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phase = 'finished' and old.phase is distinct from 'finished' then
    begin
      perform _award_xp(new.id);
    exception when others then
      null;   -- XP must never stop a game from finishing
    end;
  end if;
  return new;
end $$;
drop trigger if exists rooms_award on rooms;
create trigger rooms_award after update on rooms for each row execute function _rooms_award();

-- finish-screen stats now carry each player's XP result
create or replace function get_game_stats(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_room rooms;
begin
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.phase <> 'finished' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'player_id', p.id, 'name', p.name, 'points', p.points,
      'correct', coalesce(a.correct, 0), 'wrong', coalesce(a.wrong, 0),
      'best_streak', coalesce(s.best, 0), 'fastest_ms', a.fastest, 'bonus', coalesce(a.bonus, 0),
      'hits', coalesce(g.hits, 0), 'shots', coalesce(g.shots, 0),
      'xp_gained', p.xp_gained, 'xp_after', p.xp_after, 'new_ach', to_jsonb(p.new_ach), 'bot', p.bot > 0,
      'linked', p.profile_id is not null
    ) order by p.points desc, p.joined_at)
    from players p
    left join (
      select player_id, count(*) filter (where valid) correct, count(*) filter (where not valid and word <> '') wrong,
             min(elapsed_ms) filter (where valid) fastest, coalesce(sum(bonus) filter (where valid), 0) bonus
      from answers where room_id = v_room.id group by player_id) a on a.player_id = p.id
    left join (
      select player_id, max(c) best from (
        select player_id, count(*) c from (
          select player_id, round - row_number() over (partition by player_id order by round) grp
          from answers where room_id = v_room.id and valid) x group by player_id, grp) y group by player_id) s on s.player_id = p.id
    left join (
      select guesser_id, count(*) filter (where correct) hits, count(*) shots from guesses where room_id = v_room.id group by guesser_id) g on g.guesser_id = p.id
    where p.room_id = v_room.id
  ), '[]'::jsonb);
end $$;

revoke execute on function profile_create(text), profile_get(uuid), profile_restore(text), profile_link(uuid, uuid) from public;
grant execute on function profile_create(text), profile_get(uuid), profile_restore(text), profile_link(uuid, uuid) to anon, authenticated;

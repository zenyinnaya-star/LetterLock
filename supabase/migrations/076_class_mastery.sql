-- Class mastery: per-class XP tracks (on top of account XP), richer profile stats, equippable tier badges.
-- Account XP is untouched; class XP mirrors the XP a player earned in a game onto the class they played.
create table if not exists profile_classes (
  profile_id uuid not null references profiles(id) on delete cascade,
  class text not null,
  xp int not null default 0,
  games int not null default 0,
  wins int not null default 0,
  primary key (profile_id, class)
);
alter table profile_classes enable row level security;

alter table profiles add column if not exists longest_word text not null default '';
alter table profiles add column if not exists cur_win_streak int not null default 0;
alter table profiles add column if not exists best_win_streak int not null default 0;
alter table profiles add column if not exists modes jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists badge text;  -- equipped badge: '<class>:<tier 1-5>'

create or replace function _mastery_tier(p_xp int) returns int language sql immutable as $$
  select case when p_xp >= 1500 then 5 when p_xp >= 700 then 4 when p_xp >= 300 then 3 when p_xp >= 100 then 2 else 1 end
$$;

create or replace function _award_class_xp(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_mode text; v_p record; v_win boolean; v_wint int; v_long text; v_prof profiles;
begin
  select * into v_room from rooms where id = p_room_id;
  v_mode := coalesce(v_room.settings->>'mode', 'classic');
  select idx into v_wint from teams where room_id = p_room_id and idx = v_room.winner_team;
  for v_p in select * from players where room_id = p_room_id and profile_id is not null and bot = 0 and xp_gained > 0 loop
    v_win := case when v_mode = 'team' then v_wint is not null and exists (select 1 from teams t where t.id = v_p.team_id and t.idx = v_wint)
                  else v_room.winner_id = v_p.id end;
    insert into profile_classes (profile_id, class, xp, games, wins)
      values (v_p.profile_id, v_p.class::text, v_p.xp_gained, 1, case when v_win then 1 else 0 end)
      on conflict (profile_id, class) do update set xp = profile_classes.xp + excluded.xp,
        games = profile_classes.games + 1, wins = profile_classes.wins + excluded.wins;
    select word into v_long from answers where player_id = v_p.id and valid order by length(word) desc, word limit 1;
    select * into v_prof from profiles where id = v_p.profile_id;
    update profiles set
      cur_win_streak = case when v_win then cur_win_streak + 1 else 0 end,
      best_win_streak = greatest(best_win_streak, case when v_win then cur_win_streak + 1 else 0 end),
      longest_word = case when v_long is not null and length(v_long) > length(longest_word) then v_long else longest_word end,
      modes = jsonb_set(modes, array[v_mode], to_jsonb(coalesce((modes->>v_mode)::int, 0) + 1))
    where id = v_p.profile_id;
  end loop;
end $$;
revoke execute on function _award_class_xp(uuid) from public, anon, authenticated;

create or replace function _rooms_award_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phase = 'finished' and old.phase is distinct from 'finished' then
    begin perform _award_class_xp(new.id);
    exception when others then null;   -- never block a game from finishing
    end;
  end if;
  return new;
end $$;
drop trigger if exists rooms_award_class on rooms;   -- fires after rooms_award (alphabetical), so xp_gained is already set
create trigger rooms_award_class after update on rooms for each row execute function _rooms_award_class();

create or replace function profile_mastery(p_secret uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_p profiles;
begin
  select * into v_p from profiles where secret = p_secret;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  return jsonb_build_object(
    'classes', coalesce((select jsonb_agg(jsonb_build_object('class', class, 'xp', xp, 'games', games, 'wins', wins, 'tier', _mastery_tier(xp)) order by xp desc)
                          from profile_classes where profile_id = v_p.id), '[]'::jsonb),
    'longest_word', nullif(v_p.longest_word, ''), 'win_streak', v_p.cur_win_streak, 'best_win_streak', v_p.best_win_streak,
    'modes', v_p.modes, 'badge', v_p.badge);
end $$;

create or replace function profile_equip(p_secret uuid, p_badge text) returns void
language plpgsql security definer set search_path = public as $$
declare v_p profiles; v_class text; v_tier int;
begin
  select * into v_p from profiles where secret = p_secret;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if p_badge is null or p_badge = '' then update profiles set badge = null where id = v_p.id; return; end if;
  v_class := split_part(p_badge, ':', 1); v_tier := nullif(split_part(p_badge, ':', 2), '')::int;
  if v_tier is null or v_tier < 2 or v_tier > 5
     or not exists (select 1 from profile_classes where profile_id = v_p.id and class = v_class and _mastery_tier(xp) >= v_tier) then
    raise exception 'BADGE_LOCKED';
  end if;
  update profiles set badge = p_badge where id = v_p.id;
end $$;

-- badges for everyone seated in the caller's room (lobby, battle, leaderboard can read the same map)
create or replace function room_badges(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me players;
begin
  select * into v_me from players where token = p_token;
  if not found then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(p.id::text, pr.badge) from players p join profiles pr on pr.id = p.profile_id
                   where p.room_id = v_me.room_id and pr.badge is not null), '{}'::jsonb);
end $$;

revoke execute on function profile_mastery(uuid), profile_equip(uuid, text), room_badges(uuid) from public;
grant execute on function profile_mastery(uuid), profile_equip(uuid, text), room_badges(uuid) to anon, authenticated;

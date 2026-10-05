-- Ultimates for the last four classes + bots that use ultimates.
-- Mimic 18 "Double Take": copy a player's class and fire their ultimate for free.
-- Parasite 20 "Feast": leech two players - drain 3 points from each (you gain double); if a leeched player takes a lock hit this round, you take 2 locks per hit.
-- Thief 16 "Heist": steal cards (up to your hand limit) and 4 points from a player.
-- Wildcard 16 "Chaos Surge": trigger a chaos rule right now.

create table if not exists leeches (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  parasite_id uuid not null references players(id) on delete cascade,
  target_id uuid not null references players(id) on delete cascade,
  round int not null,
  hit boolean not null default false
);
alter table leeches enable row level security;

create or replace function _ult_cost(p_class player_class) returns int
language sql immutable as $$
  select case p_class when 'ninja' then 16 when 'oracle' then 12 when 'mastermind' then 12 when 'hero' then 14
    when 'jester' then 14 when 'villain' then 18 when 'hacker' then 20 when 'gambler' then 8
    when 'mimic' then 18 when 'parasite' then 20 when 'thief' then 16 when 'wildcard' then 16 else null end;
$$;

create or replace function _leech_hit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_l record;
begin
  for v_l in select * from leeches where target_id = new.player_id and round = new.added_round and not hit loop
    update leeches set hit = true where id = v_l.id;
    if exists (select 1 from players where id = v_l.parasite_id and not eliminated) then
      perform _add_letter(v_l.parasite_id, new.added_round, 'leech');
      perform _add_letter(v_l.parasite_id, new.added_round, 'leech');
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists banned_letters_leech on banned_letters;
create trigger banned_letters_leech after insert on banned_letters
  for each row when (new.source in ('attack','hack','ninja')) execute function _leech_hit();

-- the previous function handles the first eight classes; the wrapper below adds the rest
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_ult_base') then
    alter function use_ultimate(uuid, uuid, text) rename to _ult_base;
  end if;
end $$;
revoke execute on function _ult_base(uuid, uuid, text) from public, anon, authenticated;

create or replace function use_ultimate(p_token uuid, p_target_id uuid default null, p_kind text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_cost int; v_t players; v_t2 players; v_result jsonb; v_take int; v_gain int := 0;
  v_held int; v_card record; v_stolen int := 0; v_alt uuid; v_cost_x int; v_res jsonb;
begin
  v_me := _me(p_token);
  if v_me.class not in ('mimic','parasite','thief','wildcard') then
    return _ult_base(p_token, p_target_id, p_kind);
  end if;
  select * into v_room from rooms where id = v_me.room_id for update;
  v_cost := _ult_cost(v_me.class);
  if v_room.phase in ('lobby','finished','duel_intro') then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  if not coalesce((_cfg(v_room.id)->>'ultimates')::boolean, false) then raise exception 'ULTIMATES_OFF'; end if;
  if _is_team(v_room.id) then raise exception 'ULTIMATES_NOT_IN_TEAM'; end if;
  if v_me.ult_round = v_room.round then raise exception 'ULT_USED_THIS_ROUND'; end if;
  if v_me.charge < v_cost then raise exception 'NOT_ENOUGH_CHARGE'; end if;

  if v_me.class = 'mimic' then
    select * into v_t from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_t.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_t.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    if v_t.class = 'mimic' then raise exception 'CANNOT_MIMIC_MIMIC'; end if;
    v_cost_x := coalesce(_ult_cost(v_t.class), 0);
    -- become them, pre-pay the Mimic price, then let their ultimate run (it charges its own price on top)
    update players set class = v_t.class, orig_class = 'mimic', perk_used = case when v_t.class = 'hero' then true else false end,
      perk_round = null, charge = charge - v_cost + v_cost_x where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'mimic', 'from', v_me.id, 'to', v_t.id, 'what', v_t.class));
    select id into v_alt from players where room_id = v_room.id and id <> v_me.id and id <> v_t.id and not eliminated order by random() limit 1;
    v_res := use_ultimate(p_token, coalesce(v_alt, v_t.id), 'attack');
    return v_res || jsonb_build_object('mimicked', v_t.class);

  elsif v_me.class = 'parasite' then
    select * into v_t from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_t.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_t.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    insert into leeches (room_id, parasite_id, target_id, round) values (v_room.id, v_me.id, v_t.id, v_room.round);
    v_take := least(3, v_t.points);
    update players set points = points - v_take where id = v_t.id;
    v_gain := v_gain + 2 * v_take;
    if p_kind is not null and p_kind ~* '^[0-9a-f-]{36}$' then
      select * into v_t2 from players where id = p_kind::uuid and room_id = v_room.id;
      if found and v_t2.id <> v_me.id and v_t2.id <> v_t.id and not v_t2.eliminated then
        insert into leeches (room_id, parasite_id, target_id, round) values (v_room.id, v_me.id, v_t2.id, v_room.round);
        v_take := least(3, v_t2.points);
        update players set points = points - v_take where id = v_t2.id;
        v_gain := v_gain + 2 * v_take;
      end if;
    end if;
    update players set points = points + v_gain where id = v_me.id;
    v_result := jsonb_build_object('kind','parasite','gained',v_gain);

  elsif v_me.class = 'thief' then
    select * into v_t from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_t.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_t.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    select count(*) into v_held from cards where owner_id = v_me.id and not used;
    for v_card in select id from cards where owner_id = v_t.id and not used order by random() loop
      exit when v_held + v_stolen >= 2;
      update cards set owner_id = v_me.id where id = v_card.id;
      v_stolen := v_stolen + 1;
    end loop;
    v_take := least(4, v_t.points);
    if v_stolen = 0 and v_take = 0 then raise exception 'NOTHING_TO_STEAL'; end if;
    update players set points = points - v_take where id = v_t.id;
    update players set points = points + v_take where id = v_me.id;
    v_result := jsonb_build_object('kind','thief','cards',v_stolen,'points',v_take);

  else -- wildcard
    perform _chaos(v_room.id);
    v_result := jsonb_build_object('kind','wildcard');
  end if;

  update players set charge = charge - v_cost, ult_round = v_room.round where id = v_me.id;
  perform _feed(v_room.id, jsonb_build_object('type','ult','from',v_me.id,'what',v_me.class));
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
  return v_result || jsonb_build_object('cost', v_cost);
end $$;
revoke execute on function use_ultimate(uuid, uuid, text) from public;
grant execute on function use_ultimate(uuid, uuid, text) to anon, authenticated;

-- bots fire their ultimates when charged (host tick drives them)
create or replace function _bot_ults(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_b players; v_room rooms; v_cost int; v_t uuid; v_t2 uuid; v_kind text;
begin
  select * into v_room from rooms where id = p_room_id;
  if v_room.phase not in ('answer','reveal','guess','react') then return; end if;
  if not coalesce((_cfg(p_room_id)->>'ultimates')::boolean, false) or _is_team(p_room_id) then return; end if;
  for v_b in select * from players where room_id = p_room_id and bot > 0 and not eliminated loop
    v_cost := _ult_cost(v_b.class);
    continue when v_cost is null or v_b.charge < v_cost or v_b.ult_round = v_room.round or random() > 0.3;
    begin
      select id into v_t from players where room_id = p_room_id and id <> v_b.id and not eliminated order by random() limit 1;
      select id into v_t2 from players where room_id = p_room_id and id <> v_b.id and id <> v_t and not eliminated order by random() limit 1;
      v_kind := case v_b.class when 'gambler' then 'attack' when 'parasite' then v_t2::text else null end;
      perform use_ultimate(v_b.token, v_t, v_kind);
    exception when others then null;
    end;
  end loop;
end $$;
revoke execute on function _bot_ults(uuid) from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_proc where proname = '_bot_tick_base') then
    alter function bot_tick(uuid) rename to _bot_tick_base;
  end if;
end $$;
revoke execute on function _bot_tick_base(uuid) from public, anon, authenticated;

create or replace function bot_tick(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id;
  if v_room.host_id = v_me.id then perform _bot_ults(v_room.id); end if;
  return _bot_tick_base(p_token);
end $$;
revoke execute on function bot_tick(uuid) from public;
grant execute on function bot_tick(uuid) to anon, authenticated;

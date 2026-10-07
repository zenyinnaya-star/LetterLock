-- Story mode: pick your hero (instead of a class). Heroes are unique per party.
alter table rooms add column if not exists story boolean not null default false;
alter table players add column if not exists hero text;

create or replace function set_story(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me players;
begin
  me := _me(p_token);
  if not exists (select 1 from rooms where id = me.room_id and host_id = me.id and phase = 'lobby') then raise exception 'NOT_HOST'; end if;
  update rooms set story = true where id = me.room_id;
  perform _bump(me.room_id, 'story', '{}');
end $$;

create or replace function set_hero(p_token uuid, p_hero text) returns void
language plpgsql security definer set search_path = public as $$
declare me players;
begin
  me := _me(p_token);
  if p_hero is not null and not (p_hero = any(array['Shiro','Nero','Kira','Mira','Prince'])) then raise exception 'BAD_HERO'; end if;
  if not exists (select 1 from rooms where id = me.room_id and phase = 'lobby') then raise exception 'BAD_PHASE'; end if;
  if p_hero is not null and exists (select 1 from players where room_id = me.room_id and hero = p_hero and id <> me.id) then raise exception 'HERO_TAKEN'; end if;
  update players set hero = p_hero where id = me.id;
  perform _bump(me.room_id, 'hero', '{}');
end $$;

create or replace function story_info(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players;
begin
  me := _me(p_token);
  return jsonb_build_object(
    'story', (select story from rooms where id = me.room_id),
    'picks', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'hero', hero)), '[]'::jsonb) from players where room_id = me.room_id and hero is not null));
end $$;

create or replace function start_pve(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me players; v_room rooms; n int; p players; k int := 0; h text; s int[];
        heroes text[] := array['Shiro','Nero','Kira','Mira','Prince']; c text; taken text[];
begin
  me := _me(p_token);
  select * into v_room from rooms where id = me.room_id for update;
  if v_room.host_id <> me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'BAD_PHASE'; end if;
  select count(*) into n from players where room_id = v_room.id;
  if n > 4 then raise exception 'TOO_MANY'; end if;
  taken := array(select hero from players where room_id = v_room.id and hero is not null);
  delete from battles where room_id = v_room.id;
  delete from battle_units where room_id = v_room.id;
  for p in select * from players where room_id = v_room.id order by joined_at loop
    k := k + 1;
    h := p.hero;
    if h is null then
      foreach c in array heroes loop
        if not (c = any(taken)) then h := c; taken := taken || c; exit; end if;
      end loop;
    end if;
    -- vit, lex, foc, spd, wil, lck
    s := case h when 'Shiro'  then array[4,7,5,8,3,3]
                when 'Nero'   then array[8,5,4,3,7,3]
                when 'Kira'   then array[3,4,6,6,3,8]
                when 'Mira'   then array[5,3,7,4,7,4]
                else array[5,5,5,5,5,5] end;
    insert into battle_units(room_id, side, player_id, name, hero, hp, max_hp, vit, lex, foc, spd, wil, lck, atk, ord)
    values (v_room.id, 'hero', p.id, p.name, h, 40 + s[1]*6, 40 + s[1]*6, s[1], s[2], s[3], s[4] + 4, s[5], s[6], 10, k);
  end loop;
  insert into battles(room_id, stage) values (v_room.id, 1);
  perform _spawn(v_room.id, 1, n);
  perform _roll_turn(v_room.id);
  update rooms set phase = 'battle', round = 1 where id = v_room.id;
  perform _bump(v_room.id, 'battle_start', '{}');
end $$;


revoke execute on function set_story(uuid), set_hero(uuid,text), story_info(uuid) from public;
grant execute on function set_story(uuid), set_hero(uuid,text), story_info(uuid) to anon, authenticated;

-- PvE battle engine, Phase 1: co-op turns vs one enemy. Prompt word -> Power -> Attack/Guard/Heal, initiative by SPD.

create table if not exists battles (
  room_id uuid primary key references rooms(id) on delete cascade,
  seed bigint not null default (random()*2147483647)::bigint,
  turn int not null default 1,
  step text not null default 'input',          -- input | won | lost
  ends_at timestamptz,
  prompt_id bigint references prompts(id),
  enemy_name text not null default 'Intern Auditor',
  log jsonb not null default '[]'::jsonb,
  version int not null default 0
);
create table if not exists battle_units (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  side text not null check (side in ('hero','enemy')),
  player_id uuid references players(id) on delete cascade,
  name text not null,
  hp int not null, max_hp int not null,
  shield int not null default 0,
  spd int not null default 10, lex int not null default 10,
  acc int not null default 10, lck int not null default 5,
  atk int not null default 10,
  action text, power int not null default 0, word text
);
create index if not exists battle_units_room on battle_units(room_id);
alter table battles enable row level security;
alter table battle_units enable row level security;

create or replace function _brand(p_seed bigint, p_turn int, p_salt text) returns double precision
language sql immutable as $$
  select (('x' || substr(md5(p_seed::text || ':' || p_turn || ':' || p_salt), 1, 8))::bit(32)::bigint)::double precision / 4294967295.0;
$$;

create or replace function _battle_prompt(p_room uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  v := _pick_prompt(p_room);
  update rooms set prompt_id = v, used_prompts = used_prompts || v where id = p_room;
  return v;
end $$;

create or replace function start_pve(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me players; v_room rooms; n int; p players;
begin
  me := _me(p_token);
  select * into v_room from rooms where id = me.room_id for update;
  if v_room.host_id <> me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'BAD_PHASE'; end if;
  delete from battles where room_id = v_room.id;
  delete from battle_units where room_id = v_room.id;
  select count(*) into n from players where room_id = v_room.id;
  for p in select * from players where room_id = v_room.id order by joined_at loop
    insert into battle_units(room_id, side, player_id, name, hp, max_hp, spd, lex, acc, lck, atk)
    values (v_room.id, 'hero', p.id, p.name, 60, 60,
            case p.class when 'ninja' then 16 else 10 end,
            case p.class when 'mastermind' then 16 else 10 end,
            case p.class when 'hero' then 14 else 10 end,
            case p.class when 'villain' then 9 else 5 end, 10);
  end loop;
  insert into battle_units(room_id, side, name, hp, max_hp, spd, lex, acc, lck, atk)
  values (v_room.id, 'enemy', 'Intern Auditor', 80 + 40 * (n - 1), 80 + 40 * (n - 1), 11, 0, 8, 3, 9 + 2 * n);
  insert into battles(room_id, ends_at, prompt_id)
  values (v_room.id, now() + interval '25 seconds', _battle_prompt(v_room.id));
  update rooms set phase = 'battle', round = 1, phase_ends_at = now() + interval '25 seconds' where id = v_room.id;
  perform _bump(v_room.id, 'battle_start', '{}');
end $$;

create or replace function get_battle(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; v_prompt text;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id;
  if not found then return null; end if;
  select text into v_prompt from prompts where id = b.prompt_id;
  return jsonb_build_object(
    'turn', b.turn, 'step', b.step, 'ends_at', b.ends_at, 'prompt', v_prompt, 'enemy', b.enemy_name,
    'log', b.log, 'version', b.version, 'me', me.id,
    'units', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'side', u.side, 'player_id', u.player_id, 'name', u.name, 'hp', u.hp, 'max_hp', u.max_hp,
        'shield', u.shield, 'spd', u.spd, 'locked', (u.action is not null),
        'action', case when u.player_id = me.id then u.action end,
        'power', case when u.player_id = me.id then u.power end) order by u.side desc, u.name), '[]'::jsonb)
      from battle_units u where u.room_id = me.room_id));
end $$;

create or replace function battle_submit(p_token uuid, p_word text, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; u battle_units; w text; v_pow int; v_lang text; v_rare int;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id for update;
  if not found or b.step <> 'input' then raise exception 'BAD_PHASE'; end if;
  select * into u from battle_units where player_id = me.id for update;
  if u.hp <= 0 then raise exception 'DOWN'; end if;
  if u.action is not null then raise exception 'ALREADY'; end if;
  if p_action not in ('attack','guard','heal') then raise exception 'BAD_ACTION'; end if;
  w := lower(trim(coalesce(p_word, '')));
  if w !~ '^[a-z]{2,20}$' then return jsonb_build_object('ok', false, 'reason', 'INVALID'); end if;
  select coalesce(settings->>'lang','en') into v_lang from rooms where id = me.room_id;
  if not exists (select 1 from words where word = w and lang = v_lang) then
    return jsonb_build_object('ok', false, 'reason', 'NOT_A_WORD'); end if;
  if not _fits(b.prompt_id, w) then
    return jsonb_build_object('ok', false, 'reason', 'OFF_TOPIC'); end if;
  v_rare := (select count(*) from regexp_matches(w, '[jqxzkv]', 'g'));
  v_pow := round(char_length(w) * (1 + u.lex * 0.04) + v_rare * 2 +
                 greatest(0, extract(epoch from (b.ends_at - now())) / 5));
  update battle_units set action = p_action, power = v_pow, word = w where id = u.id;
  update battles set version = version + 1 where room_id = me.room_id;
  perform _bump(me.room_id, 'battle_lock', jsonb_build_object('player', me.id));
  return jsonb_build_object('ok', true, 'power', v_pow);
end $$;

create or replace function _battle_resolve(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles; u battle_units; t battle_units; e battle_units; lg jsonb := '[]'::jsonb;
        dmg int; heal int; r double precision; k int := 0; tgt uuid;
begin
  select * into b from battles where room_id = p_room for update;
  select * into e from battle_units where room_id = p_room and side = 'enemy';
  -- unsubmitted living heroes do a weak guard
  update battle_units set action = 'guard', power = 3, word = null
    where room_id = p_room and side = 'hero' and hp > 0 and action is null;
  for u in select * from battle_units where room_id = p_room and hp > 0
           and (action is not null or side = 'enemy')
           order by spd + _brand(b.seed, b.turn, id::text) * 4 desc loop
    select * into u from battle_units where id = u.id;
    continue when u.hp <= 0;
    k := k + 1;
    if u.side = 'hero' then
      select * into e from battle_units where room_id = p_room and side = 'enemy';
      continue when e.hp <= 0;
      if u.action = 'attack' then
        r := _brand(b.seed, b.turn, u.id::text || 'hit');
        if r > least(0.95, 0.75 + (u.acc - 8) * 0.02 + u.lck * 0.005) then
          lg := lg || jsonb_build_object('t','miss','a',u.name,'d',e.name);
        else
          dmg := u.power * 2;
          if _brand(b.seed, b.turn, u.id::text || 'crit') < u.lck * 0.01 then dmg := dmg * 2; end if;
          update battle_units set hp = greatest(0, hp - dmg) where id = e.id;
          lg := lg || jsonb_build_object('t','hit','a',u.name,'d',e.name,'n',dmg,'w',u.word);
        end if;
      elsif u.action = 'guard' then
        update battle_units set shield = shield + round(u.power * 1.5) where id = u.id;
        lg := lg || jsonb_build_object('t','guard','a',u.name,'n',round(u.power * 1.5),'w',u.word);
      else
        heal := u.power * 2;
        select * into t from battle_units where room_id = p_room and side = 'hero' and hp > 0 order by hp::float / max_hp limit 1;
        update battle_units set hp = least(max_hp, hp + heal) where id = t.id;
        lg := lg || jsonb_build_object('t','heal','a',u.name,'d',t.name,'n',heal,'w',u.word);
      end if;
    else
      select id into tgt from battle_units where room_id = p_room and side = 'hero' and hp > 0
        order by _brand(b.seed, b.turn, id::text || 'tgt') limit 1;
      continue when tgt is null;
      select * into t from battle_units where id = tgt;
      r := _brand(b.seed, b.turn, 'edodge');
      if r < least(0.4, (t.spd - 10) * 0.02) then
        lg := lg || jsonb_build_object('t','dodge','a',u.name,'d',t.name);
      else
        dmg := u.atk + floor(_brand(b.seed, b.turn, 'edmg') * 6)::int + b.turn;
        if t.shield > 0 then
          update battle_units set shield = greatest(0, shield - dmg), hp = hp - greatest(0, dmg - shield) where id = t.id;
        else
          update battle_units set hp = greatest(0, hp - dmg) where id = t.id;
        end if;
        update battle_units set hp = greatest(0, hp) where id = t.id;
        lg := lg || jsonb_build_object('t','hit','a',u.name,'d',t.name,'n',dmg);
      end if;
    end if;
  end loop;
  update battle_units set action = null, power = 0, word = null where room_id = p_room;
  if (select hp from battle_units where room_id = p_room and side = 'enemy') <= 0 then
    update battles set step = 'won', log = lg, version = version + 1 where room_id = p_room;
    update rooms set phase = 'finished', phase_ends_at = null where id = p_room;
  elsif not exists (select 1 from battle_units where room_id = p_room and side = 'hero' and hp > 0) then
    update battles set step = 'lost', log = lg, version = version + 1 where room_id = p_room;
    update rooms set phase = 'finished', phase_ends_at = null where id = p_room;
  else
    update battles set turn = turn + 1, log = lg, version = version + 1, ends_at = now() + interval '25 seconds',
      prompt_id = _battle_prompt(p_room) where room_id = p_room;
    update rooms set phase_ends_at = now() + interval '25 seconds' where id = p_room;
  end if;
  perform _bump(p_room, 'battle_turn', '{}');
end $$;

-- idempotent: only resolves when everyone alive has locked in or the clock ran out
create or replace function battle_step(p_token uuid, p_turn int) returns void
language plpgsql security definer set search_path = public as $$
declare me players; b battles; pending int;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id for update;
  if not found or b.step <> 'input' or b.turn <> p_turn then return; end if;
  select count(*) into pending from battle_units where room_id = me.room_id and side = 'hero' and hp > 0 and action is null;
  if pending > 0 and now() < b.ends_at then return; end if;
  perform _battle_resolve(me.room_id);
end $$;

revoke execute on function _brand(bigint,int,text), _battle_prompt(uuid), _battle_resolve(uuid) from public, anon, authenticated;
revoke execute on function start_pve(uuid), get_battle(uuid), battle_submit(uuid,text,text), battle_step(uuid,int) from public;
grant execute on function start_pve(uuid), get_battle(uuid), battle_submit(uuid,text,text), battle_step(uuid,int) to anon, authenticated;

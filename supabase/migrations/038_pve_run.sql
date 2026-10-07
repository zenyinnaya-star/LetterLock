-- PvE Phase 2: 5-stage run (4 IRS battles + Government), named heroes with real stats, letter locks, Corruption, boss intents.

alter table battles add column if not exists stage int not null default 1;
alter table battles add column if not exists locked text not null default '';
alter table battles add column if not exists intent text not null default 'attack';
alter table battles add column if not exists next_intent text not null default 'attack';
alter table battles add column if not exists drain boolean not null default false;
alter table battle_units add column if not exists hero text;
alter table battle_units add column if not exists vit int not null default 5;
alter table battle_units add column if not exists foc int not null default 5;
alter table battle_units add column if not exists wil int not null default 5;
alter table battle_units add column if not exists corruption int not null default 0;
alter table battle_units add column if not exists lockn int not null default 0;
alter table battle_units add column if not exists ord int not null default 0;

create or replace function _boss_intent(p_turn int, p_phase int) returns text
language sql immutable as $$
  select case p_turn % 4
    when 1 then 'strike'
    when 2 then 'red_tape'
    when 3 then case when p_phase >= 2 then 'taxes' else 'strike' end
    else case when p_phase >= 3 then 'tax_season' else 'strike' end end;
$$;

-- spawn the enemies of one stage
create or replace function _spawn(p_room uuid, p_stage int, p_n int) returns void
language plpgsql security definer set search_path = public as $$
declare m numeric := 1 + 0.6 * (p_n - 1);
begin
  if p_stage = 1 then
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values (p_room,'enemy','Intern Auditor', round(80*m), round(80*m), 6, 9, 1, 0);
  elsif p_stage = 2 then
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values (p_room,'enemy','The Collector', round(115*m), round(115*m), 7, 10, 0, 0);
  elsif p_stage = 3 then
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values
      (p_room,'enemy','Filer Alpha', round(70*m), round(70*m), 9, 8, 1, 0),
      (p_room,'enemy','Filer Beta',  round(70*m), round(70*m), 4, 9, 1, 1);
  elsif p_stage = 4 then
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values (p_room,'enemy','The Commissioner', round(170*m), round(170*m), 7, 12, 3, 0);
  else
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values (p_room,'enemy','Government', round(380*m), round(380*m), 6, 16, 0, 0);
  end if;
end $$;

-- set up the new turn: prompt, locked letters, boss intent
create or replace function _roll_turn(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles; v_prompt bigint; letters text := ''; pool text := 'rstlnmdhcpbg'; n int; j int := 0; c text;
        boss battle_units; ph int := 1; it text := 'attack'; nx text := 'attack';
begin
  select * into b from battles where room_id = p_room;
  select coalesce(sum(lockn), 0) into n from battle_units where room_id = p_room and side = 'enemy' and hp > 0;
  select * into boss from battle_units where room_id = p_room and name = 'Government' and hp > 0;
  if found then
    ph := case when boss.hp > boss.max_hp * 0.66 then 1 when boss.hp > boss.max_hp * 0.33 then 2 else 3 end;
    it := _boss_intent(b.turn, ph);
    nx := _boss_intent(b.turn + 1, ph);
    if it = 'red_tape' then n := 4; end if;
  end if;
  n := least(4, n);
  while char_length(letters) < n and j < 60 loop
    j := j + 1;
    c := substr(pool, 1 + least(char_length(pool) - 1, floor(_brand(b.seed, b.turn, 'lk' || j) * char_length(pool))::int), 1);
    if position(c in letters) = 0 then letters := letters || c; end if;
  end loop;
  v_prompt := _pick_prompt(p_room);
  update rooms set prompt_id = v_prompt, used_prompts = used_prompts || v_prompt, phase_ends_at = now() + interval '25 seconds' where id = p_room;
  update battles set prompt_id = v_prompt, locked = letters, intent = it, next_intent = nx,
    drain = exists (select 1 from battle_units where room_id = p_room and name = 'The Collector' and hp > 0),
    ends_at = now() + interval '25 seconds', enemy_name = coalesce((select string_agg(name, ' & ' order by ord) from battle_units where room_id = p_room and side = 'enemy' and hp > 0), enemy_name)
  where room_id = p_room;
end $$;

create or replace function start_pve(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me players; v_room rooms; n int; p players; k int := 0; h text; s int[];
        heroes text[] := array['Shiro','Nero','Kira','Mira','Prince'];
begin
  me := _me(p_token);
  select * into v_room from rooms where id = me.room_id for update;
  if v_room.host_id <> me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'BAD_PHASE'; end if;
  select count(*) into n from players where room_id = v_room.id;
  if n > 4 then raise exception 'TOO_MANY'; end if;
  delete from battles where room_id = v_room.id;
  delete from battle_units where room_id = v_room.id;
  for p in select * from players where room_id = v_room.id order by joined_at loop
    k := k + 1; h := heroes[k];
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
    'stage', b.stage, 'stages', 5, 'locked', b.locked, 'intent', b.intent, 'next_intent', b.next_intent, 'drain', b.drain,
    'log', b.log, 'version', b.version, 'me', me.id,
    'units', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'side', u.side, 'player_id', u.player_id, 'name', u.name, 'hero', u.hero, 'hp', u.hp, 'max_hp', u.max_hp,
        'shield', u.shield, 'spd', u.spd, 'corruption', u.corruption, 'locked', (u.action is not null),
        'action', case when u.player_id = me.id then u.action end,
        'power', case when u.player_id = me.id then u.power end) order by u.side desc, u.ord), '[]'::jsonb)
      from battle_units u where u.room_id = me.room_id));
end $$;

create or replace function battle_submit(p_token uuid, p_word text, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; u battle_units; w text; v_pow numeric; v_lang text; v_rare int; ch text;
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
  for ch in select regexp_split_to_table(b.locked, '') loop
    if position(ch in w) > 0 then return jsonb_build_object('ok', false, 'reason', 'LOCKED', 'letter', ch); end if;
  end loop;
  select coalesce(settings->>'lang','en') into v_lang from rooms where id = me.room_id;
  if not exists (select 1 from words where word = w and lang = v_lang) then
    return jsonb_build_object('ok', false, 'reason', 'NOT_A_WORD'); end if;
  if not _fits(b.prompt_id, w) then
    return jsonb_build_object('ok', false, 'reason', 'OFF_TOPIC'); end if;
  v_rare := (select count(*) from regexp_matches(w, '[jqxzkv]', 'g'));
  v_pow := char_length(w) * (1 + u.lex * 0.04) + v_rare * 2 + greatest(0, extract(epoch from (b.ends_at - now())) / 5);
  v_pow := v_pow * (1 - 0.1 * u.corruption) * case when b.drain then 0.8 else 1 end;
  update battle_units set action = p_action, power = greatest(1, round(v_pow)), word = w where id = u.id;
  update battles set version = version + 1 where room_id = me.room_id;
  perform _bump(me.room_id, 'battle_lock', jsonb_build_object('player', me.id));
  return jsonb_build_object('ok', true, 'power', greatest(1, round(v_pow)));
end $$;

create or replace function _battle_resolve(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles; u battle_units; t battle_units; e battle_units; lg jsonb := '[]'::jsonb;
        dmg int; heal int; r double precision; ids uuid[]; i uuid; hit numeric; acc numeric; eva numeric;
        crit_m numeric; n int; v_stage int; it text;
begin
  select * into b from battles where room_id = p_room for update;
  select count(*) into n from battle_units where room_id = p_room and side = 'hero';
  update battle_units set action = 'guard', power = 3, word = null
    where room_id = p_room and side = 'hero' and hp > 0 and action is null;
  select array_agg(id order by spd + _brand(b.seed, b.turn, id::text) * 4
                   + case action when 'guard' then 4 when 'heal' then 2 else 0 end desc) into ids
    from battle_units where room_id = p_room and hp > 0;
  foreach i in array ids loop
    select * into u from battle_units where id = i;
    continue when u.hp <= 0;
    if u.side = 'hero' then
      select * into e from battle_units where room_id = p_room and side = 'enemy' and hp > 0 order by ord limit 1;
      if u.action = 'attack' then
        continue when e.id is null;
        acc := u.foc * 0.01 + u.lck * 0.005 + least(0.3, 0.02 * greatest(0, char_length(coalesce(u.word, '')) - 5));
        eva := least(0.4, e.spd * 0.015);
        hit := greatest(0.1, least(0.95, 0.9 + acc - eva));
        if _brand(b.seed, b.turn, u.id::text || 'hit') > hit then
          lg := lg || jsonb_build_object('t','miss','a',u.name,'d',e.name);
        else
          dmg := u.power * 2;
          if _brand(b.seed, b.turn, u.id::text || 'crit') < least(0.5, 0.05 + u.lck * 0.01) then
            dmg := round(dmg * least(2.5, 1.5 + u.lex * 0.01));
            lg := lg || jsonb_build_object('t','crit','a',u.name,'d',e.name,'n',dmg,'w',u.word);
          else
            lg := lg || jsonb_build_object('t','hit','a',u.name,'d',e.name,'n',dmg,'w',u.word);
          end if;
          update battle_units set hp = greatest(0, hp - dmg) where id = e.id;
        end if;
      elsif u.action = 'guard' then
        update battle_units set shield = shield + round(u.power * 1.5) where id = u.id;
        lg := lg || jsonb_build_object('t','guard','a',u.name,'n',round(u.power * 1.5),'w',u.word);
      else
        heal := u.power * 2;
        select * into t from battle_units where room_id = p_room and side = 'hero' and hp > 0 order by hp::float / max_hp limit 1;
        update battle_units set hp = least(max_hp, hp + heal),
          corruption = case when u.hero = 'Mira' then greatest(0, corruption - 1) else corruption end where id = t.id;
        lg := lg || jsonb_build_object('t','heal','a',u.name,'d',t.name,'n',heal,'w',u.word);
      end if;
    else
      it := case when u.name = 'Government' then b.intent else 'attack' end;
      if it = 'tax_season' then
        lg := lg || jsonb_build_object('t','season','a',u.name);
        for t in select * from battle_units where room_id = p_room and side = 'hero' and hp > 0 loop
          dmg := round(u.atk * 1.6) + b.turn;
          update battle_units set shield = greatest(0, shield - dmg), hp = greatest(0, hp - greatest(0, dmg - shield)) where id = t.id;
        end loop;
      else
        select * into t from battle_units where room_id = p_room and side = 'hero' and hp > 0
          order by _brand(b.seed, b.turn, id::text || 'tgt' || u.id::text) limit 1;
        continue when t.id is null;
        eva := least(0.4, t.spd * 0.015);
        if _brand(b.seed, b.turn, 'edodge' || u.id::text) > greatest(0.1, least(0.95, 0.9 - eva)) and u.name <> 'Government' then
          lg := lg || jsonb_build_object('t','dodge','a',u.name,'d',t.name);
        else
          dmg := u.atk + floor(_brand(b.seed, b.turn, 'edmg' || u.id::text) * 6)::int + b.stage;
          update battle_units set shield = greatest(0, shield - dmg), hp = greatest(0, hp - greatest(0, dmg - shield)) where id = t.id;
          lg := lg || jsonb_build_object('t','hit','a',u.name,'d',t.name,'n',dmg);
        end if;
      end if;
      if it = 'taxes' then
        for t in select * from battle_units where room_id = p_room and side = 'hero' and hp > 0 loop
          if _brand(b.seed, b.turn, 'corr' || t.id::text) < least(0.6, t.wil * 0.04) then
            lg := lg || jsonb_build_object('t','resist','d',t.name);
          else
            update battle_units set corruption = least(3, corruption + 1) where id = t.id;
            lg := lg || jsonb_build_object('t','corrupt','d',t.name);
          end if;
        end loop;
      end if;
    end if;
  end loop;
  update battle_units set action = null, power = 0, word = null where room_id = p_room;
  if not exists (select 1 from battle_units where room_id = p_room and side = 'enemy' and hp > 0) then
    if b.stage >= 5 then
      update battles set step = 'won', log = lg, version = version + 1 where room_id = p_room;
      update rooms set phase = 'finished', phase_ends_at = null where id = p_room;
    else
      -- next encounter: breather heal, revive the fallen, clear shields and Corruption
      update battle_units set hp = case when hp <= 0 then round(max_hp * 0.3) else least(max_hp, hp + round(max_hp * 0.3)) end,
        shield = 0, corruption = 0 where room_id = p_room and side = 'hero';
      delete from battle_units where room_id = p_room and side = 'enemy';
      perform _spawn(p_room, b.stage + 1, n);
      update battles set stage = stage + 1, turn = turn + 1, log = lg || jsonb_build_object('t','stage','n',b.stage + 1), version = version + 1 where room_id = p_room;
      perform _roll_turn(p_room);
    end if;
  elsif not exists (select 1 from battle_units where room_id = p_room and side = 'hero' and hp > 0) then
    update battles set step = 'lost', log = lg, version = version + 1 where room_id = p_room;
    update rooms set phase = 'finished', phase_ends_at = null where id = p_room;
  else
    update battles set turn = turn + 1, log = lg, version = version + 1 where room_id = p_room;
    perform _roll_turn(p_room);
  end if;
  perform _bump(p_room, 'battle_turn', '{}');
end $$;

revoke execute on function _boss_intent(int,int), _spawn(uuid,int,int), _roll_turn(uuid) from public, anon, authenticated;

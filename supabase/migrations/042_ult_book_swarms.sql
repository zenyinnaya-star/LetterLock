-- Phase 3: multi-enemy encounters, ultimates (charge 0..6), Book of Wisdom (timed prompt -> powerful cards)
alter table battle_units add column if not exists ult int not null default 0;
alter table battle_units add column if not exists book_used boolean not null default false;
alter table battle_units add column if not exists book_prompt bigint;
alter table battle_units add column if not exists book_ends timestamptz;

-- encounters: 3+ enemies each (HP scaled by party size)
create or replace function _spawn(p_room uuid, p_stage int, p_n int) returns void
language plpgsql security definer set search_path = public as $$
declare m numeric := 1 + 0.6 * (p_n - 1);
begin
  if p_stage = 1 then
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values
      (p_room,'enemy','Intern Auditor', round(45*m), round(45*m), 6, 7, 1, 0),
      (p_room,'enemy','Intern Auditor', round(45*m), round(45*m), 5, 7, 0, 1),
      (p_room,'enemy','Intern Auditor', round(45*m), round(45*m), 7, 7, 0, 2);
  elsif p_stage = 2 then
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values
      (p_room,'enemy','Clerk', round(40*m), round(40*m), 6, 7, 0, 0),
      (p_room,'enemy','The Collector', round(85*m), round(85*m), 7, 10, 0, 1),
      (p_room,'enemy','Clerk', round(40*m), round(40*m), 5, 7, 1, 2);
  elsif p_stage = 3 then
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values
      (p_room,'enemy','Filer Alpha', round(55*m), round(55*m), 9, 8, 1, 0),
      (p_room,'enemy','Intern Auditor', round(40*m), round(40*m), 6, 7, 0, 1),
      (p_room,'enemy','Filer Beta',  round(55*m), round(55*m), 4, 9, 1, 2),
      (p_room,'enemy','Intern Auditor', round(40*m), round(40*m), 7, 7, 0, 3);
  elsif p_stage = 4 then
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values
      (p_room,'enemy','Bailiff', round(50*m), round(50*m), 5, 9, 0, 0),
      (p_room,'enemy','The Commissioner', round(130*m), round(130*m), 7, 12, 3, 1),
      (p_room,'enemy','Bailiff', round(50*m), round(50*m), 5, 9, 0, 2),
      (p_room,'enemy','Bailiff', round(50*m), round(50*m), 4, 9, 0, 3);
  else
    insert into battle_units(room_id, side, name, hp, max_hp, spd, atk, lockn, ord) values
      (p_room,'enemy','Tax Drone', round(50*m), round(50*m), 8, 8, 0, 0),
      (p_room,'enemy','Government', round(380*m), round(380*m), 6, 16, 0, 1),
      (p_room,'enemy','Tax Drone', round(50*m), round(50*m), 8, 8, 0, 2);
  end if;
end $$;

create or replace function battle_submit(p_token uuid, p_word text, p_action text, p_target uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; u battle_units; w text; v_pow numeric; v_lang text; v_rare int; ch text;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id for update;
  if not found or b.step <> 'input' then raise exception 'BAD_PHASE'; end if;
  select * into u from battle_units where player_id = me.id for update;
  if u.hp <= 0 then raise exception 'DOWN'; end if;
  if u.action is not null then raise exception 'ALREADY'; end if;
  if p_action not in ('attack','guard','heal','ult') then raise exception 'BAD_ACTION'; end if;
  if p_action = 'ult' and u.ult < 6 then raise exception 'ULT_NOT_READY'; end if;
  w := lower(trim(coalesce(p_word, '')));
  if w !~ '^[a-z]{2,20}$' then return jsonb_build_object('ok', false, 'reason', 'INVALID'); end if;
  for ch in select regexp_split_to_table(b.locked, '') where b.locked <> '' loop
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
  update battle_units set action = p_action, power = greatest(1, round(v_pow)), word = w,
    target = (select id from battle_units where id = p_target and room_id = me.room_id),
    cards = case when cardinality(cards) < 2 and _brand(b.seed, b.turn, u.id::text || 'draw') < 0.6
      then cards || (array['sweep','heal_all','cleanse'])[1 + least(2, floor(_brand(b.seed, b.turn, u.id::text || 'kind') * 3)::int)] else cards end
    where id = u.id;
  update battles set version = version + 1 where room_id = me.room_id;
  perform _bump(me.room_id, 'battle_lock', jsonb_build_object('player', me.id));
  return jsonb_build_object('ok', true, 'power', greatest(1, round(v_pow)));
end $$;

create or replace function battle_card(p_token uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; u battle_units; dmg int; t battle_units; lg jsonb := '[]'::jsonb;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id for update;
  if not found or b.step <> 'input' then raise exception 'BAD_PHASE'; end if;
  select * into u from battle_units where player_id = me.id for update;
  if u.hp <= 0 then raise exception 'DOWN'; end if;
  if u.card is not null then raise exception 'CARD_USED'; end if;
  if not (p_kind = any(u.cards)) then raise exception 'NO_CARD'; end if;
  update battle_units set cards = array_remove(cards, p_kind), card = p_kind where id = u.id;
  -- array_remove drops every copy; put one back if there were two
  if (select count(*) from unnest(u.cards) c where c = p_kind) = 2 then
    update battle_units set cards = array[p_kind] || cards where id = u.id;
  end if;
  if p_kind = 'sweep' then
    dmg := 10 + u.lex * 2;
    update battle_units set hp = greatest(0, hp - dmg) where room_id = me.room_id and side = 'enemy' and hp > 0;
    lg := jsonb_build_object('t','sweep','a',u.name,'n',dmg);
  elsif p_kind = 'heal_all' then
    dmg := 12 + u.wil * 2;
    update battle_units set hp = least(max_hp, hp + dmg) where room_id = me.room_id and side = 'hero' and hp > 0;
    lg := jsonb_build_object('t','group_heal','a',u.name,'n',dmg);
  elsif p_kind = 'mega_sweep' then
    dmg := 25 + u.lex * 3;
    update battle_units set hp = greatest(0, hp - dmg) where room_id = me.room_id and side = 'enemy' and hp > 0;
    lg := jsonb_build_object('t','mega_sweep','a',u.name,'n',dmg);
  elsif p_kind = 'full_heal' then
    update battle_units set hp = max_hp, corruption = 0 where room_id = me.room_id and side = 'hero' and hp > 0;
    lg := jsonb_build_object('t','full_heal','a',u.name);
  elsif p_kind = 'revive' then
    update battle_units set hp = round(max_hp * 0.5) where room_id = me.room_id and side = 'hero' and hp <= 0;
    lg := jsonb_build_object('t','revive','a',u.name);
  elsif p_kind = 'overcharge' then
    update battle_units set ult = 6 where id = u.id;
    lg := jsonb_build_object('t','overcharge','a',u.name);
  elsif p_kind = 'cleanse' then
    update battle_units set corruption = greatest(0, corruption - 1) where room_id = me.room_id and side = 'hero';
    lg := jsonb_build_object('t','cleanse','a',u.name);
  else
    raise exception 'BAD_CARD';
  end if;
  update battles set pre = pre || lg, version = version + 1 where room_id = me.room_id;
  perform _bump(me.room_id, 'battle_card', '{}');
  return jsonb_build_object('ok', true);
end $$;

create or replace function _battle_resolve(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles; u battle_units; t battle_units; e battle_units; lg jsonb := '[]'::jsonb;
        dmg int; heal int; r double precision; ids uuid[]; i uuid; hit numeric; acc numeric; eva numeric;
        crit_m numeric; n int; v_stage int; it text; tg battle_units;
begin
  select * into b from battles where room_id = p_room for update;
  select count(*) into n from battle_units where room_id = p_room and side = 'hero';
  lg := b.pre;
  update battle_units set action = 'guard', power = 3, word = null
    where room_id = p_room and side = 'hero' and hp > 0 and action is null;
  select array_agg(id order by spd + _brand(b.seed, b.turn, id::text) * 4
                   + case action when 'guard' then 4 when 'heal' then 2 when 'ult' then -3 else 0 end desc) into ids
    from battle_units where room_id = p_room and hp > 0;
  foreach i in array ids loop
    select * into u from battle_units where id = i;
    continue when u.hp <= 0;
    if u.side = 'hero' then
      select * into e from battle_units where room_id = p_room and side = 'enemy' and hp > 0
        order by (id = u.target) desc, ord limit 1;
      if u.action = 'ult' then
        continue when e.id is null and u.hero <> 'Mira' and u.hero <> 'Nero';
        if u.hero = 'Shiro' then
          dmg := round(u.power * 2.2);
          update battle_units set hp = greatest(0, hp - dmg) where room_id = p_room and side = 'enemy' and hp > 0;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'n',dmg,'w',u.word);
        elsif u.hero = 'Nero' then
          update battle_units set shield = shield + round(u.power * 2) where room_id = p_room and side = 'hero' and hp > 0;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'n',round(u.power * 2),'w',u.word);
        elsif u.hero = 'Kira' then
          dmg := u.power * 5;
          update battle_units set hp = greatest(0, hp - dmg) where id = e.id;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'d',e.name,'n',dmg,'w',u.word);
        elsif u.hero = 'Mira' then
          update battle_units set hp = least(max_hp, hp + round(max_hp * 0.4)), corruption = 0 where room_id = p_room and side = 'hero' and hp > 0;
          update battle_units set hp = round(max_hp * 0.3) where room_id = p_room and side = 'hero' and hp <= 0;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'w',u.word);
        else
          dmg := round(u.power * 1.6);
          update battle_units set hp = greatest(0, hp - dmg) where room_id = p_room and side = 'enemy' and hp > 0;
          update battle_units set hp = least(max_hp, hp + 15) where room_id = p_room and side = 'hero' and hp > 0;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'n',dmg,'w',u.word);
        end if;
        update battle_units set ult = 0 where id = u.id;
      elsif u.action = 'attack' then
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
        select * into t from battle_units where room_id = p_room and side = 'hero' and hp > 0
          order by (id = u.target) desc, hp::float / max_hp limit 1;
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
  update battle_units set ult = least(6, ult + 1) where room_id = p_room and side = 'hero' and hp > 0 and word is not null and action <> 'ult';
  update battle_units set action = null, power = 0, word = null, target = null, card = null where room_id = p_room;
  update battles set pre = '[]'::jsonb where room_id = p_room;
  if not exists (select 1 from battle_units where room_id = p_room and side = 'enemy' and hp > 0) then
    if b.stage >= 5 then
      update battles set step = 'won', log = lg, version = version + 1 where room_id = p_room;
      update rooms set phase = 'finished', phase_ends_at = null where id = p_room;
    else
      -- next encounter: breather heal, revive the fallen, clear shields and Corruption
      update battle_units set hp = case when hp <= 0 then round(max_hp * 0.3) else least(max_hp, hp + round(max_hp * 0.3)) end,
        shield = 0, corruption = 0, book_used = false where room_id = p_room and side = 'hero';
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

create or replace function battle_step(p_token uuid, p_turn int) returns void
language plpgsql security definer set search_path = public as $$
declare me players; b battles; pending int;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id for update;
  if not found or b.step <> 'input' or b.turn <> p_turn then return; end if;
  select count(*) into pending from battle_units where room_id = me.room_id and side = 'hero' and hp > 0 and action is null;
  if pending > 0 and now() < b.ends_at
     and exists (select 1 from battle_units where room_id = me.room_id and side = 'enemy' and hp > 0) then return; end if;
  perform _battle_resolve(me.room_id);
end $$;

create or replace function get_battle(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; v_prompt text; v_cards text[]; v_card text; v_bused boolean; v_bp bigint; v_be timestamptz; v_btext text;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id;
  if not found then return null; end if;
  select text into v_prompt from prompts where id = b.prompt_id;
  select cards, card, book_used, book_prompt, book_ends into v_cards, v_card, v_bused, v_bp, v_be from battle_units where player_id = me.id;
  if v_bp is not null and v_be > now() then select text into v_btext from prompts where id = v_bp; end if;
  return jsonb_build_object(
    'turn', b.turn, 'step', b.step, 'ends_at', b.ends_at, 'prompt', v_prompt, 'enemy', b.enemy_name,
    'stage', b.stage, 'stages', 5, 'locked', b.locked, 'intent', b.intent, 'next_intent', b.next_intent, 'drain', b.drain,
    'cards', to_jsonb(coalesce(v_cards, '{}')), 'book_used', coalesce(v_bused, false), 'book', case when v_btext is not null then jsonb_build_object('prompt', v_btext, 'ends_at', v_be) end, 'card_used', v_card is not null,
    'log', b.pre || b.log, 'version', b.version, 'me', me.id,
    'units', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'side', u.side, 'player_id', u.player_id, 'name', u.name, 'hero', u.hero, 'hp', u.hp, 'max_hp', u.max_hp,
        'shield', u.shield, 'spd', u.spd, 'corruption', u.corruption, 'ult', u.ult, 'locked', (u.action is not null),
        'action', case when u.player_id = me.id then u.action end,
        'power', case when u.player_id = me.id then u.power end) order by u.side desc, u.ord), '[]'::jsonb)
      from battle_units u where u.room_id = me.room_id));
end $$;

-- Book of Wisdom: once per hero per encounter. Open -> 15s timed prompt -> a correct word grants a powerful card.
create or replace function book_open(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; u battle_units; v bigint; t text;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id for update;
  if not found or b.step <> 'input' then raise exception 'BAD_PHASE'; end if;
  select * into u from battle_units where player_id = me.id for update;
  if u.hp <= 0 then raise exception 'DOWN'; end if;
  if u.book_used then raise exception 'BOOK_USED'; end if;
  v := _pick_prompt(me.room_id);
  update battle_units set book_used = true, book_prompt = v, book_ends = now() + interval '15 seconds' where id = u.id;
  select text into t from prompts where id = v;
  return jsonb_build_object('prompt', t, 'ends_at', now() + interval '15 seconds');
end $$;

create or replace function book_answer(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; u battle_units; w text; v_lang text; v_card text; r double precision;
begin
  me := _me(p_token);
  select * into u from battle_units where player_id = me.id for update;
  if u.book_prompt is null or u.book_ends is null then raise exception 'NO_BOOK'; end if;
  if now() > u.book_ends + interval '1 second' then
    update battle_units set book_prompt = null, book_ends = null where id = u.id;
    return jsonb_build_object('ok', false, 'reason', 'TOO_SLOW');
  end if;
  w := lower(trim(coalesce(p_word, '')));
  select coalesce(settings->>'lang','en') into v_lang from rooms where id = me.room_id;
  if w !~ '^[a-z]{2,20}$' or not exists (select 1 from words where word = w and lang = v_lang) or not _fits(u.book_prompt, w) then
    return jsonb_build_object('ok', false, 'reason', 'WRONG');   -- can retry until the clock runs out
  end if;
  r := random();
  v_card := case when r < 0.35 then 'mega_sweep' when r < 0.65 then 'full_heal' when r < 0.85 then 'overcharge' else 'revive' end;
  update battle_units set cards = case when cardinality(cards) < 4 then cards || v_card else cards end, book_prompt = null, book_ends = null where id = u.id;
  perform _bump(me.room_id, 'book', jsonb_build_object('player', me.id));
  return jsonb_build_object('ok', true, 'card', v_card);
end $$;

revoke execute on function book_open(uuid), book_answer(uuid,text) from public;
grant execute on function book_open(uuid), book_answer(uuid,text) to anon, authenticated;

-- 048: elements + weaknesses. Prompt topic -> element; enemies are weak/resistant to elements (x1.5 / x0.6 on attacks and Kira's ult).
create or replace function _elem(p_topic text) returns text language sql immutable as $$
  select case p_topic when 'food' then 'fire' when 'fun' then 'fire' when 'animals' then 'earth' when 'things' then 'earth'
    when 'nature' then 'ice' when 'tech' then 'storm' when 'internet' then 'storm' when 'fantasy' then 'light' when 'words' then 'light'
    when 'funny' then 'dark' else 'earth' end $$;

create or replace function _foe_weak(p_name text) returns text language sql immutable as $$
  select case p_name when 'Intern Auditor' then 'fire' when 'Clerk' then 'storm' when 'The Collector' then 'ice' when 'Filer Alpha' then 'earth'
    when 'Filer Beta' then 'fire' when 'Bailiff' then 'light' when 'The Commissioner' then 'dark' when 'Tax Drone' then 'storm'
    when 'Government' then 'dark' else null end $$;

create or replace function _foe_res(p_name text) returns text language sql immutable as $$
  select case p_name when 'Intern Auditor' then 'light' when 'Clerk' then 'earth' when 'The Collector' then 'fire' when 'Filer Alpha' then 'storm'
    when 'Filer Beta' then 'ice' when 'Bailiff' then 'dark' when 'The Commissioner' then 'light' when 'Tax Drone' then 'earth'
    when 'Government' then 'storm' else null end $$;

create or replace function _battle_resolve(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare b battles; u battle_units; t battle_units; e battle_units; lg jsonb := '[]'::jsonb;
        dmg int; heal int; r double precision; ids uuid[]; i uuid; hit numeric; acc numeric; eva numeric;
        crit_m numeric; n int; v_stage int; it text; tg battle_units; ea text; er double precision; el text; mult numeric := 1;
begin
  select * into b from battles where room_id = p_room for update;
  select count(*) into n from battle_units where room_id = p_room and side = 'hero';
  lg := b.pre;
  el := _elem(coalesce((select topic from prompts where id = b.prompt_id), ''));
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
          mult := case when _foe_weak(e.name) = el then 1.5 when _foe_res(e.name) = el then 0.6 else 1 end;
          dmg := round(u.power * 5 * mult);
          update battle_units set hp = greatest(0, hp - dmg) where id = e.id;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'d',e.name,'n',dmg,'w',u.word,'x',case when mult > 1 then 'weak' when mult < 1 then 'resist' end,'el',el);
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
          mult := case when _foe_weak(e.name) = el then 1.5 when _foe_res(e.name) = el then 0.6 else 1 end;
          dmg := greatest(1, round(dmg * mult));
          if _brand(b.seed, b.turn, u.id::text || 'crit') < least(0.5, 0.05 + u.lck * 0.01) then
            dmg := round(dmg * least(2.5, 1.5 + u.lex * 0.01));
            lg := lg || jsonb_build_object('t','crit','a',u.name,'d',e.name,'n',dmg,'w',u.word,'x',case when mult > 1 then 'weak' when mult < 1 then 'resist' end,'el',el);
          else
            lg := lg || jsonb_build_object('t','hit','a',u.name,'d',e.name,'n',dmg,'w',u.word,'x',case when mult > 1 then 'weak' when mult < 1 then 'resist' end,'el',el);
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
      if u.name <> 'Government' then
        er := _brand(b.seed, b.turn, 'eact' || u.id::text);
        ea := case when er < 0.40 then 'attack' when er < 0.55 then 'aoe' when er < 0.70 then 'buff' when er < 0.85 then 'debuff' else 'heal' end;
        if ea = 'heal' and not exists (select 1 from battle_units where room_id = p_room and side = 'enemy' and hp > 0 and hp < max_hp) then ea := 'attack'; end if;
        if ea = 'buff' and u.atk >= 14 then ea := 'attack'; end if;
        if ea = 'aoe' then
          dmg := round(u.atk * 0.65) + b.stage;
          for t in select * from battle_units where room_id = p_room and side = 'hero' and hp > 0 loop
            update battle_units set shield = greatest(0, shield - dmg), hp = greatest(0, hp - greatest(0, dmg - shield)) where id = t.id;
          end loop;
          lg := lg || jsonb_build_object('t','e_aoe','a',u.name,'n',dmg);
          continue;
        elsif ea = 'buff' then
          update battle_units set atk = atk + 2 where room_id = p_room and side = 'enemy' and hp > 0;
          lg := lg || jsonb_build_object('t','e_buff','a',u.name);
          continue;
        elsif ea = 'debuff' then
          select * into t from battle_units where room_id = p_room and side = 'hero' and hp > 0
            order by _brand(b.seed, b.turn, id::text || 'dbf' || u.id::text) limit 1;
          if t.id is not null then
            update battle_units set weak = 2 where id = t.id;
            lg := lg || jsonb_build_object('t','e_debuff','a',u.name,'d',t.name);
            continue;
          end if;
        elsif ea = 'heal' then
          select * into t from battle_units where room_id = p_room and side = 'enemy' and hp > 0 and hp < max_hp order by hp::float / max_hp limit 1;
          if t.id is not null then
            dmg := round(t.max_hp * 0.25);
            update battle_units set hp = least(max_hp, hp + dmg) where id = t.id;
            lg := lg || jsonb_build_object('t','e_heal','a',u.name,'d',t.name,'n',dmg);
            continue;
          end if;
        end if;
      end if;
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
  perform _battle_tally(p_room, lg);
  update battle_units set weak = greatest(0, weak - 1) where room_id = p_room and side = 'hero';
  update battle_units set action = null, power = 0, word = null, target = null, card = null where room_id = p_room;
  update battles set pre = '[]'::jsonb where room_id = p_room;
  if not exists (select 1 from battle_units where room_id = p_room and side = 'enemy' and hp > 0) then
    if b.stage >= 5 then
      update battles set step = 'won', log = lg, version = version + 1 where room_id = p_room;
      update rooms set phase = 'finished', phase_ends_at = null where id = p_room;
    else
      perform _enter_camp(p_room, b.stage, lg);
    end if;
  elsif not exists (select 1 from battle_units where room_id = p_room and side = 'hero' and hp > 0) then
    update battles set step = 'lost', log = lg, version = version + 1 where room_id = p_room;
    update rooms set phase = 'finished', phase_ends_at = null where id = p_room;
  else
    update battles set turn = turn + 1, log = lg, version = version + 1 where room_id = p_room;
    perform _roll_turn(p_room);
  end if;
  perform _bump(p_room, 'battle_turn', '{}');
end $$;;

create or replace function get_battle(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; v_prompt text; v_topic text; v_cards text[]; v_card text; v_bused boolean; v_bp bigint; v_be timestamptz; v_btext text;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id;
  if not found then return null; end if;
  select text, topic into v_prompt, v_topic from prompts where id = b.prompt_id;
  select cards, card, book_used, book_prompt, book_ends into v_cards, v_card, v_bused, v_bp, v_be from battle_units where player_id = me.id;
  if v_bp is not null and v_be > now() then select text into v_btext from prompts where id = v_bp; end if;
  return jsonb_build_object(
    'turn', b.turn, 'step', b.step, 'ends_at', b.ends_at, 'prompt', v_prompt, 'element', _elem(coalesce(v_topic, '')), 'enemy', b.enemy_name,
    'stage', b.stage, 'stages', 5, 'locked', b.locked, 'intent', b.intent, 'next_intent', b.next_intent, 'drain', b.drain,
    'cards', to_jsonb(coalesce(v_cards, '{}')), 'book_used', coalesce(v_bused, false), 'book', case when v_btext is not null then jsonb_build_object('prompt', v_btext, 'ends_at', v_be) end, 'card_used', v_card is not null,
    'log', b.pre || b.log, 'version', b.version, 'me', me.id,
    'units', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'side', u.side, 'player_id', u.player_id, 'name', u.name, 'hero', u.hero, 'hp', u.hp, 'max_hp', u.max_hp,
        'shield', u.shield, 'spd', u.spd, 'corruption', u.corruption, 'ult', u.ult, 'locked', (u.action is not null),
        'weak_el', case when u.side = 'enemy' then _foe_weak(u.name) end, 'res_el', case when u.side = 'enemy' then _foe_res(u.name) end,
        'action', case when u.player_id = me.id then u.action end,
        'power', case when u.player_id = me.id then u.power end) order by u.side desc, u.ord), '[]'::jsonb)
      from battle_units u where u.room_id = me.room_id));
end $$;

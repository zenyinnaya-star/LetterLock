-- Targeting + cards: pick who to hit/heal, and instant cards (Sweep = AoE, Group Heal, Cleanse). A valid word may draw a card.
alter table battle_units add column if not exists cards text[] not null default '{}';
alter table battle_units add column if not exists target uuid;
alter table battle_units add column if not exists card text;
alter table battles add column if not exists pre jsonb not null default '[]'::jsonb;

drop function if exists battle_submit(uuid, text, text);

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
  if p_action not in ('attack','guard','heal') then raise exception 'BAD_ACTION'; end if;
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


-- play a card: instant, no word needed, one per hero per turn
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
                   + case action when 'guard' then 4 when 'heal' then 2 else 0 end desc) into ids
    from battle_units where room_id = p_room and hp > 0;
  foreach i in array ids loop
    select * into u from battle_units where id = i;
    continue when u.hp <= 0;
    if u.side = 'hero' then
      select * into e from battle_units where room_id = p_room and side = 'enemy' and hp > 0
        order by (id = u.target) desc, ord limit 1;
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
  update battle_units set action = null, power = 0, word = null, target = null, card = null where room_id = p_room;
  update battles set pre = '[]'::jsonb where room_id = p_room;
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

-- get_battle: also report my hand
create or replace function get_battle(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; v_prompt text; v_cards text[]; v_card text;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id;
  if not found then return null; end if;
  select text into v_prompt from prompts where id = b.prompt_id;
  select cards, card into v_cards, v_card from battle_units where player_id = me.id;
  return jsonb_build_object(
    'turn', b.turn, 'step', b.step, 'ends_at', b.ends_at, 'prompt', v_prompt, 'enemy', b.enemy_name,
    'stage', b.stage, 'stages', 5, 'locked', b.locked, 'intent', b.intent, 'next_intent', b.next_intent, 'drain', b.drain,
    'cards', to_jsonb(coalesce(v_cards, '{}')), 'card_used', v_card is not null,
    'log', b.pre || b.log, 'version', b.version, 'me', me.id,
    'units', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'side', u.side, 'player_id', u.player_id, 'name', u.name, 'hero', u.hero, 'hp', u.hp, 'max_hp', u.max_hp,
        'shield', u.shield, 'spd', u.spd, 'corruption', u.corruption, 'locked', (u.action is not null),
        'action', case when u.player_id = me.id then u.action end,
        'power', case when u.player_id = me.id then u.power end) order by u.side desc, u.ord), '[]'::jsonb)
      from battle_units u where u.room_id = me.room_id));
end $$;

revoke execute on function battle_submit(uuid,text,text,uuid), battle_card(uuid,text) from public;
grant execute on function battle_submit(uuid,text,text,uuid), battle_card(uuid,text) to anon, authenticated;

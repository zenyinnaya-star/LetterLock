-- 044: Camp between encounters: gold, shop, casino, and pathways with their special camp features.
alter table battle_units add column if not exists gold int not null default 0;
alter table battle_units add column if not exists pbonus numeric not null default 0;
alter table battle_units add column if not exists path text;
alter table battle_units add column if not exists pacts int not null default 0;
alter table battle_units add column if not exists ready boolean not null default false;
alter table battle_units add column if not exists camp_flags text[] not null default '{}';
alter table battle_units add column if not exists price_up boolean not null default false;
alter table battle_units add column if not exists puzzle_kind text;
alter table battle_units add column if not exists puzzle_prompt bigint;
alter table battle_units add column if not exists puzzle_ans text;
alter table battle_units add column if not exists puzzle_scr text;
alter table battle_units add column if not exists puzzle_ends timestamptz;
alter table battle_units add column if not exists casino_stake int not null default 0;
alter table battle_units add column if not exists casino_round int not null default 0;
alter table battle_units add column if not exists casino_wins int not null default 0;
alter table battle_units add column if not exists casino_prompts bigint[] not null default '{}';
alter table battle_units add column if not exists casino_ends timestamptz;
alter table battle_units add column if not exists casino_lucky boolean not null default false;
alter table battle_units add column if not exists casino_won int not null default 0;
alter table battles add column if not exists camp_ends timestamptz;
alter table battles add column if not exists oath boolean not null default false;

-- Encounter cleared (not the last): rewards, breather, then the camp
create or replace function _enter_camp(p_room uuid, p_stage int, lg jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ne int;
begin
  select count(*) into ne from battle_units where room_id = p_room and side = 'enemy';
  update battle_units set
    gold = gold + round((25 + 15 * p_stage + 6 * ne) * case when path = 'thief' then 1.25 else 1 end),
    hp = case when hp <= 0 then round(max_hp * 0.3) else least(max_hp, hp + round(max_hp * 0.3)) end,
    shield = 0, corruption = 0, book_used = false, ready = false, camp_flags = '{}', price_up = false,
    puzzle_kind = null, puzzle_ends = null, casino_round = 0, card = null
    where room_id = p_room and side = 'hero';
  delete from battle_units where room_id = p_room and side = 'enemy';
  update battles set step = 'camp', camp_ends = now() + interval '90 seconds', log = lg || jsonb_build_object('t','camp','n',p_stage),
    version = version + 1 where room_id = p_room;
end $$;
revoke execute on function _enter_camp(uuid,int,jsonb) from public, anon, authenticated;

create or replace function _next_stage(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles; n int;
begin
  select * into b from battles where room_id = p_room for update;
  if not found or b.step <> 'camp' then return; end if;
  select count(*) into n from battle_units where room_id = p_room and side = 'hero';
  if b.oath then
    update battle_units set ult = least(6, ult + 2), shield = shield + 20 where room_id = p_room and side = 'hero' and hp > 0;
  end if;
  update battle_units set ready = false, puzzle_kind = null, casino_round = 0 where room_id = p_room and side = 'hero';
  perform _spawn(p_room, b.stage + 1, n);
  update battles set step = 'input', stage = stage + 1, turn = turn + 1, oath = false, pre = '[]'::jsonb,
    log = jsonb_build_array(jsonb_build_object('t','stage','n',b.stage + 1)), version = version + 1 where room_id = p_room;
  perform _roll_turn(p_room);
  perform _bump(p_room, 'battle_turn', '{}');
end $$;
revoke execute on function _next_stage(uuid) from public, anon, authenticated;

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
  v_pow := v_pow * (1 - 0.1 * u.corruption) * case when b.drain then 0.8 else 1 end * (1 + u.pbonus);
  update battle_units set action = p_action, power = greatest(1, round(v_pow)), word = w,
    target = (select id from battle_units where id = p_target and room_id = me.room_id),
    cards = case when cardinality(cards) < 2 and _brand(b.seed, b.turn, u.id::text || 'draw') < 0.6
      then cards || (array['sweep','heal_all','cleanse'])[1 + least(2, floor(_brand(b.seed, b.turn, u.id::text || 'kind') * 3)::int)] else cards end
    where id = u.id;
  update battles set version = version + 1 where room_id = me.room_id;
  perform _bump(me.room_id, 'battle_lock', jsonb_build_object('player', me.id));
  return jsonb_build_object('ok', true, 'power', greatest(1, round(v_pow)));
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
  perform _battle_tally(p_room, lg);
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
end $$;

create or replace function _camp_check(p_token uuid) returns battle_units
language plpgsql security definer set search_path = public as $$
declare me players; b battles; u battle_units;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id;
  if not found or b.step <> 'camp' then raise exception 'NOT_CAMP'; end if;
  select * into u from battle_units where player_id = me.id for update;
  return u;
end $$;
revoke execute on function _camp_check(uuid) from public, anon, authenticated;

create or replace function _rare_card() returns text language sql volatile as $$
  select case when r < 0.35 then 'mega_sweep' when r < 0.65 then 'full_heal' when r < 0.85 then 'overcharge' else 'revive' end from (select random() r) x;
$$;

create or replace function _price(p_base int, u battle_units) returns int language sql immutable as $$
  select round(p_base * case when u.price_up then 1.2 else 1 end)::int;
$$;

create or replace function get_camp(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; u battle_units; ct text; pt text;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id;
  if not found then return null; end if;
  select * into u from battle_units where player_id = me.id;
  if u.casino_round > 0 then select text into ct from prompts where id = u.casino_prompts[u.casino_round]; end if;
  if u.puzzle_kind is not null then select text into pt from prompts where id = u.puzzle_prompt; end if;
  return jsonb_build_object(
    'gold', u.gold, 'path', u.path, 'pbonus', u.pbonus, 'ready', u.ready, 'flags', to_jsonb(u.camp_flags), 'price_up', u.price_up,
    'camp_ends', b.camp_ends, 'stage', b.stage, 'oath', b.oath,
    'ready_count', (select count(*) from battle_units where room_id = me.room_id and side = 'hero' and ready),
    'hero_count', (select count(*) from battle_units where room_id = me.room_id and side = 'hero'),
    'casino', jsonb_build_object('active', u.casino_round > 0, 'round', u.casino_round, 'wins', u.casino_wins, 'stake', u.casino_stake,
      'prompt', ct, 'ends_at', u.casino_ends, 'closed', u.casino_won >= 600, 'lucky', u.casino_lucky),
    'puzzle', case when u.puzzle_kind is not null then jsonb_build_object('kind', u.puzzle_kind, 'text', coalesce(u.puzzle_scr, pt), 'ends_at', u.puzzle_ends) end,
    'shop', jsonb_build_array(
      jsonb_build_object('id','tea','name','Herbal Tea','desc','Heal the whole party 30%','price',_price(25,u)),
      jsonb_build_object('id','whetstone','name','Whetstone','desc','+8% Power for the rest of the run','price',_price(60,u)),
      jsonb_build_object('id','charm','name','Iron Charm','desc','+12 max HP (and heal 12)','price',_price(55,u)),
      jsonb_build_object('id','pack','name','Card Pack','desc','A random card','price',_price(45,u)),
      jsonb_build_object('id','ward','name','Ward','desc','Start the next fight with +25 shield','price',_price(40,u)),
      jsonb_build_object('id','rare','name','Rare Card','desc','Mega Sweep, Full Restore, Overcharge or Revive','price',_price(130,u))));
end $$;

create or replace function camp_buy(p_token uuid, p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u battle_units; price int; c text;
begin
  u := _camp_check(p_token);
  price := case p_item when 'tea' then 25 when 'whetstone' then 60 when 'charm' then 55 when 'pack' then 45 when 'ward' then 40 when 'rare' then 130 else null end;
  if price is null then raise exception 'BAD_ITEM'; end if;
  price := _price(price, u);
  if u.gold < price then raise exception 'NO_GOLD'; end if;
  if p_item in ('pack','rare') and cardinality(u.cards) >= 4 then raise exception 'HAND_FULL'; end if;
  if p_item = 'whetstone' and u.pbonus >= 0.6 then raise exception 'MAXED'; end if;
  update battle_units set gold = gold - price where id = u.id;
  if p_item = 'tea' then
    update battle_units set hp = least(max_hp, hp + round(max_hp * 0.3)) where room_id = u.room_id and side = 'hero';
  elsif p_item = 'whetstone' then update battle_units set pbonus = pbonus + 0.08 where id = u.id;
  elsif p_item = 'charm' then update battle_units set max_hp = max_hp + 12, hp = hp + 12 where id = u.id;
  elsif p_item = 'ward' then update battle_units set shield = shield + 25 where id = u.id;
  elsif p_item = 'pack' then
    c := (array['sweep','heal_all','cleanse'])[1 + floor(random() * 3)::int];
    update battle_units set cards = cards || c where id = u.id;
  else
    c := _rare_card();
    update battle_units set cards = cards || c where id = u.id;
  end if;
  return jsonb_build_object('ok', true, 'card', c);
end $$;

create or replace function camp_rest(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u battle_units;
begin
  u := _camp_check(p_token);
  if 'rest' = any(u.camp_flags) then raise exception 'ALREADY_USED'; end if;
  update battle_units set hp = least(max_hp, hp + round(max_hp * 0.2)), camp_flags = array_append(camp_flags, 'rest'::text) where id = u.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function camp_ready(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u battle_units; pending int;
begin
  u := _camp_check(p_token);
  update battle_units set ready = true where id = u.id;
  select count(*) into pending from battle_units where room_id = u.room_id and side = 'hero' and not ready;
  if pending = 0 then perform _next_stage(u.room_id); else perform _bump(u.room_id, 'camp_ready', '{}'); end if;
end $$;

create or replace function camp_step(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me players; b battles;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id;
  if found and b.step = 'camp' and now() > b.camp_ends then perform _next_stage(me.room_id); end if;
end $$;

-- Casino: 5 timed prompts, stake gold. 3+ right pays, 5 right pays big. Gambler pathway gets a free retry and better odds.
create or replace function casino_start(p_token uuid, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u battle_units; arr bigint[] := '{}'; i int; v bigint; t text;
begin
  u := _camp_check(p_token);
  if u.casino_round > 0 then raise exception 'IN_PROGRESS'; end if;
  if u.casino_won >= 600 then raise exception 'HOUSE_CLOSED'; end if;
  if p_stake is null or p_stake < 10 or p_stake > u.gold then raise exception 'BAD_STAKE'; end if;
  for i in 1..5 loop v := _pick_prompt(u.room_id); arr := arr || v; end loop;
  update battle_units set gold = gold - p_stake, casino_stake = p_stake, casino_round = 1, casino_wins = 0, casino_prompts = arr,
    casino_ends = now() + interval '14 seconds', casino_lucky = (coalesce(path,'') = 'gambler') where id = u.id;
  select text into t from prompts where id = arr[1];
  return jsonb_build_object('round', 1, 'prompt', t, 'ends_at', now() + interval '14 seconds');
end $$;

create or replace function casino_answer(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u battle_units; w text; v_lang text; expired boolean; hit boolean := false; mult numeric; pay int; wins int; t text;
begin
  u := _camp_check(p_token);
  if u.casino_round = 0 then raise exception 'NO_CASINO'; end if;
  w := lower(trim(coalesce(p_word, '')));
  expired := now() > u.casino_ends + interval '1 second';
  select coalesce(settings->>'lang','en') into v_lang from rooms where id = u.room_id;
  if not expired and w <> '' then
    if w ~ '^[a-z]{2,20}$' and exists (select 1 from words where word = w and lang = v_lang) and _fits(u.casino_prompts[u.casino_round], w) then
      hit := true;
    else
      return jsonb_build_object('ok', false, 'reason', 'WRONG');   -- retry until the clock runs out
    end if;
  end if;
  if not hit and u.casino_lucky then hit := true; update battle_units set casino_lucky = false where id = u.id; end if;
  wins := u.casino_wins + case when hit then 1 else 0 end;
  if u.casino_round >= 5 then
    mult := case wins when 5 then 3.2 when 4 then 2.2 when 3 then 1.5 else 0 end + case when u.path = 'gambler' and wins >= 3 then 0.4 else 0 end;
    pay := floor(u.casino_stake * mult)::int;
    update battle_units set gold = gold + pay, casino_won = casino_won + greatest(0, pay - u.casino_stake), casino_round = 0, casino_wins = wins where id = u.id;
    return jsonb_build_object('ok', true, 'done', true, 'hit', hit, 'wins', wins, 'stake', u.casino_stake, 'payout', pay);
  end if;
  update battle_units set casino_round = casino_round + 1, casino_wins = wins, casino_ends = now() + interval '14 seconds' where id = u.id;
  select text into t from prompts where id = u.casino_prompts[u.casino_round + 1];
  return jsonb_build_object('ok', true, 'done', false, 'hit', hit, 'wins', wins, 'round', u.casino_round + 1, 'prompt', t, 'ends_at', now() + interval '14 seconds');
end $$;

-- Pathways: pick one per hero. Each grants a camp feature and a perk.
create or replace function pick_pathway(p_token uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare u battle_units;
begin
  u := _camp_check(p_token);
  if u.path is not null then raise exception 'ALREADY_PICKED'; end if;
  if p_path not in ('gambler','thief','hacker','oracle','villain','hero') then raise exception 'BAD_PATH'; end if;
  update battle_units set path = p_path where id = u.id;
end $$;

create or replace function path_open(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u battle_units; b battles; v bigint; t text; w text; scr text; v_lang text; k int := 0; nm text;
begin
  u := _camp_check(p_token);
  select * into b from battles where room_id = u.room_id;
  if u.path is null then raise exception 'NO_PATH'; end if;
  if 'path' = any(u.camp_flags) then raise exception 'ALREADY_USED'; end if;
  if u.puzzle_kind is not null then raise exception 'IN_PROGRESS'; end if;
  if u.path = 'gambler' then
    update battle_units set gold = gold + 25, camp_flags = array_append(camp_flags, 'path'::text) where id = u.id;
    return jsonb_build_object('kind', 'gambler', 'gold', 25);
  elsif u.path = 'oracle' then
    nm := case b.stage + 1 when 2 then 'Two Clerks guarding The Collector (he garnishes your Power)' when 3 then 'Filer Alpha, Filer Beta and two Interns'
         when 4 then 'Three Bailiffs and The Commissioner (locks 3 letters)' when 5 then 'THE GOVERNMENT and two Tax Drones: Red Tape, Taxes, Tax Season' else 'Three Intern Auditors' end;
    update battle_units set camp_flags = array_append(camp_flags, 'path'::text) where id = u.id;
    return jsonb_build_object('kind', 'oracle', 'text', nm);
  elsif u.path = 'villain' then
    if u.pacts >= 2 then raise exception 'PACT_LIMIT'; end if;
    update battle_units set max_hp = round(max_hp * 0.8), hp = least(hp, round(max_hp * 0.8)), pbonus = pbonus + 0.25, pacts = pacts + 1, camp_flags = array_append(camp_flags, 'path'::text) where id = u.id;
    return jsonb_build_object('kind', 'villain', 'text', 'Dark Pact sealed: -20% max HP, +25% Power');
  elsif u.path = 'hero' then
    update battles set oath = true where room_id = u.room_id;
    update battle_units set camp_flags = array_append(camp_flags, 'path'::text) where id = u.id;
    return jsonb_build_object('kind', 'hero', 'text', 'Sacred Oath sworn: the party starts the next fight with +2 ultimate charge and a 20 shield');
  elsif u.path = 'thief' then
    v := _pick_prompt(u.room_id); select text into t from prompts where id = v;
    update battle_units set puzzle_kind = 'heist', puzzle_prompt = v, puzzle_scr = null, puzzle_ans = null, puzzle_ends = now() + interval '15 seconds', camp_flags = array_append(camp_flags, 'path'::text) where id = u.id;
    return jsonb_build_object('kind', 'heist', 'text', t, 'ends_at', now() + interval '15 seconds');
  else
    select coalesce(settings->>'lang','en') into v_lang from rooms where id = u.room_id;
    select word into w from words where lang = v_lang and char_length(word) between 5 and 7 and word ~ '^[a-z]+$' order by random() limit 1;
    loop
      k := k + 1;
      select string_agg(c, '' order by random()) into scr from regexp_split_to_table(w, '') c;
      exit when scr <> w or k > 8;
    end loop;
    update battle_units set puzzle_kind = 'vault', puzzle_prompt = null, puzzle_ans = w, puzzle_scr = scr, puzzle_ends = now() + interval '20 seconds', camp_flags = array_append(camp_flags, 'path'::text) where id = u.id;
    return jsonb_build_object('kind', 'vault', 'text', scr, 'ends_at', now() + interval '20 seconds');
  end if;
end $$;

create or replace function path_answer(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u battle_units; w text; v_lang text; expired boolean; ok boolean := false; r double precision; reward text; c text;
begin
  u := _camp_check(p_token);
  if u.puzzle_kind is null then raise exception 'NO_PUZZLE'; end if;
  w := lower(trim(coalesce(p_word, '')));
  expired := now() > u.puzzle_ends + interval '1 second';
  select coalesce(settings->>'lang','en') into v_lang from rooms where id = u.room_id;
  if not expired and w <> '' then
    if u.puzzle_kind = 'heist' then
      ok := w ~ '^[a-z]{2,20}$' and exists (select 1 from words where word = w and lang = v_lang) and _fits(u.puzzle_prompt, w);
    else
      ok := (w = u.puzzle_ans) or (w ~ '^[a-z]{5,7}$' and exists (select 1 from words where word = w and lang = v_lang)
            and (select string_agg(x, '' order by x) from regexp_split_to_table(w, '') x) = (select string_agg(x, '' order by x) from regexp_split_to_table(u.puzzle_ans, '') x));
    end if;
    if not ok then return jsonb_build_object('ok', false, 'reason', 'WRONG'); end if;
  end if;
  update battle_units set puzzle_kind = null, puzzle_ends = null where id = u.id;
  if not ok then
    if u.puzzle_kind = 'heist' then update battle_units set gold = greatest(0, gold - 20) where id = u.id; return jsonb_build_object('ok', false, 'reason', 'FAILED', 'text', 'Caught! -20 gold');
    else update battle_units set price_up = true where id = u.id; return jsonb_build_object('ok', false, 'reason', 'FAILED', 'text', 'The vault locks. Shop prices rise 20%'); end if;
  end if;
  if u.puzzle_kind = 'heist' then
    r := random();
    if r < 0.4 and u.pbonus < 0.6 then update battle_units set pbonus = pbonus + 0.08, gold = gold + 40 where id = u.id; reward := 'Whetstone';
    elsif r < 0.7 and cardinality(u.cards) < 4 then c := _rare_card(); update battle_units set cards = cards || c, gold = gold + 40 where id = u.id; reward := 'a rare card';
    else update battle_units set max_hp = max_hp + 12, hp = hp + 12, gold = gold + 40 where id = u.id; reward := 'an Iron Charm'; end if;
    return jsonb_build_object('ok', true, 'text', 'Heist! You stole ' || reward || ' and 40 gold');
  else
    if cardinality(u.cards) < 4 then c := _rare_card(); update battle_units set cards = cards || c, gold = gold + 60 where id = u.id;
    else update battle_units set gold = gold + 120 where id = u.id; end if;
    return jsonb_build_object('ok', true, 'text', 'Vault cracked! A rare card and 60 gold');
  end if;
end $$;

revoke execute on function get_camp(uuid), camp_buy(uuid,text), camp_rest(uuid), camp_ready(uuid), camp_step(uuid), casino_start(uuid,int), casino_answer(uuid,text),
  pick_pathway(uuid,text), path_open(uuid), path_answer(uuid,text) from public;
grant execute on function get_camp(uuid), camp_buy(uuid,text), camp_rest(uuid), camp_ready(uuid), camp_step(uuid), casino_start(uuid,int), casino_answer(uuid,text),
  pick_pathway(uuid,text), path_open(uuid), path_answer(uuid,text) to anon, authenticated;

-- 045: fixes for 044 (array append literal, null-safe gambler check)
create or replace function camp_rest(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u battle_units;
begin
  u := _camp_check(p_token);
  if 'rest' = any(u.camp_flags) then raise exception 'ALREADY_USED'; end if;
  update battle_units set hp = least(max_hp, hp + round(max_hp * 0.2)), camp_flags = array_append(camp_flags, 'rest'::text) where id = u.id;
  return jsonb_build_object('ok', true);
end $$;

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

grant execute on function camp_rest(uuid), casino_start(uuid,int), path_open(uuid) to anon, authenticated;

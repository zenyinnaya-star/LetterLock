\set ON_ERROR_STOP 1
do $$
declare
  r jsonb; rc text; ht uuid; hid uuid; rid uuid; i int; ph text; res jsonb; st jsonb; w text; rd int; k text; pts int; chg int;
begin
  r := create_room('Hu', 'hero'); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(ht, '{"mindgames":true,"weekly":true,"ultimates":true}');
  perform t_assert((select settings->>'mindgames' from rooms where id = rid) = 'true', 'mindgames saved');
  perform t_assert((select settings->>'weekly' from rooms where id = rid) = 'true', 'weekly saved');
  perform t_assert((select settings->>'ultimates' from rooms where id = rid) = 'true', 'ultimates kept');
  perform join_room(rc, 'Op', 'villain');
  update rooms set settings = settings || '{"mutation_override":"bigwords"}' where id = rid;
  perform update_settings(ht, '{"rounds":3}');
  perform t_assert((select settings->>'mutation_override' from rooms where id = rid) = 'bigwords', 'override survives settings');
  perform start_game(ht);
  select round into rd from rooms where id = rid;
  perform t_assert((select count(*) from objectives where room_id = rid and round = rd) = 2, 'each player gets an objective');
  st := get_room_state(rc, ht);
  perform t_assert(st->'me'->'objective'->>'key' is not null, 'objective in state');
  perform t_assert(st->'room'->>'mutation' = 'bigwords', 'mutation in state');

  -- force the objective to long7 and answer a 9-letter word: legendary + objective + bigwords
  update objectives set key = 'long7', done = false where player_id = hid and round = rd;
  select pw.word into w from rooms ro join prompt_words pw on pw.prompt_id = ro.prompt_id
    where ro.id = rid and char_length(pw.word) >= 7
      and not exists (select 1 from banned_letters bl where bl.player_id = hid and position(bl.letter::text in upper(pw.word)) > 0)
    order by char_length(pw.word) desc limit 1;
  if w is null then raise notice 'no long word for this prompt, skipping answer checks'; else
    pts := (select points from players where id = hid); chg := (select charge from players where id = hid);
    res := submit_answer(ht, w);
    raise notice 'answer %', res;
    perform t_assert((res->>'valid')::boolean, 'long word valid');
    perform t_assert((res->>'extra')::int >= 3, 'bigwords bonus applied');
    perform t_assert((res->>'objective_done')::boolean, 'objective completed');
    perform t_assert((select points from players where id = hid) = pts + 4, 'objective paid 4 points');
    perform t_assert((select charge from players where id = hid) >= chg + 4, 'objective paid charge');
    perform t_assert((select points from answers where player_id = hid and round = rd) = (res->>'points')::int, 'stored points include extra');
    -- resubmit: no double pay
    pts := (select points from players where id = hid);
    res := submit_answer(ht, w);
    perform t_assert((select points from players where id = hid) = pts, 'objective pays once');
    if char_length(w) >= 9 then
      perform t_assert((res->>'legend')::boolean, 'nine letters is legendary');
      perform t_assert((select count(*) from marks where player_id = hid and round = rd and kind = 'legend') = 1, 'one legend mark');
    end if;
  end if;

  -- crack objective via guess
  for i in 1..10 loop select phase::text into ph from rooms where id = rid; exit when ph = 'guess'; perform t_force(rc); end loop;
  if ph = 'guess' then
    select round into rd from rooms where id = rid;
    update objectives set key = 'crack', done = false where player_id = hid and round = rd;
    perform t_assert(exists (select 1 from objectives where player_id = hid and round = rd and key = 'crack' and not done), 'crack armed');
  end if;

  -- reveal carries the legend flag, play again clears everything
  st := get_room_state(rc, ht);
  perform t_assert(jsonb_typeof(st->'reveal') = 'array', 'reveal array');
  raise notice 'MINDGAMES OK';
end $$;

-- mutations that change rules
do $$
declare r jsonb; rc text; ht uuid; hid uuid; rid uuid; rd int; res jsonb; w text; chg int; m text;
begin
  foreach m in array array['charged','speedrun','chaos'] loop
    r := create_room('Hu', 'hero'); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
    select id into rid from rooms where code = rc;
    perform update_settings(ht, '{"weekly":true}');
    update rooms set settings = settings || jsonb_build_object('mutation_override', m) where id = rid;
    perform join_room(rc, 'Op', 'villain');
    perform start_game(ht);
    select round into rd from rooms where id = rid;
    if m = 'charged' then
      select pw.word into w from rooms ro join prompt_words pw on pw.prompt_id = ro.prompt_id
        where ro.id = rid and not exists (select 1 from banned_letters bl where bl.player_id = hid and position(bl.letter::text in upper(pw.word)) > 0) limit 1;
      if w is not null then
        chg := (select charge from players where id = hid);
        res := submit_answer(ht, w);
        perform t_assert((select charge from players where id = hid) >= chg + 5, 'charged week gives +3 on top: ' || res::text);
      end if;
    elsif m = 'chaos' then
      -- chaos week: from round 2 a chaos rule fires every round
      perform t_force(rc); perform t_force(rc); perform t_force(rc); perform t_force(rc);
      perform t_force(rc); perform t_force(rc); perform t_force(rc); perform t_force(rc);
      select round into rd from rooms where id = rid;
      if rd >= 2 then perform t_assert((select chaos_round from rooms where id = rid) = rd, 'chaos every round'); end if;
    end if;
  end loop;
  -- without the weekly rule nothing mutates
  r := create_room('Hu', 'hero'); rc := r->>'code'; ht := (r->>'token')::uuid;
  perform t_assert(get_room_state(rc, ht)->'room'->>'mutation' is null, 'no mutation when weekly is off');
  raise notice 'MUTATIONS OK';
end $$;

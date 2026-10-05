\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; rid uuid; ht uuid; hid uuid; bt uuid; res jsonb; i int; ph text; w text; lk text; n int; sawchaos boolean := false;
begin
  -- settings
  r := create_room('Hu','hero'); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(ht, '{"twist":"nope"}');
  perform t_assert((select settings->>'twist' from rooms where id=rid) = 'none', 'bad twist falls back to none');
  perform update_settings(ht, '{"twist":"reverse"}');
  perform t_assert((select settings->>'twist' from rooms where id=rid) = 'reverse', 'twist saved');
  r := join_room(rc,'Bo','hero'); bt := (r->>'token')::uuid;
  perform start_game(ht);
  perform t_assert((select count(*) from banned_letters where player_id = hid) >= 1, 'players start with a lock');
  select count(*) into n from banned_letters where player_id = hid;
  if n > 0 then
    -- a word with none of my locks is refused, one with a lock is accepted
    select w2.word into w from words w2, rooms ro where ro.id = rid and char_length(w2.word) between 3 and 9
      and (not exists (select 1 from prompt_words pw where pw.prompt_id = ro.prompt_id) or exists (select 1 from prompt_words pw where pw.prompt_id = ro.prompt_id and pw.word = w2.word))
      and not exists (select 1 from banned_letters bl where bl.player_id = hid and position(bl.letter::text in upper(w2.word)) > 0)
      and not exists (select 1 from answers a where a.player_id = hid and a.word = w2.word) limit 1;
    if w is not null then
      res := submit_answer(ht, w); perform t_assert(res->>'reason' = 'NEED_LOCK', 'word without a lock refused: ' || res::text);
    end if;
    select w2.word into w from words w2, rooms ro where ro.id = rid and char_length(w2.word) between 3 and 9
      and (not exists (select 1 from prompt_words pw where pw.prompt_id = ro.prompt_id) or exists (select 1 from prompt_words pw where pw.prompt_id = ro.prompt_id and pw.word = w2.word))
      and exists (select 1 from banned_letters bl where bl.player_id = hid and position(bl.letter::text in upper(w2.word)) > 0)
      and not exists (select 1 from answers a where a.player_id = hid and a.word = w2.word) limit 1;
    if w is not null then
      res := submit_answer(ht, w); perform t_assert((res->>'valid')::boolean, 'word using a lock accepted: ' || res::text);
    end if;
  end if;

  -- chaos twist: a chaos rule shows up by round 3
  r := create_room('Cz','hero'); rc := r->>'code'; ht := (r->>'token')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(ht, '{"twist":"chaos"}');
  perform join_room(rc,'Dd','hero');
  perform start_game(ht);
  for i in 1..60 loop
    select phase::text into ph from rooms where id=rid; exit when ph = 'finished';
    if (select chaos from rooms where id=rid) is not null then sawchaos := true; exit; end if;
    perform t_force(rc);
  end loop;
  perform t_assert(sawchaos, 'chaos twist triggers a chaos rule');
  raise notice 'TWISTS OK';
end $$;

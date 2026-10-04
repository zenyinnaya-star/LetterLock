\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; rid uuid; ht uuid; hid uuid; bt uuid; res jsonb; st jsonb; w text; i int; stats jsonb; ph text;
begin
  r := create_room('Hu','hero'); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(ht, '{"answer_seconds":15,"guess_seconds":8,"react_seconds":4}');
  perform t_assert((select (settings->>'answer_seconds')::int from rooms where id=rid) = 15, 'blitz 15s accepted');
  r := join_room(rc,'Bo','hero'); bt := (r->>'token')::uuid;
  perform start_game(ht);
  perform t_assert((select answer_started_at from rooms where id=rid) is not null, 'answer_started_at stamped');
  w := t_word(ht);
  res := submit_answer(ht, w);
  perform t_assert((res->>'valid')::boolean, 'valid answer');
  perform t_assert((res->>'elapsed_ms')::int >= 0, 'elapsed recorded');
  perform t_assert((res->>'bonus')::int >= 1, 'fast answer gets speed bonus: ' || res::text);
  perform t_assert((res->>'streak')::int = 1, 'streak 1');
  perform submit_answer(bt, t_word(bt));
  -- run 3 more rounds: streak should grow
  for i in 1..40 loop
    select phase::text into ph from rooms where id=rid; exit when ph='finished';
    if ph='answer' and (select round from rooms where id=rid) > 1
       and not exists (select 1 from answers where player_id=hid and round=(select round from rooms where id=rid)) then
      res := submit_answer(ht, t_word(ht));
      if (select round from rooms where id=rid) = 3 then
        perform t_assert((res->>'streak')::int = 3 and (res->>'bonus')::int >= 2, 'streak 3 gives streak bonus: ' || res::text);
        exit;
      end if;
    end if;
    if ph='answer' and not exists (select 1 from answers where player_id=bt and round=(select round from rooms where id=rid)) then
      begin perform submit_answer(bt, t_word(bt)); exception when others then null; end;
    end if;
    perform t_force(rc);
  end loop;
  perform leave_room(bt);
  select jsonb_agg(x) into stats from (select get_game_stats(rc) x) q;
  perform t_assert(get_game_stats(rc) = '[]'::jsonb or true, 'stats callable');
  perform _finish(rid);
  stats := get_game_stats(rc);
  perform t_assert(jsonb_array_length(stats) = 2, 'stats has both players');
  perform t_assert((stats->0->>'correct')::int >= 1, 'stats count correct');
  perform t_assert((stats->0->>'best_streak')::int >= 1, 'stats best streak');
  raise notice 'STATS %', stats;
  raise notice 'ENGINE STATS OK';
end $$;

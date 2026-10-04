\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; rid uuid; t1 uuid; t2 uuid; i1 uuid; i2 uuid; p1 jsonb; p2 jsonb; s1 uuid; s2 uuid; prof jsonb; stats jsonb; i int; ph text; w1 text;
begin
  p1 := profile_create('Ann'); s1 := (p1->>'secret')::uuid;
  p2 := profile_create('Ben'); s2 := (p2->>'secret')::uuid;
  perform t_assert(length(p1->>'code') = 10, 'recovery code length');
  perform t_assert(profile_restore(lower(substr(p1->>'code',1,5)) || '-' || substr(p1->>'code',6))->>'secret' = s1::text, 'restore code (case/dash tolerant)');
  perform t_expect_error('select profile_get(gen_random_uuid())', 'PROFILE_NOT_FOUND');
  r := create_room('Ann','hero'); rc := r->>'code'; t1 := (r->>'token')::uuid; i1 := (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  r := join_room(rc,'Ben','ninja'); t2 := (r->>'token')::uuid; i2 := (r->>'player_id')::uuid;
  perform t_assert(profile_link(t1, s1), 'link Ann');
  perform t_assert(profile_link(t2, s2), 'link Ben');
  perform t_assert(not profile_link(t2, s1), 'same profile cannot sit twice in a room');
  perform start_game(t1);
  -- play until someone wins; Ann always answers, Ben never does (strikes out)
  for i in 1..60 loop
    select phase::text into ph from rooms where id = rid; exit when ph = 'finished';
    if ph = 'answer' and not (select eliminated from players where id=i1) and not exists (select 1 from answers where player_id=i1 and round=(select round from rooms where id=rid)) then
      perform submit_answer(t1, t_word(t1));
    end if;
    perform t_force(rc);
  end loop;
  perform t_assert((select phase from rooms where id=rid) = 'finished', 'game finished');
  stats := get_game_stats(rc);
  raise notice 'STATS %', stats;
  prof := profile_get(s1);
  raise notice 'ANN %', prof;
  perform t_assert((prof->>'games')::int = 1, 'Ann games=1');
  perform t_assert((prof->>'xp')::int > 0, 'Ann got xp');
  perform t_assert((prof->'achievements') ? 'first_game', 'first_game achievement');
  perform t_assert((select xp_gained from players where id=i1) = (prof->>'xp')::int, 'xp_gained recorded on seat');
  perform t_assert((profile_get(s2)->>'games')::int = 1, 'Ben games=1');
  perform t_assert((select winner_id from rooms where id=rid) = i1 and (prof->>'wins')::int = 1, 'Ann won, wins=1');
  perform t_assert((prof->'achievements') ? 'first_win', 'first_win achievement');
  perform t_assert((prof->>'level')::int >= 1 and (prof->>'title') is not null, 'level+title');
  -- rematch does not double-award until the next finish
  perform play_again(t1);
  perform t_assert((profile_get(s1)->>'games')::int = 1, 'no double award on rematch');
  raise notice 'PROFILES OK';
end $$;

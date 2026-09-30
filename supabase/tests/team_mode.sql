\set ON_ERROR_STOP 1
do $$
declare
  r jsonb; rc text; st jsonb; n int; i int; rid uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; i1 uuid; i2 uuid; i3 uuid; i4 uuid;
  ta uuid; tb uuid; e_letter text; card bigint; pa int; pb int; ph text;
begin
  r := create_room('Ann', 'oracle'); rc := r->>'code'; t1 := (r->>'token')::uuid; i1 := (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(t1, '{"mode":"team","team_size":2,"rounds":2}');
  r := join_room(rc, 'Bob', 'ninja');   t2 := (r->>'token')::uuid; i2 := (r->>'player_id')::uuid;
  r := join_room(rc, 'Cy', 'thief');    t3 := (r->>'token')::uuid; i3 := (r->>'player_id')::uuid;
  r := join_room(rc, 'Di', 'hero');     t4 := (r->>'token')::uuid; i4 := (r->>'player_id')::uuid;
  st := get_room_state(rc, t1);
  perform t_assert(jsonb_array_length(st->'teams') = 2, 'two teams');
  perform t_assert((select count(*) from players where room_id = rid and team_id is not null) = 4, 'all seated');
  perform t_assert((select count(*) from players where room_id = rid group by team_id order by 1 limit 1) = 2, '2 per team');
  perform t_assert((select count(*) from teams where room_id = rid and leader_id is not null) = 2, 'leaders set');
  perform t_expect_error(format('select join_room(%L,%L,%L)', rc, 'Extra', 'ninja'), 'ROOM_FULL');
  perform team_update(t1, 'Rockets', null, false);
  perform t_assert((select name from teams where id = (select team_id from players where id = i1)) = 'Rockets', 'rename');
  perform t_expect_error(format('select team_update(%L::uuid, %L, null, false)', t3, 'X'), 'NOT_LEADER');
  -- start
  perform start_game(t1);
  perform t_assert((select phase from rooms where id = rid) = 'answer', 'answer phase');
  perform t_assert((select count(distinct letter) from banned_letters b join players p on p.id=b.player_id where p.room_id=rid and p.team_id=(select team_id from players where id=i1)) = 1, 'team A shares 1 letter');
  -- everyone answers
  perform submit_answer(t1, t_word(t1)); perform submit_answer(t2, t_word(t2));
  perform submit_answer(t3, t_word(t3)); perform submit_answer(t4, t_word(t4));
  perform t_force(rc);
  perform t_assert((select coalesce(sum(points),0) from players where room_id=rid) > 0, 'points awarded');
  perform t_assert((select coalesce(sum(strikes),0) from players where room_id=rid) = 0, 'no strikes');
  perform t_force(rc); -- to guess
  st := get_room_state(rc, t1);
  perform t_assert(st->'me'->>'team_id' is not null, 'me.team_id');
  -- enemy letter guess
  select p.id into ta from players p where p.room_id=rid and p.team_id <> (select team_id from players where id=i1) limit 1;
  e_letter := (select letter::text from banned_letters where player_id = ta limit 1);
  perform t_expect_error(format('select submit_guess(%L::uuid,%L::uuid,%L)', t1, i3, 'a'), 'CANNOT_TARGET_TEAMMATE');
  perform submit_guess(t1, ta, e_letter);
  perform t_assert((select count(*) from banned_letters b join players p on p.id=b.player_id where p.team_id=(select team_id from players where id=ta) and b.letter::text=e_letter and b.revealed) >= 1, 'enemy letter revealed');
  perform t_force(rc); -- react
  perform t_force(rc); -- next round or finish
  perform t_assert((select round from rooms where id=rid) = 2, 'round 2');
  perform t_assert((select count(*) from banned_letters b join players p on p.id=b.player_id where p.room_id=rid and p.team_id=(select team_id from players where id=i1)) >= 2, 'locks accrued');
  perform submit_answer(t1, t_word(t1)); perform submit_answer(t2, t_word(t2));
  perform submit_answer(t3, t_word(t3)); perform submit_answer(t4, t_word(t4));
  for i in 1..6 loop exit when (select phase from rooms where id=rid) = 'finished'; perform t_force(rc); end loop;
  ph := (select phase from rooms where id=rid);
  perform t_assert(ph = 'finished', 'finished after 2 rounds, got '||ph);
  st := get_room_state(rc, t1);
  raise notice 'winner_team=% teams=%', st->'room'->>'winner_team', st->'teams';
  perform play_again(t1);
  perform t_assert((select phase from rooms where id=rid) = 'lobby', 'play again');
  perform t_assert((select count(*) from teams where room_id=rid and name='Rockets') = 1, 'rematch keeps team name');
  perform t_assert((select count(*) from players where room_id=rid and team_id is not null) = 4, 'rematch keeps seats');
  raise notice 'TEAM TESTS OK';
end $$;

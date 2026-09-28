\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; ta uuid; tb uuid; tc uuid; ia uuid; ib uuid; ic uuid; st jsonb; c bigint; f jsonb;
begin
  r := create_room('Sa', 'ninja'); rc := r->>'code'; ta := (r->>'token')::uuid; ia := (r->>'player_id')::uuid;
  r := join_room(rc, 'Sb', 'villain'); tb := (r->>'token')::uuid; ib := (r->>'player_id')::uuid;
  r := join_room(rc, 'Sc', 'hero'); tc := (r->>'token')::uuid; ic := (r->>'player_id')::uuid;
  st := get_room_state(rc, ta);
  perform t_assert((select p->>'class' from jsonb_array_elements(st->'players') p where p->>'id' = ib::text) is null, 'lobby: other classes hidden');
  perform t_assert((select p->>'class' from jsonb_array_elements(st->'players') p where p->>'id' = ia::text) = 'ninja', 'lobby: own class visible');
  perform set_avatar(ta, 'https://cnzdjksuracagdsjbosj.supabase.co/storage/v1/object/public/avatars/0f8fad5b-d9cb-469f-a165-70867728950e.jpg');
  perform t_expect_error(format('select set_avatar(%L::uuid, %L)', ta, 'https://evil.com/x.jpg'), 'BAD_AVATAR');
  perform start_game(ta);
  perform submit_answer(ta, t_word(ta)); perform submit_answer(tb, t_word(tb)); perform submit_answer(tc, t_word(tc));
  perform t_force(rc); perform t_force(rc);
  insert into cards (room_id, owner_id, kind) select id, ib, 'attack' from rooms where code = rc returning id into c;
  perform play_card(tb, c, ia);
  st := get_room_state(rc, ta);
  f := st->'feed'->-1;
  perform t_assert(f->>'type' = 'attack' and f->'from' = 'null'::jsonb and f->>'from_class' = 'villain' and f->>'to' = ia::text, 'feed: the Villain attacked, identity hidden');
  st := get_room_state(rc, tb);
  perform t_assert(st->'feed'->-1->>'from' = ib::text, 'attacker sees own action as theirs');
  perform t_force(rc);
  st := get_room_state(rc, ta);
  perform t_assert(st->'pending'->0->'source_id' = 'null'::jsonb and st->'pending'->0->>'source_class' = 'villain', 'pending: source hidden, class shown');
  perform t_assert((st->'players'->0->>'avatar_url') like 'https://%', 'avatar in state');
  perform t_assert(not exists (select 1 from events e join rooms r2 on r2.id = e.room_id where r2.code = rc and e.payload ? 'class'), 'no class in any event payload');
  update rooms set phase = 'finished' where code = rc;
  st := get_room_state(rc, ta);
  perform t_assert((select p->>'class' from jsonb_array_elements(st->'players') p where p->>'id' = ib::text) = 'villain', 'finished: classes revealed');
  raise notice 'ALL SECRET CLASS TESTS PASSED';
end $$;

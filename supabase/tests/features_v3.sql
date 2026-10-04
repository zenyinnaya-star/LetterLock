-- Settings, 12 players, Hacker + trace, rage-quit feed. Needs helpers from simulate_game.sql.
\set ON_ERROR_STOP 1
do $$
declare
  r jsonb; rc text; th uuid; tx uuid; tv uuid; idh uuid; idx uuid; idv uuid; s jsonb; c bigint; i int; st jsonb;
begin
  -- settings + capacity
  r := create_room('Host', 'hero'); rc := r->>'code'; th := (r->>'token')::uuid; idh := (r->>'player_id')::uuid;
  s := update_settings(th, '{"max_players": 99, "answer_seconds": 45, "guess_seconds": 3, "cards": true, "strikes": 3, "shrink": false}');
  perform t_assert((s->>'max_players')::int = 12, 'max players clamped to 12');
  perform t_assert((s->>'guess_seconds')::int = 8, 'guess seconds clamped to 8');
  perform t_assert((s->>'strikes')::int = 3, 'strikes setting stored');
  for i in 1..11 loop perform join_room(rc, 'P' || i, 'ninja'); end loop;
  perform t_expect_error(format('select join_room(%L, %L, %L)', rc, 'P12', 'hero'), 'ROOM_FULL');
  perform t_assert((select count(*) from players p join rooms r2 on r2.id = p.room_id where r2.code = rc) = 12, '12 players seated');
  st := get_room_state(rc, th);
  perform t_assert((st->'room'->'settings'->>'answer_seconds')::int = 45, 'settings in state');
  perform t_expect_error(format('select update_settings(%L::uuid, %L::jsonb)',
    (select token from players where name = 'P1' and room_id = (select id from rooms where code = rc)), '{}'), 'NOT_HOST');
  perform start_game(th);
  perform t_assert((get_room_state(rc, th)->'room'->>'answer_seconds')::int = 45, 'answer timer from settings');
  perform t_assert(extract(epoch from (select phase_ends_at - now() from rooms where code = rc)) between 43 and 46, 'phase clock uses setting');

  -- hacker flow (3 players so it isn't a duel)
  r := create_room('Hax', 'hacker'); rc := r->>'code'; tx := (r->>'token')::uuid; idx := (r->>'player_id')::uuid;
  r := join_room(rc, 'Vic', 'hero');   tv := (r->>'token')::uuid; idv := (r->>'player_id')::uuid;
  r := join_room(rc, 'Bob', 'ninja');
  perform start_game(tx);
  perform submit_answer(tx, t_word(tx)); perform submit_answer(tv, t_word(tv)); perform submit_answer((r->>'token')::uuid, t_word((r->>'token')::uuid));
  perform t_force(rc); perform t_force(rc);  -- reveal -> guess
  insert into cards (room_id, owner_id, kind) select id, idx, 'attack' from rooms where code = rc returning id into c;
  r := play_card(tx, c, idv);
  perform t_assert(r->>'kind' = 'hack', 'hacker attack becomes a hack');
  st := get_room_state(rc, tv);
  perform t_assert((st->'feed'->-1->>'type') = 'hack' and (st->'feed'->-1->'from') = 'null'::jsonb, 'hack is anonymous in feed');
  perform t_assert(not exists (select 1 from events e join rooms r2 on r2.id = e.room_id
                   where r2.code = rc and e.kind in ('card_played','action') and e.payload::text like '%' || idx::text || '%'), 'hacker id never in public events');
  perform t_force(rc);  -- guess -> react
  perform t_assert((get_room_state(rc, tv)->'pending'->0->'source_id') = 'null'::jsonb, 'pending hides hacker');
  perform t_force(rc);  -- react -> answer (round 2)
  st := get_room_state(rc, tv);
  perform t_assert((st->'me'->>'hacked')::boolean, 'victim is hacked next round');
  perform t_assert((st->'me'->'letters'->0->>'letter') = '?', 'victim letters hidden');
  perform t_assert((st->'me'->>'can_trace')::boolean, 'victim can trace');
  perform t_assert(not (get_room_state(rc, tx)->'me'->>'hacked')::boolean, 'hacker sees own letters');
  r := trace_hacker(tv, idx);
  perform t_assert((r->>'caught')::boolean, 'trace catches hacker');
  perform t_expect_error(format('select trace_hacker(%L::uuid, %L::uuid)', tv, idx), 'NOT_HACKED');
  perform t_assert(not (get_room_state(rc, tv)->'me'->>'hacked')::boolean, 'victim letters restored');
  st := get_room_state(rc, tx);
  perform t_assert((st->'feed'->-1->>'type') = 'caught', 'caught in feed');
  perform t_assert(exists (select 1 from jsonb_array_elements(st->'players') p where (p->>'exposed')::boolean and p->>'id' = idx::text), 'hacker exposed');
  perform t_assert((select hacked_round from players where id = idx) = (select round from rooms where code = rc) + 1, 'hacker goes dark next round');

  -- rage quit
  perform leave_room(tv);
  st := get_room_state(rc, tx);
  perform t_assert((st->'feed'->-1->>'type') = 'chicken' and (st->'feed'->-1->>'name') = 'Vic', 'rage quit hits the feed');
  perform t_assert(exists (select 1 from jsonb_array_elements(st->'players') p where (p->>'quit')::boolean), 'quit flag public');
  raise notice 'ALL V3 FEATURE TESTS PASSED';
end $$;

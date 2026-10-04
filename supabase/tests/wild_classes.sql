\set ON_ERROR_STOP 1
do $$
declare
  r jsonb; rc text; st jsonb; c bigint; n int; i int;
  tm uuid; tg uuid; tt uuid; tp uuid; to_ uuid; tw uuid; tj uuid;
  im uuid; ig uuid; it uuid; ip uuid; io uuid; iw uuid; ij uuid;
  before_j text; before_g text; pts int;
begin
  r := create_room('Mim', 'mimic'); rc := r->>'code'; tm := (r->>'token')::uuid; im := (r->>'player_id')::uuid;
  r := join_room(rc, 'Gam', 'gambler');  tg := (r->>'token')::uuid; ig := (r->>'player_id')::uuid;
  r := join_room(rc, 'Thf', 'thief');    tt := (r->>'token')::uuid; it := (r->>'player_id')::uuid;
  r := join_room(rc, 'Par', 'parasite'); tp := (r->>'token')::uuid; ip := (r->>'player_id')::uuid;
  r := join_room(rc, 'Orc', 'oracle');   to_ := (r->>'token')::uuid; io := (r->>'player_id')::uuid;
  r := join_room(rc, 'Wil', 'wildcard'); tw := (r->>'token')::uuid; iw := (r->>'player_id')::uuid;
  r := join_room(rc, 'Jes', 'jester');   tj := (r->>'token')::uuid; ij := (r->>'player_id')::uuid;
  perform update_settings(tm, '{"strikes": 3}');
  perform start_game(tm);
  perform t_assert((select chaos from rooms where code = rc) is null, 'no chaos in round 1');

  -- Gambler bets and answers well; Parasite latches onto Jes; everyone else answers
  perform use_perk(tg, null);
  perform t_expect_error(format('select use_perk(%L::uuid, null)', tg), 'ALREADY_BET');
  perform use_perk(tp, ij);
  perform submit_answer(tg, t_word(tg)); perform submit_answer(tm, t_word(tm)); perform submit_answer(tt, t_word(tt));
  perform submit_answer(tp, t_word(tp)); perform submit_answer(to_, t_word(to_)); perform submit_answer(tw, t_word(tw));
  perform submit_answer(tj, t_word(tj));
  perform t_force(rc);  -- answer -> reveal
  select points into pts from players where id = ig;
  perform t_assert(pts > 0 and pts = (select 2 * (char_length(word) + 2 * greatest(0, char_length(word) - 6) + bonus) from answers where player_id = ig and round = 1), 'gambler bet doubles points');
  perform t_assert(exists (select 1 from events e join rooms r2 on r2.id = e.room_id where r2.code = rc and e.payload->>'type' = 'bet_win'), 'bet_win in feed');

  -- Mimic copies the Thief
  perform use_perk(tm, it);
  perform t_assert((select class::text from players where id = im) = 'thief' and (select orig_class::text from players where id = im) = 'mimic', 'mimic became thief');
  perform t_assert(not (select perk_used from players where id = im), 'mimic fresh perk state');

  perform t_force(rc);  -- reveal -> guess
  -- Thief steals: give Jes a card, Thief cracks Jes
  insert into cards (room_id, owner_id, kind) select id, ij, 'shield' from rooms where code = rc;
  perform submit_guess(tt, ij, (select letter::text from banned_letters where player_id = ij limit 1));
  perform t_assert((select count(*) from cards where owner_id = it and not used) = 1 and
                   (select count(*) from cards where owner_id = ij and not used) = 0, 'thief stole the card');
  -- Oracle peeks next prompt
  r := use_perk(to_, null);
  perform t_assert(r->>'prompt' is not null and (select next_prompt_id from rooms where code = rc) is not null, 'oracle drew next prompt');
  -- Jester swaps with Gambler
  before_j := (select string_agg(letter::text, '' order by letter) from banned_letters where player_id = ij);
  before_g := (select string_agg(letter::text, '' order by letter) from banned_letters where player_id = ig);
  perform use_perk(tj, ig);
  perform t_assert((select string_agg(letter::text, '' order by letter) from banned_letters where player_id = ij) = before_g
               and (select string_agg(letter::text, '' order by letter) from banned_letters where player_id = ig) = before_j, 'jester swapped racks');
  perform t_assert(not exists (select 1 from banned_letters where player_id = ij and not revealed), 'jester new locks revealed');

  perform t_force(rc);  -- guess -> react
  -- attack Jes (host of Parasite) so the parasite drains
  insert into cards (room_id, owner_id, kind) select id, iw, 'attack' from rooms where code = rc returning id into c;
  perform play_card(tw, c, ij);
  n := (select count(*) from banned_letters where player_id = ip);
  perform t_force(rc);  -- react -> answer (round 2) + chaos roll
  perform t_assert(exists (select 1 from events e join rooms r2 on r2.id = e.room_id where r2.code = rc and e.payload->>'type' = 'drain'), 'parasite drained');
  perform t_assert((select p.text from rooms r2 join prompts p on p.id = r2.prompt_id where r2.code = rc) =
                   (select payload->>'prompt' from intel where player_id = io and payload->>'kind' = 'oracle'), 'oracle prompt came true');
  perform t_assert((select chaos_round from rooms where code = rc) = 2, 'wildcard chaos rolled round 2');
  st := get_room_state(rc, tg);
  perform t_assert(st->'room'->>'chaos' is not null, 'chaos visible in state');
  -- Oracle word leaks live
  perform submit_answer(to_, coalesce(t_word(to_), 'zzz'));
  st := get_room_state(rc, tg);
  perform t_assert(exists (select 1 from jsonb_array_elements(st->'players') p where p->>'id' = io::text and p->>'oracle_word' is not null), 'oracle word public');

  -- rematch resets mimic
  update rooms set phase = 'finished' where code = rc;
  perform play_again(tm);
  perform t_assert((select class::text from players where id = im) = 'mimic', 'mimic restored on rematch');
  raise notice 'ALL WILD CLASS TESTS PASSED (chaos=%)', (select chaos from rooms where code = rc);
end $$;
do $$
declare r jsonb; rc text; ta uuid; tb uuid; s jsonb;
begin
  r := create_room('Duo1', 'hero'); rc := r->>'code'; ta := (r->>'token')::uuid;
  s := update_settings(ta, '{"mode": "duel"}');
  perform t_assert((s->>'max_players')::int = 2 and s->>'mode' = 'duel', 'duel mode caps at 2');
  r := join_room(rc, 'Duo2', 'villain'); tb := (r->>'token')::uuid;
  perform t_expect_error(format('select join_room(%L, %L, %L)', rc, 'Duo3', 'ninja'), 'ROOM_FULL');
  perform start_game(ta);
  perform t_assert((select phase::text from rooms where code = rc) = 'duel_intro' and (select duel from rooms where code = rc), 'opens on VS screen');
  perform t_force(rc);
  perform t_assert((select phase::text from rooms where code = rc) = 'answer' and (select round from rooms where code = rc) = 1, 'round 1 after intro');
  perform t_assert((select count(*) from banned_letters bl join players p on p.id = bl.player_id where p.token = ta) = 1, 'hero fights with 1 lock');
  perform t_assert((select count(*) from banned_letters bl join players p on p.id = bl.player_id where p.token = tb) = 2, 'villain fights with 2 locks');
  perform t_assert((get_room_state(rc, ta)->'room'->>'answer_seconds')::int = 20, 'duel timer from round 1');
  s := update_settings(ta, '{}') ;
exception when others then
  if sqlerrm = 'WRONG_PHASE' then raise notice 'ALL DUEL MODE TESTS PASSED'; else raise; end if;
end $$;

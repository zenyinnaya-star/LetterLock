-- Full-game simulation against the engine. Run on a scratch DB (not production).
\set ON_ERROR_STOP 1

create or replace function t_assert(c boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'ASSERT FAILED: %', msg; end if; raise notice 'ok  %', msg; end $$;

-- a dictionary word the player can legally play (not banned, not reused)
create or replace function t_word(p_token uuid) returns text language sql as $$
  select w.word from words w, players me
  where me.token = p_token and char_length(w.word) between 5 and 9
    and not exists (select 1 from banned_letters bl where bl.player_id = me.id and position(bl.letter::text in upper(w.word)) > 0)
    and not exists (select 1 from answers a where a.player_id = me.id and a.word = w.word)
  order by random() limit 1;
$$;
create or replace function t_bad_word(p_token uuid) returns text language sql as $$
  select w.word from words w, players me
  where me.token = p_token and char_length(w.word) between 4 and 8
    and exists (select 1 from banned_letters bl where bl.player_id = me.id and position(bl.letter::text in upper(w.word)) > 0)
  limit 1;
$$;
create or replace function t_force(p_code text) returns text language plpgsql as $$
declare r jsonb;
begin
  update rooms set phase_ends_at = now() - interval '1 second' where code = p_code;
  r := advance_phase(p_code);
  return r->>'phase';
end $$;
create or replace function t_letters(p_token uuid) returns int language sql as $$
  select count(*)::int from banned_letters bl join players p on p.id = bl.player_id where p.token = p_token;
$$;
create or replace function t_expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERT FAILED: expected % from %', p_code, p_sql;
exception when others then
  if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  if sqlerrm <> p_code then raise exception 'ASSERT FAILED: expected %, got % (%)', p_code, sqlerrm, p_sql; end if;
  raise notice 'ok  error %', p_code;
end $$;

do $$
declare
  r jsonb; rc text; ta uuid; tb uuid; tc uuid; td uuid;
  ida uuid; idb uuid; idc uuid; idd uuid; ph text; s jsonb; v_letter text; v_card bigint; n int;
begin
  -- ── lobby
  r := create_room('Ava', 'villain'); rc := r->>'code'; ta := (r->>'token')::uuid; ida := (r->>'player_id')::uuid;
  r := join_room(lower(rc), 'Ben', 'ninja');      tb := (r->>'token')::uuid; idb := (r->>'player_id')::uuid;
  r := join_room(rc, 'Cal', 'mastermind');         tc := (r->>'token')::uuid; idc := (r->>'player_id')::uuid;
  r := join_room(rc, 'Dee', 'villain');            td := (r->>'token')::uuid; idd := (r->>'player_id')::uuid;
  perform t_expect_error(format('select join_room(%L, %L, %L)', rc, 'ben', 'hero'), 'NAME_TAKEN');
  perform set_class(td, 'hero');
  perform t_expect_error(format('select start_game(%L)', tb), 'NOT_HOST');
  perform start_game(ta);
  perform t_expect_error(format('select join_room(%L, %L, %L)', rc, 'Eve', 'hero'), 'GAME_IN_PROGRESS');

  s := get_room_state(rc, ta);
  perform t_assert(s->'room'->>'phase' = 'answer' and (s->'room'->>'round')::int = 1, 'game starts in answer phase round 1');
  perform t_assert((select bool_and(l not in ('A','E','I','O','U')) from (select bl.letter::text l from banned_letters bl
                     join players p on p.id = bl.player_id join rooms ro on ro.id = p.room_id where ro.code = rc) x),
                   'starting letters are consonants');
  perform t_assert(extract(epoch from ((s->'room'->>'phase_ends_at')::timestamptz - now())) between 59 and 61, 'round 1 is 60s');
  perform t_assert((select count(*) from jsonb_array_elements(s->'players') p where p ? 'letters' and p->'letters' <> 'null'::jsonb) = 0,
                   'other players letters hidden');

  -- ── round 1: Ava+Ben valid, Cal blank, Dee plays a banned letter
  r := submit_answer(ta, t_word(ta));  perform t_assert((r->>'valid')::boolean, 'Ava valid word');
  r := submit_answer(tb, t_word(tb));  perform t_assert((r->>'valid')::boolean, 'Ben valid word');
  r := submit_answer(td, t_bad_word(td)); perform t_assert(r->>'reason' = 'BANNED_LETTER', 'Dee banned letter rejected');
  r := submit_answer(ta, 'zzqx');     perform t_assert(r->>'reason' = 'NOT_A_WORD', 'non-word rejected');
  r := submit_answer(ta, 'ox');       perform t_assert(r->>'reason' = 'TOO_SHORT', 'short word rejected');
  r := submit_answer(ta, t_word(ta)); perform t_assert((r->>'valid')::boolean, 'Ava can change answer');
  perform t_assert(advance_phase(rc)->>'reason' = 'TOO_EARLY', 'cannot advance early');
  ph := t_force(rc); perform t_assert(ph = 'reveal', 'answer -> reveal');
  perform t_assert((select strikes from players where id = idc) = 1 and (select strikes from players where id = idd) = 1
                   and (select strikes from players where id = ida) = 0, 'blank + banned = strikes');
  s := get_room_state(rc, tb);
  perform t_assert(jsonb_array_length(s->'reveal') = 4, 'reveal shows all 4 answers');
  perform t_expect_error(format('select submit_answer(%L, %L)', tb, 'hello'), 'WRONG_PHASE');

  ph := t_force(rc); perform t_assert(ph = 'guess', 'reveal -> guess');
  -- Cal (mastermind) peeks at Ava
  r := use_perk(tc, ida); perform t_assert(r->>'kind' = 'mastermind' and jsonb_array_length(r->'letters') >= 1, 'mastermind peek');
  perform t_assert((select count(*) from hints h join rooms ro on ro.id = h.room_id where ro.code = rc) = 1, 'mastermind leaks a hint');
  perform t_expect_error(format('select use_perk(%L, %L)', tc, idb), 'PERK_USED');
  -- Ava guesses Ben's real letter (ninja -> +3 penalty pending)
  select letter::text into v_letter from banned_letters where player_id = idb limit 1;
  r := submit_guess(ta, idb, lower(v_letter)); perform t_assert((r->>'correct')::boolean, 'Ava guesses Ben correctly');
  perform t_expect_error(format('select submit_guess(%L, %L, %L)', ta, idc, 'Q'), 'ALREADY_GUESSED');
  perform t_expect_error(format('select submit_guess(%L, %L, %L)', tc, idb, v_letter), 'ALREADY_REVEALED');
  perform t_expect_error(format('select submit_guess(%L, %L, %L)', tb, idb, 'Q'), 'CANNOT_TARGET_SELF');
  perform t_assert((select count(*) from cards where owner_id = ida and not used) = 1, 'correct guess earns a card');
  perform t_assert((select kind from cards where owner_id = ida) <> 'shield', 'villain never draws shield');
  update cards set kind = 'attack' where owner_id = ida;   -- make the rest deterministic
  perform t_assert((select count(*) from pending_additions where target_id = idb and kind = 'ninja' and amount = 3) = 1,
                   'ninja penalty queued');

  ph := t_force(rc); perform t_assert(ph = 'react', 'guess -> react (Cal safe: Ava guessed right)');
  perform t_assert((select strikes from players where id = idc) = 1, 'mastermind not penalised');
  select id into v_card from cards where owner_id = ida and not used;
  r := play_card(ta, v_card, idd); perform t_assert((r->>'amount')::int = 2, 'villain attack adds 2');
  r := use_perk(td, idb); perform t_assert(r->>'kind' = 'hero', 'hero absorbs Ben''s penalty');
  s := get_room_state(rc, td);
  perform t_assert(jsonb_array_length(s->'pending') = 2, 'pending shows both additions');
  perform t_assert(jsonb_array_length(s->'guess_results') = 1, 'guess results visible in react');
  perform react_ready(ta); perform react_ready(tb); perform react_ready(tc); perform react_ready(td);
  perform t_assert(advance_phase(rc)->>'phase' = 'answer', 'all ready skips react; next round');
  perform t_assert(t_letters(ta) = 2 and t_letters(tb) = 2 and t_letters(tc) = 1 and t_letters(td) = 6,
                   'letters: Ava 2, Ben 2, Cal 1, Dee 1+2+3=6');
  perform t_assert((select letters_stacked from players where id = ida) = 2, 'villain stat tracked');
  perform t_assert((select points from players where id = idd) = 5, 'hero bonus points');
  s := get_room_state(rc, ta);
  perform t_assert(extract(epoch from ((s->'room'->>'phase_ends_at')::timestamptz - now())) between 49 and 51, 'round 2 is 50s');

  -- ── round 2: Cal valid (strike resets), Dee blank -> eliminated
  perform submit_answer(ta, t_word(ta)); perform submit_answer(tb, t_word(tb)); perform submit_answer(tc, t_word(tc));
  perform t_force(rc);
  perform t_assert((select strikes from players where id = idc) = 0, 'clean round resets strikes');
  perform t_assert((select eliminated from players where id = idd), 'two strikes eliminates');
  s := get_room_state(rc, td);
  perform t_assert(s->'players'->0->'letters' <> 'null'::jsonb, 'spectator sees all letters');
  perform t_expect_error(format('select submit_answer(%L, %L)', td, 'hello'), 'WRONG_PHASE');
  perform t_force(rc); -- guess
  perform t_expect_error(format('select submit_guess(%L, %L, %L)', ta, idd, 'Q'), 'TARGET_ELIMINATED');
  perform t_force(rc); -- react
  perform t_assert(t_force(rc) = 'answer', 'round 3 starts (3 alive)');

  -- ── round 3: Ninja perk available now; Cal blank twice -> out -> duel
  r := use_perk(tb); perform t_assert(r->>'kind' = 'ninja' and jsonb_array_length(r->'letters') >= 1, 'ninja vision round 3');
  perform submit_answer(ta, t_word(ta)); perform submit_answer(tb, t_word(tb));
  perform t_force(rc); perform t_force(rc); perform t_force(rc); ph := t_force(rc);
  perform t_assert(ph = 'answer', 'round 4');
  perform submit_answer(ta, t_word(ta)); perform submit_answer(tb, t_word(tb));
  perform t_force(rc);
  perform t_assert((select eliminated from players where id = idc), 'Cal eliminated');
  perform t_force(rc); perform t_force(rc);
  n := t_letters(ta);
  ph := t_force(rc); perform t_assert(ph = 'duel_intro', 'two left -> duel intro');
  ph := t_force(rc); perform t_assert(ph = 'answer', 'duel round starts');
  s := get_room_state(rc, ta);
  perform t_assert((s->'room'->>'duel')::boolean and (s->'room'->>'answer_seconds')::int = 20, 'duel is 20s');
  perform t_assert(t_letters(ta) = n + 2, 'duel adds +1 letter (after survive +1)');

  -- ── duel: Ben blank, then valid (no reset), then blank -> out
  perform submit_answer(ta, t_word(ta)); perform t_force(rc);
  perform t_force(rc); perform t_force(rc); perform t_force(rc);
  perform submit_answer(ta, t_word(ta)); perform submit_answer(tb, t_word(tb)); perform t_force(rc);
  perform t_assert((select strikes from players where id = idb) = 1, 'strikes never reset in duel');
  perform t_force(rc); perform t_force(rc); perform t_force(rc);
  perform submit_answer(ta, t_word(ta)); perform t_force(rc);
  ph := t_force(rc); perform t_assert(ph = 'finished', 'game over after reveal');
  s := get_room_state(rc, tb);
  perform t_assert((s->'titles'->>'champion')::uuid = ida, 'Ava is champion');
  perform t_assert((s->'titles'->>'villain')::uuid = ida, 'Ava is the Villain');
  perform t_assert(s->'titles'->>'einstein' is not null, 'Einstein awarded');

  -- ── play again
  perform play_again(ta);
  s := get_room_state(rc, ta);
  perform t_assert(s->'room'->>'phase' = 'lobby' and t_letters(ta) = 0
                   and (select count(*) from players p join rooms ro on ro.id = p.room_id where ro.code = rc and p.eliminated) = 0,
                   'play again resets room');

  -- ── simultaneous elimination tiebreak
  r := create_room('X', 'hero'); rc := r->>'code'; ta := (r->>'token')::uuid; ida := (r->>'player_id')::uuid;
  r := join_room(rc, 'Y', 'ninja'); tb := (r->>'token')::uuid;
  perform start_game(ta);
  perform submit_answer(ta, t_word(ta)); perform t_force(rc); -- X scores, Y strike
  perform t_force(rc); perform t_force(rc);
  perform t_assert(t_force(rc) = 'duel_intro', '2-player game goes to duel');
  perform t_assert(t_letters(ta) = 2, 'hero has 2 before duel');
  perform t_force(rc);
  perform t_assert(t_letters(ta) = 1, 'hero cut to 1 letter at duel');
  perform t_force(rc); -- both blank: X strike 1, Y strike 2 -> Y out
  perform t_assert(t_force(rc) = 'finished', 'finish');
  perform t_assert((select winner_id from rooms where code = rc) = ida, 'survivor wins');

  r := create_room('P', 'hero'); rc := r->>'code'; ta := (r->>'token')::uuid; ida := (r->>'player_id')::uuid;
  r := join_room(rc, 'Q', 'ninja'); tb := (r->>'token')::uuid;
  perform start_game(ta);
  perform submit_answer(ta, t_word(ta)); perform submit_answer(tb, 'cat'); perform t_force(rc);  -- P scores more
  update players set strikes = 1 where token in (ta, tb);
  perform t_force(rc); perform t_force(rc); perform t_force(rc); perform t_force(rc);
  perform t_force(rc); -- both blank -> both eliminated
  perform t_assert(t_force(rc) = 'finished', 'double elimination finishes');
  perform t_assert((select winner_id from rooms r2 where r2.code = rc) = ida, 'tiebreak: more points wins');

  raise notice 'ALL TESTS PASSED';
end $$;

-- ── privileges
select code as any_code from rooms limit 1 \gset
set role anon;
select 'anon get_room_state ok' as check where get_room_state(:'any_code') is not null;
do $$ begin
  perform _add_letter(gen_random_uuid(), 1, 'x');
  raise exception 'ASSERT FAILED: anon could call _add_letter';
exception when insufficient_privilege then raise notice 'ok  anon blocked from internals';
end $$;
do $$ begin
  perform 1 from players limit 1;
  raise exception 'ASSERT FAILED: anon read players';
exception when insufficient_privilege then raise notice 'ok  anon cannot read players';
end $$;
reset role;

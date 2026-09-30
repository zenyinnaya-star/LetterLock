\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; rid uuid; ht uuid; hid uuid; i int; ph text; st jsonb; v_valid int; v_guess int; v_tot int;
begin
  r := create_room('Hu','ninja'); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform add_bot(ht, 1); perform add_bot(ht, 2); perform add_bot(ht, 3);
  perform t_assert((select count(*) from players where room_id=rid and bot>0) = 3, '3 bots added');
  perform t_expect_error(format('select add_bot(%L, 9)', ht), 'BAD_LEVEL');
  perform t_assert(jsonb_array_length(bot_tick(ht)->'bots') = 3, 'tick lists bots');
  perform remove_bot(ht, (select id from players where room_id=rid and bot=1));
  perform add_bot(ht, 1);
  perform start_game(ht);
  for i in 1..60 loop
    select phase::text into ph from rooms where id=rid;
    exit when ph = 'finished';
    if ph = 'answer' and not (select eliminated from players where id=hid) and not exists (select 1 from answers where player_id=hid and round=(select round from rooms where id=rid)) then
      perform submit_answer(ht, t_word(ht));
    end if;
    -- make bots "due": pretend most of the phase already passed
    update rooms set phase_ends_at = now() + interval '2 seconds' where id=rid;
    perform bot_tick(ht);
    perform t_force(rc);
  end loop;
  select count(*) filter (where a.valid), count(*) into v_valid, v_tot from answers a join players p on p.id=a.player_id where p.room_id=rid and p.bot>0;
  select count(*) into v_guess from guesses g join players p on p.id=g.guesser_id where p.room_id=rid and p.bot>0;
  raise notice 'bot answers valid %/% guesses % final phase %', v_valid, v_tot, v_guess, (select phase from rooms where id=rid);
  perform t_assert(v_tot > 0 and v_valid > 0, 'bots answered validly');
  perform t_assert(v_guess > 0, 'bots guessed');
  perform t_assert((select count(*) from players where room_id=rid and bot>0 and eliminated) >= 0, 'sanity');
  raise notice 'SOLO BOTS OK';
end $$;

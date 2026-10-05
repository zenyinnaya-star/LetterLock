\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; rid uuid; ht uuid; hid uuid; i int; ph text; b uuid; v_tot int; v_guess int; k int; info jsonb;
begin
  r := create_room('Hu','ninja'); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform add_bot(ht, 3, 1); perform add_bot(ht, 2, 2); perform add_bot(ht, 1, 3);
  perform t_expect_error(format('select add_bot(%L, 2, 9)', ht), 'BAD_STYLE');
  info := bot_tick(ht)->'info';
  perform t_assert(jsonb_typeof(info) = 'object' and (select count(*) from jsonb_object_keys(info)) = 3, 'info has 3 bots');
  select id into b from players where room_id=rid and bot_style=2;
  perform set_bot(ht, b, 3, 1);
  perform t_assert((select bot from players where id=b) = 3 and (select bot_style from players where id=b) = 1, 'set_bot works');
  perform t_expect_error(format('select set_bot(%L, %L, 0, 0)', ht, b), 'BAD_LEVEL');
  perform set_bot(ht, b, 2, 2);
  perform start_game(ht);
  for i in 1..250 loop
    select phase::text into ph from rooms where id=rid;
    exit when ph = 'finished';
    if ph = 'answer' and not (select eliminated from players where id=hid) and not exists (select 1 from answers where player_id=hid and round=(select round from rooms where id=rid)) then
      perform submit_answer(ht, t_word(ht));
    end if;
    update rooms set phase_ends_at = now() + interval '2 seconds' where id=rid;
    perform bot_tick(ht);
    perform t_force(rc);
  end loop;
  perform t_assert((select phase from rooms where id=rid) = 'finished', 'game with personalities finished');
  select count(*) filter (where a.valid), 0 into v_tot, k from answers a join players p on p.id=a.player_id where p.room_id=rid and p.bot>0;
  perform t_assert(v_tot > 0, 'styled bots answered validly');
  select count(*) into v_guess from guesses g join players p on p.id=g.guesser_id where p.room_id=rid and p.bot>0;
  perform t_assert(v_guess > 0, 'styled bots guessed');
  raise notice 'BOT PERSONALITIES OK';
end $$;

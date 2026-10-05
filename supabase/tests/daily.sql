\set ON_ERROR_STOP 1
do $$
declare k uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); i jsonb; r jsonb; w text; n int := 0; d date := (now() at time zone 'utc')::date; banned text; pid bigint;
begin
  i := daily_info(k);
  perform t_assert(i->>'status' = 'new' and (i->>'prompt') is not null and length(i->>'banned') = 2, 'info new');
  perform t_expect_error(format('select daily_answer(%L, %L)', k, 'cat'), 'NOT_STARTED');
  i := daily_start(k, E'Zed\n  ');
  perform t_assert(i->>'status' = 'playing' and i->>'name' = 'Zed', 'start');
  i := daily_start(k, 'Other');
  perform t_assert(i->>'name' = 'Zed', 'second start keeps the first run');
  banned := i->>'banned'; pid := _daily_prompt(d);
  for w in select pw.word from prompt_words pw where pw.prompt_id = pid and char_length(pw.word) >= 3 and upper(pw.word) !~ ('[' || banned || ']') and _in_dict('en', pw.word) limit 3 loop
    r := daily_answer(k, w); perform t_assert((r->>'valid')::boolean, 'valid word ' || w); n := n + 1;
    r := daily_answer(k, w); perform t_assert(r->>'reason' = 'REPEAT', 'repeat rejected');
  end loop;
  perform t_assert(n > 0, 'found valid words for the daily category');
  r := daily_answer(k, 'xqzvj'); perform t_assert(not (r->>'valid')::boolean, 'junk rejected');
  select pw.word into w from prompt_words pw where pw.prompt_id = pid and upper(pw.word) ~ ('[' || banned || ']') and char_length(pw.word) >= 3 limit 1;
  if w is not null then r := daily_answer(k, w); perform t_assert(r->>'reason' = 'BANNED_LETTER', 'banned letter rejected'); end if;
  i := daily_finish(k);
  perform t_assert(i->>'status' = 'done' and (i->>'score')::int > 0, 'finish -> done with score');
  perform t_expect_error(format('select daily_answer(%L, %L)', k, 'dog'), 'TIME_UP');
  perform daily_start(k2, 'Ann');
  perform t_assert(jsonb_array_length(daily_info(k)->'board') = 1 and (daily_info(k)->'board'->0->>'me')::boolean, 'board has me, ann not yet scored');
  perform t_assert(not (daily_info(k)->'board'->0 ? 'key'), 'keys never leave the server');
  -- same puzzle for everyone on the same day
  perform t_assert(daily_info(k)->>'prompt' = daily_info(k2)->>'prompt' and daily_info(k)->>'banned' = daily_info(k2)->>'banned', 'same puzzle for all');
  -- late answers are refused
  update daily_runs set started_at = now() - interval '2 minutes' where client_key = k2;
  perform t_expect_error(format('select daily_answer(%L, %L)', k2, 'dog'), 'TIME_UP');
  perform t_assert(daily_info(k2)->>'status' = 'done', 'expired run is done');
  raise notice 'DAILY OK';
end $$;

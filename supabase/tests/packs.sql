\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; ht uuid; rid uuid; i int; pk text; w text; res jsonb;
begin
  r := create_room('Pk','hero'); rc := r->>'code'; ht := (r->>'token')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(ht, '{"pack":"nope"}');
  perform t_assert((select settings->>'pack' from rooms where id = rid) = 'all', 'bad pack falls back to all');
  perform update_settings(ht, '{"pack":"fantasy"}');
  perform t_assert((select settings->>'pack' from rooms where id = rid) = 'fantasy', 'pack saved');
  perform join_room(rc, 'Dd', 'hero');
  for i in 1..6 loop
    perform start_game(ht);
    select p.pack into pk from rooms ro join prompts p on p.id = ro.prompt_id where ro.id = rid;
    perform t_assert(pk = 'fantasy', 'fantasy room only serves fantasy prompts, got ' || pk);
    exit;
  end loop;
  -- a fantasy word is accepted, a random dictionary word that is not a dragon is off topic
  select pw.word into w from rooms ro join prompt_words pw on pw.prompt_id = ro.prompt_id
    where ro.id = rid and not exists (select 1 from banned_letters bl, players pl where pl.id = bl.player_id and pl.token = ht and position(bl.letter::text in upper(pw.word)) > 0) limit 1;
  if w is not null then
    res := submit_answer(ht, w);
    perform t_assert((res->>'valid')::boolean, 'pack word accepted: ' || res::text);
  end if;
  res := submit_answer(ht, 'zzzzzz');
  perform t_assert(not (res->>'valid')::boolean, 'nonsense refused');
  raise notice 'PACKS OK';
end $$;

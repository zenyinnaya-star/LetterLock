\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; ht uuid; hid uuid; rid uuid; res jsonb; w text; s text; base int; st jsonb; n int;
begin
  foreach s in array array['keep','jungle','arcade','neon','none','random','library','station'] loop
    r := create_room('Hu','hero'); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
    select id into rid from rooms where code = rc;
    perform update_settings(ht, jsonb_build_object('stage', s));
    perform t_assert((select settings->>'stage' from rooms where id = rid) = s, 'stage saved ' || s);
    perform join_room(rc, 'Op', 'villain');
    perform start_game(ht);
    st := get_room_state(rc, ht);
    perform t_assert(st->'room'->>'stage' is not null, 'stage in state');
    if s = 'random' then perform t_assert(st->'room'->>'stage' in ('neon','library','station','arcade','jungle','keep'), 'random resolves'); end if;
    -- a long word on keep/jungle gets the stage bonus
    if s in ('keep','jungle','neon') then
      select pw.word into w from rooms ro join prompt_words pw on pw.prompt_id = ro.prompt_id
        where ro.id = rid and char_length(pw.word) >= 6
          and not exists (select 1 from banned_letters bl where bl.player_id = hid and position(bl.letter::text in upper(pw.word)) > 0)
        order by char_length(pw.word) desc limit 1;
      if w is not null then
        res := submit_answer(ht, w);
        perform t_assert((res->>'stage_bonus')::int >= 2, s || ' bonus applied: ' || res::text);
        perform t_assert((select points from answers where player_id = hid and round = 1) = (res->>'points')::int, 'stored points match');
        res := submit_answer(ht, w);
        perform t_assert((res->>'stage_bonus')::int >= 2, 'resubmit does not stack beyond one bonus');
      end if;
    end if;
  end loop;
  -- bad stage value falls back
  r := create_room('Hu','hero'); rc := r->>'code'; ht := (r->>'token')::uuid;
  perform update_settings(ht, '{"stage":"lava"}');
  perform t_assert(get_room_state(rc, ht)->'room'->>'stage' = 'none', 'bad stage -> none');
  -- other settings survive a stage change
  perform update_settings(ht, '{"mindgames":true,"weekly":true,"pack":"meme"}');
  perform update_settings(ht, '{"stage":"neon"}');
  st := get_room_state(rc, ht);
  perform t_assert(st->'room'->'settings'->>'mindgames' = 'true' and st->'room'->'settings'->>'pack' = 'meme', 'settings preserved');
  raise notice 'STAGES OK';
end $$;

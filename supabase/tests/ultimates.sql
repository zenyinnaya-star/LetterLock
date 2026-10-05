\set ON_ERROR_STOP 1
do $$
declare
  rc text; rid uuid; r jsonb; ht uuid; hid uuid; ot uuid; oid uuid; res jsonb; ph text; i int; ok boolean; n int; pts int;
  cls text; w text;
begin
  foreach cls in array array['ninja','oracle','mastermind','hero','jester','villain','hacker','gambler','thief'] loop
    r := create_room('Hu', cls::player_class); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
    select id into rid from rooms where code = rc;
    r := join_room(rc, 'Op', 'hero'); ot := (r->>'token')::uuid; oid := (r->>'player_id')::uuid;
    -- off by default
    perform start_game(ht);
    update players set charge = 30 where id = hid;
    begin perform use_ultimate(ht, oid, 'attack'); ok := false; exception when others then ok := sqlerrm in ('ULTIMATES_OFF','NO_ULTIMATE'); end;
    perform t_assert(ok, cls || ': refused while the rule is off');
    -- turn the rule on in a fresh lobby
    perform leave_room(ot);
    r := create_room('Hu', cls::player_class); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
    select id into rid from rooms where code = rc;
    perform update_settings(ht, '{"ultimates":true}');
    perform t_assert((select settings->>'ultimates' from rooms where id = rid) = 'true', 'setting saved');
    r := join_room(rc, 'Op', 'hero'); ot := (r->>'token')::uuid; oid := (r->>'player_id')::uuid;
    perform start_game(ht);
    update players set charge = 0 where id = hid;
    begin perform use_ultimate(ht, oid, 'attack'); ok := false; exception when others then ok := sqlerrm in ('NOT_ENOUGH_CHARGE','NO_ULTIMATE'); end;
    perform t_assert(ok, cls || ': needs points');
    update players set charge = 30 where id = hid;
    select phase::text into ph from rooms where id = rid;
    -- walk to a phase where it works
    for i in 1..8 loop
      select phase::text into ph from rooms where id = rid;
      exit when (cls = 'jester' and ph = 'answer') or (cls in ('villain','hacker') and ph in ('guess','react')) or (cls in ('oracle') and ph in ('reveal','guess','react'))
        or (cls in ('ninja','mastermind','gambler','hero') and ph in ('answer','guess','react'));
      perform t_force(rc);
    end loop;
    if cls = 'ninja' then
    end if;
    if cls = 'hero' then
      update players set perk_used = true where id = hid;
    end if;
    begin res := use_ultimate(ht, oid, 'attack'); ok := true; exception when others then ok := sqlerrm = 'NO_ULTIMATE'; res := jsonb_build_object('err', sqlerrm); end;
    perform t_assert(ok, cls || ' ult worked: ' || res::text);
    if cls <> 'thief' then
      select charge into pts from players where id = hid;
      perform t_assert(pts < 30, cls || ' charge spent: ' || pts);
      begin perform use_ultimate(ht, oid, 'attack'); ok := false; exception when others then ok := sqlerrm = 'ULT_USED_THIS_ROUND'; end;
      perform t_assert(ok, cls || ' once per round');
    end if;
    if cls = 'villain' then
      perform t_assert(exists (select 1 from pending_additions where source_id = hid and amount = 4 and target_id = oid), 'villain stacked 4');
    elsif cls = 'hacker' then
      perform t_assert(exists (select 1 from pending_additions where source_id = hid and kind = 'hack' and target_id = oid), 'hacker hit opponent');
    elsif cls = 'gambler' then
      perform t_assert(exists (select 1 from cards where owner_id = hid and kind = 'attack' and not used), 'gambler bought attack');
    elsif cls = 'ninja' or cls = 'oracle' then
      perform t_assert(exists (select 1 from intel where player_id = hid), cls || ' got intel');
    elsif cls = 'jester' then
      perform t_assert((select ult_round from players where id = hid) >= (select round from rooms where id = rid), 'jester unlocked this round');
    end if;
    raise notice 'ult % ok', cls;
  end loop;
  -- charge from skill
  r := create_room('Ch','hero'); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform join_room(rc,'Dd','hero'); perform start_game(ht);
  select w2.word into w from words w2, rooms ro where ro.id = rid and char_length(w2.word) between 3 and 9
      and (not exists (select 1 from prompt_words pw where pw.prompt_id = ro.prompt_id) or exists (select 1 from prompt_words pw where pw.prompt_id = ro.prompt_id and pw.word = w2.word))
      and not exists (select 1 from banned_letters bl where bl.player_id = hid and position(bl.letter::text in upper(w2.word)) > 0) limit 1;
  res := submit_answer(ht, w);
  perform t_assert((res->>'valid')::boolean, 'charge test word valid');
  perform t_assert((select charge from players where id = hid) >= 2, 'valid answer charges ult: ' || (select charge from players where id = hid));
  n := (select charge from players where id = hid);
  res := submit_answer(ht, w);
  perform t_assert((select charge from players where id = hid) = n, 'resubmitting does not double charge');
  raise notice 'ULTIMATES OK';
end $$;

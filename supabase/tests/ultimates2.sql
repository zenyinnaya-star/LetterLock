\set ON_ERROR_STOP 1
do $$
declare
  rc text; rid uuid; r jsonb; ht uuid; hid uuid; ot uuid; oid uuid; res jsonb; ok boolean; n int; cls text; pb uuid; i int; ph text;
begin
  foreach cls in array array['thief','parasite','wildcard','mimic'] loop
    r := create_room('Hu', cls::player_class); rc := r->>'code'; ht := (r->>'token')::uuid; hid := (r->>'player_id')::uuid;
    select id into rid from rooms where code = rc;
    perform update_settings(ht, '{"ultimates":true}');
    r := join_room(rc, 'Op', 'villain'); ot := (r->>'token')::uuid; oid := (r->>'player_id')::uuid;
    r := join_room(rc, 'Third', 'hero');
    perform start_game(ht);
    update players set charge = 30 where id = hid;
    update players set points = 10 where id = oid;
    insert into cards (room_id, owner_id, kind) values (rid, oid, 'attack'), (rid, oid, 'shield');
    update players set points = 0 where id = hid;
    for i in 1..8 loop select phase::text into ph from rooms where id = rid; exit when ph in ('answer','guess','react'); perform t_force(rc); end loop;
    if cls = 'mimic' then update players set points = 0 where id = oid; update players set charge = 30 where id = hid; end if;
    res := use_ultimate(ht, oid, null);
    raise notice '% -> %', cls, res;
    perform t_assert((select charge from players where id = hid) < 30, cls || ' charge spent');
    if cls = 'thief' then
      perform t_assert((select count(*) from cards where owner_id = hid and not used) = 2, 'thief took 2 cards');
      perform t_assert((select points from players where id = hid) = 4, 'thief took 4 points');
    elsif cls = 'parasite' then
      perform t_assert((select points from players where id = hid) = 6, 'parasite drained double: ' || (select points from players where id = hid));
      perform t_assert(exists (select 1 from leeches where parasite_id = hid and target_id = oid), 'leech recorded');
      -- a hit on the leeched player hurts the parasite
      n := (select count(*) from banned_letters where player_id = hid);
      perform _add_letter(oid, (select round from rooms where id = rid), 'attack');
      perform t_assert((select count(*) from banned_letters where player_id = hid) = n + 2, 'leech backlash gives parasite 2 locks');
    elsif cls = 'wildcard' then
      perform t_assert((select chaos from rooms where id = rid) is not null, 'chaos triggered');
    elsif cls = 'mimic' then
      perform t_assert((select orig_class::text from players where id = hid) = 'mimic', 'mimic copied a class');
    end if;
    begin perform use_ultimate(ht, oid, null); ok := false; exception when others then ok := sqlerrm = 'ULT_USED_THIS_ROUND'; end;
    perform t_assert(ok, cls || ' once per round');
  end loop;

  -- bots fire ultimates
  r := create_room('Bh','hero'); rc := r->>'code'; ht := (r->>'token')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(ht, '{"ultimates":true}');
  perform add_bot(ht, 3, 1); perform add_bot(ht, 3, 1);
  perform start_game(ht);
  update players set charge = 30, class = 'villain' where room_id = rid and bot > 0;
  for i in 1..60 loop
    perform bot_tick(ht);
    exit when exists (select 1 from players where room_id = rid and bot > 0 and ult_round is not null);
  end loop;
  perform t_assert(exists (select 1 from players where room_id = rid and bot > 0 and ult_round is not null), 'a bot used its ultimate');
  raise notice 'ULTIMATES2 OK';
end $$;

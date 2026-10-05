\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; ht uuid; rid uuid; i int; ph text; rec jsonb; ok boolean;
begin
  r := create_room('Hu','hero'); rc := r->>'code'; ht := (r->>'token')::uuid;
  select id into rid from rooms where code = rc;
  perform join_room(rc, 'Op', 'villain');
  begin perform get_recap(rc); ok := false; exception when others then ok := sqlerrm = 'WRONG_PHASE'; end;
  perform t_assert(ok, 'recap locked until finished');
  perform start_game(ht);
  for i in 1..200 loop select phase::text into ph from rooms where id = rid; exit when ph = 'finished'; perform t_force(rc); end loop;
  perform t_assert(ph = 'finished', 'game finished');
  rec := get_recap(rc);
  perform t_assert(jsonb_array_length(rec->'rounds') >= 1, 'has rounds: ' || rec::text);
  perform t_assert(rec->'rounds'->0->>'prompt' is not null, 'round prompt resolved');
  raise notice 'RECAP OK %', left(rec::text, 200);
end $$;

\set ON_ERROR_STOP 1
do $$
declare r jsonb; rc text; rid uuid; t uuid[] := '{}'; d uuid[] := '{}'; i int; st jsonb; ph text;
begin
  r := create_room('H','ninja'); rc := r->>'code'; t := t||(r->>'token')::uuid; d := d||(r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(t[1], '{"mode":"team","team_size":2,"rounds":2}');
  for i in 2..4 loop r := join_room(rc,'P'||i,'hero'); t := t||(r->>'token')::uuid; d := d||(r->>'player_id')::uuid; end loop;
  -- host leaves in the lobby: host and leaders move, then he can't just come back
  perform leave_room(t[1]);
  perform t_assert((select host_id from rooms where id=rid) <> d[1], 'host moved after lobby leave');
  perform t_assert((select count(*) from teams where room_id=rid and leader_id is not null) = 2, 'both teams still have a leader');
  r := join_room(rc,'H2','ninja'); t := t||(r->>'token')::uuid; d := d||(r->>'player_id')::uuid;
  perform start_game((select token from players where id=(select host_id from rooms where id=rid)));
  -- a player drops for a minute and refreshes: state is still theirs and playable
  update players set last_seen = now() - interval '2 minutes' where id = d[3];
  st := get_room_state(rc, t[3]);
  perform t_assert(st->'me'->>'id' = d[3]::text, 'reload with token restores me');
  perform t_assert(jsonb_array_length(st->'me'->'letters') >= 1, 'my locks still there');
  perform heartbeat(t[3]);
  perform t_assert((select last_seen from players where id=d[3]) > now() - interval '5 seconds', 'heartbeat revives');
  perform t_assert((submit_answer(t[3], t_word(t[3])))->>'valid' = 'true', 'can answer after reconnect');
  -- host disconnects (not leaves) mid-game: game continues through advance_phase
  update players set last_seen = now() - interval '5 minutes' where id = (select host_id from rooms where id=rid);
  perform t_force(rc);
  perform t_assert((select phase from rooms where id=rid) = 'reveal', 'game advances with host offline');
  -- late joiner is refused and can still read the room
  perform t_expect_error(format('select join_room(%L,%L,%L)', rc, 'Late', 'ninja'), 'GAME_IN_PROGRESS');
  st := get_room_state(rc, null);
  perform t_assert(st->'me' = 'null'::jsonb and jsonb_array_length(st->'players') = 4, 'spectator can read state');
  raise notice 'RECONNECT OK';
end $$;

\set ON_ERROR_STOP 1
do $$
declare
  r jsonb; rc text; rid uuid; st jsonb; i int;
  tk uuid[] := '{}'; id_ uuid[] := '{}'; cls text[] := array['ninja','hero','mastermind','jester','parasite','thief'];
  ta uuid; tgt uuid; myteam uuid; enemy uuid; card bigint; before_n int; after_n int; ph text;
begin
  r := create_room('P1', 'ninja'); rc := r->>'code'; tk := tk || (r->>'token')::uuid; id_ := id_ || (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(tk[1], '{"mode":"team","team_size":3,"rounds":3}');
  for i in 2..6 loop
    r := join_room(rc, 'P'||i, cls[i]::player_class); tk := tk || (r->>'token')::uuid; id_ := id_ || (r->>'player_id')::uuid;
  end loop;
  perform t_assert((select count(*) from players where room_id=rid and team_id is not null) = 6, '3v3 seated');
  perform t_expect_error(format('select join_room(%L,%L,%L)', rc, 'X', 'ninja'), 'ROOM_FULL');
  -- can't shrink to 2v2 with 6 players? bumps allowed or errors
  perform t_expect_error(format('select update_settings(%L::uuid, %L)', tk[1], '{"team_size":2}'), 'TOO_MANY_FOR_TEAM');
  -- swap team via team_join
  select team_id into myteam from players where id = id_[1];
  perform start_game(tk[1]);
  select id into enemy from teams where room_id=rid and id <> myteam;
  -- teammate letters mirrored
  perform t_assert((select count(distinct l) from (select string_agg(letter::text,'' order by letter) l from banned_letters b join players p on p.id=b.player_id where p.team_id=myteam group by p.id) x) = 1, 'racks mirrored');
  -- give P1 an attack card, play at enemy player -> hits whole enemy team
  for i in 1..6 loop perform submit_answer(tk[i], t_word(tk[i])); end loop;
  perform t_force(rc); perform t_force(rc);  -- guess phase
  insert into cards (room_id, owner_id, kind) values (rid, id_[1], 'attack') returning id into card;
  select id into tgt from players where team_id = enemy limit 1;
  select count(*) into before_n from banned_letters b join players p on p.id=b.player_id where p.team_id=enemy and p.id=tgt;
  perform t_expect_error(format('select play_card(%L::uuid,%s,%L::uuid)', tk[1], card, (select id from players where team_id=myteam and id<>id_[1] limit 1)), 'CANNOT_TARGET_TEAMMATE');
  perform play_card(tk[1], card, tgt);
  perform t_force(rc); perform t_force(rc); -- guess->react->next round: attack lands, +1 lock each
  select phase into ph from rooms where id=rid;
  perform t_assert((select count(distinct l) from (select string_agg(letter::text,'' order by letter) l from banned_letters b join players p on p.id=b.player_id where p.team_id=enemy group by p.id) x) = 1, 'enemy racks still mirrored after attack');
  select count(*) into after_n from banned_letters where player_id=tgt;
  perform t_assert(after_n >= before_n + 2, 'enemy got attack + round lock: '||before_n||'->'||after_n);
  raise notice 'phase after react: %', ph;
  -- perks
  perform t_force(rc);
  for i in 1..6 loop
    begin
      select p.id into tgt from players p where p.room_id=rid and p.team_id <> (select team_id from players where id=id_[i]) limit 1;
      perform use_perk(tk[i], tgt);
    exception when others then raise notice 'perk % (%): %', i, cls[i], sqlerrm; end;
  end loop;
  perform t_assert((select count(distinct l) from (select string_agg(letter::text,'' order by letter) l from banned_letters b join players p on p.id=b.player_id where p.team_id=myteam group by p.id) x) = 1, 'my racks mirrored after perks');
  perform t_assert((select count(distinct l) from (select string_agg(letter::text,'' order by letter) l from banned_letters b join players p on p.id=b.player_id where p.team_id=enemy group by p.id) x) = 1, 'enemy racks mirrored after perks');
  -- leaver: two of enemy leave -> team still playable; leader reassigned
  perform leave_room((select token from players where team_id=enemy and not eliminated order by joined_at limit 1));
  perform t_assert((select leader_id from teams where id=enemy) is not null, 'leader reassigned');
  perform leave_room((select token from players where team_id=enemy and not eliminated order by joined_at limit 1));
  perform leave_room((select token from players where team_id=enemy and not eliminated order by joined_at limit 1));
  perform t_assert((select phase from rooms where id=rid) = 'finished', 'forfeit finishes game');
  perform t_assert((select winner_team from rooms where id=rid) = (select idx from teams where id=myteam), 'remaining team wins');
  raise notice 'TEAM2 OK';
end $$;

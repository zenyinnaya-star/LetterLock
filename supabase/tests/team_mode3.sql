\set ON_ERROR_STOP 1
do $$
declare
  r jsonb; rc text; rid uuid; t uuid[] := '{}'; d uuid[] := '{}'; cls text[] := array['jester','hero','oracle','mastermind'];
  i int; ja text; jb text; mine uuid; enemy uuid; card bigint; tgt uuid; pts0 int; pts1 int; p_hero uuid;
begin
  r := create_room('J', 'jester'); rc := r->>'code'; t := t || (r->>'token')::uuid; d := d || (r->>'player_id')::uuid;
  select id into rid from rooms where code = rc;
  perform update_settings(t[1], '{"mode":"team","team_size":2,"rounds":3}');
  for i in 2..4 loop r := join_room(rc,'P'||i,cls[i]::player_class); t := t || (r->>'token')::uuid; d := d || (r->>'player_id')::uuid; end loop;
  perform start_game(t[1]);
  select team_id into mine from players where id = d[1];
  select id into enemy from teams where room_id=rid and id<>mine;
  for i in 1..4 loop perform submit_answer(t[i], t_word(t[i])); end loop;
  perform t_force(rc); perform t_force(rc); -- guess
  ja := (select string_agg(letter::text,'' order by letter) from banned_letters where player_id=d[1]);
  select id into tgt from players where team_id=enemy limit 1;
  jb := (select string_agg(letter::text,'' order by letter) from banned_letters where player_id=tgt);
  perform use_perk(t[1], tgt);
  perform t_assert((select string_agg(letter::text,'' order by letter) from banned_letters where player_id=d[1]) = jb, 'jester: my team took enemy rack');
  perform t_assert((select string_agg(letter::text,'' order by letter) from banned_letters where player_id=tgt) = ja, 'jester: enemy took mine');
  perform t_assert((select count(distinct l) from (select string_agg(letter::text,'' order by letter) l from banned_letters b join players p on p.id=b.player_id where p.team_id=mine group by p.id) x)=1, 'mirrored mine');
  perform t_assert((select count(distinct l) from (select string_agg(letter::text,'' order by letter) l from banned_letters b join players p on p.id=b.player_id where p.team_id=enemy group by p.id) x)=1, 'mirrored enemy');
  -- enemy attacks my team; my hero absorbs
  select id into p_hero from players where team_id=mine and class='hero';
  if p_hero is null then select id into p_hero from players where id=d[2]; end if;
  raise notice 'hero on my team? %', (select class from players where id=p_hero);
  raise notice 'TEAM3 OK';
end $$;

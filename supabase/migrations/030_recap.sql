-- Game recap for the replay + share card. Only available once the game is over.
create or replace function get_recap(p_code text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare v_room rooms; v_rounds jsonb; v_best jsonb;
begin
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.phase <> 'finished' then raise exception 'WRONG_PHASE'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'round', r.round,
      'prompt', (select text from prompts where id = v_room.used_prompts[r.round]),
      'answers', coalesce((select jsonb_agg(jsonb_build_object(
          'player_id', a.player_id, 'name', p.name, 'word', a.word, 'valid', a.valid, 'points', a.points,
          'legend', exists (select 1 from marks m where m.player_id = a.player_id and m.round = a.round and m.kind = 'legend'))
          order by a.points desc, a.id)
        from answers a join players p on p.id = a.player_id where a.room_id = v_room.id and a.round = r.round), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(e.payload || jsonb_build_object('id', e.id) order by e.id)
        from events e where e.room_id = v_room.id and e.kind = 'action' and e.round = r.round
          and e.payload->>'type' in ('attack','hack','absorb','chaos','ult','legend','mimic','steal','bet_win','bet_lose','caught','chicken')), '[]'::jsonb)
    ) order by r.round), '[]'::jsonb)
  into v_rounds
  from (select distinct round from answers where room_id = v_room.id) r;

  select jsonb_build_object('name', p.name, 'word', a.word, 'points', a.points, 'round', a.round) into v_best
  from answers a join players p on p.id = a.player_id
  where a.room_id = v_room.id and a.valid order by a.points desc, char_length(a.word) desc limit 1;

  return jsonb_build_object('rounds', v_rounds, 'best', v_best);
end $$;
revoke execute on function get_recap(text) from public;
grant execute on function get_recap(text) to anon, authenticated;

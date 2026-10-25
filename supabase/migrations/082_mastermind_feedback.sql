-- Mastermind v3 feedback: guesses also report letters that are in the word but in the wrong place ('near')
-- and which positions were exact ('hit_pos'), so the solver's letter boxes can fill in as they deduce.
create or replace function _mm_hit_pos(p_word text, p_guess text) returns int[] language sql immutable as $$
  select coalesce(array_agg(i order by i), '{}') from generate_series(1, least(length(p_word), length(p_guess))) i
  where substr(p_word, i, 1) = substr(p_guess, i, 1)
$$;

-- letters shared with the word (counted with multiplicity) minus the exact hits
create or replace function _mm_near(p_word text, p_guess text) returns int language sql immutable as $$
  select greatest(0, coalesce(sum(least(
    (length(p_word) - length(replace(p_word, c, ''))),
    (length(p_guess) - length(replace(p_guess, c, ''))))), 0)::int - _mm_hits(p_word, p_guess))
  from (select chr(x) as c from generate_series(97, 122) x) l
$$;

create or replace function mm_state(p_token uuid) returns json language plpgsql security definer set search_path = public as $$
declare me mm_players; r mm_rooms; reveal boolean;
begin
  me := _mm_player(p_token);
  perform _mm_tick(me.room_id);
  select * into r from mm_rooms where id = me.room_id;
  me := _mm_player(p_token);
  reveal := (r.mastermind_id = me.id) or r.status in ('between', 'finished');
  return json_build_object(
    'room', json_build_object('code', r.code, 'status', r.status, 'quick', r.quick, 'round', r.round, 'total_rounds', r.total_rounds,
      'round_secs', r.round_secs, 'round_ends', (extract(epoch from r.round_ends) * 1000)::bigint,
      'between_until', (extract(epoch from r.between_until) * 1000)::bigint, 'server_now', (extract(epoch from now()) * 1000)::bigint,
      'clues_left', r.clues_left, 'clue_limit', r.clue_limit, 'solved_by', r.solved_by, 'mastermind_id', r.mastermind_id,
      'can_reveal', r.word is not null and coalesce(array_length(r.revealed, 1), 0) < length(r.word) / 2),
    'me', json_build_object('id', me.id, 'name', me.name, 'is_host', me.is_host, 'hp', me.hp, 'out', me.is_out, 'points', me.points,
      'is_mastermind', r.mastermind_id = me.id, 'backing', me.backing),
    'word', case when reveal and r.word is not null and r.status <> 'lobby' then r.word else null end,
    'slots', case when r.word is null or r.status = 'lobby' then '[]'::json else
      (select json_agg(case when reveal or i = any(r.revealed) then upper(substr(r.word, i, 1)) else null end order by i)
       from generate_series(1, length(r.word)) i) end,
    'revealed', to_json(r.revealed),
    'players', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name, 'points', p.points, 'hp', p.hp, 'out', p.is_out,
        'is_host', p.is_host, 'is_mastermind', p.id = r.mastermind_id) order by p.seat), '[]'::json) from mm_players p where p.room_id = r.id),
    'clues', (select coalesce(json_agg(c.body order by c.id), '[]'::json) from mm_clues c where c.room_id = r.id and c.round = r.round),
    'guesses', (select coalesce(json_agg(json_build_object('player_id', g.player_id, 'text', g.body, 'correct', g.correct,
        'hits', _mm_hits(r.word, g.body), 'near', _mm_near(r.word, g.body), 'hit_pos', _mm_hit_pos(r.word, g.body)) order by g.id), '[]'::json)
        from mm_guesses g where g.room_id = r.id and g.round = r.round),
    'reacts', (select coalesce(json_agg(json_build_object('id', x.id, 'player_id', x.player_id, 'emoji', x.emoji) order by x.id), '[]'::json)
        from mm_reacts x where x.room_id = r.id and x.created_at > now() - interval '6 seconds')
  );
end $$;

do $$ declare f text; begin
  execute 'revoke execute on function mm_state(uuid) from public';
  execute 'grant execute on function mm_state(uuid) to anon, authenticated';
  foreach f in array array['_mm_hit_pos(text, text)','_mm_near(text, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

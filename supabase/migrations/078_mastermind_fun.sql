-- Mastermind v2: letter slots, "reveal a letter" power, Mastermind-style "in place" feedback, live reactions.
alter table mm_rooms add column if not exists revealed int[] not null default '{}';

create table if not exists mm_reacts (
  id bigserial primary key, room_id uuid not null references mm_rooms(id) on delete cascade,
  player_id uuid not null, emoji text not null, created_at timestamptz not null default now()
);
create index if not exists mm_reacts_room on mm_reacts (room_id, created_at desc);
alter table mm_reacts enable row level security;

-- letters of the guess that sit in the same position as the secret word
create or replace function _mm_hits(p_word text, p_guess text) returns int language sql immutable as $$
  select count(*)::int from generate_series(1, least(length(p_word), length(p_guess))) i
  where substr(p_word, i, 1) = substr(p_guess, i, 1)
$$;

create or replace function _mm_begin_round(p_room uuid) returns void language plpgsql security definer set search_path = public as $$
declare r mm_rooms; n int; mid uuid; w text[]; secs int;
begin
  select * into r from mm_rooms where id = p_room for update;
  select count(*) into n from mm_players where room_id = p_room;
  select id into mid from mm_players where room_id = p_room order by seat offset (r.round % n) limit 1;
  w := _mm_words();
  secs := case when r.quick then 45 else 90 end;
  update mm_players set hp = 3, is_out = false, backing = null where room_id = p_room;
  update mm_rooms set round = r.round + 1, mastermind_id = mid, word = w[1 + floor(random() * array_length(w, 1))::int],
    clues_left = clue_limit, round_secs = secs, round_ends = now() + make_interval(secs => secs), between_until = null,
    solved_by = null, revealed = '{}', status = 'round' where id = p_room;
end $$;

-- Mastermind spends one clue to light up a random hidden letter (never more than half the word)
create or replace function mm_reveal(p_token uuid) returns json language plpgsql security definer set search_path = public as $$
declare me mm_players; r mm_rooms; pos int; hidden int[];
begin
  me := _mm_player(p_token);
  perform _mm_tick(me.room_id);
  select * into r from mm_rooms where id = me.room_id for update;
  if r.status <> 'round' or r.mastermind_id <> me.id then raise exception 'NOT_ALLOWED'; end if;
  if r.clues_left <= 0 then raise exception 'NO_CLUES_LEFT'; end if;
  if coalesce(array_length(r.revealed, 1), 0) >= length(r.word) / 2 then raise exception 'MAX_REVEALS'; end if;
  select array_agg(i) into hidden from generate_series(1, length(r.word)) i where not (i = any(r.revealed));
  pos := hidden[1 + floor(random() * array_length(hidden, 1))::int];
  update mm_rooms set revealed = revealed || pos, clues_left = clues_left - 1 where id = r.id;
  insert into mm_clues (room_id, round, body) values (r.id, r.round, 'Letter ' || pos || ' is ' || upper(substr(r.word, pos, 1)));
  return json_build_object('pos', pos);
end $$;

create or replace function mm_react(p_token uuid, p_emoji text) returns void language plpgsql security definer set search_path = public as $$
declare me mm_players;
begin
  me := _mm_player(p_token);
  if p_emoji not in ('😱','🤔','🔥','😂','🕵️','👀') then raise exception 'BAD_EMOJI'; end if;
  if exists (select 1 from mm_reacts where player_id = me.id and created_at > now() - interval '700 milliseconds') then return; end if;
  insert into mm_reacts (room_id, player_id, emoji) values (me.room_id, me.id, p_emoji);
  delete from mm_reacts where room_id = me.room_id and created_at < now() - interval '1 minute';
end $$;

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
        'hits', _mm_hits(r.word, g.body)) order by g.id), '[]'::json)
        from mm_guesses g where g.room_id = r.id and g.round = r.round),
    'reacts', (select coalesce(json_agg(json_build_object('id', x.id, 'player_id', x.player_id, 'emoji', x.emoji) order by x.id), '[]'::json)
        from mm_reacts x where x.room_id = r.id and x.created_at > now() - interval '6 seconds')
  );
end $$;

do $$ declare f text; begin
  foreach f in array array['mm_reveal(uuid)','mm_react(uuid, text)','mm_state(uuid)'] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['_mm_hits(text, text)','_mm_begin_round(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

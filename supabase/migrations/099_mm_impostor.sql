-- Mastermind: hidden Impostor, voting, 4-player minimum, honest scoring, lazy-Mastermind penalty.
-- Additive columns/tables + CREATE OR REPLACE of the existing mm_* functions (same signatures).

alter table mm_rooms add column if not exists impostor_id uuid;
alter table mm_rooms add column if not exists accused_id uuid;
alter table mm_rooms add column if not exists caught boolean;
alter table mm_rooms add column if not exists lazy boolean not null default false;
alter table mm_rooms add column if not exists decoys int not null default 0;
alter table mm_guesses add column if not exists decoy boolean not null default false;
alter table mm_players add column if not exists lazy_count int not null default 0;
alter table mm_players add column if not exists caught_count int not null default 0;
alter table mm_players add column if not exists fooled_count int not null default 0;

create table if not exists mm_votes (
  room_id uuid not null references mm_rooms(id) on delete cascade,
  round int not null,
  voter_id uuid not null references mm_players(id) on delete cascade,
  target_id uuid not null references mm_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, round, voter_id)
);
alter table mm_votes enable row level security;

-- what a decoy guess "looks like" to the table: the word with two pairs of letters swapped
create or replace function _mm_fake(p_word text) returns text language sql immutable as $$
  select case when length(p_word) < 4 then p_word
    else substr(p_word,2,1) || substr(p_word,1,1) || substr(p_word,4,1) || substr(p_word,3,1) || substr(p_word,5) end
$$;

create or replace function mm_start(p_token uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players; r mm_rooms; n int;
begin
  me := _mm_player(p_token);
  select * into r from mm_rooms where id = me.room_id for update;
  if not me.is_host then raise exception 'NOT_HOST'; end if;
  if r.status <> 'lobby' then return; end if;
  select count(*) into n from mm_players where room_id = r.id and not sitting;
  if n < 4 then raise exception 'NEED_PLAYERS'; end if;
  update mm_rooms set total_rounds = case when quick then least(n, 3) else n end, round = 0 where id = r.id;
  perform _mm_begin_round(r.id);
end $$;

create or replace function _mm_begin_round(p_room uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare r mm_rooms; n int; mid uuid; iid uuid; w text[]; secs int;
begin
  select * into r from mm_rooms where id = p_room for update;
  select count(*) into n from mm_players where room_id = p_room and not sitting;
  select id into mid from mm_players where room_id = p_room and not sitting order by seat offset (r.round % n) limit 1;
  select id into iid from mm_players where room_id = p_room and not sitting and id <> mid order by random() limit 1;
  w := _mm_words();
  secs := case when r.quick then 45 else 90 end;
  update mm_players set hp = 3, is_out = sitting, backing = null where room_id = p_room;
  update mm_rooms set round = r.round + 1, mastermind_id = mid, impostor_id = iid, accused_id = null, caught = null, lazy = false, decoys = 0,
    word = w[1 + floor(random() * array_length(w, 1))::int],
    clues_left = clue_limit, round_secs = secs, round_ends = now() + make_interval(secs => secs), between_until = null,
    solved_by = null, revealed = '{}', status = 'round' where id = p_room;
end $$;

create or replace function _mm_end_round(p_room uuid, p_solver uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare r mm_rooms; left_s numeric; acc uuid; n_top int; was_caught boolean; was_lazy boolean := false;
begin
  select * into r from mm_rooms where id = p_room for update;
  if r.status <> 'round' then return; end if;
  left_s := greatest(0, extract(epoch from (r.round_ends - now())));

  -- who did the table accuse? plurality wins, a tie accuses nobody
  with t as (select target_id, count(*) c from mm_votes where room_id = p_room and round = r.round group by 1)
  select (select target_id from t order by c desc limit 1),
         (select count(*) from t where c = (select max(c) from t))
    into acc, n_top;
  if n_top is distinct from 1 then acc := null; end if;
  was_caught := acc is not null and acc = r.impostor_id;

  if p_solver is not null then
    update mm_players set points = points + 10 + floor(left_s * 10 / r.round_secs)::int where id = p_solver;
    -- the Mastermind is paid for a case that got solved, and for clues good enough to solve it fast; saying less never pays
    update mm_players set points = points + 6 + (case when left_s * 2 > r.round_secs then 2 else 0 end) where id = r.mastermind_id;
    update mm_players set points = points + 3 where room_id = p_room and is_out and not sitting and backing = p_solver;
  else
    was_lazy := r.clues_left > 0;
    update mm_players set points = greatest(0, points - case when was_lazy then 5 else 2 end),
      lazy_count = lazy_count + case when was_lazy then 1 else 0 end where id = r.mastermind_id;
  end if;

  -- the Impostor hunt
  if r.impostor_id is not null then
    update mm_players set points = points + 4
      where id in (select voter_id from mm_votes where room_id = p_room and round = r.round and target_id = r.impostor_id);
    if was_caught then
      update mm_players set caught_count = caught_count + 1 where id = r.impostor_id;
    else
      update mm_players set points = points + 6 + (case when p_solver is null then 3 else 0 end), fooled_count = fooled_count + 1
        where id = r.impostor_id;
    end if;
  end if;

  update mm_rooms set status = 'between', solved_by = p_solver, accused_id = acc, caught = was_caught, lazy = was_lazy,
    between_until = now() + interval '12 seconds' where id = p_room;
end $$;

create or replace function mm_vote(p_token uuid, p_target uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players; r mm_rooms; t mm_players;
begin
  me := _mm_player(p_token);
  perform _mm_tick(me.room_id);
  select * into r from mm_rooms where id = me.room_id for update;
  if r.status <> 'round' or r.mastermind_id = me.id or me.sitting then raise exception 'NOT_ALLOWED'; end if;
  select * into t from mm_players where id = p_target and room_id = r.id;
  if t.id is null or t.id = me.id or t.id = r.mastermind_id or t.sitting then raise exception 'BAD_TARGET'; end if;
  insert into mm_votes (room_id, round, voter_id, target_id) values (r.id, r.round, me.id, t.id)
    on conflict (room_id, round, voter_id) do update set target_id = excluded.target_id, created_at = now();
end $$;

create or replace function mm_clue(p_token uuid, p_text text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players; r mm_rooms; t text; letters text;
begin
  me := _mm_player(p_token);
  perform _mm_tick(me.room_id);
  select * into r from mm_rooms where id = me.room_id for update;
  if r.status <> 'round' or r.mastermind_id <> me.id then raise exception 'NOT_ALLOWED'; end if;
  if r.clues_left <= 0 then raise exception 'NO_CLUES_LEFT'; end if;
  t := left(trim(coalesce(p_text, '')), 80);
  if length(t) < 3 then raise exception 'EMPTY'; end if;
  letters := regexp_replace(lower(t), '[^a-z]', '', 'g');
  -- the clue may not contain the word, its stem, the word spaced out or backwards, or an anagram of it
  if position(r.word in lower(t)) > 0
     or position(left(r.word, greatest(4, length(r.word) - 2)) in lower(t)) > 0
     or position(r.word in letters) > 0
     or position(reverse(r.word) in letters) > 0
     or exists (
       select 1 from regexp_split_to_table(lower(t), '[^a-z]+') w
       where length(w) = length(r.word)
         and (select string_agg(c, '' order by c) from regexp_split_to_table(w, '') c)
           = (select string_agg(c, '' order by c) from regexp_split_to_table(r.word, '') c)
     ) then
    raise exception 'REVEALS_WORD';
  end if;
  insert into mm_clues (room_id, round, body) values (r.id, r.round, t);
  update mm_rooms set clues_left = clues_left - 1 where id = r.id;
end $$;

create or replace function mm_guess(p_token uuid, p_text text) returns json
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players; r mm_rooms; g text; ok boolean; alive int;
begin
  me := _mm_player(p_token);
  perform _mm_tick(me.room_id);
  select * into r from mm_rooms where id = me.room_id for update;
  if r.status <> 'round' or r.mastermind_id = me.id or me.is_out then raise exception 'NOT_ALLOWED'; end if;
  -- detectives cannot brute-force: guessing opens only once the Mastermind has put two clues on the file
  if (select count(*) from mm_clues where room_id = r.id and round = r.round) < 2 then raise exception 'WAIT_FOR_CLUES'; end if;
  g := left(regexp_replace(lower(trim(coalesce(p_text, ''))), '[^a-z]', '', 'g'), 20);
  if length(g) < 1 then raise exception 'EMPTY'; end if;
  -- the Impostor knows the word, so their "guesses" are decoys: they cannot win and cost no life, but the board lies about them
  if me.id = r.impostor_id then
    if r.decoys >= 2 then raise exception 'DECOY_LIMIT'; end if;
    insert into mm_guesses (room_id, round, player_id, body, correct, decoy) values (r.id, r.round, me.id, g, false, true);
    update mm_rooms set decoys = decoys + 1 where id = r.id;
    return json_build_object('correct', false, 'decoy', true);
  end if;
  ok := (g = r.word);
  insert into mm_guesses (room_id, round, player_id, body, correct) values (r.id, r.round, me.id, g, ok);
  if ok then
    perform _mm_end_round(r.id, me.id);
    return json_build_object('correct', true);
  end if;
  update mm_players set hp = hp - 1, is_out = (hp - 1 <= 0) where id = me.id;
  select count(*) into alive from mm_players
    where room_id = r.id and id <> r.mastermind_id and id is distinct from r.impostor_id and not is_out and not sitting;
  if alive = 0 then perform _mm_end_round(r.id, null); end if;
  return json_build_object('correct', false);
end $$;

create or replace function mm_again(p_token uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players;
begin
  me := _mm_player(p_token);
  if not me.is_host then raise exception 'NOT_HOST'; end if;
  delete from mm_clues where room_id = me.room_id; delete from mm_guesses where room_id = me.room_id; delete from mm_votes where room_id = me.room_id;
  update mm_players set points = 0, hp = 3, is_out = sitting, backing = null, lazy_count = 0, caught_count = 0, fooled_count = 0 where room_id = me.room_id;
  update mm_rooms set status = 'lobby', round = 0, word = null, mastermind_id = null, impostor_id = null, accused_id = null, caught = null, lazy = false, decoys = 0, solved_by = null
    where id = me.room_id and status = 'finished';
end $$;

create or replace function mm_state(p_token uuid) returns json
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players; r mm_rooms; reveal boolean; ended boolean; myvote uuid;
begin
  me := _mm_player(p_token);
  perform _mm_tick(me.room_id);
  select * into r from mm_rooms where id = me.room_id;
  me := _mm_player(p_token);
  ended := r.status in ('between', 'finished');
  reveal := (r.mastermind_id = me.id) or (r.impostor_id = me.id) or ended;
  select target_id into myvote from mm_votes where room_id = r.id and round = r.round and voter_id = me.id;
  return json_build_object(
    'room', json_build_object('code', r.code, 'status', r.status, 'quick', r.quick, 'round', r.round, 'total_rounds', r.total_rounds,
      'round_secs', r.round_secs, 'round_ends', (extract(epoch from r.round_ends) * 1000)::bigint,
      'between_until', (extract(epoch from r.between_until) * 1000)::bigint, 'server_now', (extract(epoch from now()) * 1000)::bigint,
      'clues_left', r.clues_left, 'clue_limit', r.clue_limit, 'solved_by', r.solved_by, 'mastermind_id', r.mastermind_id,
      'can_reveal', r.word is not null and coalesce(array_length(r.revealed, 1), 0) < length(r.word) / 2,
      'impostor_id', case when ended then r.impostor_id else null end,
      'accused_id', case when ended then r.accused_id else null end,
      'caught', case when ended then r.caught else null end,
      'lazy', case when ended then r.lazy else false end,
      'decoys_left', greatest(0, 2 - r.decoys), 'min_players', 4),
    'me', json_build_object('id', me.id, 'name', me.name, 'is_host', me.is_host, 'hp', me.hp, 'out', me.is_out, 'points', me.points,
      'is_mastermind', r.mastermind_id = me.id, 'is_impostor', r.impostor_id = me.id and r.status <> 'lobby',
      'role', case when r.status = 'lobby' then null when r.mastermind_id = me.id then 'mastermind' when r.impostor_id = me.id then 'impostor' else 'detective' end,
      'vote', myvote, 'backing', me.backing, 'sitting', me.sitting),
    'word', case when reveal and r.word is not null and r.status <> 'lobby' then r.word else null end,
    'slots', case when r.word is null or r.status = 'lobby' then '[]'::json else
      (select json_agg(case when reveal or i = any(r.revealed) then upper(substr(r.word, i, 1)) else null end order by i)
       from generate_series(1, length(r.word)) i) end,
    'revealed', to_json(r.revealed),
    'players', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name, 'points', p.points, 'hp', p.hp, 'out', p.is_out,
        'is_host', p.is_host, 'is_mastermind', p.id = r.mastermind_id, 'sitting', p.sitting,
        'is_impostor', ended and p.id = r.impostor_id,
        'voted', exists (select 1 from mm_votes v where v.room_id = r.id and v.round = r.round and v.voter_id = p.id),
        'votes', case when ended then (select count(*) from mm_votes v where v.room_id = r.id and v.round = r.round and v.target_id = p.id) else null end,
        'lazy_count', p.lazy_count, 'caught_count', p.caught_count, 'fooled_count', p.fooled_count) order by p.seat), '[]'::json)
        from mm_players p where p.room_id = r.id),
    'clues', (select coalesce(json_agg(c.body order by c.id), '[]'::json) from mm_clues c where c.room_id = r.id and c.round = r.round),
    'guesses', (select coalesce(json_agg(json_build_object('player_id', g.player_id, 'text', g.body, 'correct', g.correct,
        'decoy', case when ended then g.decoy else null end,
        'hits', _mm_hits(case when g.decoy then _mm_fake(r.word) else r.word end, g.body),
        'near', _mm_near(case when g.decoy then _mm_fake(r.word) else r.word end, g.body),
        'hit_pos', _mm_hit_pos(case when g.decoy then _mm_fake(r.word) else r.word end, g.body)) order by g.id), '[]'::json)
        from mm_guesses g where g.room_id = r.id and g.round = r.round),
    'reacts', (select coalesce(json_agg(json_build_object('id', x.id, 'player_id', x.player_id, 'emoji', x.emoji) order by x.id), '[]'::json)
        from mm_reacts x where x.room_id = r.id and x.created_at > now() - interval '6 seconds')
  );
end $$;

grant execute on function mm_vote(uuid, uuid) to anon, authenticated;
grant execute on function mm_start(uuid), mm_clue(uuid, text), mm_guess(uuid, text), mm_again(uuid), mm_state(uuid) to anon, authenticated;

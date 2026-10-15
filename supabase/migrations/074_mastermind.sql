-- Mastermind mode (Lab): one player secretly holds a word and gives limited clues; the others race to crack it.
-- Standalone tables + RPCs, separate from the classic room engine. The word is only ever returned to the Mastermind (or after the round).
create table if not exists mm_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text not null default 'lobby',           -- lobby | round | between | finished
  quick boolean not null default false,
  round int not null default 0,
  total_rounds int not null default 0,
  mastermind_id uuid,
  word text,
  clue_limit int not null default 3,
  clues_left int not null default 3,
  round_secs int not null default 90,
  round_ends timestamptz,
  between_until timestamptz,
  solved_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists mm_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references mm_rooms(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  name text not null,
  seat int not null,
  is_host boolean not null default false,
  points int not null default 0,
  hp int not null default 3,
  is_out boolean not null default false,
  backing uuid
);
create table if not exists mm_clues (
  id bigserial primary key, room_id uuid not null references mm_rooms(id) on delete cascade,
  round int not null, body text not null, created_at timestamptz not null default now()
);
create table if not exists mm_guesses (
  id bigserial primary key, room_id uuid not null references mm_rooms(id) on delete cascade,
  round int not null, player_id uuid not null, body text not null, correct boolean not null default false,
  created_at timestamptz not null default now()
);
alter table mm_rooms enable row level security;
alter table mm_players enable row level security;
alter table mm_clues enable row level security;
alter table mm_guesses enable row level security;

create or replace function _mm_words() returns text[] language sql immutable as $$
  select array['planet','harbor','castle','dragon','shadow','window','garden','pirate','silver','anchor','bridge','candle',
  'forest','island','jungle','kitten','lantern','magnet','needle','orange','pencil','rabbit','saddle','tunnel','violin',
  'whisper','yellow','zipper','basket','bottle','button','camera','carpet','cheese','circus','coffee','copper','desert',
  'engine','falcon','finger','flower','guitar','hammer','insect','jacket','kettle','ladder','marble','mirror','napkin',
  'office','parrot','pepper','pillow','pocket','puzzle','rocket','school','spider','sponge','thunder','ticket','tomato',
  'turtle','valley','wallet','wizard','winter','banana','bucket','cactus','donkey','eagle','feather','glacier','honey']
$$;

create or replace function _mm_player(p_token uuid) returns mm_players language plpgsql security definer set search_path = public as $$
declare v mm_players;
begin
  select * into v from mm_players where token = p_token;
  if not found then raise exception 'BAD_TOKEN'; end if;
  return v;
end $$;

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
    solved_by = null, status = 'round' where id = p_room;
end $$;

create or replace function _mm_end_round(p_room uuid, p_solver uuid) returns void language plpgsql security definer set search_path = public as $$
declare r mm_rooms; left_s numeric;
begin
  select * into r from mm_rooms where id = p_room for update;
  if r.status <> 'round' then return; end if;
  if p_solver is not null then
    left_s := greatest(0, extract(epoch from (r.round_ends - now())));
    update mm_players set points = points + 10 + floor(left_s * 10 / r.round_secs)::int + r.clues_left * 3 where id = p_solver;
    update mm_players set points = points + 4 + r.clues_left * 2 where id = r.mastermind_id;
    update mm_players set points = points + 3 where room_id = p_room and is_out and backing = p_solver;
  else
    update mm_players set points = greatest(0, points - 2) where id = r.mastermind_id;
  end if;
  update mm_rooms set status = 'between', solved_by = p_solver, between_until = now() + interval '8 seconds' where id = p_room;
end $$;

create or replace function _mm_tick(p_room uuid) returns void language plpgsql security definer set search_path = public as $$
declare r mm_rooms;
begin
  select * into r from mm_rooms where id = p_room for update;
  if r.status = 'round' and now() > r.round_ends then
    perform _mm_end_round(p_room, null);
  elsif r.status = 'between' and now() > r.between_until then
    if r.round >= r.total_rounds then update mm_rooms set status = 'finished' where id = p_room;
    else perform _mm_begin_round(p_room); end if;
  end if;
end $$;

create or replace function mm_create(p_name text, p_quick boolean default false) returns json language plpgsql security definer set search_path = public as $$
declare v_code text; v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; v_room uuid; v_p mm_players; nm text;
begin
  nm := left(trim(coalesce(p_name, '')), 20);
  if length(nm) < 1 then raise exception 'NAME'; end if;
  if (select count(*) from mm_rooms where created_at > now() - interval '1 minute') > 100 then raise exception 'BUSY'; end if;
  loop
    v_code := '';
    for i in 1..4 loop v_code := v_code || substr(v_alpha, 1 + floor(random() * 32)::int, 1); end loop;
    exit when not exists (select 1 from mm_rooms where code = v_code);
  end loop;
  insert into mm_rooms (code, quick) values (v_code, coalesce(p_quick, false)) returning id into v_room;
  insert into mm_players (room_id, name, seat, is_host) values (v_room, nm, 0, true) returning * into v_p;
  return json_build_object('code', v_code, 'token', v_p.token, 'player_id', v_p.id);
end $$;

create or replace function mm_join(p_code text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare r mm_rooms; v_p mm_players; nm text; n int;
begin
  nm := left(trim(coalesce(p_name, '')), 20);
  if length(nm) < 1 then raise exception 'NAME'; end if;
  select * into r from mm_rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.status <> 'lobby' then raise exception 'ALREADY_STARTED'; end if;
  select count(*) into n from mm_players where room_id = r.id;
  if n >= 8 then raise exception 'ROOM_FULL'; end if;
  insert into mm_players (room_id, name, seat) values (r.id, nm, n) returning * into v_p;
  return json_build_object('code', r.code, 'token', v_p.token, 'player_id', v_p.id);
end $$;

create or replace function mm_start(p_token uuid) returns void language plpgsql security definer set search_path = public as $$
declare me mm_players; r mm_rooms; n int;
begin
  me := _mm_player(p_token);
  select * into r from mm_rooms where id = me.room_id for update;
  if not me.is_host then raise exception 'NOT_HOST'; end if;
  if r.status <> 'lobby' then return; end if;
  select count(*) into n from mm_players where room_id = r.id;
  if n < 2 then raise exception 'NEED_PLAYERS'; end if;
  update mm_rooms set total_rounds = case when quick then least(n, 3) else n end, round = 0 where id = r.id;
  perform _mm_begin_round(r.id);
end $$;

create or replace function mm_clue(p_token uuid, p_text text) returns void language plpgsql security definer set search_path = public as $$
declare me mm_players; r mm_rooms; t text;
begin
  me := _mm_player(p_token);
  perform _mm_tick(me.room_id);
  select * into r from mm_rooms where id = me.room_id for update;
  if r.status <> 'round' or r.mastermind_id <> me.id then raise exception 'NOT_ALLOWED'; end if;
  if r.clues_left <= 0 then raise exception 'NO_CLUES_LEFT'; end if;
  t := left(trim(coalesce(p_text, '')), 80);
  if length(t) < 2 then raise exception 'EMPTY'; end if;
  -- the clue may not contain the secret word, its stem, or the word spaced out
  if position(r.word in lower(t)) > 0
     or position(left(r.word, greatest(4, length(r.word) - 2)) in lower(t)) > 0
     or position(r.word in regexp_replace(lower(t), '[^a-z]', '', 'g')) > 0 then
    raise exception 'REVEALS_WORD';
  end if;
  insert into mm_clues (room_id, round, body) values (r.id, r.round, t);
  update mm_rooms set clues_left = clues_left - 1 where id = r.id;
end $$;

create or replace function mm_guess(p_token uuid, p_text text) returns json language plpgsql security definer set search_path = public as $$
declare me mm_players; r mm_rooms; g text; ok boolean; alive int;
begin
  me := _mm_player(p_token);
  perform _mm_tick(me.room_id);
  select * into r from mm_rooms where id = me.room_id for update;
  if r.status <> 'round' or r.mastermind_id = me.id or me.is_out then raise exception 'NOT_ALLOWED'; end if;
  g := left(regexp_replace(lower(trim(coalesce(p_text, ''))), '[^a-z]', '', 'g'), 20);
  if length(g) < 1 then raise exception 'EMPTY'; end if;
  ok := (g = r.word);
  insert into mm_guesses (room_id, round, player_id, body, correct) values (r.id, r.round, me.id, g, ok);
  if ok then
    perform _mm_end_round(r.id, me.id);
    return json_build_object('correct', true);
  end if;
  update mm_players set hp = hp - 1, is_out = (hp - 1 <= 0) where id = me.id;
  select count(*) into alive from mm_players where room_id = r.id and id <> r.mastermind_id and not is_out;
  if alive = 0 then perform _mm_end_round(r.id, null); end if;
  return json_build_object('correct', false);
end $$;

-- knocked-out players stay in the round: back one live guesser; if they solve it, the backer earns partial points
create or replace function mm_back(p_token uuid, p_target uuid) returns void language plpgsql security definer set search_path = public as $$
declare me mm_players; r mm_rooms;
begin
  me := _mm_player(p_token);
  perform _mm_tick(me.room_id);
  select * into r from mm_rooms where id = me.room_id;
  if r.status <> 'round' or not me.is_out or me.id = r.mastermind_id then raise exception 'NOT_ALLOWED'; end if;
  if not exists (select 1 from mm_players where id = p_target and room_id = r.id and id <> r.mastermind_id and not is_out) then raise exception 'BAD_TARGET'; end if;
  update mm_players set backing = p_target where id = me.id;
end $$;

create or replace function mm_again(p_token uuid) returns void language plpgsql security definer set search_path = public as $$
declare me mm_players;
begin
  me := _mm_player(p_token);
  if not me.is_host then raise exception 'NOT_HOST'; end if;
  delete from mm_clues where room_id = me.room_id; delete from mm_guesses where room_id = me.room_id;
  update mm_players set points = 0, hp = 3, is_out = false, backing = null where room_id = me.room_id;
  update mm_rooms set status = 'lobby', round = 0, word = null, mastermind_id = null, solved_by = null where id = me.room_id and status = 'finished';
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
      'clues_left', r.clues_left, 'clue_limit', r.clue_limit, 'solved_by', r.solved_by, 'mastermind_id', r.mastermind_id),
    'me', json_build_object('id', me.id, 'name', me.name, 'is_host', me.is_host, 'hp', me.hp, 'out', me.is_out, 'points', me.points,
      'is_mastermind', r.mastermind_id = me.id, 'backing', me.backing),
    'word', case when reveal and r.word is not null and r.status <> 'lobby' then r.word else null end,
    'players', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name, 'points', p.points, 'hp', p.hp, 'out', p.is_out,
        'is_host', p.is_host, 'is_mastermind', p.id = r.mastermind_id) order by p.seat), '[]'::json) from mm_players p where p.room_id = r.id),
    'clues', (select coalesce(json_agg(c.body order by c.id), '[]'::json) from mm_clues c where c.room_id = r.id and c.round = r.round),
    'guesses', (select coalesce(json_agg(json_build_object('player_id', g.player_id, 'text', g.body, 'correct', g.correct) order by g.id), '[]'::json)
        from mm_guesses g where g.room_id = r.id and g.round = r.round)
  );
end $$;

do $$ declare f text; begin
  foreach f in array array['mm_create(text, boolean)','mm_join(text, text)','mm_start(uuid)','mm_clue(uuid, text)','mm_guess(uuid, text)','mm_back(uuid, uuid)','mm_again(uuid)','mm_state(uuid)'] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

do $$ declare f text; begin
  foreach f in array array['_mm_words()','_mm_player(uuid)','_mm_begin_round(uuid)','_mm_end_round(uuid, uuid)','_mm_tick(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

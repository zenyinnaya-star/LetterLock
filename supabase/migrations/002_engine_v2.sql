-- Letterlock engine v2: consolidated schema + RPCs.
-- Keeps public.words and public.prompts (seed data). Rebuilds all game tables/functions.

-- ───────────── teardown of v1 ─────────────
drop function if exists create_room(text, player_class);
drop function if exists join_room(text, text, player_class);
drop function if exists get_room_state(uuid, uuid);
drop function if exists submit_answer(uuid, uuid, text);
drop function if exists submit_guess(uuid, uuid, uuid, text);
drop function if exists play_card(uuid, uuid, bigint, uuid);
drop function if exists add_random_letter(uuid, int, text);
drop function if exists phase_duration(room_phase, int, boolean);
drop function if exists start_game(uuid, uuid);
drop function if exists advance_phase(uuid);
drop function if exists gen_room_code();
drop table if exists cards, hints, intel, pending_additions, guesses, answers, banned_letters, events, players, rooms cascade;
drop type if exists card_kind;
drop type if exists player_class;
drop type if exists room_phase;
drop extension if exists http;

-- ───────────── types ─────────────
create type room_phase as enum ('lobby','answer','reveal','guess','react','duel_intro','finished');
create type player_class as enum ('ninja','mastermind','hero','villain');
create type card_kind as enum ('attack','shield','cleanse');

-- ───────────── tables ─────────────
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  phase room_phase not null default 'lobby',
  round int not null default 0,
  duel boolean not null default false,
  state_version bigint not null default 0,
  host_id uuid,
  winner_id uuid,
  phase_ends_at timestamptz,
  prompt_id bigint references prompts(id),
  used_prompts bigint[] not null default '{}',
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20),
  class player_class not null,
  strikes int not null default 0,
  points int not null default 0,
  letters_stacked int not null default 0,
  eliminated boolean not null default false,
  eliminated_round int,
  perk_used boolean not null default false,
  perk_round int,
  react_ready boolean not null default false,
  last_seen timestamptz not null default now(),
  joined_at timestamptz not null default clock_timestamp()
);
create index players_room_idx on players(room_id);
create unique index players_room_name_uq on players(room_id, lower(name));

create table banned_letters (
  id bigserial primary key,
  player_id uuid not null references players(id) on delete cascade,
  letter char(1) not null check (letter ~ '^[A-Z]$'),
  added_round int not null default 0,
  source text not null default 'system',
  revealed boolean not null default false,
  unique (player_id, letter)
);

create table answers (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round int not null,
  word text not null default '',
  valid boolean not null default false,
  reason text,
  points int not null default 0,
  created_at timestamptz not null default now(),
  unique (player_id, round)
);
create index answers_room_round_idx on answers(room_id, round);

create table guesses (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  guesser_id uuid not null references players(id) on delete cascade,
  target_id uuid not null references players(id) on delete cascade,
  letter char(1) not null,
  correct boolean not null,
  created_at timestamptz not null default now(),
  unique (guesser_id, round)
);
create index guesses_room_round_idx on guesses(room_id, round);

create table cards (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  owner_id uuid not null references players(id) on delete cascade,
  kind card_kind not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create index cards_owner_idx on cards(owner_id) where not used;

create table pending_additions (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  target_id uuid not null references players(id) on delete cascade,
  source_id uuid references players(id) on delete set null,
  kind text not null default 'attack',          -- attack | ninja
  amount int not null default 1,
  status text not null default 'pending',       -- pending | blocked | applied
  absorbed_by uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);
create index pending_room_round_idx on pending_additions(room_id, round);

create table intel (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round int not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table hints (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table events (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  round int,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_room_idx on events(room_id, id);

-- ───────────── RLS: no client writes, only events readable (for realtime) ─────────────
alter table rooms enable row level security;
alter table players enable row level security;
alter table banned_letters enable row level security;
alter table answers enable row level security;
alter table guesses enable row level security;
alter table cards enable row level security;
alter table pending_additions enable row level security;
alter table intel enable row level security;
alter table hints enable row level security;
alter table events enable row level security;
create policy events_select on events for select to anon, authenticated using (true);

-- ───────────── internal helpers ─────────────
create or replace function _me(p_token uuid) returns players
language plpgsql security definer set search_path = public as $$
declare v players;
begin
  select * into v from players where token = p_token;
  if not found then raise exception 'BAD_TOKEN'; end if;
  return v;
end $$;

create or replace function _bump(p_room_id uuid, p_kind text, p_payload jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_round int;
begin
  update rooms set state_version = state_version + 1 where id = p_room_id returning round into v_round;
  insert into events (room_id, round, kind, payload) values (p_room_id, v_round, p_kind, coalesce(p_payload, '{}'::jsonb));
end $$;

create or replace function _gen_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from rooms where code = candidate);
  end loop;
  return candidate;
end $$;

create or replace function _answer_seconds(p_round int, p_duel boolean) returns int
language sql immutable as $$
  select case when p_duel then 20 else greatest(20, 60 - 10 * greatest(0, p_round - 1)) end;
$$;

create or replace function _alive(p_room_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from players where room_id = p_room_id and not eliminated;
$$;

-- Adds one random letter. Round 0 (starting letter) is always a consonant; max 2 vowels per player.
create or replace function _add_letter(p_player_id uuid, p_round int, p_source text) returns char(1)
language plpgsql security definer set search_path = public as $$
declare
  v_letter text;
  v_vowels int;
begin
  select count(*) into v_vowels from banned_letters
    where player_id = p_player_id and letter in ('A','E','I','O','U');
  select l into v_letter from (select chr(65 + i) as l from generate_series(0, 25) i) a
  where l not in (select letter::text from banned_letters where player_id = p_player_id)
    and not (l in ('A','E','I','O','U') and (p_round = 0 or v_vowels >= 2))
  order by random() limit 1;
  if v_letter is null then return null; end if;
  insert into banned_letters (player_id, letter, added_round, source)
    values (p_player_id, v_letter, p_round, p_source);
  return v_letter;
end $$;

create or replace function _strike(p_player_id uuid, p_round int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_strikes int;
begin
  update players set strikes = strikes + 1 where id = p_player_id returning strikes into v_strikes;
  if v_strikes >= 2 then
    update players set eliminated = true, eliminated_round = p_round where id = p_player_id and not eliminated;
    return true;
  end if;
  return false;
end $$;

create or replace function _set_phase(p_room_id uuid, p_phase room_phase, p_seconds int) returns void
language sql security definer set search_path = public as $$
  update rooms set phase = p_phase,
    phase_ends_at = case when p_seconds > 0 then now() + make_interval(secs => p_seconds) else null end
  where id = p_room_id;
$$;

create or replace function _start_round(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_prompt bigint;
begin
  select * into v_room from rooms where id = p_room_id;
  select id into v_prompt from prompts
    where active and not (id = any(v_room.used_prompts)) order by random() limit 1;
  if v_prompt is null then
    select id into v_prompt from prompts where active order by random() limit 1;
    update rooms set used_prompts = '{}' where id = p_room_id;
  end if;
  update rooms set
    round = round + 1,
    prompt_id = v_prompt,
    used_prompts = array_append(used_prompts, v_prompt),
    phase = 'answer',
    phase_ends_at = now() + make_interval(secs => _answer_seconds(round + 1, duel))
  where id = p_room_id;
  update players set react_ready = false where room_id = p_room_id;
end $$;

-- Ends the game. If nobody is left alive, the best of the last-eliminated group is restored as winner
-- (points desc, fewest letters, earliest joined).
create or replace function _finish(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_winner uuid;
  v_last int;
begin
  if _alive(p_room_id) = 1 then
    select id into v_winner from players where room_id = p_room_id and not eliminated;
  else
    select max(eliminated_round) into v_last from players where room_id = p_room_id and eliminated;
    select p.id into v_winner from players p
      where p.room_id = p_room_id and p.eliminated and p.eliminated_round = v_last
      order by p.points desc,
        (select count(*) from banned_letters bl where bl.player_id = p.id) asc,
        p.joined_at asc
      limit 1;
    update players set eliminated = false, eliminated_round = null where id = v_winner;
  end if;
  update rooms set phase = 'finished', phase_ends_at = null, winner_id = v_winner where id = p_room_id;
end $$;

-- ───────────── public RPCs ─────────────
create or replace function create_room(p_name text, p_class player_class) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room_id uuid;
  v_code text;
  v_player players;
  v_name text := trim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 1 or char_length(v_name) > 20 then raise exception 'BAD_NAME'; end if;
  if p_class is null then raise exception 'CLASS_REQUIRED'; end if;
  v_code := _gen_code();
  insert into rooms (code) values (v_code) returning id into v_room_id;
  insert into players (room_id, name, class) values (v_room_id, v_name, p_class) returning * into v_player;
  update rooms set host_id = v_player.id where id = v_room_id;
  perform _bump(v_room_id, 'room_created', jsonb_build_object('player_id', v_player.id));
  return jsonb_build_object('code', v_code, 'player_id', v_player.id, 'token', v_player.token);
end $$;

create or replace function join_room(p_code text, p_name text, p_class player_class) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_player players;
  v_name text := trim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 1 or char_length(v_name) > 20 then raise exception 'BAD_NAME'; end if;
  if p_class is null then raise exception 'CLASS_REQUIRED'; end if;
  select * into v_room from rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.phase <> 'lobby' then raise exception 'GAME_IN_PROGRESS'; end if;
  if (select count(*) from players where room_id = v_room.id) >= 8 then raise exception 'ROOM_FULL'; end if;
  begin
    insert into players (room_id, name, class) values (v_room.id, v_name, p_class) returning * into v_player;
  exception when unique_violation then
    raise exception 'NAME_TAKEN';
  end;
  perform _bump(v_room.id, 'player_joined', jsonb_build_object('player_id', v_player.id));
  return jsonb_build_object('code', v_room.code, 'player_id', v_player.id, 'token', v_player.token);
end $$;

create or replace function set_class(p_token uuid, p_class player_class) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  update players set class = p_class where id = v_me.id;
  perform _bump(v_room.id, 'class_changed', jsonb_build_object('player_id', v_me.id));
end $$;

create or replace function leave_room(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_next uuid;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase = 'lobby' then
    delete from players where id = v_me.id;
    if not exists (select 1 from players where room_id = v_room.id) then
      delete from rooms where id = v_room.id;
      return;
    end if;
  elsif v_room.phase <> 'finished' and not v_me.eliminated then
    update players set eliminated = true, eliminated_round = v_room.round, last_seen = now() - interval '1 hour'
      where id = v_me.id;
    if _alive(v_room.id) <= 1 then perform _finish(v_room.id); end if;
  else
    update players set last_seen = now() - interval '1 hour' where id = v_me.id;
  end if;
  if v_room.host_id = v_me.id then
    select id into v_next from players
      where room_id = v_room.id and id <> v_me.id and last_seen > now() - interval '20 seconds'
      order by joined_at limit 1;
    if v_next is null then
      select id into v_next from players where room_id = v_room.id and id <> v_me.id order by joined_at limit 1;
    end if;
    update rooms set host_id = v_next where id = v_room.id;
  end if;
  perform _bump(v_room.id, 'player_left', jsonb_build_object('player_id', v_me.id));
end $$;

create or replace function heartbeat(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_next uuid;
begin
  v_me := _me(p_token);
  update players set last_seen = now() where id = v_me.id;
  select * into v_room from rooms where id = v_me.room_id;
  if v_room.host_id is distinct from v_me.id and not exists (
    select 1 from players where id = v_room.host_id and last_seen > now() - interval '20 seconds'
  ) then
    select id into v_next from players
      where room_id = v_room.id and last_seen > now() - interval '20 seconds'
      order by joined_at limit 1;
    update rooms set host_id = v_next where id = v_room.id and host_id is distinct from v_next;
    if found then perform _bump(v_room.id, 'host_changed', jsonb_build_object('player_id', v_next)); end if;
  end if;
end $$;

create or replace function start_game(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_p record;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  if (select count(*) from players where room_id = v_room.id) < 2 then raise exception 'NEED_TWO_PLAYERS'; end if;
  for v_p in select id from players where room_id = v_room.id loop
    perform _add_letter(v_p.id, 0, 'start');
  end loop;
  perform _start_round(v_room.id);
  perform _bump(v_room.id, 'game_started');
end $$;

create or replace function submit_answer(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms;
  v_word text := lower(trim(coalesce(p_word, '')));
  v_valid boolean := true; v_reason text; v_points int := 0; v_letter text;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'answer' then raise exception 'WRONG_PHASE'; end if;
  if now() > v_room.phase_ends_at + interval '1 second' then raise exception 'TIME_UP'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;

  if v_word = '' then v_valid := false; v_reason := 'BLANK';
  elsif v_word !~ '^[a-z]+$' then v_valid := false; v_reason := 'NOT_LETTERS';
  elsif char_length(v_word) < 3 then v_valid := false; v_reason := 'TOO_SHORT';
  elsif not exists (select 1 from words where word = v_word) then v_valid := false; v_reason := 'NOT_A_WORD';
  elsif exists (select 1 from answers where player_id = v_me.id and round < v_room.round and valid and word = v_word) then
    v_valid := false; v_reason := 'REPEAT';
  else
    select bl.letter::text into v_letter from banned_letters bl
      where bl.player_id = v_me.id and position(bl.letter::text in upper(v_word)) > 0 limit 1;
    if v_letter is not null then v_valid := false; v_reason := 'BANNED_LETTER'; end if;
  end if;

  if v_valid then v_points := char_length(v_word) + 2 * greatest(0, char_length(v_word) - 6); end if;

  insert into answers (room_id, player_id, round, word, valid, reason, points)
  values (v_room.id, v_me.id, v_room.round, v_word, v_valid, v_reason, v_points)
  on conflict (player_id, round) do update
    set word = excluded.word, valid = excluded.valid, reason = excluded.reason,
        points = excluded.points, created_at = now();

  perform _bump(v_room.id, 'answered', jsonb_build_object('player_id', v_me.id));
  return jsonb_build_object('word', v_word, 'valid', v_valid, 'reason', v_reason, 'points', v_points,
                            'letter', v_letter);
end $$;

create or replace function submit_guess(p_token uuid, p_target_id uuid, p_letter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_target players;
  v_letter text := upper(substr(trim(coalesce(p_letter, '')), 1, 1));
  v_correct boolean; v_kind card_kind; v_held int;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'guess' then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  select * into v_target from players where id = p_target_id and room_id = v_room.id;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
  if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
  if v_letter !~ '^[A-Z]$' then raise exception 'BAD_LETTER'; end if;
  if exists (select 1 from guesses where guesser_id = v_me.id and round = v_room.round) then
    raise exception 'ALREADY_GUESSED';
  end if;
  if exists (select 1 from banned_letters where player_id = v_target.id and letter = v_letter and revealed) then
    raise exception 'ALREADY_REVEALED';
  end if;

  v_correct := exists (select 1 from banned_letters where player_id = v_target.id and letter = v_letter);
  insert into guesses (room_id, round, guesser_id, target_id, letter, correct)
    values (v_room.id, v_room.round, v_me.id, v_target.id, v_letter, v_correct);

  if v_correct then
    update banned_letters set revealed = true where player_id = v_target.id and letter = v_letter;
    select count(*) into v_held from cards where owner_id = v_me.id and not used;
    if v_held < 2 then
      if v_me.class = 'villain' then
        v_kind := (array['attack','cleanse']::card_kind[])[1 + floor(random() * 2)::int];
      else
        v_kind := (array['attack','shield','cleanse']::card_kind[])[1 + floor(random() * 3)::int];
      end if;
      insert into cards (room_id, owner_id, kind) values (v_room.id, v_me.id, v_kind);
    end if;
    -- Ninja penalty: +3 letters, at most once per round
    if v_target.class = 'ninja' and not exists (
      select 1 from pending_additions where room_id = v_room.id and round = v_room.round
        and target_id = v_target.id and kind = 'ninja'
    ) then
      insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
        values (v_room.id, v_room.round, v_target.id, null, 'ninja', 3);
    end if;
  end if;

  perform _bump(v_room.id, 'guessed', jsonb_build_object('player_id', v_me.id));
  return jsonb_build_object('correct', v_correct, 'card', v_kind, 'letter', v_letter);
end $$;

create or replace function play_card(p_token uuid, p_card_id bigint, p_target_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_card cards; v_target players;
  v_amount int; v_removed text; v_blocked bigint;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  select * into v_card from cards where id = p_card_id for update;
  if not found or v_card.owner_id <> v_me.id or v_card.used then raise exception 'CARD_NOT_AVAILABLE'; end if;

  if v_card.kind = 'attack' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    v_amount := case when v_me.class = 'villain' then 2 else 1 end;
    insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
      values (v_room.id, v_room.round, v_target.id, v_me.id, 'attack', v_amount);

  elsif v_card.kind = 'shield' then
    if v_room.phase <> 'react' then raise exception 'WRONG_PHASE'; end if;
    if v_me.class = 'villain' then raise exception 'VILLAIN_NO_SHIELD'; end if;
    select id into v_blocked from pending_additions
      where room_id = v_room.id and round = v_room.round and target_id = v_me.id and status = 'pending'
      order by amount desc, id limit 1;
    if v_blocked is null then raise exception 'NOTHING_TO_BLOCK'; end if;
    update pending_additions set status = 'blocked' where id = v_blocked;

  elsif v_card.kind = 'cleanse' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    if (select count(*) from banned_letters where player_id = v_me.id) <= 1 then raise exception 'AT_MINIMUM'; end if;
    delete from banned_letters where id = (
      select id from banned_letters where player_id = v_me.id order by revealed desc, random() limit 1
    ) returning letter::text into v_removed;
  end if;

  update cards set used = true where id = v_card.id;
  perform _bump(v_room.id, 'card_played',
    jsonb_build_object('player_id', v_me.id, 'kind', v_card.kind, 'target_id', p_target_id));
  return jsonb_build_object('kind', v_card.kind, 'removed', v_removed, 'amount', v_amount);
end $$;

create or replace function use_perk(p_token uuid, p_target_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_target players;
  v_letters jsonb; v_hint text; v_pending bigint; v_result jsonb;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase in ('lobby','finished') then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  if v_me.perk_used then raise exception 'PERK_USED'; end if;

  if v_me.class = 'ninja' then
    if v_room.round < 3 then raise exception 'PERK_NOT_READY'; end if;
    select coalesce(jsonb_agg(distinct bl.letter::text), '[]'::jsonb) into v_letters
      from banned_letters bl join players p on p.id = bl.player_id
      where p.room_id = v_room.id and not p.eliminated and p.id <> v_me.id;
    v_result := jsonb_build_object('kind','ninja','round',v_room.round,'letters',v_letters);
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);

  elsif v_me.class = 'mastermind' then
    if v_room.phase not in ('answer','reveal','guess') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    select coalesce(jsonb_agg(letter::text order by id), '[]'::jsonb) into v_letters
      from banned_letters where player_id = v_target.id;
    select letter::text into v_hint from banned_letters
      where player_id = v_target.id order by revealed asc, random() limit 1;
    v_result := jsonb_build_object('kind','mastermind','round',v_room.round,
      'target_id',v_target.id,'target_name',v_target.name,'letters',v_letters,'leaked',v_hint);
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);
    insert into hints (room_id, round, text)
      values (v_room.id, v_room.round, 'Intel leak: somebody is locked out of "' || v_hint || '".');
    update players set perk_round = v_room.round where id = v_me.id;

  elsif v_me.class = 'hero' then
    if v_room.phase <> 'react' then raise exception 'WRONG_PHASE'; end if;
    select id into v_pending from pending_additions
      where room_id = v_room.id and round = v_room.round and target_id = p_target_id
        and target_id <> v_me.id and status = 'pending'
      order by amount desc, id limit 1;
    if v_pending is null then raise exception 'NOTHING_TO_ABSORB'; end if;
    update pending_additions set target_id = v_me.id, absorbed_by = v_me.id where id = v_pending;
    update players set points = points + 5 where id = v_me.id;
    v_result := jsonb_build_object('kind','hero','absorbed_from',p_target_id,'bonus',5);

  else
    raise exception 'NO_ACTIVE_PERK';
  end if;

  update players set perk_used = true where id = v_me.id;
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
  return v_result;
end $$;

create or replace function react_ready(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'react' then raise exception 'WRONG_PHASE'; end if;
  update players set react_ready = true where id = v_me.id;
  if not exists (select 1 from players where room_id = v_room.id and not eliminated and not react_ready) then
    update rooms set phase_ends_at = now() where id = v_room.id;
  end if;
  perform _bump(v_room.id, 'react_ready', jsonb_build_object('player_id', v_me.id));
end $$;

-- Time-gated, idempotent. Any client may call it once the clock runs out.
create or replace function advance_phase(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_p record; v_a record; v_i int;
begin
  select * into v_room from rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.phase in ('lobby','finished') then return jsonb_build_object('ok', false, 'reason', 'NOT_RUNNING'); end if;
  if v_room.phase_ends_at is not null and now() < v_room.phase_ends_at - interval '250 milliseconds' then
    return jsonb_build_object('ok', false, 'reason', 'TOO_EARLY');
  end if;

  if v_room.phase = 'answer' then
    for v_p in select * from players where room_id = v_room.id and not eliminated order by joined_at loop
      insert into answers (room_id, player_id, round, word, valid, reason, points)
        values (v_room.id, v_p.id, v_room.round, '', false, 'BLANK', 0)
        on conflict (player_id, round) do nothing;
      select * into v_a from answers where player_id = v_p.id and round = v_room.round;
      if v_a.valid then
        update players set points = points + v_a.points,
          strikes = case when v_room.duel then strikes else 0 end
        where id = v_p.id;
      else
        perform _strike(v_p.id, v_room.round);
      end if;
    end loop;
    perform _set_phase(v_room.id, 'reveal', 6);

  elsif v_room.phase = 'reveal' then
    if _alive(v_room.id) <= 1 then
      perform _finish(v_room.id);
    else
      perform _set_phase(v_room.id, 'guess', 20);
    end if;

  elsif v_room.phase = 'guess' then
    -- Mastermind gamble: strike if nobody else guessed correctly this round
    for v_p in select * from players
      where room_id = v_room.id and class = 'mastermind' and perk_round = v_room.round and not eliminated loop
      if not exists (select 1 from guesses where room_id = v_room.id and round = v_room.round
                       and correct and guesser_id <> v_p.id) then
        perform _strike(v_p.id, v_room.round);
      end if;
    end loop;
    if _alive(v_room.id) <= 1 then
      perform _finish(v_room.id);
    else
      update players set react_ready = false where room_id = v_room.id;
      perform _set_phase(v_room.id, 'react', 8);
    end if;

  elsif v_room.phase = 'react' then
    for v_a in select pa.* from pending_additions pa join players p on p.id = pa.target_id
      where pa.room_id = v_room.id and pa.round = v_room.round and pa.status = 'pending' and not p.eliminated
      order by pa.id loop
      v_i := 0;
      for n in 1..v_a.amount loop
        if _add_letter(v_a.target_id, v_room.round, v_a.kind) is not null then v_i := v_i + 1; end if;
      end loop;
      update pending_additions set status = 'applied' where id = v_a.id;
      if v_a.source_id is not null and v_a.source_id <> v_a.target_id then
        update players set letters_stacked = letters_stacked + v_i where id = v_a.source_id;
      end if;
    end loop;
    -- survivors (clean answer this round) take a new letter
    for v_p in select p.id from players p join answers a on a.player_id = p.id and a.round = v_room.round
      where p.room_id = v_room.id and not p.eliminated and a.valid loop
      perform _add_letter(v_p.id, v_room.round, 'survive');
    end loop;
    if _alive(v_room.id) = 2 and not v_room.duel then
      perform _set_phase(v_room.id, 'duel_intro', 6);
    else
      perform _start_round(v_room.id);
    end if;

  elsif v_room.phase = 'duel_intro' then
    update rooms set duel = true where id = v_room.id;
    for v_p in select * from players where room_id = v_room.id and not eliminated loop
      if v_p.class = 'hero' then
        delete from banned_letters where player_id = v_p.id and id <> (
          select id from banned_letters where player_id = v_p.id order by revealed asc, id limit 1);
      else
        perform _add_letter(v_p.id, v_room.round, 'duel');
      end if;
    end loop;
    perform _start_round(v_room.id);
  end if;

  select * into v_room from rooms where id = v_room.id;
  perform _bump(v_room.id, 'phase', jsonb_build_object('phase', v_room.phase));
  return jsonb_build_object('ok', true, 'phase', v_room.phase);
end $$;

create or replace function play_again(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'finished' then raise exception 'WRONG_PHASE'; end if;
  delete from banned_letters where player_id in (select id from players where room_id = v_room.id);
  delete from answers where room_id = v_room.id;
  delete from guesses where room_id = v_room.id;
  delete from cards where room_id = v_room.id;
  delete from pending_additions where room_id = v_room.id;
  delete from intel where room_id = v_room.id;
  delete from hints where room_id = v_room.id;
  delete from players where room_id = v_room.id and last_seen < now() - interval '60 seconds' and id <> v_me.id;
  update players set strikes = 0, points = 0, letters_stacked = 0, eliminated = false, eliminated_round = null,
    perk_used = false, perk_round = null, react_ready = false where room_id = v_room.id;
  update rooms set phase = 'lobby', round = 0, duel = false, winner_id = null, prompt_id = null,
    used_prompts = '{}', phase_ends_at = null where id = v_room.id;
  perform _bump(v_room.id, 'reset');
end $$;

create or replace function get_room_state(p_code text, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me players; v_show_all boolean; v_me_json jsonb := null; v_titles jsonb := null;
begin
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if p_token is not null then
    select * into v_me from players where token = p_token and room_id = v_room.id;
  end if;
  v_show_all := v_room.phase = 'finished' or coalesce(v_me.eliminated, false);

  if v_me.id is not null then
    v_me_json := jsonb_build_object(
      'id', v_me.id, 'name', v_me.name, 'class', v_me.class, 'strikes', v_me.strikes,
      'points', v_me.points, 'eliminated', v_me.eliminated, 'perk_used', v_me.perk_used,
      'letters', coalesce((select jsonb_agg(jsonb_build_object('letter', letter::text, 'revealed', revealed) order by id)
                           from banned_letters where player_id = v_me.id), '[]'::jsonb),
      'cards', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind) order by id)
                         from cards where owner_id = v_me.id and not used), '[]'::jsonb),
      'answer', (select jsonb_build_object('word', word, 'valid', valid, 'reason', reason, 'points', points)
                 from answers where player_id = v_me.id and round = v_room.round),
      'guess', (select jsonb_build_object('target_id', target_id, 'letter', letter::text, 'correct', correct)
                from guesses where guesser_id = v_me.id and round = v_room.round),
      'intel', coalesce((select jsonb_agg(payload order by id) from intel where player_id = v_me.id), '[]'::jsonb),
      'used_words', coalesce((select jsonb_agg(word order by round) from answers
                              where player_id = v_me.id and valid and round < v_room.round), '[]'::jsonb)
    );
  end if;

  if v_room.phase = 'finished' then
    v_titles := jsonb_build_object(
      'champion', v_room.winner_id,
      'einstein', (select a.player_id from answers a where a.room_id = v_room.id and a.valid
                   group by a.player_id order by sum(char_length(a.word)) desc, max(a.points) desc limit 1),
      'villain', (select id from players where room_id = v_room.id and letters_stacked > 0
                  order by letters_stacked desc, points desc limit 1)
    );
  end if;

  return jsonb_build_object(
    'server_time', now(),
    'room', jsonb_build_object(
      'code', v_room.code, 'phase', v_room.phase, 'round', v_room.round, 'duel', v_room.duel,
      'state_version', v_room.state_version, 'host_id', v_room.host_id, 'winner_id', v_room.winner_id,
      'phase_ends_at', v_room.phase_ends_at,
      'answer_seconds', _answer_seconds(v_room.round, v_room.duel)),
    'prompt', (select text from prompts where id = v_room.prompt_id),
    'me', v_me_json,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'class', p.class, 'strikes', p.strikes, 'points', p.points,
        'eliminated', p.eliminated, 'perk_used', p.perk_used, 'is_host', p.id = v_room.host_id,
        'connected', p.last_seen > now() - interval '20 seconds',
        'react_ready', p.react_ready,
        'letters_stacked', p.letters_stacked,
        'letter_count', (select count(*) from banned_letters bl where bl.player_id = p.id),
        'revealed', coalesce((select jsonb_agg(bl.letter::text order by bl.id) from banned_letters bl
                              where bl.player_id = p.id and bl.revealed), '[]'::jsonb),
        'letters', case when v_show_all then coalesce((select jsonb_agg(bl.letter::text order by bl.id)
                              from banned_letters bl where bl.player_id = p.id), '[]'::jsonb) else null end,
        'answered', exists (select 1 from answers a where a.player_id = p.id and a.round = v_room.round),
        'guessed', exists (select 1 from guesses g where g.guesser_id = p.id and g.round = v_room.round)
      ) order by p.joined_at)
      from players p where p.room_id = v_room.id), '[]'::jsonb),
    'hints', coalesce((select jsonb_agg(jsonb_build_object('round', round, 'text', text) order by id)
                       from hints where room_id = v_room.id), '[]'::jsonb),
    'reveal', case when v_room.phase in ('reveal','guess','react','duel_intro','finished') then coalesce((
      select jsonb_agg(jsonb_build_object('player_id', a.player_id, 'word', a.word, 'valid', a.valid,
                                          'reason', a.reason, 'points', a.points) order by a.points desc, a.id)
      from answers a where a.room_id = v_room.id and a.round = v_room.round), '[]'::jsonb) else '[]'::jsonb end,
    'guess_results', case when v_room.phase in ('react','duel_intro','finished') then coalesce((
      select jsonb_agg(jsonb_build_object('guesser_id', g.guesser_id, 'target_id', g.target_id, 'correct', g.correct,
                                          'letter', case when g.correct then g.letter::text end) order by g.id)
      from guesses g where g.room_id = v_room.id and g.round = v_room.round), '[]'::jsonb) else '[]'::jsonb end,
    'pending', case when v_room.phase = 'react' then coalesce((
      select jsonb_agg(jsonb_build_object('id', pa.id, 'target_id', pa.target_id, 'source_id', pa.source_id,
                                          'kind', pa.kind, 'amount', pa.amount, 'status', pa.status,
                                          'absorbed_by', pa.absorbed_by) order by pa.id)
      from pending_additions pa where pa.room_id = v_room.id and pa.round = v_room.round), '[]'::jsonb)
      else '[]'::jsonb end,
    'titles', v_titles
  );
end $$;

-- ───────────── privileges ─────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  create_room(text, player_class), join_room(text, text, player_class), set_class(uuid, player_class),
  leave_room(uuid), heartbeat(uuid), start_game(uuid), submit_answer(uuid, text),
  submit_guess(uuid, uuid, text), play_card(uuid, bigint, uuid), use_perk(uuid, uuid),
  react_ready(uuid), advance_phase(text), play_again(uuid), get_room_state(text, uuid)
to anon, authenticated;

-- ───────────── realtime ─────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    execute 'alter publication supabase_realtime add table public.events';
  end if;
end $$;

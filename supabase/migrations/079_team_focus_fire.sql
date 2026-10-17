-- Team mode v2: teamwork is how you win.
--  * Focus fire: an enemy letter only cracks when TWO teammates call the same letter in the same round.
--    A lone call reveals nothing (not even whether it was right) until a teammate backs it.
--    A team with a single active member still fires alone.
--  * Split knowledge: in the guess phase each teammate gets a different clue about the enemy rack:
--    the first sees 4 suspects (exactly one is really locked), the others see which suspects are clean.
--  * Voice: each team gets a secret voice_key, only ever returned to its own members, used to name the
--    private push-to-talk signaling channel.
-- Classic and 1v1 are untouched: everything is behind _is_team().

alter table teams add column if not exists voice_key uuid not null default gen_random_uuid();

create table if not exists team_calls (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  team_id uuid not null,
  caller_id uuid not null,
  target_id uuid not null,
  letter text not null,
  resolved boolean not null default false,
  correct boolean,
  created_at timestamptz not null default now(),
  unique (caller_id, round)
);
create index if not exists team_calls_room on team_calls (room_id, round, team_id);
alter table team_calls enable row level security;

create table if not exists team_intel (
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  team_id uuid not null,
  player_id uuid not null,
  kind text not null,          -- 'suspects' (one of these is locked) | 'clean' (these are not locked)
  letters text[] not null,
  primary key (room_id, round, player_id)
);
alter table team_intel enable row level security;

create or replace function submit_guess(p_token uuid, p_target_id uuid, p_letter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_me players; v_room rooms; v_target players; v_alive int; v_n int;
  v_letter text := upper(substr(trim(coalesce(p_letter, '')), 1, 1)); v_ok boolean;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id;

  if _is_team(v_room.id) then
    select count(*) into v_alive from players where team_id = v_me.team_id and not eliminated and not quit;
    if v_alive >= 2 then
      select * into v_room from rooms where id = v_me.room_id for update;
      if v_room.phase <> 'guess' then raise exception 'WRONG_PHASE'; end if;
      if v_me.eliminated then raise exception 'ELIMINATED'; end if;
      select * into v_target from players where id = p_target_id and room_id = v_room.id;
      if not found then raise exception 'TARGET_NOT_FOUND'; end if;
      if v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
      if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
      if v_letter !~ '^[A-Z]$' then raise exception 'BAD_LETTER'; end if;
      if exists (select 1 from team_calls where caller_id = v_me.id and round = v_room.round)
         or exists (select 1 from guesses where guesser_id = v_me.id and round = v_room.round) then
        raise exception 'ALREADY_GUESSED';
      end if;
      if exists (select 1 from banned_letters where player_id = v_target.id and letter = v_letter and revealed) then
        raise exception 'ALREADY_REVEALED';
      end if;
      insert into team_calls (room_id, round, team_id, caller_id, target_id, letter)
        values (v_room.id, v_room.round, v_me.team_id, v_me.id, v_target.id, v_letter);
      select count(*) into v_n from team_calls c
        where c.room_id = v_room.id and c.round = v_room.round and c.team_id = v_me.team_id and c.letter = v_letter
          and not c.resolved
          and (select team_id from players where id = c.target_id) = v_target.team_id;
      if v_n >= 2 then
        -- focus fire: the shot lands (or misses) for real
        v_res := _guess_base(p_token, p_target_id, p_letter);
        v_ok := coalesce((v_res->>'correct')::boolean, false);
        insert into guesses (room_id, round, guesser_id, target_id, letter, correct)
          select c.room_id, c.round, c.caller_id, c.target_id, c.letter, v_ok from team_calls c
          where c.room_id = v_room.id and c.round = v_room.round and c.team_id = v_me.team_id and c.letter = v_letter
            and c.caller_id <> v_me.id and not c.resolved
            and not exists (select 1 from guesses g where g.guesser_id = c.caller_id and g.round = c.round);
        update team_calls set resolved = true, correct = v_ok
          where room_id = v_room.id and round = v_room.round and team_id = v_me.team_id and letter = v_letter and not resolved;
        if v_ok then
          perform _feed(v_room.id, jsonb_build_object('type', 'focus_fire', 'from', v_me.id, 'to', v_target.id, 'what', v_letter));
        end if;
        v_res := v_res || jsonb_build_object('focus', true);
      else
        perform _bump(v_room.id, 'called', jsonb_build_object('player_id', v_me.id));
        return jsonb_build_object('called', true, 'letter', v_letter, 'waiting', true);
      end if;
    else
      v_res := _guess_base(p_token, p_target_id, p_letter);
    end if;
  else
    v_res := _guess_base(p_token, p_target_id, p_letter);
  end if;

  if exists (select 1 from guesses where guesser_id = v_me.id and round = v_room.round and correct)
     and exists (select 1 from objectives where player_id = v_me.id and round = v_room.round and key = 'crack') then
    perform _obj_done(v_me.id, v_room.round);
  end if;
  return v_res;
end $$;

-- deal this round's clues to every member of a team (once)
create or replace function _team_deal_intel(p_room_id uuid, p_round int, p_team_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_enemy uuid; v_ref uuid; v_real text; v_decoys text[]; v_members uuid[]; i int;
begin
  perform 1 from teams where id = p_team_id for update;
  if exists (select 1 from team_intel where room_id = p_room_id and round = p_round and team_id = p_team_id) then return; end if;
  select id into v_enemy from teams where room_id = p_room_id and id <> p_team_id limit 1;
  v_ref := _team_ref(v_enemy);
  if v_ref is null then return; end if;
  select letter::text into v_real from banned_letters where player_id = v_ref and not revealed order by random() limit 1;
  if v_real is null then return; end if;
  select array_agg(l) into v_decoys from (
    select chr(65 + g) as l from generate_series(0, 25) g
    where chr(65 + g) not in (select letter::text from banned_letters where player_id = v_ref)
    order by random() limit 3) d;
  select array_agg(id order by joined_at, id) into v_members from players
    where team_id = p_team_id and not eliminated and not quit;
  if v_members is null then return; end if;
  -- first member: four suspects, one of them real
  insert into team_intel values (p_room_id, p_round, p_team_id, v_members[1], 'suspects',
    (select array_agg(x order by random()) from unnest(v_decoys || v_real) x));
  if array_length(v_members, 1) = 1 then return; end if;
  if array_length(v_members, 1) = 2 then
    insert into team_intel values (p_room_id, p_round, p_team_id, v_members[2], 'clean', v_decoys[1:2]);
  else
    insert into team_intel values (p_room_id, p_round, p_team_id, v_members[2], 'clean', v_decoys[1:2]);
    for i in 3..array_length(v_members, 1) loop
      insert into team_intel values (p_room_id, p_round, p_team_id, v_members[i], 'clean', array[v_decoys[3]]);
    end loop;
  end if;
end $$;

-- everything that is private to my team: calls, my clue, the voice channel key
create or replace function team_extra(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_team teams;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id;
  if not _is_team(v_room.id) or v_me.team_id is null then return null; end if;
  select * into v_team from teams where id = v_me.team_id;
  if v_room.phase = 'guess' and not v_me.eliminated then
    perform _team_deal_intel(v_room.id, v_room.round, v_me.team_id);
  end if;
  return jsonb_build_object(
    'team_id', v_team.id,
    'voice_key', v_team.voice_key,
    'round', v_room.round,
    'calls', (select coalesce(jsonb_agg(jsonb_build_object('caller_id', c.caller_id, 'letter', c.letter, 'target_id', c.target_id,
                'resolved', c.resolved, 'correct', c.correct) order by c.id), '[]'::jsonb)
              from team_calls c where c.room_id = v_room.id and c.round = v_room.round and c.team_id = v_team.id),
    'intel', (select jsonb_build_object('kind', i.kind, 'letters', to_jsonb(i.letters)) from team_intel i
              where i.room_id = v_room.id and i.round = v_room.round and i.player_id = v_me.id)
  );
end $$;

revoke execute on function _team_deal_intel(uuid, int, uuid) from public, anon, authenticated;
revoke execute on function team_extra(uuid) from public;
grant execute on function team_extra(uuid) to anon, authenticated;
revoke execute on function submit_guess(uuid, uuid, text) from public;
grant execute on function submit_guess(uuid, uuid, text) to anon, authenticated;

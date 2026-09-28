-- Room settings (host), Hacker class, rage-quit tracking and a public action feed.

-- ───────────── columns ─────────────
alter table rooms add column if not exists settings jsonb not null default '{}'::jsonb;
alter table players add column if not exists quit boolean not null default false;
alter table players add column if not exists hacked_round int;
alter table players add column if not exists hacked_by uuid;
alter table players add column if not exists traced_round int;
alter table players add column if not exists exposed boolean not null default false;

-- ───────────── settings helpers ─────────────
create or replace function _defaults() returns jsonb
language sql immutable as $$
  select '{"max_players":8,"answer_seconds":60,"shrink":true,"guess_seconds":20,"react_seconds":8,
           "duel_seconds":20,"cards":true,"perks":true,"strikes":2}'::jsonb;
$$;

create or replace function _cfg(p_room_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select _defaults() || coalesce((select settings from rooms where id = p_room_id), '{}'::jsonb);
$$;

create or replace function _answer_secs(p_cfg jsonb, p_round int, p_duel boolean) returns int
language sql immutable as $$
  select case
    when p_duel then (p_cfg->>'duel_seconds')::int
    when (p_cfg->>'shrink')::boolean then
      greatest(least(20, (p_cfg->>'answer_seconds')::int),
               (p_cfg->>'answer_seconds')::int - 10 * greatest(0, p_round - 1))
    else (p_cfg->>'answer_seconds')::int end;
$$;

-- Public action feed row (no state bump: callers bump once themselves).
create or replace function _feed(p_room_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into events (room_id, round, kind, payload)
  values (p_room_id, (select round from rooms where id = p_room_id), 'action', p_payload);
end $$;

create or replace function _clamp(p_val jsonb, p_lo int, p_hi int, p_default int) returns int
language sql immutable as $$
  select greatest(p_lo, least(p_hi, coalesce(case when jsonb_typeof(p_val) = 'number' then (p_val::text)::numeric::int end, p_default)));
$$;

create or replace function update_settings(p_token uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_cur jsonb; v_in jsonb := coalesce(p_settings, '{}'::jsonb); v_new jsonb; v_count int;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  v_cur := _defaults() || v_room.settings;
  select count(*) into v_count from players where room_id = v_room.id;
  v_new := jsonb_build_object(
    'max_players',    _clamp(coalesce(v_in->'max_players', v_cur->'max_players'), greatest(2, v_count), 12, 8),
    'answer_seconds', _clamp(coalesce(v_in->'answer_seconds', v_cur->'answer_seconds'), 20, 120, 60),
    'guess_seconds',  _clamp(coalesce(v_in->'guess_seconds', v_cur->'guess_seconds'), 10, 45, 20),
    'react_seconds',  _clamp(coalesce(v_in->'react_seconds', v_cur->'react_seconds'), 5, 20, 8),
    'duel_seconds',   _clamp(coalesce(v_in->'duel_seconds', v_cur->'duel_seconds'), 10, 60, 20),
    'strikes',        _clamp(coalesce(v_in->'strikes', v_cur->'strikes'), 1, 3, 2),
    'shrink', case when jsonb_typeof(v_in->'shrink') = 'boolean' then v_in->'shrink' else v_cur->'shrink' end,
    'cards',  case when jsonb_typeof(v_in->'cards') = 'boolean' then v_in->'cards' else v_cur->'cards' end,
    'perks',  case when jsonb_typeof(v_in->'perks') = 'boolean' then v_in->'perks' else v_cur->'perks' end
  );
  update rooms set settings = v_new where id = v_room.id;
  perform _bump(v_room.id, 'settings');
  return v_new;
end $$;

-- ───────────── engine functions (settings-aware) ─────────────
create or replace function _strike(p_player_id uuid, p_round int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_strikes int; v_room uuid;
begin
  update players set strikes = strikes + 1 where id = p_player_id returning strikes, room_id into v_strikes, v_room;
  if v_strikes >= (_cfg(v_room)->>'strikes')::int then
    update players set eliminated = true, eliminated_round = p_round where id = p_player_id and not eliminated;
    return true;
  end if;
  return false;
end $$;

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
    phase_ends_at = now() + make_interval(secs => _answer_secs(_cfg(p_room_id), round + 1, duel))
  where id = p_room_id;
  update players set react_ready = false where room_id = p_room_id;
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
  if (select count(*) from players where room_id = v_room.id) >= (_cfg(v_room.id)->>'max_players')::int then
    raise exception 'ROOM_FULL';
  end if;
  begin
    insert into players (room_id, name, class) values (v_room.id, v_name, p_class) returning * into v_player;
  exception when unique_violation then
    raise exception 'NAME_TAKEN';
  end;
  perform _bump(v_room.id, 'player_joined', jsonb_build_object('player_id', v_player.id));
  return jsonb_build_object('code', v_room.code, 'player_id', v_player.id, 'token', v_player.token);
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
    -- rage quit: out of the game, and everyone hears about it
    update players set eliminated = true, eliminated_round = v_room.round, quit = true,
      last_seen = now() - interval '1 hour'
      where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'chicken', 'from', v_me.id, 'name', v_me.name));
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
    -- a hacked player doesn't get told which letter burned them
    'letter', case when v_me.hacked_round = v_room.round then null else v_letter end);
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
    if v_held < 2 and (_cfg(v_room.id)->>'cards')::boolean then
      if v_me.class = 'villain' then
        v_kind := (array['attack','cleanse']::card_kind[])[1 + floor(random() * 2)::int];
      else
        v_kind := (array['attack','shield','cleanse']::card_kind[])[1 + floor(random() * 3)::int];
      end if;
      insert into cards (room_id, owner_id, kind) values (v_room.id, v_me.id, v_kind);
    end if;
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
  v_amount int; v_removed text; v_blocked pending_additions; v_kind text; v_attacker uuid;
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
    v_kind := case when v_me.class = 'hacker' then 'hack' else 'attack' end;
    insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
      values (v_room.id, v_room.round, v_target.id, v_me.id, v_kind, v_amount);
    if v_kind = 'hack' then
      -- anonymous unless this hacker has already been exposed
      perform _feed(v_room.id, jsonb_build_object('type', 'hack', 'to', v_target.id,
        'from', case when v_me.exposed then v_me.id end));
    else
      perform _feed(v_room.id, jsonb_build_object('type', 'attack', 'from', v_me.id, 'to', v_target.id,
        'amount', v_amount));
    end if;

  elsif v_card.kind = 'shield' then
    if v_room.phase <> 'react' then raise exception 'WRONG_PHASE'; end if;
    if v_me.class = 'villain' then raise exception 'VILLAIN_NO_SHIELD'; end if;
    select * into v_blocked from pending_additions
      where room_id = v_room.id and round = v_room.round and target_id = v_me.id and status = 'pending'
      order by amount desc, id limit 1;
    if v_blocked.id is null then raise exception 'NOTHING_TO_BLOCK'; end if;
    update pending_additions set status = 'blocked' where id = v_blocked.id;
    v_attacker := case when v_blocked.kind = 'hack'
                         and not coalesce((select exposed from players where id = v_blocked.source_id), false)
                       then null else v_blocked.source_id end;
    perform _feed(v_room.id, jsonb_build_object('type', 'block', 'from', v_me.id, 'to', v_attacker,
      'what', v_blocked.kind));

  elsif v_card.kind = 'cleanse' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    if (select count(*) from banned_letters where player_id = v_me.id) <= 1 then raise exception 'AT_MINIMUM'; end if;
    delete from banned_letters where id = (
      select id from banned_letters where player_id = v_me.id order by revealed desc, random() limit 1
    ) returning letter::text into v_removed;
    perform _feed(v_room.id, jsonb_build_object('type', 'cleanse', 'from', v_me.id));
  end if;

  update cards set used = true where id = v_card.id;
  perform _bump(v_room.id, 'card_played', jsonb_build_object('kind', v_card.kind));
  return jsonb_build_object('kind', coalesce(v_kind, v_card.kind::text), 'removed', v_removed, 'amount', v_amount);
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
  if not (_cfg(v_room.id)->>'perks')::boolean then raise exception 'PERKS_OFF'; end if;
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
    perform _feed(v_room.id, jsonb_build_object('type', 'absorb', 'from', v_me.id, 'to', p_target_id));

  else
    raise exception 'NO_ACTIVE_PERK';
  end if;

  update players set perk_used = true where id = v_me.id;
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
  return v_result;
end $$;

-- A hacked player gets one guess per round at who did it.
create or replace function trace_hacker(p_token uuid, p_suspect_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_suspect players; v_hit boolean;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase in ('lobby','finished','duel_intro') then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  if v_me.hacked_round is distinct from v_room.round or v_me.hacked_by is null then raise exception 'NOT_HACKED'; end if;
  if v_me.traced_round = v_room.round then raise exception 'ALREADY_TRACED'; end if;
  select * into v_suspect from players where id = p_suspect_id and room_id = v_room.id;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_suspect.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;

  v_hit := v_suspect.id = v_me.hacked_by;
  update players set traced_round = v_room.round where id = v_me.id;
  if v_hit then
    -- caught: hacker exposed and goes dark next round; victim gets their screen back
    update players set exposed = true, hacked_round = v_room.round + 1, hacked_by = null, traced_round = null
      where id = v_suspect.id;
    update players set hacked_round = null, hacked_by = null where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'caught', 'from', v_me.id, 'to', v_suspect.id));
  else
    perform _feed(v_room.id, jsonb_build_object('type', 'trace_miss', 'from', v_me.id, 'to', v_suspect.id));
  end if;
  perform _bump(v_room.id, 'traced');
  return jsonb_build_object('caught', v_hit);
end $$;

create or replace function advance_phase(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_p record; v_a record; v_i int; v_cfg jsonb;
begin
  select * into v_room from rooms where code = upper(trim(p_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.phase in ('lobby','finished') then return jsonb_build_object('ok', false, 'reason', 'NOT_RUNNING'); end if;
  if v_room.phase_ends_at is not null and now() < v_room.phase_ends_at - interval '250 milliseconds' then
    return jsonb_build_object('ok', false, 'reason', 'TOO_EARLY');
  end if;
  v_cfg := _cfg(v_room.id);

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
      perform _set_phase(v_room.id, 'guess', (v_cfg->>'guess_seconds')::int);
    end if;

  elsif v_room.phase = 'guess' then
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
      perform _set_phase(v_room.id, 'react', (v_cfg->>'react_seconds')::int);
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
      if v_a.kind = 'hack' then
        -- the victim plays next round without seeing their own locks
        update players set hacked_round = v_room.round + 1, hacked_by = v_a.source_id, traced_round = null
          where id = v_a.target_id;
      end if;
      if v_a.source_id is not null and v_a.source_id <> v_a.target_id then
        update players set letters_stacked = letters_stacked + v_i where id = v_a.source_id;
      end if;
    end loop;
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
    -- a hack scheduled for "next round" survives the duel intro
    update players set hacked_round = hacked_round + 1
      where room_id = v_room.id and hacked_round = v_room.round + 1;
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
  delete from players where room_id = v_room.id and (quit or last_seen < now() - interval '60 seconds') and id <> v_me.id;
  update players set strikes = 0, points = 0, letters_stacked = 0, eliminated = false, eliminated_round = null,
    perk_used = false, perk_round = null, react_ready = false, quit = false,
    hacked_round = null, hacked_by = null, traced_round = null, exposed = false
    where room_id = v_room.id;
  update rooms set phase = 'lobby', round = 0, duel = false, winner_id = null, prompt_id = null,
    used_prompts = '{}', phase_ends_at = null where id = v_room.id;
  perform _bump(v_room.id, 'reset');
end $$;

create or replace function get_room_state(p_code text, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me players; v_show_all boolean; v_me_json jsonb := null; v_titles jsonb := null;
  v_cfg jsonb; v_live boolean; v_dark boolean;
begin
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  v_cfg := _defaults() || v_room.settings;
  v_live := v_room.phase not in ('lobby','finished');
  if p_token is not null then
    select * into v_me from players where token = p_token and room_id = v_room.id;
  end if;
  v_show_all := v_room.phase = 'finished' or coalesce(v_me.eliminated, false);

  if v_me.id is not null then
    v_dark := coalesce(v_live and not v_me.eliminated and v_me.hacked_round = v_room.round, false);
    v_me_json := jsonb_build_object(
      'id', v_me.id, 'name', v_me.name, 'class', v_me.class, 'strikes', v_me.strikes,
      'points', v_me.points, 'eliminated', v_me.eliminated, 'perk_used', v_me.perk_used,
      'hacked', v_dark,
      'can_trace', v_dark and v_me.hacked_by is not null and v_me.traced_round is distinct from v_room.round
                   and v_room.phase <> 'duel_intro',
      'letters', coalesce((select jsonb_agg(
                             case when v_dark then jsonb_build_object('letter', '?', 'revealed', false, 'hidden', true)
                                  else jsonb_build_object('letter', letter::text, 'revealed', revealed) end
                             order by id)
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
      'answer_seconds', _answer_secs(v_cfg, v_room.round, v_room.duel),
      'settings', v_cfg),
    'prompt', (select text from prompts where id = v_room.prompt_id),
    'me', v_me_json,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'class', p.class, 'strikes', p.strikes, 'points', p.points,
        'eliminated', p.eliminated, 'perk_used', p.perk_used, 'is_host', p.id = v_room.host_id,
        'connected', p.last_seen > now() - interval '20 seconds',
        'react_ready', p.react_ready,
        'letters_stacked', p.letters_stacked,
        'quit', p.quit,
        'exposed', p.exposed,
        'hacked', coalesce(v_live and not p.eliminated and p.hacked_round = v_room.round, false),
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
      select jsonb_agg(jsonb_build_object('id', pa.id, 'target_id', pa.target_id,
                                          'source_id', case when pa.kind = 'hack' and not coalesce(src.exposed, false)
                                                            then null else pa.source_id end,
                                          'kind', pa.kind, 'amount', pa.amount, 'status', pa.status,
                                          'absorbed_by', pa.absorbed_by) order by pa.id)
      from pending_additions pa left join players src on src.id = pa.source_id
      where pa.room_id = v_room.id and pa.round = v_room.round), '[]'::jsonb)
      else '[]'::jsonb end,
    'feed', coalesce((select jsonb_agg(f.payload || jsonb_build_object('id', f.id, 'round', f.round) order by f.id)
                      from (select * from events where room_id = v_room.id and kind = 'action'
                            order by id desc limit 15) f), '[]'::jsonb),
    'titles', v_titles
  );
end $$;

-- ───────────── privileges ─────────────
revoke execute on function _defaults(), _cfg(uuid), _answer_secs(jsonb, int, boolean), _feed(uuid, jsonb),
  _clamp(jsonb, int, int, int) from public, anon, authenticated;
revoke execute on function update_settings(uuid, jsonb), trace_hacker(uuid, uuid) from public;
grant execute on function update_settings(uuid, jsonb), trace_hacker(uuid, uuid) to anon, authenticated;

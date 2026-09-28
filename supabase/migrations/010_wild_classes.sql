-- Seven wild classes: Mimic, Gambler, Thief, Parasite, Oracle, Wildcard, Jester.

alter table players add column if not exists orig_class player_class;
alter table players add column if not exists bet_round int;
alter table players add column if not exists latch_target uuid;
alter table players add column if not exists latch_round int;
alter table players add column if not exists oracle_round int;
alter table rooms add column if not exists next_prompt_id bigint;
alter table rooms add column if not exists chaos text;
alter table rooms add column if not exists chaos_round int;

-- ───────────── Wildcard: one random room-wide event at the start of a round ─────────────
create or replace function _chaos(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_kind text; v_ids uuid[]; v_n int; i int; v_letter text; v_card record; v_k int := 0;
  v_moves jsonb := '[]'::jsonb; v_m jsonb;
begin
  select * into v_room from rooms where id = p_room_id;
  v_kind := (array['swap','no_e','shuffle','double','amnesty','speed'])[1 + floor(random() * 6)::int];
  select array_agg(id order by joined_at) into v_ids from players where room_id = p_room_id and not eliminated;
  v_n := coalesce(array_length(v_ids, 1), 0);

  if v_kind = 'swap' and v_n >= 2 then
    -- everyone passes one random lock to the player on their left
    for i in 1..v_n loop
      select letter::text into v_letter from banned_letters
        where player_id = v_ids[i] and (select count(*) from banned_letters b2 where b2.player_id = v_ids[i]) > 1
        order by revealed asc, random() limit 1;
      if v_letter is not null then
        v_moves := v_moves || jsonb_build_object('from', v_ids[i], 'to', v_ids[1 + (i % v_n)], 'letter', v_letter);
      end if;
    end loop;
    for v_m in select * from jsonb_array_elements(v_moves) loop
      if not exists (select 1 from banned_letters where player_id = (v_m->>'to')::uuid and letter = v_m->>'letter') then
        update banned_letters set player_id = (v_m->>'to')::uuid, revealed = false
          where player_id = (v_m->>'from')::uuid and letter = v_m->>'letter';
      end if;
    end loop;
  elsif v_kind = 'shuffle' and v_n >= 2 then
    for v_card in select c.id from cards c join players p on p.id = c.owner_id
                  where c.room_id = p_room_id and not c.used and not p.eliminated order by random() loop
      update cards set owner_id = v_ids[1 + (v_k % v_n)] where id = v_card.id;
      v_k := v_k + 1;
    end loop;
  elsif v_kind = 'amnesty' then
    delete from banned_letters where id in (
      select distinct on (bl.player_id) bl.id from banned_letters bl
      where bl.player_id = any(v_ids) and (select count(*) from banned_letters b2 where b2.player_id = bl.player_id) > 1
      order by bl.player_id, random());
  elsif v_kind = 'speed' then
    update rooms set phase_ends_at = now() + make_interval(secs => greatest(15, _answer_secs(_cfg(p_room_id), round, duel) / 2))
      where id = p_room_id;
  end if;

  update rooms set chaos = v_kind, chaos_round = round where id = p_room_id;
  perform _feed(p_room_id, jsonb_build_object('type', 'chaos', 'what', v_kind));
end $$;

create or replace function _start_round(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_prompt bigint;
begin
  select * into v_room from rooms where id = p_room_id;
  v_prompt := v_room.next_prompt_id;   -- the Oracle may have pre-drawn it
  if v_prompt is null then
    select id into v_prompt from prompts
      where active and not (id = any(v_room.used_prompts)) order by random() limit 1;
  end if;
  if v_prompt is null then
    select id into v_prompt from prompts where active order by random() limit 1;
    update rooms set used_prompts = '{}' where id = p_room_id;
  end if;
  update rooms set
    round = round + 1,
    prompt_id = v_prompt,
    next_prompt_id = null,
    used_prompts = array_append(used_prompts, v_prompt),
    phase = 'answer',
    phase_ends_at = now() + make_interval(secs => _answer_secs(_cfg(p_room_id), round + 1, duel))
  where id = p_room_id;
  update players set react_ready = false where room_id = p_room_id;
  if v_room.round + 1 >= 2 and exists (
    select 1 from players where room_id = p_room_id and class = 'wildcard' and not eliminated
  ) then
    perform _chaos(p_room_id);
  end if;
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
  elsif v_room.chaos = 'no_e' and v_room.chaos_round = v_room.round and position('e' in v_word) > 0 then
    v_valid := false; v_reason := 'CHAOS_NO_E';
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
    'letter', case when v_me.hacked_round = v_room.round then null else v_letter end);
end $$;

create or replace function submit_guess(p_token uuid, p_target_id uuid, p_letter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_target players;
  v_letter text := upper(substr(trim(coalesce(p_letter, '')), 1, 1));
  v_correct boolean; v_kind card_kind; v_held int; v_cards boolean; v_card bigint; v_stole boolean := false;
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

  v_cards := (_cfg(v_room.id)->>'cards')::boolean;
  v_correct := exists (select 1 from banned_letters where player_id = v_target.id and letter = v_letter);
  insert into guesses (room_id, round, guesser_id, target_id, letter, correct)
    values (v_room.id, v_room.round, v_me.id, v_target.id, v_letter, v_correct);
  select count(*) into v_held from cards where owner_id = v_me.id and not used;

  if v_correct then
    update banned_letters set revealed = true where player_id = v_target.id and letter = v_letter;
    if v_held < 2 and v_cards then
      if v_me.class = 'thief' then
        -- the Thief lifts a card straight out of the victim's hand
        select id into v_card from cards where owner_id = v_target.id and not used order by random() limit 1;
        if v_card is not null then
          update cards set owner_id = v_me.id where id = v_card returning kind into v_kind;
          v_stole := true;
          perform _feed(v_room.id, jsonb_build_object('type', 'steal', 'from', v_me.id, 'to', v_target.id));
        end if;
      end if;
      if not v_stole then
        if v_me.class = 'villain' then
          v_kind := (array['attack','cleanse']::card_kind[])[1 + floor(random() * 2)::int];
        else
          v_kind := (array['attack','shield','cleanse']::card_kind[])[1 + floor(random() * 3)::int];
        end if;
        insert into cards (room_id, owner_id, kind) values (v_room.id, v_me.id, v_kind);
      end if;
    end if;
    if v_target.class = 'ninja' and not exists (
      select 1 from pending_additions where room_id = v_room.id and round = v_room.round
        and target_id = v_target.id and kind = 'ninja'
    ) then
      insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
        values (v_room.id, v_room.round, v_target.id, null, 'ninja', 3);
    end if;
  elsif v_me.class = 'thief' and v_cards then
    -- a botched job: the Thief drops one of their own cards into the target's hand
    select id into v_card from cards where owner_id = v_me.id and not used order by random() limit 1;
    if v_card is not null and (select count(*) from cards where owner_id = v_target.id and not used) < 2 then
      update cards set owner_id = v_target.id where id = v_card;
      perform _feed(v_room.id, jsonb_build_object('type', 'drop', 'from', v_me.id, 'to', v_target.id));
    end if;
  end if;

  perform _bump(v_room.id, 'guessed', jsonb_build_object('player_id', v_me.id));
  return jsonb_build_object('correct', v_correct, 'card', v_kind, 'letter', v_letter, 'stole', v_stole);
end $$;

create or replace function use_perk(p_token uuid, p_target_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_target players;
  v_letters jsonb; v_hint text; v_pending bigint; v_result jsonb; v_prompt bigint; v_mine jsonb; v_theirs jsonb;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase in ('lobby','finished') then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  if not (_cfg(v_room.id)->>'perks')::boolean then raise exception 'PERKS_OFF'; end if;

  -- per-round abilities (never "used up")
  if v_me.class = 'gambler' then
    if v_room.phase <> 'answer' then raise exception 'WRONG_PHASE'; end if;
    if v_me.bet_round = v_room.round then raise exception 'ALREADY_BET'; end if;
    update players set bet_round = v_room.round where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'bet', 'from', v_me.id));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
    return jsonb_build_object('kind', 'gambler', 'round', v_room.round);
  elsif v_me.class = 'parasite' then
    if v_room.phase not in ('answer','reveal','guess') then raise exception 'WRONG_PHASE'; end if;
    if v_me.latch_round = v_room.round then raise exception 'ALREADY_LATCHED'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    update players set latch_target = v_target.id, latch_round = v_room.round where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'latch', 'from', v_me.id, 'to', v_target.id));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
    return jsonb_build_object('kind', 'parasite', 'target_id', v_target.id);
  end if;

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

  elsif v_me.class = 'mimic' then
    if v_room.phase = 'duel_intro' then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    if v_target.class = 'mimic' then raise exception 'CANNOT_MIMIC_MIMIC'; end if;
    -- become that class for the rest of the game: its perk (fresh) and its downside
    update players set class = v_target.class, orig_class = 'mimic', perk_used = false, perk_round = null
      where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'mimic', 'from', v_me.id, 'to', v_target.id, 'what', v_target.class));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', 'mimic'));
    return jsonb_build_object('kind', 'mimic', 'became', v_target.class);

  elsif v_me.class = 'oracle' then
    if v_room.phase not in ('reveal','guess','react') then raise exception 'WRONG_PHASE'; end if;
    select id into v_prompt from prompts
      where active and not (id = any(v_room.used_prompts)) order by random() limit 1;
    if v_prompt is null then select id into v_prompt from prompts where active order by random() limit 1; end if;
    update rooms set next_prompt_id = v_prompt where id = v_room.id;
    update players set oracle_round = v_room.round + 1 where id = v_me.id;
    v_result := jsonb_build_object('kind','oracle','round',v_room.round + 1,
      'prompt', (select text from prompts where id = v_prompt));
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);
    perform _feed(v_room.id, jsonb_build_object('type', 'oracle', 'from', v_me.id));

  elsif v_me.class = 'jester' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
      into v_mine from banned_letters where player_id = v_me.id;
    select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
      into v_theirs from banned_letters where player_id = v_target.id;
    delete from banned_letters where player_id in (v_me.id, v_target.id);
    -- the Jester's new rack is on public display
    insert into banned_letters (player_id, letter, added_round, source, revealed)
      select v_me.id, x->>'l', (x->>'a')::int, x->>'s', true from jsonb_array_elements(v_theirs) x;
    insert into banned_letters (player_id, letter, added_round, source, revealed)
      select v_target.id, x->>'l', (x->>'a')::int, x->>'s', (x->>'r')::boolean from jsonb_array_elements(v_mine) x;
    v_result := jsonb_build_object('kind','jester','target_id',v_target.id);
    perform _feed(v_room.id, jsonb_build_object('type', 'swap', 'from', v_me.id, 'to', v_target.id));

  else
    raise exception 'NO_ACTIVE_PERK';
  end if;

  update players set perk_used = true where id = v_me.id;
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
  return v_result;
end $$;

-- Parasite fallout for this round: strike if the host went down.
create or replace function _parasite_host_check(p_room_id uuid, p_round int) returns void
language plpgsql security definer set search_path = public as $$
declare v_p record;
begin
  for v_p in select p.id, p.latch_target from players p join players h on h.id = p.latch_target
    where p.room_id = p_room_id and p.class = 'parasite' and not p.eliminated and p.latch_round = p_round
      and h.eliminated and h.eliminated_round = p_round loop
    perform _strike(v_p.id, p_round);
    update players set latch_target = null where id = v_p.id;
    perform _feed(p_room_id, jsonb_build_object('type', 'host_down', 'from', v_p.id, 'to', v_p.latch_target));
  end loop;
end $$;

create or replace function advance_phase(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_p record; v_a record; v_i int; v_cfg jsonb; v_pts int; v_gained int; v_drained int;
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
        v_pts := v_a.points;
        if v_room.chaos = 'double' and v_room.chaos_round = v_room.round then v_pts := v_pts * 2; end if;
        if v_p.bet_round = v_room.round then
          v_pts := v_pts * 2;
          perform _feed(v_room.id, jsonb_build_object('type', 'bet_win', 'from', v_p.id, 'amount', v_pts));
        end if;
        if v_pts <> v_a.points then update answers set points = v_pts where id = v_a.id; end if;
        update players set points = points + v_pts,
          strikes = case when v_room.duel then strikes else 0 end
        where id = v_p.id;
      else
        perform _strike(v_p.id, v_room.round);
        if v_p.bet_round = v_room.round then
          update players set points = greatest(0, points - 10) where id = v_p.id;
          perform _feed(v_room.id, jsonb_build_object('type', 'bet_lose', 'from', v_p.id, 'amount', 10));
        end if;
      end if;
    end loop;
    perform _parasite_host_check(v_room.id, v_room.round);
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
    perform _parasite_host_check(v_room.id, v_room.round);
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
    -- Parasite: every lock the host gained this round, the Parasite sheds one (never below 1)
    for v_p in select p.id, p.latch_target from players p
      where p.room_id = v_room.id and p.class = 'parasite' and not p.eliminated
        and p.latch_round = v_room.round and p.latch_target is not null loop
      select count(*) into v_gained from banned_letters
        where player_id = v_p.latch_target and added_round = v_room.round and source <> 'start';
      v_drained := 0;
      for n in 1..v_gained loop
        exit when (select count(*) from banned_letters where player_id = v_p.id) <= 1;
        delete from banned_letters where id = (
          select id from banned_letters where player_id = v_p.id order by revealed desc, random() limit 1);
        v_drained := v_drained + 1;
      end loop;
      if v_drained > 0 then
        perform _feed(v_room.id, jsonb_build_object('type', 'drain', 'from', v_p.id, 'to', v_p.latch_target, 'amount', v_drained));
      end if;
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
    update players set hacked_round = hacked_round + 1
      where room_id = v_room.id and hacked_round = v_room.round + 1;
    update players set oracle_round = oracle_round + 1
      where room_id = v_room.id and oracle_round = v_room.round + 1;
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
    hacked_round = null, hacked_by = null, traced_round = null, exposed = false,
    class = coalesce(orig_class, class), orig_class = null,
    bet_round = null, latch_target = null, latch_round = null, oracle_round = null
    where room_id = v_room.id;
  update rooms set phase = 'lobby', round = 0, duel = false, winner_id = null, prompt_id = null, next_prompt_id = null,
    chaos = null, chaos_round = null, used_prompts = '{}', phase_ends_at = null where id = v_room.id;
  perform _bump(v_room.id, 'reset');
end $$;

create or replace function get_room_state(p_code text, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me players; v_show_all boolean; v_me_json jsonb := null; v_titles jsonb := null;
  v_cfg jsonb; v_live boolean; v_dark boolean; v_chaos text; v_secs int;
begin
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  v_cfg := _defaults() || v_room.settings;
  v_live := v_room.phase not in ('lobby','finished');
  v_chaos := case when v_live and v_room.chaos_round = v_room.round then v_room.chaos end;
  v_secs := _answer_secs(v_cfg, v_room.round, v_room.duel);
  if v_chaos = 'speed' then v_secs := greatest(15, v_secs / 2); end if;
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
      'bet_active', coalesce(v_me.bet_round = v_room.round, false),
      'latched_to', case when v_me.latch_round = v_room.round then v_me.latch_target end,
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
      'answer_seconds', v_secs,
      'chaos', v_chaos,
      'settings', v_cfg),
    'prompt', (select text from prompts where id = v_room.prompt_id),
    'me', v_me_json,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'class', p.class, 'orig_class', p.orig_class,
        'strikes', p.strikes, 'points', p.points,
        'eliminated', p.eliminated, 'perk_used', p.perk_used, 'is_host', p.id = v_room.host_id,
        'connected', p.last_seen > now() - interval '20 seconds',
        'react_ready', p.react_ready,
        'letters_stacked', p.letters_stacked,
        'quit', p.quit,
        'exposed', p.exposed,
        'hacked', coalesce(v_live and not p.eliminated and p.hacked_round = v_room.round, false),
        'betting', coalesce(v_live and p.bet_round = v_room.round, false),
        'latched_to', case when v_live and p.latch_round = v_room.round then p.latch_target end,
        -- the Oracle's price: their word is public the moment they lock it in
        'oracle_word', case when v_room.phase = 'answer' and p.oracle_round = v_room.round
                            then (select a.word from answers a where a.player_id = p.id and a.round = v_room.round) end,
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

revoke execute on function _chaos(uuid), _parasite_host_check(uuid, int) from public, anon, authenticated;

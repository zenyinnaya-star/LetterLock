-- Ultimates (phase 1). Room rule "ultimates" (off by default): players spend points to trigger a class ultimate.
-- Ninja 8 / Oracle 8 / Mastermind 8: use the perk again (repeatable, Ninja works before round 3).
-- Hero 10: re-arm Absorb. Jester 10: use locked letters this round. Villain 12: stack 4 on a target.
-- Hacker 14: network down - hack everyone else. Gambler 6: buy a card of your choice.

alter table players add column if not exists ult_round int;

create or replace function _defaults() returns jsonb
language sql immutable set search_path = public as $$
  select '{"mode":"classic","max_players":8,"answer_seconds":60,"shrink":true,"guess_seconds":20,"react_seconds":8,
           "duel_seconds":20,"cards":true,"perks":true,"strikes":2,"lang":"en","team_size":2,"rounds":5,"ultimates":false}'::jsonb;
$$;

create or replace function update_settings(p_token uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_cur jsonb; v_in jsonb := coalesce(p_settings, '{}'::jsonb); v_new jsonb; v_count int;
  v_mode text; v_size int;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  v_cur := _defaults() || v_room.settings;
  select count(*) into v_count from players where room_id = v_room.id;
  v_mode := case when v_in->>'mode' in ('classic', 'duel', 'team') then v_in->>'mode' else v_cur->>'mode' end;
  v_size := _clamp(coalesce(v_in->'team_size', v_cur->'team_size'), 2, 3, 2);
  if v_mode = 'duel' and v_count > 2 then raise exception 'TOO_MANY_FOR_DUEL'; end if;
  if v_mode = 'team' and v_count > 2 * v_size then raise exception 'TOO_MANY_FOR_TEAM'; end if;
  v_new := jsonb_build_object(
    'mode', v_mode,
    'max_players',    case when v_mode = 'duel' then 2
                           when v_mode = 'team' then 2 * v_size
                           else _clamp(coalesce(v_in->'max_players', case when v_cur->>'mode' <> 'classic' then '8'::jsonb else v_cur->'max_players' end),
                                       greatest(2, v_count), 12, 8) end,
    'answer_seconds', _clamp(coalesce(v_in->'answer_seconds', v_cur->'answer_seconds'), 10, 120, 60),
    'guess_seconds',  _clamp(coalesce(v_in->'guess_seconds', v_cur->'guess_seconds'), 8, 45, 20),
    'react_seconds',  _clamp(coalesce(v_in->'react_seconds', v_cur->'react_seconds'), 4, 20, 8),
    'duel_seconds',   _clamp(coalesce(v_in->'duel_seconds', v_cur->'duel_seconds'), 10, 60, 20),
    'strikes',        _clamp(coalesce(v_in->'strikes', v_cur->'strikes'), 1, 3, 2),
    'shrink', case when jsonb_typeof(v_in->'shrink') = 'boolean' then v_in->'shrink' else v_cur->'shrink' end,
    'cards',  case when jsonb_typeof(v_in->'cards') = 'boolean' then v_in->'cards' else v_cur->'cards' end,
    'perks',  case when jsonb_typeof(v_in->'perks') = 'boolean' then v_in->'perks' else v_cur->'perks' end,
    'lang',   case when v_in->>'lang' in ('en', 'es', 'fr', 'de', 'ja', 'zh') then v_in->>'lang'
                   else coalesce(v_cur->>'lang', 'en') end,
    'twist',  case when v_in->>'twist' in ('none', 'reverse', 'chaos', 'memory') then v_in->>'twist' else coalesce(v_cur->>'twist', 'none') end,
    'ultimates', case when jsonb_typeof(v_in->'ultimates') = 'boolean' then v_in->'ultimates' else coalesce(v_cur->'ultimates', 'false'::jsonb) end,
    'team_size', v_size,
    'rounds', _clamp(coalesce(v_in->'rounds', v_cur->'rounds'), 1, 8, 5)
  );
  update rooms set settings = v_new where id = v_room.id;
  if v_mode = 'team' then
    perform _team_setup(v_room.id);
  else
    delete from teams where room_id = v_room.id;
  end if;
  perform _bump(v_room.id, 'settings');
  return v_new;
end $$;

create or replace function submit_answer(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_lang text;
  v_word text;
  v_valid boolean := true; v_reason text; v_points int := 0; v_letter text;
  v_elapsed int; v_total int; v_prev int := 0; v_sb int := 0; v_tb int := 0; v_i int; v_frac double precision;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'answer' then raise exception 'WRONG_PHASE'; end if;
  if now() > v_room.phase_ends_at + interval '1 second' then raise exception 'TIME_UP'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  v_lang := coalesce(v_room.settings->>'lang', 'en');
  v_word := _norm(v_lang, p_word);

  if v_word = '' then v_valid := false; v_reason := 'BLANK';
  elsif v_word !~ '^[a-z]+$' then v_valid := false; v_reason := 'NOT_LETTERS';
  elsif char_length(v_word) < 3 then v_valid := false; v_reason := 'TOO_SHORT';
  elsif exists (select 1 from answers where player_id = v_me.id and round < v_room.round and valid and word = v_word) then
    v_valid := false; v_reason := 'REPEAT';
  elsif not _fits(v_room.prompt_id, v_word) then
    v_valid := false; v_reason := case when _in_dict(v_lang, v_word) then 'OFF_TOPIC' else 'NOT_A_WORD' end;
  elsif not _in_dict(v_lang, v_word) and v_lang = 'en' then
    v_valid := false; v_reason := 'NOT_A_WORD';
  elsif v_room.chaos = 'no_e' and v_room.chaos_round = v_room.round and position('e' in v_word) > 0 then
    v_valid := false; v_reason := 'CHAOS_NO_E';
  elsif v_room.settings->>'twist' = 'reverse' then
    -- Reverse Lock: your locked letters are the ones you MUST use (at least one of them)
    if exists (select 1 from banned_letters where player_id = v_me.id)
       and not exists (select 1 from banned_letters bl where bl.player_id = v_me.id and position(bl.letter::text in upper(v_word)) > 0) then
      v_valid := false; v_reason := 'NEED_LOCK';
    end if;
  elsif v_me.class = 'jester' and v_me.ult_round = v_room.round then
    null; -- Jester ultimate: locked letters are fair game this round
  else
    select bl.letter::text into v_letter from banned_letters bl
      where bl.player_id = v_me.id and position(bl.letter::text in upper(v_word)) > 0 limit 1;
    if v_letter is not null then v_valid := false; v_reason := 'BANNED_LETTER'; end if;
  end if;

  if v_word <> '' and v_room.answer_started_at is not null then
    v_elapsed := greatest(0, (extract(epoch from (now() - v_room.answer_started_at)) * 1000)::int);
    v_total := greatest(1000, (extract(epoch from (v_room.phase_ends_at - v_room.answer_started_at)) * 1000)::int);
  end if;

  if v_valid then
    v_points := char_length(v_word) + 2 * greatest(0, char_length(v_word) - 6);
    for v_i in reverse (v_room.round - 1)..1 loop
      exit when not exists (select 1 from answers where player_id = v_me.id and round = v_i and valid);
      v_prev := v_prev + 1;
    end loop;
    v_sb := least(v_prev, 4);
    if v_elapsed is not null then
      v_frac := v_elapsed::double precision / v_total;
      v_tb := case when v_frac < 0.2 then 3 when v_frac < 0.4 then 2 when v_frac < 0.6 then 1 else 0 end;
    end if;
    v_points := v_points + v_sb + v_tb;
  end if;

  insert into answers (room_id, player_id, round, word, valid, reason, points, elapsed_ms, bonus)
  values (v_room.id, v_me.id, v_room.round, v_word, v_valid, v_reason, v_points, v_elapsed, v_sb + v_tb)
  on conflict (player_id, round) do update
    set word = excluded.word, valid = excluded.valid, reason = excluded.reason,
        points = excluded.points, elapsed_ms = excluded.elapsed_ms, bonus = excluded.bonus, created_at = now();

  perform _bump(v_room.id, 'answered', jsonb_build_object('player_id', v_me.id));
  return jsonb_build_object('word', v_word, 'valid', v_valid, 'reason', v_reason, 'points', v_points,
    'bonus', v_sb + v_tb, 'speed_bonus', v_tb, 'streak_bonus', v_sb, 'streak', case when v_valid then v_prev + 1 else 0 end, 'elapsed_ms', v_elapsed,
    'letter', case when v_me.hacked_round = v_room.round then null else v_letter end);
end $$;


create or replace function _ult_cost(p_class player_class) returns int
language sql immutable as $$
  select case p_class when 'ninja' then 8 when 'oracle' then 8 when 'mastermind' then 8 when 'hero' then 10
    when 'jester' then 10 when 'villain' then 12 when 'hacker' then 14 when 'gambler' then 6 else null end;
$$;

create or replace function use_ultimate(p_token uuid, p_target_id uuid default null, p_kind text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_target players; v_cost int; v_letters jsonb; v_hint text; v_prompt bigint;
  v_result jsonb; v_n int := 0; v_p record; v_held int; v_kind card_kind;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  v_cost := _ult_cost(v_me.class);
  if v_cost is null then raise exception 'NO_ULTIMATE'; end if;
  if v_room.phase in ('lobby','finished','duel_intro') then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  if not coalesce((_cfg(v_room.id)->>'ultimates')::boolean, false) then raise exception 'ULTIMATES_OFF'; end if;
  if _is_team(v_room.id) then raise exception 'ULTIMATES_NOT_IN_TEAM'; end if;
  if v_me.ult_round = v_room.round then raise exception 'ULT_USED_THIS_ROUND'; end if;
  if v_me.points < v_cost then raise exception 'NOT_ENOUGH_POINTS'; end if;

  if v_me.class = 'ninja' then
    if v_room.phase not in ('answer','reveal','guess','react') then raise exception 'WRONG_PHASE'; end if;
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
    select coalesce(jsonb_agg(letter::text order by id), '[]'::jsonb) into v_letters from banned_letters where player_id = v_target.id;
    select letter::text into v_hint from banned_letters where player_id = v_target.id order by revealed asc, random() limit 1;
    v_result := jsonb_build_object('kind','mastermind','round',v_room.round,'target_id',v_target.id,'target_name',v_target.name,'letters',v_letters,'leaked',v_hint);
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);
    update players set perk_round = v_room.round where id = v_me.id;

  elsif v_me.class = 'oracle' then
    if v_room.phase not in ('reveal','guess','react') then raise exception 'WRONG_PHASE'; end if;
    v_prompt := _pick_prompt(v_room.id);
    update rooms set next_prompt_id = v_prompt where id = v_room.id;
    update players set oracle_round = v_room.round + 1 where id = v_me.id;
    v_result := jsonb_build_object('kind','oracle','round',v_room.round + 1,'prompt',(select text from prompts where id = v_prompt));
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);

  elsif v_me.class = 'hero' then
    if not v_me.perk_used then raise exception 'ULT_NOT_NEEDED'; end if;
    update players set perk_used = false where id = v_me.id;
    v_result := jsonb_build_object('kind','hero','rearmed',true);

  elsif v_me.class = 'jester' then
    if v_room.phase <> 'answer' then raise exception 'WRONG_PHASE'; end if;
    v_result := jsonb_build_object('kind','jester','unlocked',true);

  elsif v_me.class = 'villain' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
      values (v_room.id, v_room.round, v_target.id, v_me.id, 'attack', 4);
    perform _feed(v_room.id, jsonb_build_object('type','attack','from',v_me.id,'to',v_target.id,'amount',4));
    v_result := jsonb_build_object('kind','villain','target_id',v_target.id,'amount',4);

  elsif v_me.class = 'hacker' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    for v_p in select id from players where room_id = v_room.id and id <> v_me.id and not eliminated loop
      insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
        values (v_room.id, v_room.round, v_p.id, v_me.id, 'hack', 1);
      perform _feed(v_room.id, jsonb_build_object('type','hack','to',v_p.id,'from',case when v_me.exposed then v_me.id end));
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'NO_TARGETS'; end if;
    v_result := jsonb_build_object('kind','hacker','hit',v_n);

  elsif v_me.class = 'gambler' then
    if not coalesce((_cfg(v_room.id)->>'cards')::boolean, true) then raise exception 'CARDS_OFF'; end if;
    if p_kind not in ('attack','shield','cleanse') then raise exception 'BAD_CARD_KIND'; end if;
    select count(*) into v_held from cards where owner_id = v_me.id and not used;
    if v_held >= 2 then raise exception 'HAND_FULL'; end if;
    v_kind := p_kind::card_kind;
    insert into cards (room_id, owner_id, kind) values (v_room.id, v_me.id, v_kind);
    v_result := jsonb_build_object('kind','gambler','card',v_kind);
  end if;

  update players set points = points - v_cost, ult_round = v_room.round where id = v_me.id;
  perform _feed(v_room.id, jsonb_build_object('type','ult','from',v_me.id,'what',v_me.class));
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
  return v_result || jsonb_build_object('cost', v_cost);
end $$;

revoke execute on function _ult_cost(player_class) from public;
revoke execute on function use_ultimate(uuid, uuid, text) from public;
grant execute on function use_ultimate(uuid, uuid, text) to anon, authenticated;

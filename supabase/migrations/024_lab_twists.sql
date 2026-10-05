-- Lab twists: room setting 'twist' = none | reverse | chaos | memory.
-- reverse: you must use one of your locked letters. chaos: random chaos rule every round. memory: client hides your locks.

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

create or replace function bot_tick(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_cfg jsonb; v_b players; v_remaining double precision; v_total double precision;
  v_lo double precision; v_hi double precision; v_r double precision; v_ids jsonb;
  v_word text; v_tries int; v_res jsonb; v_banned text; v_target players; v_letter text;
  v_freq text := 'ETAOINSHRDLUCMFWYPVBGKQJXZ';
  v_cands text[]; v_lvl int; v_sty int; v_info jsonb; v_twist text; v_card cards; v_pend pending_additions; v_used text;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id;
  if v_room.host_id <> v_me.id then return jsonb_build_object('bots', '[]'::jsonb); end if;
  select coalesce(jsonb_agg(id), '[]'::jsonb), coalesce(jsonb_object_agg(id, jsonb_build_object('l', bot, 's', bot_style)), '{}'::jsonb)
    into v_ids, v_info from players where room_id = v_room.id and bot > 0;
  if v_ids = '[]'::jsonb then return jsonb_build_object('bots', v_ids, 'info', v_info); end if;
  update players set last_seen = now() where room_id = v_room.id and bot > 0;
  if v_room.phase not in ('answer','guess','react') then return jsonb_build_object('bots', v_ids, 'info', v_info); end if;
  v_cfg := _cfg(v_room.id);
  v_twist := v_cfg->>'twist';
  v_remaining := extract(epoch from (v_room.phase_ends_at - now()));
  v_total := case v_room.phase
    when 'answer' then coalesce((v_cfg->>'answer_seconds')::int, 60)
    when 'guess' then coalesce((v_cfg->>'guess_seconds')::int, 20)
    else coalesce((v_cfg->>'react_seconds')::int, 8) end;
  if v_remaining <= 1 then return jsonb_build_object('bots', v_ids, 'info', v_info); end if;

  for v_b in select * from players where room_id = v_room.id and bot > 0 and not eliminated order by joined_at loop
    v_lvl := v_b.bot; v_sty := v_b.bot_style;
    v_r := _bot_r(v_b.id, v_room.round, v_room.phase::text);
    begin
      if v_room.phase = 'answer' then
        if exists (select 1 from answers where player_id = v_b.id and round = v_room.round) then continue; end if;
        -- when the bot is ready: easy 50-90% of the time gone, medium 30-65%, hard 12-40%
        v_lo := case v_lvl when 1 then 0.5 when 2 then 0.3 else 0.12 end;
        v_hi := case v_lvl when 1 then 0.9 when 2 then 0.65 else 0.4 end;
        if v_sty = 3 then v_lo := 0.03; v_hi := 0.2;           -- speed demon: answers almost instantly
        elsif v_sty = 2 then v_lo := greatest(v_lo, 0.4); v_hi := greatest(v_hi, 0.75); end if;  -- defensive: takes its time
        if v_remaining > v_total * (1 - (v_lo + v_r * (v_hi - v_lo))) then continue; end if;
        select string_agg(letter::text, '') into v_banned from banned_letters where player_id = v_b.id;
        -- easy bots sometimes forget their banned letters
        if v_lvl = 1 and v_sty <> 2 and random() < 0.45 then v_banned := null; end if;
        v_tries := case v_lvl when 1 then 1 when 2 then 3 else 8 end;
        if v_sty = 2 then v_tries := v_tries + 3; end if;
        for v_word in
          select w from (
            select pw.word as w from prompt_words pw where pw.prompt_id = v_room.prompt_id
            union
            select d.word from words d where d.lang = coalesce(v_cfg->>'lang', 'en')
              and not exists (select 1 from prompt_words x where x.prompt_id = v_room.prompt_id)
              and char_length(d.word) between 3 and 9
          ) c
          where w ~ '^[a-z]{3,}$'
            and (v_banned is null or (case when v_twist = 'reverse' then upper(w) ~ ('[' || v_banned || ']') else upper(w) !~ ('[' || v_banned || ']') end))
            and not exists (select 1 from answers a where a.player_id = v_b.id and a.valid and a.word = c.w)
          order by case when v_sty = 3 then char_length(w) + random() * 2      -- speed demon: short words, fast
                     when v_lvl = 3 then -(char_length(w)) + random() * 3   -- hard: long words, big points
                     when v_lvl = 1 then char_length(w) + random() * 4      -- easy: short words
                     else random() * 10 end
          limit v_tries
        loop
          v_res := submit_answer(v_b.token, v_word);
          exit when (v_res->>'valid')::boolean;
        end loop;
        -- nothing fitted: a blank turn is a strike, just like for a human
        if not exists (select 1 from answers where player_id = v_b.id and round = v_room.round) then
          perform submit_answer(v_b.token, '');
        end if;

      elsif v_room.phase = 'guess' then
        -- attack card first (medium/hard), once
        if v_sty = 1 or (v_sty <> 2 and (v_lvl >= 2 or random() < 0.3)) or (v_sty = 2 and random() < 0.1) then
          select * into v_card from cards where owner_id = v_b.id and not used and kind = 'attack' limit 1;
          if found and (v_r > 0.3 or v_sty = 1) then
            select * into v_target from players where room_id = v_room.id and id <> v_b.id and not eliminated
              order by case when v_lvl = 3 or v_sty = 1 then -points else 0 end, random() limit 1;
            if found then perform play_card(v_b.token, v_card.id, v_target.id); end if;
          end if;
        end if;
        if exists (select 1 from guesses where guesser_id = v_b.id and round = v_room.round) then continue; end if;
        v_lo := case v_lvl when 1 then 0.4 when 2 then 0.2 else 0.08 end;
        v_hi := case v_lvl when 1 then 0.85 when 2 then 0.6 else 0.35 end;
        if v_sty = 3 then v_lo := 0.03; v_hi := 0.18; elsif v_sty = 1 then v_lo := least(v_lo, 0.1); v_hi := least(v_hi, 0.4); end if;
        if v_remaining > v_total * (1 - (v_lo + v_r * (v_hi - v_lo))) then continue; end if;
        select * into v_target from players where room_id = v_room.id and id <> v_b.id and not eliminated
          order by case when v_lvl = 3 or v_sty = 1 then -points else 0 end, random() limit 1;
        if not found then continue; end if;
        -- letters that could still be banned on the target: not revealed, not already missed by this bot,
        -- and (medium/hard) not in the word the target just played
        select array_agg(ch order by position(ch in v_freq)) into v_cands
        from (select chr(65 + g) as ch from generate_series(0, 25) g) l
        where not exists (select 1 from banned_letters where player_id = v_target.id and letter::text = l.ch and revealed)
          and not exists (select 1 from guesses where guesser_id = v_b.id and target_id = v_target.id and letter = l.ch and not correct)
          and (v_lvl = 1 or not exists (select 1 from answers a where a.player_id = v_target.id and a.round = v_room.round
                 and a.valid and position(l.ch in upper(a.word)) > 0));
        if v_cands is null or array_length(v_cands, 1) is null then continue; end if;
        v_letter := case v_lvl
          when 1 then v_cands[1 + floor(random() * array_length(v_cands, 1))::int]
          when 2 then v_cands[1 + floor(random() * least(14, array_length(v_cands, 1)))::int]
          else v_cands[1 + floor(random() * least(7, array_length(v_cands, 1)))::int] end;
        perform submit_guess(v_b.token, v_target.id, v_letter);

      elsif v_room.phase = 'react' then
        if v_lvl >= 2 or v_sty = 2 then
          select * into v_pend from pending_additions where room_id = v_room.id and round = v_room.round
            and status = 'pending' and target_id = v_b.id order by amount desc limit 1;
          if found then
            select * into v_card from cards where owner_id = v_b.id and not used and kind = 'shield' limit 1;
            if found then perform play_card(v_b.token, v_card.id, null); end if;
          end if;
          if (v_lvl = 3 or v_sty = 2) and (select count(*) from banned_letters where player_id = v_b.id) > (3 - (v_sty = 2)::int) then
            select * into v_card from cards where owner_id = v_b.id and not used and kind = 'cleanse' limit 1;
            if found then perform play_card(v_b.token, v_card.id, null); end if;
          end if;
        end if;
        if not v_b.react_ready and v_remaining <= v_total * (1 - v_r * case when v_sty = 3 then 1.0 else 0.7 end) then
          perform react_ready(v_b.token);
        end if;
      end if;
    exception when others then
      null; -- a bot never breaks the game; it just skips the turn
    end;
  end loop;
  return jsonb_build_object('bots', v_ids, 'info', v_info);
end $$;

-- Chaos twist: a random chaos rule every round from round 2 (a Wildcard in the room already triggers its own, so skip then)
create or replace function _twist_chaos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phase = 'answer' and new.round >= 2 and (old.phase is distinct from 'answer' or old.round is distinct from new.round)
     and new.settings->>'twist' = 'chaos' and new.chaos_round is distinct from new.round
     and not exists (select 1 from players where room_id = new.id and class = 'wildcard' and not eliminated) then
    begin
      perform _chaos(new.id);
    exception when others then null;
    end;
  end if;
  return null;
end $$;
drop trigger if exists rooms_twist_chaos on rooms;
create trigger rooms_twist_chaos after update on rooms for each row execute function _twist_chaos();


-- Bot personalities (0 balanced, 1 aggressive, 2 defensive, 3 speed demon) and live level/style editing in the lobby.
alter table players add column if not exists bot_style int not null default 0;

drop function if exists add_bot(uuid, int);
create or replace function add_bot(p_token uuid, p_level int, p_style int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_name text; v_class player_class; v_p players;
  v_names text[] := array['Bolt','Nova','Rex','Pixel','Echo','Sage','Zed','Miko','Juno','Kit','Ori','Vex'];
  v_classes player_class[] := array['ninja','mastermind','hero','villain','hacker','mimic','gambler','thief','parasite','oracle','wildcard','jester']::player_class[];
  v_cfg jsonb;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  v_cfg := _cfg(v_room.id);
  if v_cfg->>'mode' = 'team' then raise exception 'BOTS_NOT_IN_TEAM_MODE'; end if;
  if p_level not between 1 and 3 then raise exception 'BAD_LEVEL'; end if;
  if p_style not between 0 and 3 then raise exception 'BAD_STYLE'; end if;
  if (select count(*) from players where room_id = v_room.id) >= (v_cfg->>'max_players')::int then raise exception 'ROOM_FULL'; end if;
  if v_cfg->>'mode' = 'duel' and (select count(*) from players where room_id = v_room.id) >= 2 then raise exception 'ROOM_FULL'; end if;
  select n into v_name from unnest(v_names) n
    where not exists (select 1 from players where room_id = v_room.id and lower(name) = lower(n))
    order by random() limit 1;
  if v_name is null then v_name := 'Bot' || floor(random() * 900 + 100)::int; end if;
  v_class := v_classes[1 + floor(random() * array_length(v_classes, 1))::int];
  insert into players (room_id, name, class, bot, bot_style) values (v_room.id, v_name, v_class, p_level, p_style) returning * into v_p;
  perform _bump(v_room.id, 'player_joined', jsonb_build_object('player_id', v_p.id));
  return jsonb_build_object('player_id', v_p.id, 'name', v_name);
end $$;

create or replace function set_bot(p_token uuid, p_bot_id uuid, p_level int, p_style int) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  if p_level not between 1 and 3 then raise exception 'BAD_LEVEL'; end if;
  if p_style not between 0 and 3 then raise exception 'BAD_STYLE'; end if;
  update players set bot = p_level, bot_style = p_style where id = p_bot_id and room_id = v_room.id and bot > 0;
  perform _bump(v_room.id, 'settings');
end $$;

create or replace function bot_tick(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_cfg jsonb; v_b players; v_remaining double precision; v_total double precision;
  v_lo double precision; v_hi double precision; v_r double precision; v_ids jsonb;
  v_word text; v_tries int; v_res jsonb; v_banned text; v_target players; v_letter text;
  v_freq text := 'ETAOINSHRDLUCMFWYPVBGKQJXZ';
  v_cands text[]; v_lvl int; v_sty int; v_info jsonb; v_card cards; v_pend pending_additions; v_used text;
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
            and (v_banned is null or upper(w) !~ ('[' || v_banned || ']'))
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

revoke execute on function add_bot(uuid, int, int), set_bot(uuid, uuid, int, int), bot_tick(uuid) from public;
grant execute on function add_bot(uuid, int, int), set_bot(uuid, uuid, int, int), bot_tick(uuid) to anon, authenticated;

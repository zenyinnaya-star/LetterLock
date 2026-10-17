-- Bots in Team mode (needs 079). Bots fill team seats, only ever aim at the enemy team, and play focus fire:
-- they back a teammate's open call (harder bots back more often) or make their own call using the team's
-- pooled clues (a team that talks shares its clues, so bots read every clue dealt to their team).

create or replace function add_bot(p_token uuid, p_level integer, p_style integer default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_name text; v_class player_class; v_p players;
  v_names text[] := array['Bolt','Nova','Rex','Pixel','Echo','Sage','Zed','Miko','Juno','Kit','Ori','Vex'];
  v_classes player_class[] := array['ninja','mastermind','hero','villain','hacker','mimic','gambler','thief','parasite','oracle','wildcard','jester']::player_class[];
  v_cfg jsonb; v_team boolean; v_cap int;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  v_cfg := _cfg(v_room.id);
  v_team := v_cfg->>'mode' = 'team';
  if p_level not between 1 and 3 then raise exception 'BAD_LEVEL'; end if;
  if p_style not between 0 and 3 then raise exception 'BAD_STYLE'; end if;
  v_cap := case when v_team then 2 * coalesce((v_cfg->>'team_size')::int, 2) else (v_cfg->>'max_players')::int end;
  if (select count(*) from players where room_id = v_room.id) >= v_cap then raise exception 'ROOM_FULL'; end if;
  if v_cfg->>'mode' = 'duel' and (select count(*) from players where room_id = v_room.id) >= 2 then raise exception 'ROOM_FULL'; end if;
  select n into v_name from unnest(v_names) n
    where not exists (select 1 from players where room_id = v_room.id and lower(name) = lower(n))
    order by random() limit 1;
  if v_name is null then v_name := 'Bot' || floor(random() * 900 + 100)::int; end if;
  v_class := v_classes[1 + floor(random() * array_length(v_classes, 1))::int];
  insert into players (room_id, name, class, bot, bot_style) values (v_room.id, v_name, v_class, p_level, p_style) returning * into v_p;
  if v_team then
    perform _team_setup(v_room.id);
    perform _team_autoplace(v_room.id, v_p.id);
    perform _team_fix_leaders(v_room.id);
  end if;
  perform _bump(v_room.id, 'player_joined', jsonb_build_object('player_id', v_p.id));
  return jsonb_build_object('player_id', v_p.id, 'name', v_name);
end $$;

create or replace function _bot_tick_base(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_cfg jsonb; v_b players; v_remaining double precision; v_total double precision;
  v_lo double precision; v_hi double precision; v_r double precision; v_ids jsonb;
  v_word text; v_tries int; v_res jsonb; v_banned text; v_target players; v_letter text;
  v_freq text := 'ETAOINSHRDLUCMFWYPVBGKQJXZ';
  v_cands text[]; v_lvl int; v_sty int; v_info jsonb; v_twist text; v_card cards; v_pend pending_additions; v_used text;
  v_team boolean; v_back text; v_sus text[]; v_clean text[];
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
  v_team := coalesce(v_cfg->>'mode', 'classic') = 'team';
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
        v_lo := case v_lvl when 1 then 0.5 when 2 then 0.3 else 0.12 end;
        v_hi := case v_lvl when 1 then 0.9 when 2 then 0.65 else 0.4 end;
        if v_sty = 3 then v_lo := 0.03; v_hi := 0.2;
        elsif v_sty = 2 then v_lo := greatest(v_lo, 0.4); v_hi := greatest(v_hi, 0.75); end if;
        if v_remaining > v_total * (1 - (v_lo + v_r * (v_hi - v_lo))) then continue; end if;
        select string_agg(letter::text, '') into v_banned from banned_letters where player_id = v_b.id;
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
            -- team: don't echo a word a teammate already played this round
            and not (v_team and exists (select 1 from answers a join players tp on tp.id = a.player_id
                      where tp.team_id = v_b.team_id and a.round = v_room.round and a.word = c.w))
          order by case when v_sty = 3 then char_length(w) + random() * 2
                     when v_lvl = 3 then -(char_length(w)) + random() * 3
                     when v_lvl = 1 then char_length(w) + random() * 4
                     else random() * 10 end
          limit v_tries
        loop
          v_res := submit_answer(v_b.token, v_word);
          exit when (v_res->>'valid')::boolean;
        end loop;
        if not exists (select 1 from answers where player_id = v_b.id and round = v_room.round) then
          perform submit_answer(v_b.token, '');
        end if;

      elsif v_room.phase = 'guess' then
        if v_sty = 1 or (v_sty <> 2 and (v_lvl >= 2 or random() < 0.3)) or (v_sty = 2 and random() < 0.1) then
          select * into v_card from cards where owner_id = v_b.id and not used and kind = 'attack' limit 1;
          if found and (v_r > 0.3 or v_sty = 1) then
            select * into v_target from players where room_id = v_room.id and id <> v_b.id and not eliminated
              and (not v_team or team_id is distinct from v_b.team_id)
              order by case when v_lvl = 3 or v_sty = 1 then -points else 0 end, random() limit 1;
            if found then perform play_card(v_b.token, v_card.id, v_target.id); end if;
          end if;
        end if;
        if exists (select 1 from guesses where guesser_id = v_b.id and round = v_room.round) then continue; end if;
        if v_team and exists (select 1 from team_calls where caller_id = v_b.id and round = v_room.round) then continue; end if;
        v_lo := case v_lvl when 1 then 0.4 when 2 then 0.2 else 0.08 end;
        v_hi := case v_lvl when 1 then 0.85 when 2 then 0.6 else 0.35 end;
        if v_sty = 3 then v_lo := 0.03; v_hi := 0.18; elsif v_sty = 1 then v_lo := least(v_lo, 0.1); v_hi := least(v_hi, 0.4); end if;
        if v_remaining > v_total * (1 - (v_lo + v_r * (v_hi - v_lo))) then continue; end if;
        select * into v_target from players where room_id = v_room.id and id <> v_b.id and not eliminated
          and (not v_team or team_id is distinct from v_b.team_id)
          order by case when v_lvl = 3 or v_sty = 1 then -points else 0 end, random() limit 1;
        if not found then continue; end if;

        if v_team then
          -- back a teammate's open call (easy 45%, medium 75%, hard 95%)
          select c.letter into v_back from team_calls c
            where c.room_id = v_room.id and c.round = v_room.round and c.team_id = v_b.team_id and not c.resolved
            order by c.id limit 1;
          if v_back is not null and random() < case v_lvl when 1 then 0.45 when 2 then 0.75 else 0.95 end then
            perform submit_guess(v_b.token, v_target.id, v_back);
            continue;
          end if;
          -- otherwise call a letter, using the team's pooled clues
          perform _team_deal_intel(v_room.id, v_room.round, v_b.team_id);
          select array_agg(l) into v_sus from team_intel i, unnest(i.letters) l
            where i.room_id = v_room.id and i.round = v_room.round and i.team_id = v_b.team_id and i.kind = 'suspects';
          select array_agg(l) into v_clean from team_intel i, unnest(i.letters) l
            where i.room_id = v_room.id and i.round = v_room.round and i.team_id = v_b.team_id and i.kind = 'clean';
          if v_sus is not null and (v_lvl >= 2 or random() < 0.5) then
            select l into v_letter from unnest(v_sus) l
              where v_clean is null or not (l = any(v_clean))
              order by random() limit 1;
            if v_letter is not null then
              perform submit_guess(v_b.token, v_target.id, v_letter);
              continue;
            end if;
          end if;
        end if;

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

revoke execute on function _bot_tick_base(uuid) from public, anon, authenticated;

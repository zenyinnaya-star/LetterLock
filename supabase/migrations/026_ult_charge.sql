-- Ultimates v2: skill charges the ultimate (not score). Charge comes from valid answers (2 + streak + speed bonus)
-- and cracked locks (+3), caps at 30, and costs are in charge. Ninja nerfed: vision shows 6 random locks, ult costs 16
-- and needs round 3+.

alter table players add column if not exists charge int not null default 0;
update players set charge = 0 where charge is null;

create or replace function get_room_state(p_code text, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me players; v_show_all boolean; v_me_json jsonb := null; v_titles jsonb := null;
  v_cfg jsonb; v_live boolean; v_dark boolean; v_chaos text; v_secs int; v_hide boolean; v_mt uuid;
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
  v_mt := v_me.team_id;   -- my team (null outside team mode)
  v_show_all := v_room.phase = 'finished' or coalesce(v_me.eliminated, false);
  -- Everyone's class is secret (you only learn "the Ninja attacked Ava") until the game ends — teammates excepted.
  v_hide := v_room.phase <> 'finished' and not coalesce(v_me.eliminated, false);

  if v_me.id is not null then
    v_dark := coalesce(v_live and not v_me.eliminated and v_me.hacked_round = v_room.round, false);
    v_me_json := jsonb_build_object(
      'id', v_me.id, 'name', v_me.name, 'class', v_me.class, 'strikes', v_me.strikes,
      'points', v_me.points, 'eliminated', v_me.eliminated, 'perk_used', v_me.perk_used, 'charge', v_me.charge,
      'team_id', v_me.team_id,
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
      'winner_team', v_room.winner_team,
      'phase_ends_at', v_room.phase_ends_at,
      'answer_seconds', v_secs,
      'chaos', v_chaos,
      'settings', v_cfg),
    'prompt', (select text from prompts where id = v_room.prompt_id),
    'me', v_me_json,
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'idx', t.idx, 'name', t.name, 'image_url', t.image_url, 'leader_id', t.leader_id,
        'points', (select coalesce(sum(p.points), 0) from players p where p.team_id = t.id),
        'letter_count', (select count(*) from banned_letters bl where bl.player_id = _team_ref(t.id))
      ) order by t.idx) from teams t where t.room_id = v_room.id), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'avatar_url', p.avatar_url, 'team_id', p.team_id,
        'class', case when v_hide and p.id is distinct from v_me.id and not (v_mt is not null and p.team_id = v_mt) then null else p.class end,
        'orig_class', case when v_hide and p.id is distinct from v_me.id and not (v_mt is not null and p.team_id = v_mt) then null else p.orig_class end,
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
                                          'source_id', case when pa.kind = 'hack' and not coalesce(src.exposed, false) then null
                                                            when v_hide and pa.source_id is distinct from v_me.id
                                                                 and not (v_mt is not null and src.team_id = v_mt) then null
                                                            else pa.source_id end,
                                          'source_class', case when pa.source_id is not null then coalesce(src.orig_class, src.class) end,
                                          'kind', pa.kind, 'amount', pa.amount, 'status', pa.status,
                                          'absorbed_by', pa.absorbed_by) order by pa.id)
      from pending_additions pa left join players src on src.id = pa.source_id
      where pa.room_id = v_room.id and pa.round = v_room.round), '[]'::jsonb)
      else '[]'::jsonb end,
    'feed', coalesce((select jsonb_agg(
                        case when v_hide and f.payload->>'from' is distinct from v_me.id::text
                                  and not (v_mt is not null and fp.team_id = v_mt)
                                  and f.payload->>'type' not in ('chicken', 'caught', 'trace_miss', 'chaos')
                             then (f.payload - 'from' - 'what') || jsonb_build_object('from', null)
                             else f.payload end
                        || jsonb_build_object('id', f.id, 'round', f.round,
                             'from_class', case when f.payload->>'type' = 'mimic' then 'mimic' else fp.class::text end)
                        order by f.id)
                      from (select * from events where room_id = v_room.id and kind = 'action'
                            order by id desc limit 15) f
                      left join players fp on fp.id::text = f.payload->>'from'), '[]'::jsonb),
    'titles', v_titles
  );
end $$;

create or replace function submit_guess(p_token uuid, p_target_id uuid, p_letter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_target players;
  v_letter text := upper(substr(trim(coalesce(p_letter, '')), 1, 1));
  v_correct boolean; v_kind card_kind; v_held int; v_cards boolean; v_card bigint; v_stole boolean := false;
  v_team boolean; v_ninja uuid;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'guess' then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  v_team := _is_team(v_room.id);
  select * into v_target from players where id = p_target_id and room_id = v_room.id;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
  if v_team and v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
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
    update players set charge = least(30, charge + 3) where id = v_me.id; -- skill charges your ultimate
    if v_team then
      update banned_letters set revealed = true where letter = v_letter
        and player_id in (select id from players where team_id = v_target.team_id);
    else
      update banned_letters set revealed = true where player_id = v_target.id and letter = v_letter;
    end if;
    if v_held < 2 and v_cards then
      if v_me.class = 'thief' then
        -- the Thief lifts a card straight out of the victim's hand (any card on the enemy team)
        select id into v_card from cards where not used and (
            (not v_team and owner_id = v_target.id)
            or (v_team and owner_id in (select id from players where team_id = v_target.team_id)))
          order by random() limit 1;
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
    if v_team then
      -- Ninja's price, team edition: a crack on the Ninja's team costs the whole team 2 locks (once a round)
      select id into v_ninja from players where team_id = v_target.team_id and class = 'ninja' and not eliminated limit 1;
      if v_ninja is not null and not exists (
        select 1 from pending_additions pa where pa.room_id = v_room.id and pa.round = v_room.round and pa.kind = 'ninja'
          and pa.target_id in (select id from players where team_id = v_target.team_id)
      ) then
        insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
          values (v_room.id, v_room.round, v_ninja, null, 'ninja', 2);
      end if;
    elsif v_target.class = 'ninja' and not exists (
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
  v_team boolean; v_ref_me uuid; v_ref_th uuid;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase in ('lobby','finished') then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  if not (_cfg(v_room.id)->>'perks')::boolean then raise exception 'PERKS_OFF'; end if;
  v_team := _is_team(v_room.id);

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
    if v_team and v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
    update players set latch_target = v_target.id, latch_round = v_room.round where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'latch', 'from', v_me.id, 'to', v_target.id));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
    return jsonb_build_object('kind', 'parasite', 'target_id', v_target.id);
  end if;

  if v_me.perk_used then raise exception 'PERK_USED'; end if;

  if v_me.class = 'ninja' then
    if v_room.round < 3 then raise exception 'PERK_NOT_READY'; end if;
    -- Ninja nerf: vision shows only 6 random locks in play, not all of them
    select coalesce(jsonb_agg(x.l), '[]'::jsonb) into v_letters from (
      select bl.letter::text as l
      from banned_letters bl join players p on p.id = bl.player_id
      where p.room_id = v_room.id and not p.eliminated and p.id <> v_me.id
        and (not v_team or p.team_id is distinct from v_me.team_id)
      group by bl.letter order by random() limit 6) x;
    v_result := jsonb_build_object('kind','ninja','round',v_room.round,'letters',v_letters);
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);

  elsif v_me.class = 'mastermind' then
    if v_room.phase not in ('answer','reveal','guess') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_team and v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
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
    if v_team then
      -- team edition: take an incoming attack on your team off the table for +5 points
      select pa.id into v_pending from pending_additions pa
        where pa.room_id = v_room.id and pa.round = v_room.round and pa.status = 'pending'
          and pa.target_id in (select id from players where team_id = v_me.team_id)
        order by pa.amount desc, pa.id limit 1;
      if v_pending is null then raise exception 'NOTHING_TO_ABSORB'; end if;
      update pending_additions set status = 'blocked', absorbed_by = v_me.id where id = v_pending;
    else
      select id into v_pending from pending_additions
        where room_id = v_room.id and round = v_room.round and target_id = p_target_id
          and target_id <> v_me.id and status = 'pending'
        order by amount desc, id limit 1;
      if v_pending is null then raise exception 'NOTHING_TO_ABSORB'; end if;
      update pending_additions set target_id = v_me.id, absorbed_by = v_me.id where id = v_pending;
    end if;
    update players set points = points + 5 where id = v_me.id;
    v_result := jsonb_build_object('kind','hero','absorbed_from',p_target_id,'bonus',5);
    perform _feed(v_room.id, jsonb_build_object('type', 'absorb', 'from', v_me.id,
      'to', case when v_team then (select target_id from pending_additions where id = v_pending) else p_target_id end));

  elsif v_me.class = 'mimic' then
    if v_room.phase = 'duel_intro' then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    if v_target.class = 'mimic' then raise exception 'CANNOT_MIMIC_MIMIC'; end if;
    update players set class = v_target.class, orig_class = 'mimic', perk_used = false, perk_round = null
      where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'mimic', 'from', v_me.id, 'to', v_target.id, 'what', v_target.class));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', 'mimic'));
    return jsonb_build_object('kind', 'mimic', 'became', v_target.class);

  elsif v_me.class = 'oracle' then
    if v_room.phase not in ('reveal','guess','react') then raise exception 'WRONG_PHASE'; end if;
    v_prompt := _pick_prompt(v_room.id);
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
    if v_team then
      -- team edition: the two teams swap their whole racks; what the Jester's team receives is revealed to all
      if v_target.team_id is not distinct from v_me.team_id then raise exception 'CANNOT_TARGET_TEAMMATE'; end if;
      v_ref_me := _team_ref(v_me.team_id); v_ref_th := _team_ref(v_target.team_id);
      select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
        into v_mine from banned_letters where player_id = v_ref_me;
      select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
        into v_theirs from banned_letters where player_id = v_ref_th;
      delete from banned_letters where player_id in (select id from players where team_id in (v_me.team_id, v_target.team_id));
      insert into banned_letters (player_id, letter, added_round, source, revealed)
        select p.id, x->>'l', (x->>'a')::int, x->>'s', true
        from players p, jsonb_array_elements(v_theirs) x where p.team_id = v_me.team_id;
      insert into banned_letters (player_id, letter, added_round, source, revealed)
        select p.id, x->>'l', (x->>'a')::int, x->>'s', (x->>'r')::boolean
        from players p, jsonb_array_elements(v_mine) x where p.team_id = v_target.team_id;
    else
      select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
        into v_mine from banned_letters where player_id = v_me.id;
      select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
        into v_theirs from banned_letters where player_id = v_target.id;
      delete from banned_letters where player_id in (v_me.id, v_target.id);
      insert into banned_letters (player_id, letter, added_round, source, revealed)
        select v_me.id, x->>'l', (x->>'a')::int, x->>'s', true from jsonb_array_elements(v_theirs) x;
      insert into banned_letters (player_id, letter, added_round, source, revealed)
        select v_target.id, x->>'l', (x->>'a')::int, x->>'s', (x->>'r')::boolean from jsonb_array_elements(v_mine) x;
    end if;
    v_result := jsonb_build_object('kind','jester','target_id',v_target.id);
    perform _feed(v_room.id, jsonb_build_object('type', 'swap', 'from', v_me.id, 'to', v_target.id));

  else
    raise exception 'NO_ACTIVE_PERK';
  end if;

  update players set perk_used = true where id = v_me.id;
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
  return v_result;
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

  if v_valid and not exists (select 1 from answers where player_id = v_me.id and round = v_room.round and valid) then
    -- skill charges your ultimate: base 2 + streak bonus + speed bonus (so 2..9 per answer)
    update players set charge = least(30, charge + 2 + v_sb + v_tb) where id = v_me.id;
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
  select case p_class when 'ninja' then 16 when 'oracle' then 12 when 'mastermind' then 12 when 'hero' then 14
    when 'jester' then 14 when 'villain' then 18 when 'hacker' then 20 when 'gambler' then 8 else null end;
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
  if v_me.charge < v_cost then raise exception 'NOT_ENOUGH_CHARGE'; end if;

  if v_me.class = 'ninja' then
    if v_room.phase not in ('answer','reveal','guess','react') then raise exception 'WRONG_PHASE'; end if;
    if v_room.round < 3 then raise exception 'PERK_NOT_READY'; end if;
    select coalesce(jsonb_agg(x.l), '[]'::jsonb) into v_letters from (
      select bl.letter::text as l from banned_letters bl join players p on p.id = bl.player_id
      where p.room_id = v_room.id and not p.eliminated and p.id <> v_me.id
      group by bl.letter order by random() limit 6) x;
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

  update players set charge = charge - v_cost, ult_round = v_room.round where id = v_me.id;
  perform _feed(v_room.id, jsonb_build_object('type','ult','from',v_me.id,'what',v_me.class));
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
  return v_result || jsonb_build_object('cost', v_cost);
end $$;

revoke execute on function _ult_cost(player_class) from public;
revoke execute on function use_ultimate(uuid, uuid, text) from public;
grant execute on function use_ultimate(uuid, uuid, text) to anon, authenticated;


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
    charge = 0, ult_round = null, bet_round = null, latch_target = null, latch_round = null, oracle_round = null
    where room_id = v_room.id;
  update rooms set phase = 'lobby', round = 0, duel = false, winner_id = null, winner_team = null,
    prompt_id = null, next_prompt_id = null,
    chaos = null, chaos_round = null, used_prompts = '{}', phase_ends_at = null where id = v_room.id;
  if _is_team(v_room.id) then perform _team_fix_leaders(v_room.id); end if;
  perform _bump(v_room.id, 'reset');
end $$;

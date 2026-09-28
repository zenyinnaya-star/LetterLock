-- Answers must fit the prompt's category, and classes stay secret in 1v1 as well.

create table if not exists prompt_words (
  prompt_id bigint not null references prompts(id) on delete cascade,
  word text not null,
  primary key (prompt_id, word)
);
alter table prompt_words enable row level security;

-- A word fits if the prompt has no list (legacy) or the word / its singular is on the list.
create or replace function _fits(p_prompt bigint, p_word text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from prompt_words where prompt_id = p_prompt)
      or exists (select 1 from prompt_words where prompt_id = p_prompt and word = any (array[
           p_word,
           case when p_word ~ 's$' then left(p_word, -1) end,
           case when p_word ~ 'es$' then left(p_word, -2) end,
           case when p_word ~ 'ies$' then left(p_word, -3) || 'y' end,
           case when p_word ~ 'ves$' then left(p_word, -3) || 'f' end,
           case when p_word ~ 'ves$' then left(p_word, -3) || 'fe' end
         ]));
$$;
revoke execute on function _fits(bigint, text) from public, anon, authenticated;

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
  elsif not _fits(v_room.prompt_id, v_word) then
    v_valid := false; v_reason := 'OFF_TOPIC';
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

create or replace function get_room_state(p_code text, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me players; v_show_all boolean; v_me_json jsonb := null; v_titles jsonb := null;
  v_cfg jsonb; v_live boolean; v_dark boolean; v_chaos text; v_secs int; v_hide boolean;
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
  -- Everyone's class is secret (you only learn "the Ninja attacked Ava") until the game ends — in 1v1 too.
  v_hide := v_room.phase <> 'finished' and not coalesce(v_me.eliminated, false);

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
        'id', p.id, 'name', p.name, 'avatar_url', p.avatar_url,
        'class', case when v_hide and p.id is distinct from v_me.id then null else p.class end,
        'orig_class', case when v_hide and p.id is distinct from v_me.id then null else p.orig_class end,
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
                                                            when v_hide and pa.source_id is distinct from v_me.id then null
                                                            else pa.source_id end,
                                          'source_class', case when pa.source_id is not null then coalesce(src.orig_class, src.class) end,
                                          'kind', pa.kind, 'amount', pa.amount, 'status', pa.status,
                                          'absorbed_by', pa.absorbed_by) order by pa.id)
      from pending_additions pa left join players src on src.id = pa.source_id
      where pa.room_id = v_room.id and pa.round = v_room.round), '[]'::jsonb)
      else '[]'::jsonb end,
    'feed', coalesce((select jsonb_agg(
                        case when v_hide and f.payload->>'from' is distinct from v_me.id::text
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


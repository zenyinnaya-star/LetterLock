-- Answer timing, streak + speed bonus, per-game stats, Blitz-friendly settings floor.

alter table rooms   add column if not exists answer_started_at timestamptz;
alter table answers add column if not exists elapsed_ms int;
alter table answers add column if not exists bonus int not null default 0;

-- stamp when the answer clock starts (every path into the answer phase: new round, duel round, rematch)
create or replace function _stamp_answer_start() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.phase = 'answer' and (old.phase is distinct from 'answer' or old.round is distinct from new.round) then
    new.answer_started_at := now();
  end if;
  return new;
end $$;
drop trigger if exists rooms_stamp_answer on rooms;
create trigger rooms_stamp_answer before update on rooms for each row execute function _stamp_answer_start();

-- Blitz needs answer clocks under 20s
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

-- submit_answer: same rules as ever, plus streak bonus (+1 per answer in a row, max +4) and speed bonus (+3/+2/+1)
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

-- Per-game stats for the finish screen (finished rooms only; no tokens leave here)
create or replace function get_game_stats(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_room rooms;
begin
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.phase <> 'finished' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'player_id', p.id, 'name', p.name, 'points', p.points,
      'correct', coalesce(a.correct, 0), 'wrong', coalesce(a.wrong, 0),
      'best_streak', coalesce(s.best, 0), 'fastest_ms', a.fastest, 'bonus', coalesce(a.bonus, 0),
      'hits', coalesce(g.hits, 0), 'shots', coalesce(g.shots, 0)
    ) order by p.points desc, p.joined_at)
    from players p
    left join (
      select player_id, count(*) filter (where valid) correct, count(*) filter (where not valid and word <> '') wrong,
             min(elapsed_ms) filter (where valid) fastest, coalesce(sum(bonus) filter (where valid), 0) bonus
      from answers where room_id = v_room.id group by player_id) a on a.player_id = p.id
    left join (
      select player_id, max(c) best from (
        select player_id, count(*) c from (
          select player_id, round - row_number() over (partition by player_id order by round) grp
          from answers where room_id = v_room.id and valid) x group by player_id, grp) y group by player_id) s on s.player_id = p.id
    left join (
      select guesser_id, count(*) filter (where correct) hits, count(*) shots from guesses where room_id = v_room.id group by guesser_id) g on g.guesser_id = p.id
    where p.room_id = v_room.id
  ), '[]'::jsonb);
end $$;
grant execute on function get_game_stats(text) to anon, authenticated;

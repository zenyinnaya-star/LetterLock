-- Stages: themed environments, each with one small rule. Room setting 'stage' = none | neon | library | station | arcade | jungle | keep | random
--   neon    Neon City        answers in the first 30% of the clock score +2
--   library Haunted Library  the prompt fades after a few seconds (client-side)
--   station Space Station    a chaos rule fires more often (40% of rounds from round 2)
--   arcade  Arcade           answering with a streak of 2+ scores +2
--   jungle  Jungle Ruins     first valid answer of the round scores +3
--   keep    Frozen Keep      words of 6+ letters score +2

create or replace function _defaults() returns jsonb
language sql immutable set search_path = public as $$
  select '{"mode":"classic","max_players":8,"answer_seconds":60,"shrink":true,"guess_seconds":20,"react_seconds":8,
           "duel_seconds":20,"cards":true,"perks":true,"strikes":2,"lang":"en","team_size":2,"rounds":5,"ultimates":false,
           "mindgames":false,"weekly":false,"stage":"none"}'::jsonb;
$$;

create or replace function _room_stage(p_room_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_room rooms; v_s text; v_list text[] := array['neon','library','station','arcade','jungle','keep'];
begin
  select * into v_room from rooms where id = p_room_id;
  v_s := coalesce(v_room.settings->>'stage', 'none');
  if v_s = 'random' then return v_list[1 + (abs(hashtext(v_room.id::text)) + greatest(v_room.round, 0)) % 6]; end if;
  if v_s = any(v_list) then return v_s; end if;
  return 'none';
end $$;
revoke execute on function _room_stage(uuid) from public, anon, authenticated;

-- settings
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_settings_029') then
    alter function update_settings(uuid, jsonb) rename to _settings_029;
  end if;
end $$;
revoke execute on function _settings_029(uuid, jsonb) from public, anon, authenticated;

create or replace function update_settings(p_token uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me players; v_prev jsonb; v_in jsonb := coalesce(p_settings, '{}'::jsonb); v_new jsonb; v_stage text;
begin
  v_me := _me(p_token);
  select settings into v_prev from rooms where id = v_me.room_id;
  v_new := _settings_029(p_token, p_settings);
  v_stage := case when v_in->>'stage' in ('none','neon','library','station','arcade','jungle','keep','random') then v_in->>'stage'
                  else coalesce(v_prev->>'stage', 'none') end;
  v_new := v_new || jsonb_build_object('stage', v_stage);
  update rooms set settings = v_new where id = v_me.room_id;
  return v_new;
end $$;
revoke execute on function update_settings(uuid, jsonb) from public;
grant execute on function update_settings(uuid, jsonb) to anon, authenticated;

-- round start: Space Station fires chaos more often
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_round_029') then
    alter function _start_round(uuid) rename to _round_029;
  end if;
end $$;
revoke execute on function _round_029(uuid) from public, anon, authenticated;

create or replace function _start_round(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_room rooms;
begin
  perform _round_029(p_room_id);
  select * into v_room from rooms where id = p_room_id;
  if _room_stage(p_room_id) = 'station' and v_room.round >= 2 and v_room.chaos_round is distinct from v_room.round and random() < 0.4 then
    perform _chaos(p_room_id);
  end if;
end $$;
revoke execute on function _start_round(uuid) from public, anon, authenticated;

-- answers: stage bonuses
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_answer_029') then
    alter function submit_answer(uuid, text) rename to _answer_029;
  end if;
end $$;
revoke execute on function _answer_029(uuid, text) from public, anon, authenticated;

create or replace function submit_answer(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_res jsonb; v_me players; v_room rooms; v_stage text; v_extra int := 0; v_total int; v_frac double precision; v_len int;
begin
  v_res := _answer_029(p_token, p_word);
  if not coalesce((v_res->>'valid')::boolean, false) then return v_res; end if;
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id;
  v_stage := _room_stage(v_room.id);
  if v_stage = 'none' then return v_res; end if;
  v_len := char_length(v_res->>'word');
  v_total := greatest(1000, (extract(epoch from (v_room.phase_ends_at - v_room.answer_started_at)) * 1000)::int);
  v_frac := case when v_res->>'elapsed_ms' is null then 1 else (v_res->>'elapsed_ms')::double precision / v_total end;
  if v_stage = 'neon' and v_frac < 0.3 then v_extra := 2;
  elsif v_stage = 'arcade' and coalesce((v_res->>'streak')::int, 0) >= 2 then v_extra := 2;
  elsif v_stage = 'keep' and v_len >= 6 then v_extra := 2;
  elsif v_stage = 'jungle' and not exists (
      select 1 from answers where room_id = v_room.id and round = v_room.round and valid and player_id <> v_me.id) then v_extra := 3;
  end if;
  if v_extra > 0 then
    update answers set points = points + v_extra where player_id = v_me.id and round = v_room.round;
    v_res := v_res || jsonb_build_object('points', (v_res->>'points')::int + v_extra, 'stage_bonus', v_extra);
  end if;
  return v_res;
end $$;
revoke execute on function submit_answer(uuid, text) from public;
grant execute on function submit_answer(uuid, text) to anon, authenticated;

-- state: expose the resolved stage
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_state_029') then
    alter function get_room_state(text, uuid) rename to _state_029;
  end if;
end $$;
revoke execute on function _state_029(text, uuid) from public, anon, authenticated;

create or replace function get_room_state(p_code text, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_id uuid;
begin
  v := _state_029(p_code, p_token);
  select id into v_id from rooms where code = upper(trim(p_code));
  return jsonb_set(v, '{room,stage}', to_jsonb(_room_stage(v_id)));
end $$;
revoke execute on function get_room_state(text, uuid) from public;
grant execute on function get_room_state(text, uuid) to anon, authenticated;

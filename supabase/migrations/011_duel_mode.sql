-- 1v1 mode: a two-player room that opens straight on the VS screen and plays duel rules from round 1.

create or replace function _defaults() returns jsonb
language sql immutable set search_path = public as $$
  select '{"mode":"classic","max_players":8,"answer_seconds":60,"shrink":true,"guess_seconds":20,"react_seconds":8,
           "duel_seconds":20,"cards":true,"perks":true,"strikes":2}'::jsonb;
$$;

create or replace function update_settings(p_token uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_cur jsonb; v_in jsonb := coalesce(p_settings, '{}'::jsonb); v_new jsonb; v_count int;
  v_mode text;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  v_cur := _defaults() || v_room.settings;
  select count(*) into v_count from players where room_id = v_room.id;
  v_mode := case when v_in->>'mode' in ('classic', 'duel') then v_in->>'mode' else v_cur->>'mode' end;
  if v_mode = 'duel' and v_count > 2 then raise exception 'TOO_MANY_FOR_DUEL'; end if;
  v_new := jsonb_build_object(
    'mode', v_mode,
    'max_players',    case when v_mode = 'duel' then 2
                           else _clamp(coalesce(v_in->'max_players', case when v_cur->>'mode' = 'duel' then '8'::jsonb else v_cur->'max_players' end),
                                       greatest(2, v_count), 12, 8) end,
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

create or replace function start_game(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_p record; v_count int;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.host_id <> v_me.id then raise exception 'NOT_HOST'; end if;
  if v_room.phase <> 'lobby' then raise exception 'WRONG_PHASE'; end if;
  select count(*) into v_count from players where room_id = v_room.id;
  if v_count < 2 then raise exception 'NEED_TWO_PLAYERS'; end if;
  if _cfg(v_room.id)->>'mode' = 'duel' and v_count <> 2 then raise exception 'TOO_MANY_FOR_DUEL'; end if;
  for v_p in select id from players where room_id = v_room.id loop
    perform _add_letter(v_p.id, 0, 'start');
  end loop;
  if _cfg(v_room.id)->>'mode' = 'duel' then
    -- straight to the VS screen; the duel intro then deals the usual duel lock (Hero stays at 1)
    update rooms set duel = true where id = v_room.id;
    perform _set_phase(v_room.id, 'duel_intro', 7);
    perform _bump(v_room.id, 'game_started', jsonb_build_object('mode', 'duel'));
    return;
  end if;
  perform _start_round(v_room.id);
  perform _bump(v_room.id, 'game_started');
end $$;

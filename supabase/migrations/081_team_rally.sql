-- Team mode: the King's Rally. Once per game, during the answer phase, the team leader (the king) blows the horn:
-- every valid word the team lands that round scores double. Implemented as a wrapper around advance_phase so the
-- round loop itself is untouched: when the answer phase closes, a rallying team's members get their answer points
-- again (and the answer rows show the doubled value).

alter table teams add column if not exists rally_round int;
alter table teams add column if not exists rally_used boolean not null default false;

create or replace function team_rally(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_team teams;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if not _is_team(v_room.id) then raise exception 'NOT_ALLOWED'; end if;
  if v_room.phase <> 'answer' then raise exception 'WRONG_PHASE'; end if;
  select * into v_team from teams where id = v_me.team_id for update;
  if v_team.leader_id is distinct from v_me.id then raise exception 'NOT_KING'; end if;
  if v_team.rally_used then raise exception 'RALLY_USED'; end if;
  update teams set rally_used = true, rally_round = v_room.round where id = v_team.id;
  perform _feed(v_room.id, jsonb_build_object('type', 'rally', 'from', v_me.id));
  perform _bump(v_room.id, 'rally', jsonb_build_object('team_id', v_team.id));
  return jsonb_build_object('ok', true, 'round', v_room.round);
end $$;

do $$ begin
  if not exists (select 1 from pg_proc where proname = '_advance_phase_core') then
    alter function advance_phase(text) rename to _advance_phase_core;
  end if;
end $$;
revoke execute on function _advance_phase_core(text) from public, anon, authenticated;

create or replace function advance_phase(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before rooms; v_after rooms; v_res jsonb; v_t record;
begin
  select * into v_before from rooms where code = upper(trim(p_code));
  v_res := _advance_phase_core(p_code);
  if v_before.id is null or v_before.phase <> 'answer' or not _is_team(v_before.id) then return v_res; end if;
  select * into v_after from rooms where id = v_before.id;
  if v_after.phase = 'answer' and v_after.round = v_before.round then return v_res; end if;
  for v_t in select id from teams where room_id = v_before.id and rally_round = v_before.round loop
    update players p set points = p.points + a.points
      from answers a where a.player_id = p.id and a.round = v_before.round and a.valid and a.points > 0 and p.team_id = v_t.id;
    update answers a set points = a.points * 2
      from players p where a.player_id = p.id and a.round = v_before.round and a.valid and p.team_id = v_t.id;
    update teams set rally_round = -1 where id = v_t.id; -- paid out once
  end loop;
  return v_res;
end $$;
grant execute on function advance_phase(text) to anon, authenticated;

-- expose the rally state to the team (extends team_extra from 079)
create or replace function team_extra(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_team teams;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id;
  if not _is_team(v_room.id) or v_me.team_id is null then return null; end if;
  select * into v_team from teams where id = v_me.team_id;
  if v_room.phase = 'guess' and not v_me.eliminated then
    perform _team_deal_intel(v_room.id, v_room.round, v_me.team_id);
  end if;
  return jsonb_build_object(
    'team_id', v_team.id,
    'voice_key', v_team.voice_key,
    'round', v_room.round,
    'king', v_team.leader_id = v_me.id,
    'rally_used', v_team.rally_used,
    'rally_now', v_team.rally_round = v_room.round,
    'calls', (select coalesce(jsonb_agg(jsonb_build_object('caller_id', c.caller_id, 'letter', c.letter, 'target_id', c.target_id,
                'resolved', c.resolved, 'correct', c.correct) order by c.id), '[]'::jsonb)
              from team_calls c where c.room_id = v_room.id and c.round = v_room.round and c.team_id = v_team.id),
    'intel', (select jsonb_build_object('kind', i.kind, 'letters', to_jsonb(i.letters)) from team_intel i
              where i.room_id = v_room.id and i.round = v_room.round and i.player_id = v_me.id),
    -- which rallies are live this round (both teams can see the enemy's horn, it's loud)
    'rallies', (select coalesce(jsonb_agg(t.id), '[]'::jsonb) from teams t where t.room_id = v_room.id and t.rally_round = v_room.round)
  );
end $$;
grant execute on function team_rally(uuid) to anon, authenticated;
grant execute on function team_extra(uuid) to anon, authenticated;

-- a fresh game resets the horn
create or replace function _team_reset_rally() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phase = 'lobby' and old.phase is distinct from 'lobby' then
    update teams set rally_used = false, rally_round = null where room_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists rooms_team_reset_rally on rooms;
create trigger rooms_team_reset_rally after update of phase on rooms for each row execute function _team_reset_rally();

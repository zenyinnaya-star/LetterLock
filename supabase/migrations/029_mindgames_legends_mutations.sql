-- Mind Games (secret per-round objectives), Legendary answers, Weekly mutations.
-- Everything wraps the existing engine functions so the big ones are not rewritten.

create table if not exists objectives (
  id bigserial primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round int not null,
  key text not null,
  done boolean not null default false,
  unique (player_id, round)
);
alter table objectives enable row level security;

create table if not exists marks (
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  round int not null,
  kind text not null,
  primary key (player_id, round, kind)
);
alter table marks enable row level security;

create or replace function _defaults() returns jsonb
language sql immutable set search_path = public as $$
  select '{"mode":"classic","max_players":8,"answer_seconds":60,"shrink":true,"guess_seconds":20,"react_seconds":8,
           "duel_seconds":20,"cards":true,"perks":true,"strikes":2,"lang":"en","team_size":2,"rounds":5,"ultimates":false,
           "mindgames":false,"weekly":false}'::jsonb;
$$;

-- the mutation rotates every Monday-ish week (epoch weeks); tests can pin one with settings.mutation_override
create or replace function _mutation() returns text
language sql stable set search_path = public as $$
  select (array['bigwords','speedrun','charged','chaos'])[1 + (floor(extract(epoch from now()) / 604800)::int % 4)];
$$;
create or replace function _room_mutation(p_room_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when coalesce((settings->>'weekly')::boolean, false)
              then coalesce(settings->>'mutation_override', _mutation()) end
  from rooms where id = p_room_id;
$$;
revoke execute on function _room_mutation(uuid) from public, anon, authenticated;

-- ---------- settings: accept mindgames + weekly ----------
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_settings_base') then
    alter function update_settings(uuid, jsonb) rename to _settings_base;
  end if;
end $$;
revoke execute on function _settings_base(uuid, jsonb) from public, anon, authenticated;

create or replace function update_settings(p_token uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me players; v_prev jsonb; v_in jsonb := coalesce(p_settings, '{}'::jsonb); v_new jsonb; v_extra jsonb;
begin
  v_me := _me(p_token);
  select settings into v_prev from rooms where id = v_me.room_id;
  v_new := _settings_base(p_token, p_settings);
  v_extra := jsonb_build_object(
    'mindgames', case when jsonb_typeof(v_in->'mindgames') = 'boolean' then v_in->'mindgames' else coalesce(v_prev->'mindgames', 'false'::jsonb) end,
    'weekly',    case when jsonb_typeof(v_in->'weekly') = 'boolean' then v_in->'weekly' else coalesce(v_prev->'weekly', 'false'::jsonb) end);
  if v_prev ? 'mutation_override' then v_extra := v_extra || jsonb_build_object('mutation_override', v_prev->'mutation_override'); end if;
  v_new := v_new || v_extra;
  update rooms set settings = v_new where id = v_me.room_id;
  return v_new;
end $$;
revoke execute on function update_settings(uuid, jsonb) from public;
grant execute on function update_settings(uuid, jsonb) to anon, authenticated;

-- ---------- round start: objectives + chaos week ----------
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_start_round_base') then
    alter function _start_round(uuid) rename to _start_round_base;
  end if;
end $$;
revoke execute on function _start_round_base(uuid) from public, anon, authenticated;

create or replace function _start_round(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_p record; v_keys text[] := array['long7','fast','rare','vowel','crack'];
begin
  perform _start_round_base(p_room_id);
  select * into v_room from rooms where id = p_room_id;
  if _room_mutation(p_room_id) = 'chaos' and v_room.round >= 2 and v_room.chaos_round is distinct from v_room.round then
    perform _chaos(p_room_id);
  end if;
  if coalesce((v_room.settings->>'mindgames')::boolean, false) and not _is_team(p_room_id) then
    for v_p in select id from players where room_id = p_room_id and not eliminated loop
      insert into objectives (room_id, player_id, round, key)
        values (p_room_id, v_p.id, v_room.round, v_keys[1 + floor(random() * array_length(v_keys, 1))::int])
        on conflict (player_id, round) do nothing;
    end loop;
  end if;
end $$;
revoke execute on function _start_round(uuid) from public, anon, authenticated;

-- complete an objective: +4 points, +4 charge, once
create or replace function _obj_done(p_player_id uuid, p_round int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update objectives set done = true where player_id = p_player_id and round = p_round and not done;
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;
  update players set points = points + 4, charge = least(30, charge + 4) where id = p_player_id;
  return true;
end $$;
revoke execute on function _obj_done(uuid, int) from public, anon, authenticated;

-- ---------- answers: legendary + mutation bonuses + objectives ----------
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_answer_base') then
    alter function submit_answer(uuid, text) rename to _answer_base;
  end if;
end $$;
revoke execute on function _answer_base(uuid, text) from public, anon, authenticated;

create or replace function submit_answer(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_res jsonb; v_me players; v_room rooms; v_a answers; v_word text; v_len int; v_extra int := 0; v_mut text;
  v_total int; v_frac double precision; v_n int; v_key text; v_legend boolean := false; v_obj_done boolean := false;
begin
  v_res := _answer_base(p_token, p_word);
  if not coalesce((v_res->>'valid')::boolean, false) then return v_res; end if;
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id;
  select * into v_a from answers where player_id = v_me.id and round = v_room.round;
  v_word := v_res->>'word'; v_len := char_length(v_word);
  v_mut := _room_mutation(v_room.id);
  v_total := greatest(1000, (extract(epoch from (v_room.phase_ends_at - v_room.answer_started_at)) * 1000)::int);
  v_frac := case when v_res->>'elapsed_ms' is null then 1 else (v_res->>'elapsed_ms')::double precision / v_total end;

  -- legendary: 9+ letters, or 7+ letters nobody has ever played before
  if v_len >= 9 or (v_len >= 7 and not exists (select 1 from answers where valid and word = v_word and id <> v_a.id)) then
    v_legend := true; v_extra := v_extra + 5;
    insert into marks (room_id, player_id, round, kind) values (v_room.id, v_me.id, v_room.round, 'legend') on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update players set charge = least(30, charge + 3) where id = v_me.id;
      perform _feed(v_room.id, jsonb_build_object('type', 'legend', 'name', v_me.name));
    end if;
  end if;

  -- weekly mutation
  if v_mut = 'bigwords' and v_len >= 7 then v_extra := v_extra + 3;
  elsif v_mut = 'speedrun' and v_frac < 0.3 then v_extra := v_extra + 3;
  elsif v_mut = 'charged' then
    insert into marks (room_id, player_id, round, kind) values (v_room.id, v_me.id, v_room.round, 'charged') on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then update players set charge = least(30, charge + 3) where id = v_me.id; end if;
  end if;

  -- mind game objective
  select key into v_key from objectives where player_id = v_me.id and round = v_room.round and not done;
  if v_key is not null and (
       (v_key = 'long7' and v_len >= 7) or (v_key = 'fast' and v_frac < 0.25)
    or (v_key = 'rare' and v_word ~ '[jkqvwxyz]') or (v_key = 'vowel' and v_word ~ '^[aeiou]')) then
    v_obj_done := _obj_done(v_me.id, v_room.round);
  end if;

  if v_extra > 0 then
    update answers set points = points + v_extra where id = v_a.id;
  end if;
  return v_res || jsonb_build_object('points', (v_res->>'points')::int + v_extra, 'extra', v_extra,
                                     'legend', v_legend, 'objective_done', v_obj_done);
end $$;
revoke execute on function submit_answer(uuid, text) from public;
grant execute on function submit_answer(uuid, text) to anon, authenticated;

-- ---------- guesses: the 'crack' objective ----------
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_guess_base') then
    alter function submit_guess(uuid, uuid, text) rename to _guess_base;
  end if;
end $$;
revoke execute on function _guess_base(uuid, uuid, text) from public, anon, authenticated;

create or replace function submit_guess(p_token uuid, p_target_id uuid, p_letter text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_me players; v_room rooms;
begin
  v_res := _guess_base(p_token, p_target_id, p_letter);
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id;
  if exists (select 1 from guesses where guesser_id = v_me.id and round = v_room.round and correct)
     and exists (select 1 from objectives where player_id = v_me.id and round = v_room.round and key = 'crack') then
    perform _obj_done(v_me.id, v_room.round);
  end if;
  return v_res;
end $$;
revoke execute on function submit_guess(uuid, uuid, text) from public;
grant execute on function submit_guess(uuid, uuid, text) to anon, authenticated;

-- ---------- state: objective, mutation, legend flags ----------
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_state_base') then
    alter function get_room_state(text, uuid) rename to _state_base;
  end if;
end $$;
revoke execute on function _state_base(text, uuid) from public, anon, authenticated;

create or replace function get_room_state(p_code text, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_room rooms; v_me uuid; v_obj jsonb; v_mut text;
begin
  v := _state_base(p_code, p_token);
  select * into v_room from rooms where code = upper(trim(p_code));
  v_mut := _room_mutation(v_room.id);
  v := jsonb_set(v, '{room,mutation}', coalesce(to_jsonb(v_mut), 'null'::jsonb));
  if v->'me' is not null and v->'me' <> 'null'::jsonb and v_room.phase not in ('lobby') then
    v_me := (v->'me'->>'id')::uuid;
    select jsonb_build_object('key', key, 'done', done) into v_obj from objectives where player_id = v_me and round = v_room.round;
    v := jsonb_set(v, '{me,objective}', coalesce(v_obj, 'null'::jsonb));
  end if;
  v := jsonb_set(v, '{reveal}', coalesce((
    select jsonb_agg(e || jsonb_build_object('legend', exists (
      select 1 from marks m where m.player_id = (e->>'player_id')::uuid and m.round = v_room.round and m.kind = 'legend')))
    from jsonb_array_elements(v->'reveal') e), '[]'::jsonb));
  return v;
end $$;
revoke execute on function get_room_state(text, uuid) from public;
grant execute on function get_room_state(text, uuid) to anon, authenticated;

-- ---------- play again clears the new tables ----------
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_again_base') then
    alter function play_again(uuid) rename to _again_base;
  end if;
end $$;
revoke execute on function _again_base(uuid) from public, anon, authenticated;

create or replace function play_again(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players;
begin
  v_me := _me(p_token);
  perform _again_base(p_token);
  delete from objectives where room_id = v_me.room_id;
  delete from marks where room_id = v_me.room_id;
end $$;
revoke execute on function play_again(uuid) from public;
grant execute on function play_again(uuid) to anon, authenticated;

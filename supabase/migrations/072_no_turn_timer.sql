-- Strictly turn-based: no countdown forces an auto-attack. A turn waits for every present human to act
-- (battle_step already ignores players who left or went idle, so nobody can stall the fight).
-- rooms.settings.turn_secs (10-45) still works as an OPT-IN timer; missing/0 means no timer.
-- Multiplayer only: a long idle safety net (90s) so one idle player cannot stall the match; the idle player just guards
-- (and after 3 idle turns stops blocking). Solo battles never time out.
create or replace function public._roll_turn(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles; v_prompt bigint; letters text := ''; pool text := 'rstlnmdhcpbg'; n int; j int := 0; c text;
        boss battle_units; ph int := 1; it text := 'attack'; nx text := 'attack';
        v_secs int; v_play numeric; v_end timestamptz; v_humans int;
begin
  select * into b from battles where room_id = p_room;
  select coalesce(sum(lockn), 0) into n from battle_units where room_id = p_room and side = 'enemy' and hp > 0;
  select * into boss from battle_units where room_id = p_room and name = 'Government' and hp > 0;
  if found then
    ph := case when boss.hp > boss.max_hp * 0.66 then 1 when boss.hp > boss.max_hp * 0.33 then 2 else 3 end;
    it := _boss_intent(b.turn, ph);
    nx := _boss_intent(b.turn + 1, ph);
    if it = 'red_tape' then n := 4; end if;
  end if;
  n := least(4, n);
  while char_length(letters) < n and j < 60 loop
    j := j + 1;
    c := substr(pool, 1 + least(char_length(pool) - 1, floor(_brand(b.seed, b.turn, 'lk' || j) * char_length(pool))::int), 1);
    if position(c in letters) = 0 then letters := letters || c; end if;
  end loop;
  v_prompt := _pick_prompt(p_room);
  select coalesce(nullif(settings->>'turn_secs','')::int, 0) into v_secs from rooms where id = p_room;
  v_secs := coalesce(v_secs, 0);
  if v_secs >= 10 then
    v_play := least(16, coalesce(jsonb_array_length(b.log), 0)) * 1.2;
    v_end := now() + make_interval(secs => least(45, v_secs) + v_play);
  else
    select count(*) into v_humans from players where room_id = p_room and bot = 0 and not quit;
    if v_humans > 1 then
      v_play := least(16, coalesce(jsonb_array_length(b.log), 0)) * 1.2;
      v_end := now() + make_interval(secs => 90 + v_play);   -- long idle safety net, multiplayer only
    else
      v_end := now() + interval '12 hours';                  -- solo: no timer
    end if;
  end if;
  update rooms set prompt_id = v_prompt, used_prompts = used_prompts || v_prompt, phase_ends_at = v_end where id = p_room;
  update battles set prompt_id = v_prompt, locked = letters, intent = it, next_intent = nx,
    drain = exists (select 1 from battle_units where room_id = p_room and name = 'The Collector' and hp > 0),
    ends_at = v_end, enemy_name = coalesce((select string_agg(name, ' & ' order by ord) from battle_units where room_id = p_room and side = 'enemy' and hp > 0), enemy_name)
  where room_id = p_room;
end
$$;

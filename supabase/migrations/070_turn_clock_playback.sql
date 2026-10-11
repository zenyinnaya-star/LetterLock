-- Turn clock starts AFTER the resolved turn has had time to play back on screen.
-- Base input window = rooms.settings.turn_secs (clamped 10..45, default 15) + 1.2s per log entry (max 16 entries).
create or replace function _roll_turn(p_room uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare b battles; v_prompt bigint; letters text := ''; pool text := 'rstlnmdhcpbg'; n int; j int := 0; c text;
        boss battle_units; ph int := 1; it text := 'attack'; nx text := 'attack';
        v_secs int; v_play numeric; v_end timestamptz;
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
  select greatest(10, least(45, coalesce(nullif(settings->>'turn_secs','')::int, 15))) into v_secs from rooms where id = p_room;
  v_secs := coalesce(v_secs, 15);
  v_play := least(16, coalesce(jsonb_array_length(b.log), 0)) * 1.2;
  v_end := now() + make_interval(secs => v_secs + v_play);
  update rooms set prompt_id = v_prompt, used_prompts = used_prompts || v_prompt, phase_ends_at = v_end where id = p_room;
  update battles set prompt_id = v_prompt, locked = letters, intent = it, next_intent = nx,
    drain = exists (select 1 from battle_units where room_id = p_room and name = 'The Collector' and hp > 0),
    ends_at = v_end, enemy_name = coalesce((select string_agg(name, ' & ' order by ord) from battle_units where room_id = p_room and side = 'enemy' and hp > 0), enemy_name)
  where room_id = p_room;
end
$fn$;

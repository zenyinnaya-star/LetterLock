-- fix: an empty lock string made every word 'locked'
create or replace function battle_submit(p_token uuid, p_word text, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; b battles; u battle_units; w text; v_pow numeric; v_lang text; v_rare int; ch text;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id for update;
  if not found or b.step <> 'input' then raise exception 'BAD_PHASE'; end if;
  select * into u from battle_units where player_id = me.id for update;
  if u.hp <= 0 then raise exception 'DOWN'; end if;
  if u.action is not null then raise exception 'ALREADY'; end if;
  if p_action not in ('attack','guard','heal') then raise exception 'BAD_ACTION'; end if;
  w := lower(trim(coalesce(p_word, '')));
  if w !~ '^[a-z]{2,20}$' then return jsonb_build_object('ok', false, 'reason', 'INVALID'); end if;
  for ch in select regexp_split_to_table(b.locked, '') where b.locked <> '' loop
    if position(ch in w) > 0 then return jsonb_build_object('ok', false, 'reason', 'LOCKED', 'letter', ch); end if;
  end loop;
  select coalesce(settings->>'lang','en') into v_lang from rooms where id = me.room_id;
  if not exists (select 1 from words where word = w and lang = v_lang) then
    return jsonb_build_object('ok', false, 'reason', 'NOT_A_WORD'); end if;
  if not _fits(b.prompt_id, w) then
    return jsonb_build_object('ok', false, 'reason', 'OFF_TOPIC'); end if;
  v_rare := (select count(*) from regexp_matches(w, '[jqxzkv]', 'g'));
  v_pow := char_length(w) * (1 + u.lex * 0.04) + v_rare * 2 + greatest(0, extract(epoch from (b.ends_at - now())) / 5);
  v_pow := v_pow * (1 - 0.1 * u.corruption) * case when b.drain then 0.8 else 1 end;
  update battle_units set action = p_action, power = greatest(1, round(v_pow)), word = w where id = u.id;
  update battles set version = version + 1 where room_id = me.room_id;
  perform _bump(me.room_id, 'battle_lock', jsonb_build_object('player', me.id));
  return jsonb_build_object('ok', true, 'power', greatest(1, round(v_pow)));
end $$;


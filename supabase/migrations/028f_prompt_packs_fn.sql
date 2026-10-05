create or replace function _pick_prompt(p_room_id uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_lang text; v_prompt bigint; v_pack text;
begin
  select * into v_room from rooms where id = p_room_id;
  v_lang := coalesce(v_room.settings->>'lang', 'en');
  v_pack := case when v_lang = 'en' then coalesce(v_room.settings->>'pack', 'all') else 'all' end;
  select id into v_prompt from prompts
    where active and lang = v_lang and (v_pack = 'all' or pack = v_pack) and not (id = any(v_room.used_prompts)) order by random() limit 1;
  if v_prompt is null then
    select id into v_prompt from prompts where active and lang = v_lang and (v_pack = 'all' or pack = v_pack) order by random() limit 1;
  end if;
  if v_prompt is null then   -- language has no prompts loaded yet: fall back to English
    select id into v_prompt from prompts where active and lang = 'en' order by random() limit 1;
  end if;
  return v_prompt;
end $$;


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
    'twist',  case when v_in->>'twist' in ('none', 'reverse', 'chaos', 'memory') then v_in->>'twist' else coalesce(v_cur->>'twist', 'none') end,
    'pack',  case when v_in->>'pack' in ('all', 'classic', 'meme', 'fantasy', 'cyber', 'comedy') then v_in->>'pack' else coalesce(v_cur->>'pack', 'all') end,
    'ultimates', case when jsonb_typeof(v_in->'ultimates') = 'boolean' then v_in->'ultimates' else coalesce(v_cur->'ultimates', 'false'::jsonb) end,
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


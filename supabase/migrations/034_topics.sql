-- Topic picker: hosts choose which kinds of prompts show up (multi-select). Empty = everything.
alter table prompts add column if not exists topic text;

update prompts set topic = case
  when pack = 'meme' then 'internet'
  when pack = 'fantasy' then 'fantasy'
  when pack = 'cyber' then 'tech'
  when pack = 'comedy' then 'funny'
  when text ~* 'animal|bird|fish|mammal|reptile|insect|lives in water' then 'animals'
  when text ~* 'food|fruit|vegetable|dessert|herb|drink|kitchen' then 'food'
  when text ~* 'tree|flower|plant|rock|weather|space' then 'nature'
  when text ~* 'word meaning|emotion|color|shape|read' then 'words'
  when text ~* 'sport|game|dance|instrument|job' then 'fun'
  else 'things' end
where lang = 'en' and topic is null;

create or replace function _pick_prompt(p_room_id uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_lang text; v_prompt bigint; v_pack text; v_topics text[];
begin
  select * into v_room from rooms where id = p_room_id;
  v_lang := coalesce(v_room.settings->>'lang', 'en');
  v_pack := case when v_lang = 'en' then coalesce(v_room.settings->>'pack', 'all') else 'all' end;
  v_topics := case when v_lang = 'en' and jsonb_typeof(v_room.settings->'topics') = 'array'
                   then array(select jsonb_array_elements_text(v_room.settings->'topics')) else '{}' end;
  select id into v_prompt from prompts
    where active and lang = v_lang and (cardinality(v_topics) = 0 or topic = any(v_topics))
      and (v_pack = 'all' or pack = v_pack) and not (id = any(v_room.used_prompts)) order by random() limit 1;
  if v_prompt is null then
    select id into v_prompt from prompts
      where active and lang = v_lang and (cardinality(v_topics) = 0 or topic = any(v_topics)) and (v_pack = 'all' or pack = v_pack)
      order by random() limit 1;
  end if;
  if v_prompt is null then
    select id into v_prompt from prompts where active and lang = 'en' order by random() limit 1;
  end if;
  return v_prompt;
end $$;
revoke execute on function _pick_prompt(uuid) from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_proc where proname = '_settings_034') then
    alter function update_settings(uuid, jsonb) rename to _settings_034;
  end if;
end $$;
revoke execute on function _settings_034(uuid, jsonb) from public, anon, authenticated;

create or replace function update_settings(p_token uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me players; v_prev jsonb; v_in jsonb := coalesce(p_settings, '{}'::jsonb); v_new jsonb; v_t jsonb;
begin
  v_me := _me(p_token);
  select settings into v_prev from rooms where id = v_me.room_id;
  v_new := _settings_034(p_token, p_settings);
  v_t := coalesce(v_prev->'topics', '[]'::jsonb);
  if jsonb_typeof(v_in->'topics') = 'array' then
    v_t := coalesce((select jsonb_agg(distinct e) from jsonb_array_elements_text(v_in->'topics') e
                     where e in ('animals','food','nature','things','words','fun','internet','fantasy','tech','funny')), '[]'::jsonb);
  end if;
  v_new := v_new || jsonb_build_object('topics', v_t);
  update rooms set settings = v_new where id = v_me.room_id;
  return v_new;
end $$;
revoke execute on function update_settings(uuid, jsonb) from public;
grant execute on function update_settings(uuid, jsonb) to anon, authenticated;

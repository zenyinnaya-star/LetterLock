-- Default (no topics picked) = general classic questions only. Meme/fantasy/cyber/comedy only appear when the host picks those topics.
create or replace function _pick_prompt(p_room_id uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_lang text; v_prompt bigint; v_pack text; v_topics text[];
begin
  select * into v_room from rooms where id = p_room_id;
  v_lang := coalesce(v_room.settings->>'lang', 'en');
  v_pack := case when v_lang = 'en' then coalesce(v_room.settings->>'pack', 'classic') else 'all' end;
  v_topics := case when v_lang = 'en' and jsonb_typeof(v_room.settings->'topics') = 'array'
                   then array(select jsonb_array_elements_text(v_room.settings->'topics')) else '{}' end;
  -- nothing chosen: stick to the general set
  if cardinality(v_topics) = 0 and v_pack = 'all' then v_pack := 'classic'; end if;
  select id into v_prompt from prompts
    where active and lang = v_lang and (cardinality(v_topics) = 0 or topic = any(v_topics))
      and (v_pack = 'all' or pack = v_pack or cardinality(v_topics) > 0) and not (id = any(v_room.used_prompts)) order by random() limit 1;
  if v_prompt is null then
    select id into v_prompt from prompts
      where active and lang = v_lang and (cardinality(v_topics) = 0 or topic = any(v_topics)) and (v_pack = 'all' or pack = v_pack or cardinality(v_topics) > 0)
      order by random() limit 1;
  end if;
  if v_prompt is null then
    select id into v_prompt from prompts where active and lang = 'en' and pack = 'classic' order by random() limit 1;
  end if;
  return v_prompt;
end $$;
revoke execute on function _pick_prompt(uuid) from public, anon, authenticated;

-- Ultimate rework (additive and backward compatible: bots / old clients that send no choice fall back to the old behaviour).
--   villain  : p_target_id + p_kind = up to 4 chosen letters ("QZXJ") -> those exact locks are stacked on the target
--   hacker   : p_kind = comma-separated player ids (or 'all'/null) -> hack each and privately see ALL their locks
--   wildcard : p_kind = swap|no_e|shuffle|double|amnesty|speed -> that rule applies this round (null = random)
--   parasite : outbreak - every other player takes a lock; the Parasite sheds up to 2 of its own
--   oracle   : also foretells the next 3 locks that will land on her (players.fate), shown on her rack
--   jester   : unchanged (locked letters are allowed while the ultimate is active)
alter table pending_additions add column if not exists letters text;
alter table players add column if not exists fate text;

create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in %: %', p_name, left(p_from, 60); end if;
  execute replace(d, p_from, p_to);
end $$;

-- 1) _advance_phase_core: apply chosen letters (villain) instead of random ones
select _patch_fn('_advance_phase_core', 'for n in 1..v_a.amount loop',
  'for n in 1..(case when v_a.letters is not null then 0 else v_a.amount end) loop');
select _patch_fn('_advance_phase_core', 'update pending_additions set status = ''applied'' where id = v_a.id;',
  'if v_a.letters is not null then
        for n in 1..length(v_a.letters) loop
          insert into banned_letters (player_id, letter, added_round, source)
            select v_a.target_id, substr(v_a.letters, n, 1), v_room.round, v_a.kind
            where not exists (select 1 from banned_letters where player_id = v_a.target_id and letter = substr(v_a.letters, n, 1));
          if found then v_i := v_i + 1; end if;
        end loop;
      end if;
      update pending_additions set status = ''applied'' where id = v_a.id;');

-- 2) _add_letter: foretold (Oracle) letters land first
select _patch_fn('_add_letter', E'declare\n  v_letter text;', E'declare\n  v_fate text;\n  v_letter text;');
select _patch_fn('_add_letter', E'begin\n  select count(*) into v_vowels',
  E'begin\n  select fate into v_fate from players where id = p_player_id;\n  if coalesce(v_fate, '''') <> '''' then\n    v_letter := null;\n    while coalesce(v_fate, '''') <> '''' loop\n      if substr(v_fate, 1, 1) not in (select letter::text from banned_letters where player_id = p_player_id) then\n        v_letter := substr(v_fate, 1, 1); v_fate := substr(v_fate, 2); exit;\n      end if;\n      v_fate := substr(v_fate, 2);\n    end loop;\n    update players set fate = nullif(v_fate, '''') where id = p_player_id;\n    if v_letter is not null then\n      insert into banned_letters (player_id, letter, added_round, source) values (p_player_id, v_letter, p_round, p_source);\n      return v_letter;\n    end if;\n  end if;\n  select count(*) into v_vowels');

-- 3) state + rematch + oracle price
select _patch_fn('_state_base', '''is_spectator'', v_me.is_spectator,', '''is_spectator'', v_me.is_spectator, ''fate'', v_me.fate,');
select _patch_fn('_again_base', 'latch_round = null, oracle_round = null', 'latch_round = null, oracle_round = null, fate = null');
select _patch_fn('_ult_cost', 'when ''oracle'' then 10', 'when ''oracle'' then 12');

-- 4) wildcard: choose the rule (copy of _chaos with an override)
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '_chaos' and pronargs = 1;
  d := replace(d, 'public._chaos(p_room_id uuid)', 'public._chaos_pick(p_room_id uuid, p_kind text)');
  if position('v_kind := (array[''swap'',''no_e'',''shuffle'',''double'',''amnesty'',''speed''])[1 + floor(random() * 6)::int];' in d) = 0 then raise exception 'chaos anchor'; end if;
  d := replace(d, 'v_kind := (array[''swap'',''no_e'',''shuffle'',''double'',''amnesty'',''speed''])[1 + floor(random() * 6)::int];',
    'v_kind := case when p_kind in (''swap'',''no_e'',''shuffle'',''double'',''amnesty'',''speed'') then p_kind
      else (array[''swap'',''no_e'',''shuffle'',''double'',''amnesty'',''speed''])[1 + floor(random() * 6)::int] end;');
  execute d;
  revoke execute on function _chaos_pick(uuid, text) from public, anon, authenticated;
end $$;

-- 5) use_ultimate wrapper: parasite outbreak + wildcard pick
do $$
declare d text; a int; b int;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'use_ultimate';
  a := position('elsif v_me.class = ''parasite'' then' in d);
  b := position('elsif v_me.class = ''thief'' then' in d);
  if a = 0 or b = 0 or b < a then raise exception 'use_ultimate anchors'; end if;
  d := substr(d, 1, a - 1) || $new$elsif v_me.class = 'parasite' then
    -- Outbreak: everyone else takes a lock (shields can still block it); the Parasite sheds up to 2 of its own
    for v_t in select * from players where room_id = v_room.id and id <> v_me.id and not eliminated loop
      insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
        values (v_room.id, v_room.round, v_t.id, v_me.id, 'attack', 1);
      perform _feed(v_room.id, jsonb_build_object('type','attack','from',v_me.id,'to',v_t.id,'amount',1));
      v_gain := v_gain + 1;
    end loop;
    if v_gain = 0 then raise exception 'NO_TARGETS'; end if;
    v_take := 0;
    while v_take < 2 and (select count(*) from banned_letters where player_id = v_me.id) > 1 loop
      delete from banned_letters where id = (select id from banned_letters where player_id = v_me.id order by revealed desc, random() limit 1);
      v_take := v_take + 1;
    end loop;
    v_result := jsonb_build_object('kind','parasite','hit',v_gain,'shed',v_take);

  $new$ || substr(d, b);
  if position('perform _chaos(v_room.id);' in d) = 0 then raise exception 'wildcard anchor'; end if;
  d := replace(d, 'perform _chaos(v_room.id);', 'perform _chaos_pick(v_room.id, p_kind);');
  execute d;
end $$;

-- 6) _ult_base: villain letters, hacker multi-target crack, oracle foresight
do $$
declare d text; a int; b int;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '_ult_base';
  d := replace(d, 'v_held int; v_kind card_kind;', 'v_held int; v_kind card_kind; v_chosen text; v_vow int; v_c text; v_fate text; v_fl text; v_nf int;');
  a := position('elsif v_me.class = ''villain'' then' in d);
  b := position('elsif v_me.class = ''gambler'' then' in d);
  if a = 0 or b = 0 or b < a then raise exception '_ult_base anchors'; end if;
  d := substr(d, 1, a - 1) || $new$elsif v_me.class = 'villain' then
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    v_chosen := '';
    if coalesce(p_kind, '') ~ '^[A-Za-z]{1,4}$' then
      select count(*) into v_vow from banned_letters where player_id = v_target.id and letter in ('A','E','I','O','U');
      for v_c in select distinct upper(ch) from regexp_split_to_table(p_kind, '') ch loop
        if exists (select 1 from banned_letters where player_id = v_target.id and letter = v_c) then continue; end if;
        if v_c in ('A','E','I','O','U') then
          if v_vow >= 2 then continue; end if;
          v_vow := v_vow + 1;
        end if;
        v_chosen := v_chosen || v_c;
      end loop;
      if v_chosen = '' then raise exception 'NO_LETTERS_AVAILABLE'; end if;
    end if;
    insert into pending_additions (room_id, round, target_id, source_id, kind, amount, letters)
      values (v_room.id, v_room.round, v_target.id, v_me.id, 'attack', case when v_chosen = '' then 4 else length(v_chosen) end, nullif(v_chosen, ''));
    perform _feed(v_room.id, jsonb_build_object('type','attack','from',v_me.id,'to',v_target.id,'amount',case when v_chosen = '' then 4 else length(v_chosen) end));
    v_result := jsonb_build_object('kind','villain','target_id',v_target.id,'amount',case when v_chosen = '' then 4 else length(v_chosen) end,'letters',v_chosen);

  elsif v_me.class = 'hacker' then
    for v_p in select id, name from players
        where room_id = v_room.id and id <> v_me.id and not eliminated
          and (coalesce(p_kind, '') !~ '^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36})*$' or id::text = any(string_to_array(lower(p_kind), ','))) loop
      insert into pending_additions (room_id, round, target_id, source_id, kind, amount)
        values (v_room.id, v_room.round, v_p.id, v_me.id, 'hack', 1);
      perform _feed(v_room.id, jsonb_build_object('type','hack','to',v_p.id,'from',case when v_me.exposed then v_me.id end));
      select coalesce(jsonb_agg(letter::text order by id), '[]'::jsonb) into v_letters from banned_letters where player_id = v_p.id;
      insert into intel (room_id, player_id, round, payload)
        values (v_room.id, v_me.id, v_room.round, jsonb_build_object('kind','hacker','round',v_room.round,'target_id',v_p.id,'target_name',v_p.name,'letters',v_letters));
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'NO_TARGETS'; end if;
    v_result := jsonb_build_object('kind','hacker','hit',v_n);

  $new$ || substr(d, b);
  -- oracle: after the prompt peek, roll the next 3 locks that will land on her
  if position('v_result := jsonb_build_object(''kind'',''oracle'',''round'',v_room.round + 1,''prompt'',(select text from prompts where id = v_prompt));' in d) = 0 then raise exception 'oracle anchor'; end if;
  d := replace(d, 'v_result := jsonb_build_object(''kind'',''oracle'',''round'',v_room.round + 1,''prompt'',(select text from prompts where id = v_prompt));',
    'v_result := jsonb_build_object(''kind'',''oracle'',''round'',v_room.round + 1,''prompt'',(select text from prompts where id = v_prompt));
    v_fate := ''''; v_nf := 0;
    select count(*) into v_vow from banned_letters where player_id = v_me.id and letter in (''A'',''E'',''I'',''O'',''U'');
    for v_fl in select l from (select chr(65 + i) as l from generate_series(0, 25) i) a
        where l not in (select letter::text from banned_letters where player_id = v_me.id)
        order by random() loop
      exit when v_nf >= 3;
      if v_fl in (''A'',''E'',''I'',''O'',''U'') then
        continue when v_vow >= 2;
        v_vow := v_vow + 1;
      end if;
      v_fate := v_fate || v_fl; v_nf := v_nf + 1;
    end loop;
    update players set fate = nullif(v_fate, '''') where id = v_me.id;');
  execute d;
end $$;

drop function _patch_fn(text, text, text);

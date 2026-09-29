-- Multi-language play. The room picks a word language (host setting); every language is played in plain a-z so
-- banned letters still work: accents are folded (árbol -> arbol, ß -> ss), Japanese is typed in romaji and
-- Chinese in toneless pinyin. Native-script answers (猫, 苹果) are looked up and converted server-side.

alter table words add column if not exists lang text not null default 'en';
alter table words drop constraint if exists words_pkey;
alter table words add primary key (lang, word);

alter table prompts add column if not exists lang text not null default 'en';
alter table prompts add column if not exists key text;   -- the English prompt this one translates
update prompts set key = text where lang = 'en' and key is null;
create index if not exists prompts_lang_active on prompts (lang, active);
create unique index if not exists prompts_lang_key on prompts (lang, key) where lang <> 'en';

create table if not exists native_words (
  lang text not null, native text not null, word text not null,
  primary key (lang, native)
);
alter table native_words enable row level security;

create or replace function _defaults() returns jsonb
language sql immutable set search_path = public as $$
  select '{"mode":"classic","max_players":8,"answer_seconds":60,"shrink":true,"guess_seconds":20,"react_seconds":8,
           "duel_seconds":20,"cards":true,"perks":true,"strikes":2,"lang":"en"}'::jsonb;
$$;

create or replace function _room_lang(p_room_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select settings->>'lang' from rooms where id = p_room_id), 'en');
$$;

-- fold what a player typed into the game alphabet
create or replace function _norm(p_lang text, p_word text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text := trim(coalesce(p_word, '')); v_n text;
begin
  if p_lang in ('ja', 'zh') and v ~ '[^\x01-\x7f]' then
    select word into v_n from native_words where lang = p_lang and native = v;
    if v_n is not null then return v_n; end if;
  end if;
  v := lower(v);
  v := replace(replace(replace(v, 'ß', 'ss'), 'œ', 'oe'), 'æ', 'ae');
  v := translate(v, 'áàâäãåāǎéèêëēěíìîïīǐóòôöõøōǒúùûüūǔǖǘǚǜñńçýÿ', 'aaaaaaaaeeeeeeiiiiiioooooooouuuuuuuuuunncyy');
  return v;
end $$;

-- plural/inflected forms we accept for a listed word
create or replace function _forms(p_word text) returns text[]
language sql immutable set search_path = public as $$
  select array_remove(array[
    p_word,
    case when p_word ~ 's$'   then left(p_word, -1) end,
    case when p_word ~ 'es$'  then left(p_word, -2) end,
    case when p_word ~ 'ies$' then left(p_word, -3) || 'y' end,
    case when p_word ~ 'ves$' then left(p_word, -3) || 'f' end,
    case when p_word ~ 'ves$' then left(p_word, -3) || 'fe' end,
    case when p_word ~ 'x$'   then left(p_word, -1) end,              -- fr: bijoux
    case when p_word ~ 'aux$' then left(p_word, -3) || 'al' end,      -- fr: chevaux
    case when p_word ~ 'en$'  then left(p_word, -2) end,              -- de: Blumen
    case when p_word ~ 'n$'   then left(p_word, -1) end,              -- de: Katzen -> katze
    case when p_word ~ 'e$'   then left(p_word, -1) end,              -- de: Hunde
    case when p_word ~ 'er$'  then left(p_word, -2) end               -- de: Kinder
  ], null);
$$;

create or replace function _fits(p_prompt bigint, p_word text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from prompt_words where prompt_id = p_prompt)
      or exists (select 1 from prompt_words where prompt_id = p_prompt and word = any (_forms(p_word)));
$$;

create or replace function _in_dict(p_lang text, p_word text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from words where lang = p_lang
                  and word = any (case when p_lang = 'en' then array[p_word] else _forms(p_word) end));
$$;

create or replace function _pick_prompt(p_room_id uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_lang text; v_prompt bigint;
begin
  select * into v_room from rooms where id = p_room_id;
  v_lang := coalesce(v_room.settings->>'lang', 'en');
  select id into v_prompt from prompts
    where active and lang = v_lang and not (id = any(v_room.used_prompts)) order by random() limit 1;
  if v_prompt is null then
    select id into v_prompt from prompts where active and lang = v_lang order by random() limit 1;
  end if;
  if v_prompt is null then   -- language has no prompts loaded yet: fall back to English
    select id into v_prompt from prompts where active and lang = 'en' order by random() limit 1;
  end if;
  return v_prompt;
end $$;

create or replace function _start_round(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_prompt bigint;
begin
  select * into v_room from rooms where id = p_room_id;
  v_prompt := v_room.next_prompt_id;
  if v_prompt is null then
    v_prompt := _pick_prompt(p_room_id);
    if v_prompt = any(v_room.used_prompts) then
      update rooms set used_prompts = '{}' where id = p_room_id;
    end if;
  end if;
  update rooms set
    round = round + 1,
    prompt_id = v_prompt,
    next_prompt_id = null,
    used_prompts = array_append(used_prompts, v_prompt),
    phase = 'answer',
    phase_ends_at = now() + make_interval(secs => _answer_secs(_cfg(p_room_id), round + 1, duel))
  where id = p_room_id;
  update players set react_ready = false where room_id = p_room_id;
  if v_room.round + 1 >= 2 and exists (
    select 1 from players where room_id = p_room_id and class = 'wildcard' and not eliminated
  ) then
    perform _chaos(p_room_id);
  end if;
end $$;

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
    'perks',  case when jsonb_typeof(v_in->'perks') = 'boolean' then v_in->'perks' else v_cur->'perks' end,
    'lang',   case when v_in->>'lang' in ('en', 'es', 'fr', 'de', 'ja', 'zh') then v_in->>'lang'
                   else coalesce(v_cur->>'lang', 'en') end
  );
  update rooms set settings = v_new where id = v_room.id;
  perform _bump(v_room.id, 'settings');
  return v_new;
end $$;

create or replace function submit_answer(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_lang text;
  v_word text;
  v_valid boolean := true; v_reason text; v_points int := 0; v_letter text;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase <> 'answer' then raise exception 'WRONG_PHASE'; end if;
  if now() > v_room.phase_ends_at + interval '1 second' then raise exception 'TIME_UP'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  v_lang := coalesce(v_room.settings->>'lang', 'en');
  v_word := _norm(v_lang, p_word);

  if v_word = '' then v_valid := false; v_reason := 'BLANK';
  elsif v_word !~ '^[a-z]+$' then v_valid := false; v_reason := 'NOT_LETTERS';
  elsif char_length(v_word) < 3 then v_valid := false; v_reason := 'TOO_SHORT';
  elsif exists (select 1 from answers where player_id = v_me.id and round < v_room.round and valid and word = v_word) then
    v_valid := false; v_reason := 'REPEAT';
  elsif not _fits(v_room.prompt_id, v_word) then
    -- a real word in the wrong category is OFF_TOPIC; anything else is not a word at all
    v_valid := false; v_reason := case when _in_dict(v_lang, v_word) then 'OFF_TOPIC' else 'NOT_A_WORD' end;
  elsif not _in_dict(v_lang, v_word) and v_lang = 'en' then
    v_valid := false; v_reason := 'NOT_A_WORD';
  elsif v_room.chaos = 'no_e' and v_room.chaos_round = v_room.round and position('e' in v_word) > 0 then
    v_valid := false; v_reason := 'CHAOS_NO_E';
  else
    select bl.letter::text into v_letter from banned_letters bl
      where bl.player_id = v_me.id and position(bl.letter::text in upper(v_word)) > 0 limit 1;
    if v_letter is not null then v_valid := false; v_reason := 'BANNED_LETTER'; end if;
  end if;

  if v_valid then v_points := char_length(v_word) + 2 * greatest(0, char_length(v_word) - 6); end if;

  insert into answers (room_id, player_id, round, word, valid, reason, points)
  values (v_room.id, v_me.id, v_room.round, v_word, v_valid, v_reason, v_points)
  on conflict (player_id, round) do update
    set word = excluded.word, valid = excluded.valid, reason = excluded.reason,
        points = excluded.points, created_at = now();

  perform _bump(v_room.id, 'answered', jsonb_build_object('player_id', v_me.id));
  return jsonb_build_object('word', v_word, 'valid', v_valid, 'reason', v_reason, 'points', v_points,
    'letter', case when v_me.hacked_round = v_room.round then null else v_letter end);
end $$;

-- the Oracle previews a prompt in the room's language
create or replace function use_perk(p_token uuid, p_target_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_target players;
  v_letters jsonb; v_hint text; v_pending bigint; v_result jsonb; v_prompt bigint; v_mine jsonb; v_theirs jsonb;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_room.phase in ('lobby','finished') then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  if not (_cfg(v_room.id)->>'perks')::boolean then raise exception 'PERKS_OFF'; end if;

  -- per-round abilities (never "used up")
  if v_me.class = 'gambler' then
    if v_room.phase <> 'answer' then raise exception 'WRONG_PHASE'; end if;
    if v_me.bet_round = v_room.round then raise exception 'ALREADY_BET'; end if;
    update players set bet_round = v_room.round where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'bet', 'from', v_me.id));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
    return jsonb_build_object('kind', 'gambler', 'round', v_room.round);
  elsif v_me.class = 'parasite' then
    if v_room.phase not in ('answer','reveal','guess') then raise exception 'WRONG_PHASE'; end if;
    if v_me.latch_round = v_room.round then raise exception 'ALREADY_LATCHED'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    update players set latch_target = v_target.id, latch_round = v_room.round where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'latch', 'from', v_me.id, 'to', v_target.id));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
    return jsonb_build_object('kind', 'parasite', 'target_id', v_target.id);
  end if;

  if v_me.perk_used then raise exception 'PERK_USED'; end if;

  if v_me.class = 'ninja' then
    if v_room.round < 3 then raise exception 'PERK_NOT_READY'; end if;
    select coalesce(jsonb_agg(distinct bl.letter::text), '[]'::jsonb) into v_letters
      from banned_letters bl join players p on p.id = bl.player_id
      where p.room_id = v_room.id and not p.eliminated and p.id <> v_me.id;
    v_result := jsonb_build_object('kind','ninja','round',v_room.round,'letters',v_letters);
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);

  elsif v_me.class = 'mastermind' then
    if v_room.phase not in ('answer','reveal','guess') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    select coalesce(jsonb_agg(letter::text order by id), '[]'::jsonb) into v_letters
      from banned_letters where player_id = v_target.id;
    select letter::text into v_hint from banned_letters
      where player_id = v_target.id order by revealed asc, random() limit 1;
    v_result := jsonb_build_object('kind','mastermind','round',v_room.round,
      'target_id',v_target.id,'target_name',v_target.name,'letters',v_letters,'leaked',v_hint);
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);
    insert into hints (room_id, round, text)
      values (v_room.id, v_room.round, 'Intel leak: somebody is locked out of "' || v_hint || '".');
    update players set perk_round = v_room.round where id = v_me.id;

  elsif v_me.class = 'hero' then
    if v_room.phase <> 'react' then raise exception 'WRONG_PHASE'; end if;
    select id into v_pending from pending_additions
      where room_id = v_room.id and round = v_room.round and target_id = p_target_id
        and target_id <> v_me.id and status = 'pending'
      order by amount desc, id limit 1;
    if v_pending is null then raise exception 'NOTHING_TO_ABSORB'; end if;
    update pending_additions set target_id = v_me.id, absorbed_by = v_me.id where id = v_pending;
    update players set points = points + 5 where id = v_me.id;
    v_result := jsonb_build_object('kind','hero','absorbed_from',p_target_id,'bonus',5);
    perform _feed(v_room.id, jsonb_build_object('type', 'absorb', 'from', v_me.id, 'to', p_target_id));

  elsif v_me.class = 'mimic' then
    if v_room.phase = 'duel_intro' then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    if v_target.class = 'mimic' then raise exception 'CANNOT_MIMIC_MIMIC'; end if;
    -- become that class for the rest of the game: its perk (fresh) and its downside
    update players set class = v_target.class, orig_class = 'mimic', perk_used = false, perk_round = null
      where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object('type', 'mimic', 'from', v_me.id, 'to', v_target.id, 'what', v_target.class));
    perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', 'mimic'));
    return jsonb_build_object('kind', 'mimic', 'became', v_target.class);

  elsif v_me.class = 'oracle' then
    if v_room.phase not in ('reveal','guess','react') then raise exception 'WRONG_PHASE'; end if;
    v_prompt := _pick_prompt(v_room.id);
    update rooms set next_prompt_id = v_prompt where id = v_room.id;
    update players set oracle_round = v_room.round + 1 where id = v_me.id;
    v_result := jsonb_build_object('kind','oracle','round',v_room.round + 1,
      'prompt', (select text from prompts where id = v_prompt));
    insert into intel (room_id, player_id, round, payload) values (v_room.id, v_me.id, v_room.round, v_result);
    perform _feed(v_room.id, jsonb_build_object('type', 'oracle', 'from', v_me.id));

  elsif v_me.class = 'jester' then
    if v_room.phase not in ('guess','react') then raise exception 'WRONG_PHASE'; end if;
    select * into v_target from players where id = p_target_id and room_id = v_room.id;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    if v_target.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
    if v_target.eliminated then raise exception 'TARGET_ELIMINATED'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
      into v_mine from banned_letters where player_id = v_me.id;
    select coalesce(jsonb_agg(jsonb_build_object('l', letter::text, 'r', revealed, 'a', added_round, 's', source)), '[]'::jsonb)
      into v_theirs from banned_letters where player_id = v_target.id;
    delete from banned_letters where player_id in (v_me.id, v_target.id);
    -- the Jester's new rack is on public display
    insert into banned_letters (player_id, letter, added_round, source, revealed)
      select v_me.id, x->>'l', (x->>'a')::int, x->>'s', true from jsonb_array_elements(v_theirs) x;
    insert into banned_letters (player_id, letter, added_round, source, revealed)
      select v_target.id, x->>'l', (x->>'a')::int, x->>'s', (x->>'r')::boolean from jsonb_array_elements(v_mine) x;
    v_result := jsonb_build_object('kind','jester','target_id',v_target.id);
    perform _feed(v_room.id, jsonb_build_object('type', 'swap', 'from', v_me.id, 'to', v_target.id));

  else
    raise exception 'NO_ACTIVE_PERK';
  end if;

  update players set perk_used = true where id = v_me.id;
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', v_me.class));
  return v_result;
end $$;

revoke execute on function _room_lang(uuid), _norm(text, text), _forms(text), _in_dict(text, text), _pick_prompt(uuid) from public, anon, authenticated;

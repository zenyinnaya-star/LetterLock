-- Multi-language answers: accents folded, native script converted, category + dictionary checks per language.
\set ON_ERROR_STOP 1
create or replace function t_assert(c boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'ASSERT FAILED: %', msg; end if; raise notice 'ok  %', msg; end $$;

create or replace function t_try(p_lang text, p_key text, p_word text) returns text language plpgsql as $$
declare r jsonb; rc text; ta uuid; tb uuid; v_room uuid; v_prompt bigint;
begin
  r := create_room('Ava', 'hero'); rc := r->>'code'; ta := (r->>'token')::uuid;
  r := join_room(rc, 'Ben', 'hero'); tb := (r->>'token')::uuid;
  perform update_settings(ta, jsonb_build_object('lang', p_lang));
  perform start_game(ta);
  select id into v_room from rooms where code = rc;
  select id into v_prompt from prompts where lang = p_lang and key = p_key;
  update rooms set prompt_id = v_prompt, phase = 'answer', phase_ends_at = now() + interval '1 minute' where id = v_room;
  delete from banned_letters where player_id in (select id from players where room_id = v_room);
  r := submit_answer(ta, p_word);
  return case when (r->>'valid')::boolean then 'ok:' || (r->>'word') else r->>'reason' end;
end $$;

do $$
declare v text; p text;
begin
  -- lobby setting + prompt pick in the room's language
  perform t_assert(t_try('es', 'A fruit', 'manzana') = 'ok:manzana', 'es fruit manzana');
  perform t_assert(t_try('es', 'A fruit', 'Manzanas') = 'ok:manzanas', 'es plural + capital');
  perform t_assert(t_try('es', 'A tree', 'Árbol') = 'ok:arbol', 'es accent folded (Árbol -> arbol)');
  perform t_assert(t_try('es', 'A fruit', 'coche') = 'OFF_TOPIC', 'es car is not a fruit');
  perform t_assert(t_try('es', 'A fruit', 'zzqx') = 'NOT_A_WORD', 'es junk is not a word');
  perform t_assert(t_try('fr', 'A vehicle', 'voiture') = 'ok:voiture', 'fr voiture');
  perform t_assert(t_try('fr', 'A color', 'voiture') = 'OFF_TOPIC', 'fr car is not a colour');
  perform t_assert(t_try('de', 'An animal', 'Katzen') in ('ok:katzen'), 'de plural Katzen');
  perform t_assert(t_try('de', 'A color', 'Grün') = 'ok:grun', 'de umlaut folded');
  perform t_assert(t_try('de', 'A fruit', 'Straße') <> 'ok:strasse', 'de street is not a fruit');
  perform t_assert(t_try('ja', 'An animal', 'neko') = 'ok:neko', 'ja romaji neko');
  perform t_assert(t_try('ja', 'An animal', '猫') = 'ok:neko', 'ja kanji converted to romaji');
  perform t_assert(t_try('ja', 'A fruit', 'kuruma') = 'OFF_TOPIC', 'ja car is not a fruit');
  perform t_assert(t_try('zh', 'A fruit', '苹果') = 'ok:pingguo', 'zh hanzi converted to pinyin');
  perform t_assert(t_try('zh', 'A fruit', 'píngguǒ') = 'ok:pingguo', 'zh tone marks folded');
  perform t_assert(t_try('zh', 'A vehicle', 'pingguo') = 'OFF_TOPIC', 'zh apple is not a vehicle');
  perform t_assert(t_try('en', 'A type of food', 'car') = 'OFF_TOPIC', 'en car still off topic');
  perform t_assert(t_try('en', 'A type of food', 'pizza') = 'ok:pizza', 'en pizza still fine');

  -- rooms pick prompts in their own language
  declare r jsonb; ta uuid;
  begin
    r := create_room('Zed', 'hero'); ta := (r->>'token')::uuid;
    perform join_room(r->>'code', 'Yo', 'hero');
    perform update_settings(ta, '{"lang":"ja"}');
    perform start_game(ta);
    select p.lang into v from rooms x join prompts p on p.id = x.prompt_id where x.code = r->>'code';
    perform t_assert(v = 'ja', 'ja room gets a Japanese prompt');
    perform t_assert((get_room_state(r->>'code', ta)->'room'->'settings'->>'lang') = 'ja', 'lang visible in room settings');
  end;
  raise exception 'ROLLBACK';
exception when others then
  if sqlerrm <> 'ROLLBACK' then raise; end if;
  raise notice 'all language checks passed';
end $$;

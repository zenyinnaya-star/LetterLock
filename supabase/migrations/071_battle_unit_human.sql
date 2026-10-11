-- get_battle: expose whether each hero unit is a real (non-bot, non-quit) player, so the UI can tell solo from multiplayer.
create or replace function get_battle(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare me players; b battles; v_prompt text; v_topic text; v_cards text[]; v_card text; v_bused boolean; v_bp bigint; v_be timestamptz; v_btext text;
begin
  me := _me(p_token);
  select * into b from battles where room_id = me.room_id;
  if not found then return null; end if;
  select text, topic into v_prompt, v_topic from prompts where id = b.prompt_id;
  select cards, card, book_used, book_prompt, book_ends into v_cards, v_card, v_bused, v_bp, v_be from battle_units where player_id = me.id;
  if v_bp is not null and v_be > now() then select text into v_btext from prompts where id = v_bp; end if;
  return jsonb_build_object(
    'turn', b.turn, 'momentum', b.momentum, 'step', b.step, 'ends_at', b.ends_at, 'prompt', v_prompt, 'element', _elem(coalesce(v_topic, '')), 'enemy', b.enemy_name,
    'stage', b.stage, 'stages', 5, 'locked', b.locked, 'intent', b.intent, 'next_intent', b.next_intent, 'drain', b.drain,
    'cards', to_jsonb(coalesce(v_cards, '{}')), 'book_used', coalesce(v_bused, false), 'book', case when v_btext is not null then jsonb_build_object('prompt', v_btext, 'ends_at', v_be) end, 'card_used', v_card is not null,
    'log', b.pre || b.log, 'version', b.version, 'me', me.id,
    'units', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'side', u.side, 'player_id', u.player_id, 'name', u.name, 'hero', u.hero, 'hp', u.hp, 'max_hp', u.max_hp,
        'shield', u.shield, 'spd', u.spd, 'corruption', u.corruption, 'ult', u.ult, 'afk', u.afk, 'weak_el', case when u.side = 'enemy' then _foe_weak(u.name) end, 'res_el', case when u.side = 'enemy' then _foe_res(u.name) end, 'locked', (u.action is not null), 'haste', u.haste, 'intent', _eintent(u, b),
        'human', (u.side = 'hero' and exists (select 1 from players pp where pp.id = u.player_id and pp.bot = 0 and not pp.quit)),
        'action', case when u.player_id = me.id then u.action end,
        'power', case when u.player_id = me.id then u.power end) order by u.side desc, u.ord), '[]'::jsonb)
      from battle_units u where u.room_id = me.room_id));
end
$fn$;

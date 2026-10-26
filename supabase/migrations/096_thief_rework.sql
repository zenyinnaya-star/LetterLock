-- Thief rework: Grand Heist (word points + best cards), Hot Potato (frame a lock onto someone), Wanted bounty.
-- Additive: new columns/RPC; function patches only.
alter table players add column if not exists heat int not null default 0;
alter table banned_letters add column if not exists framed_by uuid;

create or replace function thief_frame(p_token uuid, p_target_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_me players; v_room rooms; v_t players; v_bl banned_letters;
begin
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id for update;
  if v_me.class <> 'thief' then raise exception 'NOT_THIEF'; end if;
  if v_room.phase <> 'react' then raise exception 'WRONG_PHASE'; end if;
  if v_me.eliminated then raise exception 'ELIMINATED'; end if;
  if _is_team(v_room.id) then raise exception 'NOT_IN_TEAM'; end if;
  if v_me.perk_round is not distinct from v_room.round then raise exception 'ALREADY_FRAMED'; end if;
  select * into v_t from players where id = p_target_id and room_id = v_room.id;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_t.id = v_me.id then raise exception 'CANNOT_TARGET_SELF'; end if;
  if v_t.eliminated or v_t.is_spectator then raise exception 'TARGET_ELIMINATED'; end if;
  select * into v_bl from banned_letters b where b.player_id = v_me.id
    and not exists (select 1 from banned_letters x where x.player_id = v_t.id and x.letter = b.letter)
    order by b.revealed desc, random() limit 1;
  if v_bl.id is null then raise exception 'NOTHING_TO_DUMP'; end if;
  update banned_letters set player_id = v_t.id, framed_by = v_me.id, revealed = false where id = v_bl.id;
  update players set perk_round = v_room.round where id = v_me.id;
  perform _feed(v_room.id, jsonb_build_object('type', 'frame', 'from', v_me.id, 'to', v_t.id));
  perform _bump(v_room.id, 'perk_used', jsonb_build_object('player_id', v_me.id, 'class', 'thief'));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function thief_frame(uuid, uuid) to anon, authenticated;

create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in % : %', p_name, p_from; end if;
  execute replace(d, p_from, p_to);
end $$;

-- Grand Heist: best cards first, and the target's word points for the round (min 4)
select _patch_fn('use_ultimate',
  'for v_card in select id from cards where owner_id = v_t.id and not used order by random() loop',
  'for v_card in select id from cards where owner_id = v_t.id and not used order by case kind::text when ''attack'' then 0 when ''shield'' then 1 else 2 end, random() loop');
select _patch_fn('use_ultimate',
  'v_take := least(4, v_t.points);',
  'v_take := least(v_t.points, greatest(4, coalesce((select a.points from answers a where a.player_id = v_t.id and a.round = v_room.round and a.valid), 0)));');
select _patch_fn('use_ultimate',
  'v_result := jsonb_build_object(''kind'',''thief'',''cards'',v_stolen,''points'',v_take);',
  'update players set heat = heat + 2 where id = v_me.id;
    perform _feed(v_room.id, jsonb_build_object(''type'',''heist'',''from'',v_me.id,''to'',v_t.id,''cards'',v_stolen,''amount'',v_take));
    v_result := jsonb_build_object(''kind'',''thief'',''cards'',v_stolen,''points'',v_take);');

-- heat on card steals; bounty + give-back when you crack a Wanted/framing Thief
select _patch_fn('_guess_base', 'v_stole := true;', 'v_stole := true; update players set heat = heat + 1 where id = v_me.id;');
select _patch_fn('_guess_base',
  'update players set charge = least(30, charge + 3) where id = v_me.id; -- skill charges your ultimate',
  'update players set charge = least(30, charge + 3) where id = v_me.id; -- skill charges your ultimate
    if v_target.class = ''thief'' then
      if v_target.heat >= 3 then
        update players set points = points + 3 where id = v_me.id;
        update players set heat = 0 where id = v_target.id;
        perform _feed(v_room.id, jsonb_build_object(''type'', ''bounty'', ''from'', v_me.id, ''to'', v_target.id, ''amount'', 3));
      end if;
      update banned_letters b set player_id = v_target.id, framed_by = null
        where b.player_id = v_me.id and b.framed_by = v_target.id
          and not exists (select 1 from banned_letters x where x.player_id = v_target.id and x.letter = b.letter);
    end if;');

select _patch_fn('_state_base', '''wins'', p.wins,', '''wins'', p.wins, ''wanted'', p.heat >= 3,');
-- (also applied with this migration: legend marks only for legendary+ tiers, see 095)
select _patch_fn('_answer_029', 'if v_len >= 9 or (v_len >= 7 and not exists (select 1 from answers where valid and word = v_word and id <> v_a.id)) then', 'if _word_tier(replace(v_word, '' '', '''')) in (''legendary'', ''mythic'', ''godlike'') then');
drop function _patch_fn(text, text, text);

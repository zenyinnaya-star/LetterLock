-- Word rarity ladder (common < epic < legendary < mythic < godlike) + Unstoppable streak.
-- Additive: new nullable columns, new functions; old legend +5 replaced by tier bonus.
alter table answers add column if not exists tier text;
alter table answers add column if not exists mult numeric(3,2);

create or replace function _word_tier(p_word text) returns text language sql immutable as $$
  with w as (select replace(coalesce(p_word, ''), ' ', '') f)
  select case
    when char_length(f) < 6 then 'common'
    else case
      when char_length(f) + char_length(regexp_replace(f, '[^jqxz]', '', 'g')) >= 14 then 'godlike'
      when char_length(f) + char_length(regexp_replace(f, '[^jqxz]', '', 'g')) >= 12 then 'mythic'
      when char_length(f) + char_length(regexp_replace(f, '[^jqxz]', '', 'g')) >= 10 then 'legendary'
      when char_length(f) + char_length(regexp_replace(f, '[^jqxz]', '', 'g')) >= 8 then 'epic'
      else 'common' end
  end from w
$$;

create or replace function _tier_bonus(p_tier text) returns int language sql immutable as $$
  select case p_tier when 'epic' then 2 when 'legendary' then 5 when 'mythic' then 9 when 'godlike' then 15 else 0 end
$$;

create or replace function _answer_095(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_res jsonb; v_me players; v_room rooms; v_a answers; v_tier text; v_tb int; v_run int := 0; v_i int;
  v_mult numeric := 1; v_pts int; v_hit boolean := true;
begin
  v_res := _answer_036(p_token, p_word);
  if not coalesce((v_res->>'valid')::boolean, false) then return v_res; end if;
  v_me := _me(p_token);
  select * into v_room from rooms where id = v_me.room_id;
  select * into v_a from answers where player_id = v_me.id and round = v_room.round;
  v_tier := _word_tier(replace(v_res->>'word', ' ', ''));
  v_tb := _tier_bonus(v_tier);
  if v_tier <> 'common' then
    v_run := 1;
    for v_i in reverse (v_room.round - 1)..1 loop
      select (tier is not null and tier <> 'common') into v_hit from answers
        where player_id = v_me.id and round = v_i and valid;
      exit when v_hit is not true;
      v_run := v_run + 1;
    end loop;
  end if;
  if v_run >= 3 then v_mult := least(2.0, 1 + 0.25 * (v_run - 2)); end if;
  v_pts := round((v_a.points + v_tb) * v_mult);
  update answers set points = v_pts, tier = v_tier, mult = v_mult where id = v_a.id;
  return v_res || jsonb_build_object('points', v_pts, 'tier', v_tier, 'tier_bonus', v_tb,
                                     'tier_run', v_run, 'mult', v_mult, 'unstoppable', v_run >= 3);
end $$;
grant execute on function _answer_095(uuid, text) to anon, authenticated;

create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in %', p_name; end if;
  execute replace(d, p_from, p_to);
end $$;

-- the old flat legend bonus is superseded by the ladder (marks/charge/feed stay)
select _patch_fn('_answer_029', 'v_legend := true; v_extra := v_extra + 5;', 'v_legend := true;');
select _patch_fn('submit_answer', 'v_res := _answer_036(p_token, p_word);', 'v_res := _answer_095(p_token, p_word);');
select _patch_fn('_state_base', '''reason'', a.reason, ''points'', a.points)', '''reason'', a.reason, ''points'', a.points, ''tier'', a.tier, ''mult'', a.mult)');
drop function _patch_fn(text, text, text);

-- legend marks/charge/feed now fire only for legendary+ words (ladder), not the old 9+/unplayed rule
create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in %', p_name; end if;
  execute replace(d, p_from, p_to);
end $$;
select _patch_fn('_answer_029', 'if v_len >= 9 or (v_len >= 7 and not exists (select 1 from answers where valid and word = v_word and id <> v_a.id)) then', 'if _word_tier(replace(v_word, '' '', '''')) in (''legendary'', ''mythic'', ''godlike'') then');
drop function _patch_fn(text, text, text);

-- Real Break: weakness/long/rare/crit/ult hits fill an enemy Break meter; when full the enemy is stunned
-- (loses its next action, takes +30% damage while stunned). Log entries: {t:'brk',di,n,mx,x:broke} and {t:'stunned',ai}.
alter table battle_units add column if not exists brk int not null default 0;
alter table battle_units add column if not exists stun int not null default 0;

create or replace function public._break_max(p_name text) returns int language sql immutable as $$
  select case p_name when 'Bailiff' then 7 when 'Tax Drone' then 6 when 'Collector' then 8 when 'Commissioner' then 9 when 'Government' then 12 else 5 end
$$;

-- adds points to an enemy's meter; returns jsonb log entry (and stuns on full)
create or replace function public._break_add(p_enemy uuid, p_pts int) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare e battle_units; v int; mx int; broke boolean := false;
begin
  select * into e from battle_units where id = p_enemy for update;
  if e.id is null or e.hp <= 0 or e.stun > 0 then return null; end if;
  mx := _break_max(e.name);
  v := e.brk + greatest(0, p_pts);
  if v >= mx then broke := true; v := mx; update battle_units set brk = 0, stun = 1 where id = e.id;
  else update battle_units set brk = v where id = e.id; end if;
  return jsonb_build_object('t','brk','di',e.id,'d',e.name,'n',v,'mx',mx,'x',broke);
end $$;

do $$
declare d text; o text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='_battle_resolve';
  -- 1) declare crit flag
  o := 'declare b battles;'; if position(o in d)=0 then raise exception 'anchor1'; end if;
  d := replace(d, o, 'declare kc boolean := false; bk jsonb; b battles;');
  -- 2) reset flag per attack
  o := 'dmg := u.power * 2;'; if position(o in d)=0 then raise exception 'anchor2'; end if;
  d := replace(d, o, 'kc := false; dmg := u.power * 2;');
  -- 3) stunned enemies take +30%
  o := 'dmg := greatest(1, round(dmg * mult));'; if position(o in d)=0 then raise exception 'anchor3'; end if;
  d := replace(d, o, 'dmg := greatest(1, round(dmg * mult * case when e.stun > 0 then 1.3 else 1 end));');
  -- 4) mark crit
  o := 'dmg := round(dmg * least(2.5, 1.5 + u.lex * 0.01));'; if position(o in d)=0 then raise exception 'anchor4'; end if;
  d := replace(d, o, 'kc := true; dmg := round(dmg * least(2.5, 1.5 + u.lex * 0.01));');
  -- 5) fill break after a landed attack
  o := 'update battle_units set misses = 0 where id = u.id;'; if position(o in d)=0 then raise exception 'anchor5'; end if;
  d := replace(d, o, o || E'\n          bk := _break_add(e.id, 1 + (case when char_length(coalesce(u.word,'''')) >= 6 then 1 else 0 end) + (case when (select count(*) from regexp_matches(coalesce(u.word,''''), ''[jqxzkvwy]'', ''g'')) >= 2 then 1 else 0 end) + (case when mult > 1 then 2 else 0 end) + (case when kc then 3 else 0 end));\n          if bk is not null then lg := lg || bk; end if;');
  -- 6) Kira ult fills break too
  o := 'update battle_units set hp = greatest(0, hp - dmg) where id = e.id;' || E'\n          lg := lg || jsonb_build_object(''t'',''ult'',''a'',u.name,''ai'',u.id,''hero'',u.hero,''d'',e.name';
  if position(o in d)>0 then d := replace(d, o, 'update battle_units set hp = greatest(0, hp - dmg) where id = e.id;' || E'\n          bk := _break_add(e.id, 3); if bk is not null then lg := lg || bk; end if;\n          lg := lg || jsonb_build_object(''t'',''ult'',''a'',u.name,''ai'',u.id,''hero'',u.hero,''d'',e.name'); end if;
  -- 7) stunned enemy skips its action
  o := 'it := case when u.name = ''Government'' then b.intent else ''attack'' end;'; if position(o in d)=0 then raise exception 'anchor7'; end if;
  d := replace(d, o, E'if u.stun > 0 then\n        update battle_units set stun = stun - 1 where id = u.id;\n        lg := lg || jsonb_build_object(''t'',''stunned'',''a'',u.name,''ai'',u.id);\n        continue;\n      end if;\n      ' || o);
  execute d;
end $$;

-- 043: Story performance tracking, XP + levels from each run, run history for the stats page.
alter table battle_units add column if not exists dmg int not null default 0;
alter table battle_units add column if not exists healed int not null default 0;
alter table battle_units add column if not exists crits int not null default 0;
alter table battle_units add column if not exists ults_used int not null default 0;
alter table battle_units add column if not exists words int not null default 0;
alter table battle_units add column if not exists book_ok int not null default 0;

create table if not exists story_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  room_id uuid,
  created_at timestamptz not null default now(),
  hero text, won boolean not null, stages_cleared int not null default 0,
  dmg int not null default 0, healed int not null default 0, crits int not null default 0, ults int not null default 0,
  words int not null default 0, books int not null default 0, survived boolean not null default false,
  xp int not null default 0, lvl_before int not null default 1, lvl_after int not null default 1, xp_after int not null default 0,
  unique (room_id, profile_id)
);
alter table story_runs enable row level security;

-- Count the damage/heals/crits/ults in a turn's log entries for the hero that did them.
create or replace function _battle_tally(p_room uuid, lg jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e jsonb; t text;
begin
  for e in select * from jsonb_array_elements(lg) loop
    t := e->>'t';
    if t in ('hit','crit') then
      update battle_units set dmg = dmg + coalesce((e->>'n')::int,0), crits = crits + case when t = 'crit' then 1 else 0 end
        where room_id = p_room and side = 'hero' and name = e->>'a';
    elsif t in ('sweep','mega_sweep') then
      update battle_units set dmg = dmg + coalesce((e->>'n')::int,0) where room_id = p_room and side = 'hero' and name = e->>'a';
    elsif t = 'ult' then
      update battle_units set ults_used = ults_used + 1,
        dmg = dmg + case when hero in ('Shiro','Kira','Prince') then coalesce((e->>'n')::int,0) else 0 end
        where room_id = p_room and side = 'hero' and name = e->>'a';
    elsif t in ('heal','group_heal','full_heal') then
      update battle_units set healed = healed + coalesce((e->>'n')::int,0) where room_id = p_room and side = 'hero' and name = e->>'a';
    end if;
  end loop;
  update battle_units set words = words + 1 where room_id = p_room and side = 'hero' and word is not null;
end $$;
revoke execute on function _battle_tally(uuid, jsonb) from public, anon, authenticated;

-- count correct Book answers (book_prompt cleared while the hand grew)
create or replace function _bu_book_ok() returns trigger language plpgsql as $$
begin
  if old.book_prompt is not null and new.book_prompt is null and coalesce(cardinality(new.cards),0) > coalesce(cardinality(old.cards),0) then
    new.book_ok := old.book_ok + 1;
  end if;
  return new;
end $$;
drop trigger if exists bu_book_ok on battle_units;
create trigger bu_book_ok before update on battle_units for each row execute function _bu_book_ok();

create or replace function _battle_resolve(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles; u battle_units; t battle_units; e battle_units; lg jsonb := '[]'::jsonb;
        dmg int; heal int; r double precision; ids uuid[]; i uuid; hit numeric; acc numeric; eva numeric;
        crit_m numeric; n int; v_stage int; it text; tg battle_units;
begin
  select * into b from battles where room_id = p_room for update;
  select count(*) into n from battle_units where room_id = p_room and side = 'hero';
  lg := b.pre;
  update battle_units set action = 'guard', power = 3, word = null
    where room_id = p_room and side = 'hero' and hp > 0 and action is null;
  select array_agg(id order by spd + _brand(b.seed, b.turn, id::text) * 4
                   + case action when 'guard' then 4 when 'heal' then 2 when 'ult' then -3 else 0 end desc) into ids
    from battle_units where room_id = p_room and hp > 0;
  foreach i in array ids loop
    select * into u from battle_units where id = i;
    continue when u.hp <= 0;
    if u.side = 'hero' then
      select * into e from battle_units where room_id = p_room and side = 'enemy' and hp > 0
        order by (id = u.target) desc, ord limit 1;
      if u.action = 'ult' then
        continue when e.id is null and u.hero <> 'Mira' and u.hero <> 'Nero';
        if u.hero = 'Shiro' then
          dmg := round(u.power * 2.2);
          update battle_units set hp = greatest(0, hp - dmg) where room_id = p_room and side = 'enemy' and hp > 0;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'n',dmg,'w',u.word);
        elsif u.hero = 'Nero' then
          update battle_units set shield = shield + round(u.power * 2) where room_id = p_room and side = 'hero' and hp > 0;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'n',round(u.power * 2),'w',u.word);
        elsif u.hero = 'Kira' then
          dmg := u.power * 5;
          update battle_units set hp = greatest(0, hp - dmg) where id = e.id;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'d',e.name,'n',dmg,'w',u.word);
        elsif u.hero = 'Mira' then
          update battle_units set hp = least(max_hp, hp + round(max_hp * 0.4)), corruption = 0 where room_id = p_room and side = 'hero' and hp > 0;
          update battle_units set hp = round(max_hp * 0.3) where room_id = p_room and side = 'hero' and hp <= 0;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'w',u.word);
        else
          dmg := round(u.power * 1.6);
          update battle_units set hp = greatest(0, hp - dmg) where room_id = p_room and side = 'enemy' and hp > 0;
          update battle_units set hp = least(max_hp, hp + 15) where room_id = p_room and side = 'hero' and hp > 0;
          lg := lg || jsonb_build_object('t','ult','a',u.name,'hero',u.hero,'n',dmg,'w',u.word);
        end if;
        update battle_units set ult = 0 where id = u.id;
      elsif u.action = 'attack' then
        continue when e.id is null;
        acc := u.foc * 0.01 + u.lck * 0.005 + least(0.3, 0.02 * greatest(0, char_length(coalesce(u.word, '')) - 5));
        eva := least(0.4, e.spd * 0.015);
        hit := greatest(0.1, least(0.95, 0.9 + acc - eva));
        if _brand(b.seed, b.turn, u.id::text || 'hit') > hit then
          lg := lg || jsonb_build_object('t','miss','a',u.name,'d',e.name);
        else
          dmg := u.power * 2;
          if _brand(b.seed, b.turn, u.id::text || 'crit') < least(0.5, 0.05 + u.lck * 0.01) then
            dmg := round(dmg * least(2.5, 1.5 + u.lex * 0.01));
            lg := lg || jsonb_build_object('t','crit','a',u.name,'d',e.name,'n',dmg,'w',u.word);
          else
            lg := lg || jsonb_build_object('t','hit','a',u.name,'d',e.name,'n',dmg,'w',u.word);
          end if;
          update battle_units set hp = greatest(0, hp - dmg) where id = e.id;
        end if;
      elsif u.action = 'guard' then
        update battle_units set shield = shield + round(u.power * 1.5) where id = u.id;
        lg := lg || jsonb_build_object('t','guard','a',u.name,'n',round(u.power * 1.5),'w',u.word);
      else
        heal := u.power * 2;
        select * into t from battle_units where room_id = p_room and side = 'hero' and hp > 0
          order by (id = u.target) desc, hp::float / max_hp limit 1;
        update battle_units set hp = least(max_hp, hp + heal),
          corruption = case when u.hero = 'Mira' then greatest(0, corruption - 1) else corruption end where id = t.id;
        lg := lg || jsonb_build_object('t','heal','a',u.name,'d',t.name,'n',heal,'w',u.word);
      end if;
    else
      it := case when u.name = 'Government' then b.intent else 'attack' end;
      if it = 'tax_season' then
        lg := lg || jsonb_build_object('t','season','a',u.name);
        for t in select * from battle_units where room_id = p_room and side = 'hero' and hp > 0 loop
          dmg := round(u.atk * 1.6) + b.turn;
          update battle_units set shield = greatest(0, shield - dmg), hp = greatest(0, hp - greatest(0, dmg - shield)) where id = t.id;
        end loop;
      else
        select * into t from battle_units where room_id = p_room and side = 'hero' and hp > 0
          order by _brand(b.seed, b.turn, id::text || 'tgt' || u.id::text) limit 1;
        continue when t.id is null;
        eva := least(0.4, t.spd * 0.015);
        if _brand(b.seed, b.turn, 'edodge' || u.id::text) > greatest(0.1, least(0.95, 0.9 - eva)) and u.name <> 'Government' then
          lg := lg || jsonb_build_object('t','dodge','a',u.name,'d',t.name);
        else
          dmg := u.atk + floor(_brand(b.seed, b.turn, 'edmg' || u.id::text) * 6)::int + b.stage;
          update battle_units set shield = greatest(0, shield - dmg), hp = greatest(0, hp - greatest(0, dmg - shield)) where id = t.id;
          lg := lg || jsonb_build_object('t','hit','a',u.name,'d',t.name,'n',dmg);
        end if;
      end if;
      if it = 'taxes' then
        for t in select * from battle_units where room_id = p_room and side = 'hero' and hp > 0 loop
          if _brand(b.seed, b.turn, 'corr' || t.id::text) < least(0.6, t.wil * 0.04) then
            lg := lg || jsonb_build_object('t','resist','d',t.name);
          else
            update battle_units set corruption = least(3, corruption + 1) where id = t.id;
            lg := lg || jsonb_build_object('t','corrupt','d',t.name);
          end if;
        end loop;
      end if;
    end if;
  end loop;
  update battle_units set ult = least(6, ult + 1) where room_id = p_room and side = 'hero' and hp > 0 and word is not null and action <> 'ult';
  perform _battle_tally(p_room, lg);
  update battle_units set action = null, power = 0, word = null, target = null, card = null where room_id = p_room;
  update battles set pre = '[]'::jsonb where room_id = p_room;
  if not exists (select 1 from battle_units where room_id = p_room and side = 'enemy' and hp > 0) then
    if b.stage >= 5 then
      update battles set step = 'won', log = lg, version = version + 1 where room_id = p_room;
      update rooms set phase = 'finished', phase_ends_at = null where id = p_room;
    else
      -- next encounter: breather heal, revive the fallen, clear shields and Corruption
      update battle_units set hp = case when hp <= 0 then round(max_hp * 0.3) else least(max_hp, hp + round(max_hp * 0.3)) end,
        shield = 0, corruption = 0, book_used = false where room_id = p_room and side = 'hero';
      delete from battle_units where room_id = p_room and side = 'enemy';
      perform _spawn(p_room, b.stage + 1, n);
      update battles set stage = stage + 1, turn = turn + 1, log = lg || jsonb_build_object('t','stage','n',b.stage + 1), version = version + 1 where room_id = p_room;
      perform _roll_turn(p_room);
    end if;
  elsif not exists (select 1 from battle_units where room_id = p_room and side = 'hero' and hp > 0) then
    update battles set step = 'lost', log = lg, version = version + 1 where room_id = p_room;
    update rooms set phase = 'finished', phase_ends_at = null where id = p_room;
  else
    update battles set turn = turn + 1, log = lg, version = version + 1 where room_id = p_room;
    perform _roll_turn(p_room);
  end if;
  perform _bump(p_room, 'battle_turn', '{}');
end $$;


-- XP for a finished Story run, from performance
create or replace function _award_story(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles; u record; prof profiles; cleared int; x int; won boolean; lb int; humans int;
begin
  select * into b from battles where room_id = p_room;
  if not found then return; end if;
  won := b.step = 'won';
  cleared := case when won then 5 else greatest(0, b.stage - 1) end;
  select count(*) into humans from players where room_id = p_room and bot = 0;
  for u in select bu.*, p.profile_id as pid from battle_units bu join players p on p.id = bu.player_id
           where bu.room_id = p_room and bu.side = 'hero' and p.profile_id is not null and p.bot = 0 loop
    select * into prof from profiles where id = u.pid for update;
    if not found then continue; end if;
    x := 25 + 20 * cleared + least(40, u.dmg / 20) + least(30, u.healed / 20) + least(45, 3 * u.words) + least(25, 5 * u.crits)
         + least(30, 10 * u.ults_used) + least(30, 15 * u.book_ok) + case when u.hp > 0 then 15 else 0 end
         + case when won then 100 else 0 end + case when won and humans >= 3 then 25 else 0 end;
    lb := _level(prof.xp);
    insert into story_runs (profile_id, room_id, hero, won, stages_cleared, dmg, healed, crits, ults, words, books, survived, xp, lvl_before, lvl_after, xp_after)
      values (prof.id, p_room, u.hero, won, cleared, u.dmg, u.healed, u.crits, u.ults_used, u.words, u.book_ok, u.hp > 0, x, lb, _level(prof.xp + x), prof.xp + x)
      on conflict (room_id, profile_id) do nothing;
    if found then
      update profiles set xp = xp + x, updated_at = now() where id = prof.id;
    end if;
  end loop;
end $$;
revoke execute on function _award_story(uuid) from public, anon, authenticated;

create or replace function _rooms_award() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phase = 'finished' and old.phase is distinct from 'finished' then
    begin
      if exists (select 1 from battles where room_id = new.id) then perform _award_story(new.id); else perform _award_xp(new.id); end if;
    exception when others then
      null;   -- XP must never stop a game from finishing
    end;
  end if;
  return new;
end $$;
revoke execute on function _rooms_award() from public, anon, authenticated;

-- my run result (for the end-of-run screen)
create or replace function story_result(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me players; r story_runs; prof profiles;
begin
  me := _me(p_token);
  select * into r from story_runs where room_id = me.room_id and profile_id = me.profile_id;
  if not found then return null; end if;
  select * into prof from profiles where id = r.profile_id;
  return jsonb_build_object('hero', r.hero, 'won', r.won, 'stages_cleared', r.stages_cleared, 'dmg', r.dmg, 'healed', r.healed, 'crits', r.crits,
    'ults', r.ults, 'words', r.words, 'books', r.books, 'survived', r.survived, 'xp', r.xp, 'lvl_before', r.lvl_before, 'lvl_after', r.lvl_after,
    'xp_after', r.xp_after, 'level_floor', 60 * (r.lvl_after - 1) * (r.lvl_after - 1), 'level_next', 60 * r.lvl_after * r.lvl_after);
end $$;

-- stats page
create or replace function story_stats(p_secret uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare prof profiles;
begin
  select * into prof from profiles where secret = p_secret;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  return jsonb_build_object(
    'profile', _profile_json(prof),
    'totals', (select jsonb_build_object('runs', count(*), 'wins', count(*) filter (where won), 'dmg', coalesce(sum(dmg),0), 'healed', coalesce(sum(healed),0),
        'crits', coalesce(sum(crits),0), 'ults', coalesce(sum(ults),0), 'words', coalesce(sum(words),0), 'books', coalesce(sum(books),0),
        'best_stage', coalesce(max(stages_cleared),0), 'xp', coalesce(sum(xp),0)) from story_runs where profile_id = prof.id),
    'heroes', (select coalesce(jsonb_agg(jsonb_build_object('hero', hero, 'runs', c, 'wins', w, 'dmg', d, 'healed', h) order by c desc), '[]'::jsonb)
        from (select hero, count(*) c, count(*) filter (where won) w, sum(dmg) d, sum(healed) h from story_runs where profile_id = prof.id group by hero) x),
    'recent', (select coalesce(jsonb_agg(to_jsonb(r) - 'profile_id' - 'room_id' - 'id' order by r.created_at desc), '[]'::jsonb)
        from (select * from story_runs where profile_id = prof.id order by created_at desc limit 15) r));
end $$;
revoke execute on function story_result(uuid), story_stats(uuid) from public;
grant execute on function story_result(uuid), story_stats(uuid) to anon, authenticated;

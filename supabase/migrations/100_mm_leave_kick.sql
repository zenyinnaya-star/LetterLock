-- Mastermind: real leaving, host hand-off, host kick. A removed player is flagged `gone` (and sits out), never deleted,
-- so scores, guesses and votes stay consistent. Everything that already skips `sitting` players skips them too.
alter table mm_players add column if not exists gone boolean not null default false;

-- a removed player's token stops working (the client reads REMOVED and leaves the room)
create or replace function _mm_player(p_token uuid) returns mm_players language plpgsql security definer set search_path = public as $$
declare v mm_players;
begin
  select * into v from mm_players where token = p_token;
  if not found then raise exception 'BAD_TOKEN'; end if;
  if v.gone then raise exception 'REMOVED'; end if;
  return v;
end $$;

create or replace function _mm_remove(p_player uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v mm_players; r mm_rooms; nh uuid; active int; alive int;
begin
  select * into v from mm_players where id = p_player;
  if v.id is null or v.gone then return; end if;
  select * into r from mm_rooms where id = v.room_id for update;
  update mm_players set gone = true, sitting = true, is_out = true, backing = null, is_host = false where id = v.id;
  delete from mm_votes where voter_id = v.id;

  if v.is_host then
    select id into nh from mm_players where room_id = r.id and not gone order by sitting, seat limit 1;
    if nh is null then
      update mm_rooms set status = 'finished', between_until = null where id = r.id;
      return;
    end if;
    update mm_players set is_host = true where id = nh;
  end if;

  if r.status in ('round', 'between') then
    select count(*) into active from mm_players where room_id = r.id and not sitting;
    if active < 3 then
      -- not enough people left for a case (Mastermind + Impostor + a detective)
      update mm_rooms set status = 'finished', between_until = null where id = r.id;
      return;
    end if;
    if r.status = 'round' then
      if v.id = r.mastermind_id then
        -- the Mastermind walked out: the case is voided, nobody is scored
        update mm_rooms set status = 'between', solved_by = null, accused_id = null, caught = null, lazy = false,
          between_until = now() + interval '8 seconds' where id = r.id;
      else
        select count(*) into alive from mm_players
          where room_id = r.id and id <> r.mastermind_id and id is distinct from r.impostor_id and not is_out and not sitting;
        if alive = 0 then perform _mm_end_round(r.id, null); end if;
      end if;
    end if;
  end if;
end $$;

create or replace function mm_leave(p_token uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players;
begin
  select * into me from mm_players where token = p_token;
  if me.id is null then return; end if;
  perform _mm_remove(me.id);
end $$;

create or replace function mm_kick(p_token uuid, p_target uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players; t mm_players;
begin
  me := _mm_player(p_token);
  if not me.is_host then raise exception 'NOT_HOST'; end if;
  select * into t from mm_players where id = p_target and room_id = me.room_id and not gone;
  if t.id is null or t.id = me.id then raise exception 'BAD_TARGET'; end if;
  perform _mm_remove(t.id);
end $$;
grant execute on function mm_leave(uuid), mm_kick(uuid, uuid) to anon, authenticated;

-- removed players disappear from the table
create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in % : %', p_name, p_from; end if;
  execute replace(d, p_from, p_to);
end $$;
select _patch_fn('mm_state', 'from mm_players p where p.room_id = r.id),', 'from mm_players p where p.room_id = r.id and not p.gone),');
drop function _patch_fn(text, text, text);

-- Rivalry score: wins carry across rematches in the same room (players rows persist; _again_base does not reset wins).
alter table players add column if not exists wins int not null default 0;

create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in %', p_name; end if;
  execute replace(d, p_from, p_to);
end $$;

select _patch_fn('_finish',
  'update rooms set phase = ''finished'', phase_ends_at = null, winner_id = v_winner where id = p_room_id;',
  'update rooms set phase = ''finished'', phase_ends_at = null, winner_id = v_winner where id = p_room_id;
  update players set wins = wins + 1 where id = v_winner;');
select _patch_fn('_state_base',
  '''is_spectator'', p.is_spectator,',
  '''is_spectator'', p.is_spectator, ''wins'', p.wins,');
drop function _patch_fn(text, text, text);

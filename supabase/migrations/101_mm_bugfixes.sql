-- Mastermind bug fixes found in the pre-launch review.
--  1. mm_again only resets a FINISHED game (it used to wipe clues, guesses, votes and scores mid-round if the host called it).
--  2. mm_join: removed (gone) players no longer take up seats in the room cap, and seats never collide.
create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in % : %', p_name, p_from; end if;
  execute replace(d, p_from, p_to);
end $$;
select _patch_fn('mm_again', 'delete from mm_clues where room_id = me.room_id;', 'if (select status from mm_rooms where id = me.room_id) is distinct from ''finished'' then return; end if;
  delete from mm_clues where room_id = me.room_id;');
select _patch_fn('mm_join', 'select count(*) into n from mm_players where room_id = r.id;', 'select count(*) into n from mm_players where room_id = r.id and not gone;');
select _patch_fn('mm_join', 'values (r.id, nm, n)', 'values (r.id, nm, coalesce((select max(seat) + 1 from mm_players where room_id = r.id), 0))');
drop function _patch_fn(text, text, text);

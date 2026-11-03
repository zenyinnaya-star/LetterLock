-- 1) attacks that pick letters can't stack vowels: one locked vowel per player; a blocked vowel becomes a random consonant
-- 2) Mastermind: host sitting out mid-round ends the round if only the Impostor is left guessing (same rule as a wrong guess)
create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in % : %', p_name, p_from; end if;
  execute replace(d, p_from, p_to);
end $$;
select _patch_fn('_advance_phase_core',
'            where not exists (select 1 from banned_letters where player_id = v_a.target_id and letter = substr(v_a.letters, n, 1));
          if found then v_i := v_i + 1; end if;',
'            where not exists (select 1 from banned_letters where player_id = v_a.target_id and letter = substr(v_a.letters, n, 1))
              and not (upper(substr(v_a.letters, n, 1)) in (''A'',''E'',''I'',''O'',''U'')
                       and exists (select 1 from banned_letters where player_id = v_a.target_id and letter in (''A'',''E'',''I'',''O'',''U'')));
          if found then v_i := v_i + 1;
          elsif upper(substr(v_a.letters, n, 1)) in (''A'',''E'',''I'',''O'',''U'') then
            if _add_letter(v_a.target_id, v_room.round, v_a.kind) is not null then v_i := v_i + 1; end if;
          end if;');
select _patch_fn('mm_sit',
'select count(*) into alive from mm_players where room_id = r.id and id <> r.mastermind_id and not is_out;',
'select count(*) into alive from mm_players where room_id = r.id and id <> r.mastermind_id and id is distinct from r.impostor_id and not is_out and not sitting;');
drop function _patch_fn(text, text, text);

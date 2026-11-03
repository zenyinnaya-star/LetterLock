-- fewer vowel locks: at most 1 vowel per player (was 2), and a vowel is ~4x less likely to be drawn than a consonant (~6% per draw, was ~19%)
create or replace function _patch_fn(p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_name;
  if position(p_from in d) = 0 then raise exception 'anchor not found in % : %', p_name, p_from; end if;
  execute replace(d, p_from, p_to);
end $$;
select _patch_fn('_add_letter', 'and not (l in (''A'',''E'',''I'',''O'',''U'') and (p_round = 0 or v_vowels >= 2))
  order by random() limit 1;', 'and not (l in (''A'',''E'',''I'',''O'',''U'') and (p_round = 0 or v_vowels >= 1))
  order by random() * case when l in (''A'',''E'',''I'',''O'',''U'') then 4 else 1 end limit 1;');
drop function _patch_fn(text, text, text);

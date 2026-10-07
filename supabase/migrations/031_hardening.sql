-- Security advisor fixes: pin search_path on _ult_cost, stop exposing trigger helpers over the API.
create or replace function _ult_cost(p_class player_class) returns int
language sql immutable set search_path = public as $$
  select case p_class when 'ninja' then 16 when 'oracle' then 12 when 'mastermind' then 12 when 'hero' then 14
    when 'jester' then 14 when 'villain' then 18 when 'hacker' then 20 when 'gambler' then 8
    when 'mimic' then 18 when 'parasite' then 20 when 'thief' then 16 when 'wildcard' then 16 else null end;
$$;
revoke execute on function _leech_hit() from public, anon, authenticated;
revoke execute on function _rooms_award() from public, anon, authenticated;
revoke execute on function _twist_chaos() from public, anon, authenticated;

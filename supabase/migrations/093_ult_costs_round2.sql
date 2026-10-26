-- Balance round 2 (small, data-light): ultimates that carry the heaviest built-in downsides get cheaper.
--   hacker 16 -> 14  (a traced Hacker is exposed and goes dark for a round)
--   parasite 16 -> 14 (suffers if the host is hit)
--   wildcard 16 -> 12 (the passive chaos already hits the Wildcard as hard as everyone)
create or replace function _ult_cost(p_class player_class) returns integer
language sql immutable set search_path = public as $$
  select case p_class when 'ninja' then 16 when 'oracle' then 10 when 'mastermind' then 12 when 'hero' then 14
    when 'jester' then 12 when 'villain' then 14 when 'hacker' then 14 when 'gambler' then 10
    when 'mimic' then 14 when 'parasite' then 14 when 'thief' then 16 when 'wildcard' then 12 else null end;
$$;

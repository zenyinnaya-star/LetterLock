-- 049: team Momentum (0-100) + automatic Limit Break. Applied as a patch over _battle_resolve/get_battle (see Supabase migration 049_momentum_limit_break).
-- Gains: attack +10, weakness hit +20, crit +25, guard +5, miss -10. At 100 the next resolve fires LIMIT BREAK: 60 + 10*stage + 2*sum(hero power) to every enemy, then resets to 0.
alter table battles add column if not exists momentum int not null default 0;
-- _battle_resolve additions: declare mom/gain/lb; read momentum before ordering units; limit-break block (log t='limit'); mom adjustments on miss/hit/crit/guard; persist momentum after _battle_tally.
-- get_battle additions: 'momentum', b.momentum.

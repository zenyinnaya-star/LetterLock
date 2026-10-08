-- 052: party-size balance (applied as Supabase migration 052_party_scaling_balance).
-- Enemy HP multiplier _hpm(n) = [0.32, 0.82, 1.35, 2.05]; enemy attack multiplier _atkm(n) = [0.30, 0.60, 0.80, 1.05] (applied in _spawn).
-- Momentum gains are scaled by 4/(n+3) so big parties don't chain Limit Breaks.
-- Tuned with a scripted simulation (power 8/11/14, 1-4 players, seeded): average power wins ~50-100% at every size, weak power ~0-50%, strong ~85-100%.
create or replace function _hpm(p_n int) returns numeric language sql immutable as $$ select (array[0.32, 0.82, 1.35, 2.05])[least(4, greatest(1, p_n))]::numeric $$;
create or replace function _atkm(p_n int) returns numeric language sql immutable as $$ select (array[0.30, 0.60, 0.80, 1.05])[least(4, greatest(1, p_n))]::numeric $$;

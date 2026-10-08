-- 053: camp break upgrades (applied as Supabase migration 053_camp_gear_gambler_casino).
-- Gear: battle_units.gear {weapon,armor,trinket: tier 0-2}; camp_gear(token, slot). Weapon +10%/+12% power, Armor +20/+25 max HP (+15 shield per fight at T2), Trinket +3 LCK / +3 LCK +3 SPD.
-- Casino: battles.casino_open, reset every camp; casino_open(token) only for the Gambler pathway; casino_start raises CASINO_LOCKED until opened.
-- Camp lasts 150s; camp_ready only waits for present, non-idle human players.
alter table battles add column if not exists casino_open boolean not null default false;
alter table battle_units add column if not exists gear jsonb not null default '{}'::jsonb;

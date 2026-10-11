-- Applied live via MCP (combo_hero_word_bonuses). battle_submit now applies:
--  hero word mechanics: Shiro short(<=4) +15%, Nero long(>=6) +15%, Kira rare letters +10/+30%, Mira +6%, Prince +8%
--  combo: consecutive valid words +4% per stack (max 5). Column battle_units.combo.
-- Full function body: see live DB (pg_get_functiondef public.battle_submit).
alter table battle_units add column if not exists combo int not null default 0;

-- Only prompts with a word list are in rotation, so every answer is checked against its category.
-- (Live DB: several 014 lists were replaced by tighter hand-curated ones — body parts, kitchen = utensils + everything edible,
--  containers, herbs/spices, emotions, electronics, weapons, games, desserts, reading, space, synonyms, shapes, fabrics, flying things.
--  Vague prompts like "Something round" / "Something at the beach" are switched off.)
update prompts set active = exists (select 1 from prompt_words pw where pw.prompt_id = prompts.id);

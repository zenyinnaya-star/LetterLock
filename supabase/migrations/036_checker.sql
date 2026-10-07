-- Smarter word checker: more forgiving inflections, irregular plurals, and a miss log so category lists can grow from real play.

-- singular/plural both ways + irregulars
create or replace function _fits(p_prompt bigint, p_word text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from prompt_words where prompt_id = p_prompt)
      or exists (select 1 from prompt_words where prompt_id = p_prompt and word = any (array[
           p_word,
           case when p_word ~ 's$' then left(p_word, -1) end,
           case when p_word ~ 'es$' then left(p_word, -2) end,
           case when p_word ~ 'ies$' then left(p_word, -3) || 'y' end,
           case when p_word ~ 'ves$' then left(p_word, -3) || 'f' end,
           case when p_word ~ 'ves$' then left(p_word, -3) || 'fe' end,
           p_word || 's',
           p_word || 'es',
           case when p_word ~ 'y$' then left(p_word, -1) || 'ies' end,
           case p_word when 'mice' then 'mouse' when 'geese' then 'goose' when 'men' then 'man' when 'women' then 'woman'
             when 'children' then 'child' when 'feet' then 'foot' when 'teeth' then 'tooth' when 'oxen' then 'ox'
             when 'people' then 'person' when 'lice' then 'louse' when 'fungi' then 'fungus' when 'cacti' then 'cactus' end
         ]));
$$;
revoke execute on function _fits(bigint, text) from public, anon, authenticated;

create table if not exists fit_misses (
  prompt_id bigint not null references prompts(id) on delete cascade,
  word text not null,
  n int not null default 1,
  last_at timestamptz not null default now(),
  primary key (prompt_id, word)
);
alter table fit_misses enable row level security;

do $$ begin
  if not exists (select 1 from pg_proc where proname = '_answer_036') then
    alter function submit_answer(uuid, text) rename to _answer_036;
  end if;
end $$;
revoke execute on function _answer_036(uuid, text) from public, anon, authenticated;

create or replace function submit_answer(p_token uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_me players; v_pid bigint;
begin
  v_res := _answer_036(p_token, p_word);
  if v_res->>'reason' = 'OFF_TOPIC' then
    v_me := _me(p_token);
    select prompt_id into v_pid from rooms where id = v_me.room_id;
    if v_pid is not null then
      insert into fit_misses (prompt_id, word) values (v_pid, v_res->>'word')
        on conflict (prompt_id, word) do update set n = fit_misses.n + 1, last_at = now();
    end if;
  end if;
  return v_res;
end $$;
revoke execute on function submit_answer(uuid, text) from public;
grant execute on function submit_answer(uuid, text) to anon, authenticated;

-- fill the few gaps found while probing
insert into prompt_words (prompt_id, word)
  select p.id, v.w from (values ('A job or profession','youtuber'),('A job or profession','streamer'),('A sport','parkour'),
    ('A vehicle','tuktuk'),('A vehicle','rickshaw')) v(t, w)
  join prompts p on p.lang = 'en' and p.text = v.t and p.pack = 'classic'
  on conflict do nothing;
insert into words (lang, word) values ('en','youtuber'),('en','streamer'),('en','parkour'),('en','tuktuk'),('en','rickshaw') on conflict do nothing;

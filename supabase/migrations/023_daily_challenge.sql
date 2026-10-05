-- Daily challenge: one shared puzzle per UTC day (same category, same two banned letters for everybody),
-- 60 seconds, as many valid words as you can. No account: a random key kept in the browser marks your attempt.

create table if not exists daily_runs (
  day date not null,
  client_key uuid not null,
  name text not null,
  started_at timestamptz not null default now(),
  finished boolean not null default false,
  score int not null default 0,
  words int not null default 0,
  primary key (day, client_key)
);
create index if not exists daily_runs_board on daily_runs (day, score desc, started_at);
alter table daily_runs enable row level security;

create table if not exists daily_words (
  day date not null,
  client_key uuid not null,
  word text not null,
  points int not null,
  primary key (day, client_key, word)
);
alter table daily_words enable row level security;

create or replace function _daily_day() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'utc')::date; $$;

create or replace function _daily_prompt(p_day date) returns bigint
language sql stable security definer set search_path = public as $$
  select id from prompts where active and lang = 'en' order by md5(id::text || p_day::text) limit 1;
$$;

create or replace function _daily_banned(p_day date) returns text
language sql stable set search_path = public as $$
  select string_agg(l, '' order by l) from (
    select l from unnest(string_to_array('E T A O N R I S L D C H M', ' ')) l order by md5(l || p_day::text) limit 2) x;
$$;
revoke execute on function _daily_prompt(date), _daily_banned(date), _daily_day() from public, anon, authenticated;

create or replace function _daily_board(p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'score', score, 'words', words, 'key', client_key) order by score desc, started_at), '[]'::jsonb)
  from (select * from daily_runs where day = p_day and score > 0 order by score desc, started_at limit 20) b;
$$;
revoke execute on function _daily_board(date) from public, anon, authenticated;

-- Today's puzzle + leaderboard (no side effects). 'key' is only used to flag your own row; keys are never returned.
create or replace function daily_info(p_key uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_day date := _daily_day(); v_run daily_runs; v_board jsonb;
begin
  select * into v_run from daily_runs where day = v_day and client_key = p_key;
  select coalesce(jsonb_agg(e - 'key' || jsonb_build_object('me', (e->>'key')::uuid = p_key)), '[]'::jsonb)
    into v_board from jsonb_array_elements(_daily_board(v_day)) e;
  return jsonb_build_object(
    'day', v_day, 'prompt', (select text from prompts where id = _daily_prompt(v_day)), 'banned', _daily_banned(v_day),
    'seconds', 60, 'now', now(),
    'status', case when v_run.client_key is null then 'new' when v_run.finished or now() > v_run.started_at + interval '62 seconds' then 'done' else 'playing' end,
    'ends_at', v_run.started_at + interval '60 seconds', 'score', coalesce(v_run.score, 0), 'name', v_run.name,
    'words', coalesce((select jsonb_agg(jsonb_build_object('word', word, 'points', points) order by word) from daily_words where day = v_day and client_key = p_key), '[]'::jsonb),
    'board', v_board,
    'rank', case when v_run.score > 0 then (select count(*) + 1 from daily_runs where day = v_day and score > v_run.score) end);
end $$;

create or replace function daily_start(p_key uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_day date := _daily_day(); v_name text := left(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'), 20);
begin
  if p_key is null then raise exception 'BAD_KEY'; end if;
  if (select count(*) from daily_runs where started_at > now() - interval '1 minute') > 400 then raise exception 'BUSY'; end if;
  if trim(v_name) = '' then v_name := 'Player'; end if;
  insert into daily_runs (day, client_key, name) values (v_day, p_key, trim(v_name)) on conflict do nothing;
  return daily_info(p_key);
end $$;

create or replace function daily_answer(p_key uuid, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day date := _daily_day(); v_run daily_runs; v_word text; v_pts int := 0; v_valid boolean := true; v_reason text; v_banned text;
begin
  select * into v_run from daily_runs where day = v_day and client_key = p_key for update;
  if not found then raise exception 'NOT_STARTED'; end if;
  if v_run.finished or now() > v_run.started_at + interval '61 seconds' then raise exception 'TIME_UP'; end if;
  v_word := _norm('en', p_word);
  v_banned := _daily_banned(v_day);
  if v_word = '' then v_valid := false; v_reason := 'BLANK';
  elsif v_word !~ '^[a-z]+$' then v_valid := false; v_reason := 'NOT_LETTERS';
  elsif char_length(v_word) < 3 then v_valid := false; v_reason := 'TOO_SHORT';
  elsif exists (select 1 from daily_words where day = v_day and client_key = p_key and word = v_word) then v_valid := false; v_reason := 'REPEAT';
  elsif not _fits(_daily_prompt(v_day), v_word) then v_valid := false; v_reason := case when _in_dict('en', v_word) then 'OFF_TOPIC' else 'NOT_A_WORD' end;
  elsif not _in_dict('en', v_word) then v_valid := false; v_reason := 'NOT_A_WORD';
  elsif upper(v_word) ~ ('[' || v_banned || ']') then v_valid := false; v_reason := 'BANNED_LETTER';
  end if;
  if v_valid then
    v_pts := char_length(v_word) + 2 * greatest(0, char_length(v_word) - 6);
    insert into daily_words (day, client_key, word, points) values (v_day, p_key, v_word, v_pts);
    update daily_runs set score = score + v_pts, words = words + 1 where day = v_day and client_key = p_key returning * into v_run;
  end if;
  return jsonb_build_object('word', v_word, 'valid', v_valid, 'reason', v_reason, 'points', v_pts, 'score', v_run.score, 'words', v_run.words);
end $$;

create or replace function daily_finish(p_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update daily_runs set finished = true where day = _daily_day() and client_key = p_key;
  return daily_info(p_key);
end $$;

revoke execute on function daily_info(uuid), daily_start(uuid, text), daily_answer(uuid, text), daily_finish(uuid) from public;
grant execute on function daily_info(uuid), daily_start(uuid, text), daily_answer(uuid, text), daily_finish(uuid) to anon, authenticated;

-- Secret classes in classic mode, player avatars (placeholder or uploaded), and no public action rows.

alter table players add column if not exists avatar_url text;

-- avatars bucket: public read, anonymous upload of small images only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 262144, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 262144,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];
drop policy if exists avatars_anon_upload on storage.objects;
create policy avatars_anon_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'avatars' and name ~ '^[0-9a-f-]{36}\.(jpg|png|webp|gif)$');

create or replace function set_avatar(p_token uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players;
begin
  v_me := _me(p_token);
  if p_url is not null and p_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}\.(jpg|png|webp|gif)$' then
    raise exception 'BAD_AVATAR';
  end if;
  update players set avatar_url = p_url where id = v_me.id;
  perform _bump(v_me.room_id, 'avatar', jsonb_build_object('player_id', v_me.id));
end $$;
revoke execute on function set_avatar(uuid, text) from public;
grant execute on function set_avatar(uuid, text) to anon, authenticated;

-- action rows name the attacker: keep them off the public realtime feed (clients read them via get_room_state)
drop policy if exists events_select on events;
create policy events_select on events for select to anon, authenticated using (kind <> 'action');

-- never broadcast a player's class in change notifications
create or replace function _bump(p_room_id uuid, p_kind text, p_payload jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_round int;
begin
  update rooms set state_version = state_version + 1 where id = p_room_id returning round into v_round;
  insert into events (room_id, round, kind, payload)
  values (p_room_id, v_round, p_kind, coalesce(p_payload, '{}'::jsonb) - 'class');
end $$;

create or replace function get_room_state(p_code text, p_token uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me players; v_show_all boolean; v_me_json jsonb := null; v_titles jsonb := null;
  v_cfg jsonb; v_live boolean; v_dark boolean; v_chaos text; v_secs int; v_hide boolean;
begin
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  v_cfg := _defaults() || v_room.settings;
  v_live := v_room.phase not in ('lobby','finished');
  v_chaos := case when v_live and v_room.chaos_round = v_room.round then v_room.chaos end;
  v_secs := _answer_secs(v_cfg, v_room.round, v_room.duel);
  if v_chaos = 'speed' then v_secs := greatest(15, v_secs / 2); end if;
  if p_token is not null then
    select * into v_me from players where token = p_token and room_id = v_room.id;
  end if;
  v_show_all := v_room.phase = 'finished' or coalesce(v_me.eliminated, false);
  -- Classic mode keeps everyone's class secret (you only learn "the Ninja attacked Ava") until the game ends.
  v_hide := v_cfg->>'mode' <> 'duel' and v_room.phase <> 'finished' and not coalesce(v_me.eliminated, false);

  if v_me.id is not null then
    v_dark := coalesce(v_live and not v_me.eliminated and v_me.hacked_round = v_room.round, false);
    v_me_json := jsonb_build_object(
      'id', v_me.id, 'name', v_me.name, 'class', v_me.class, 'strikes', v_me.strikes,
      'points', v_me.points, 'eliminated', v_me.eliminated, 'perk_used', v_me.perk_used,
      'hacked', v_dark,
      'can_trace', v_dark and v_me.hacked_by is not null and v_me.traced_round is distinct from v_room.round
                   and v_room.phase <> 'duel_intro',
      'bet_active', coalesce(v_me.bet_round = v_room.round, false),
      'latched_to', case when v_me.latch_round = v_room.round then v_me.latch_target end,
      'letters', coalesce((select jsonb_agg(
                             case when v_dark then jsonb_build_object('letter', '?', 'revealed', false, 'hidden', true)
                                  else jsonb_build_object('letter', letter::text, 'revealed', revealed) end
                             order by id)
                           from banned_letters where player_id = v_me.id), '[]'::jsonb),
      'cards', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind) order by id)
                         from cards where owner_id = v_me.id and not used), '[]'::jsonb),
      'answer', (select jsonb_build_object('word', word, 'valid', valid, 'reason', reason, 'points', points)
                 from answers where player_id = v_me.id and round = v_room.round),
      'guess', (select jsonb_build_object('target_id', target_id, 'letter', letter::text, 'correct', correct)
                from guesses where guesser_id = v_me.id and round = v_room.round),
      'intel', coalesce((select jsonb_agg(payload order by id) from intel where player_id = v_me.id), '[]'::jsonb),
      'used_words', coalesce((select jsonb_agg(word order by round) from answers
                              where player_id = v_me.id and valid and round < v_room.round), '[]'::jsonb)
    );
  end if;

  if v_room.phase = 'finished' then
    v_titles := jsonb_build_object(
      'champion', v_room.winner_id,
      'einstein', (select a.player_id from answers a where a.room_id = v_room.id and a.valid
                   group by a.player_id order by sum(char_length(a.word)) desc, max(a.points) desc limit 1),
      'villain', (select id from players where room_id = v_room.id and letters_stacked > 0
                  order by letters_stacked desc, points desc limit 1)
    );
  end if;

  return jsonb_build_object(
    'server_time', now(),
    'room', jsonb_build_object(
      'code', v_room.code, 'phase', v_room.phase, 'round', v_room.round, 'duel', v_room.duel,
      'state_version', v_room.state_version, 'host_id', v_room.host_id, 'winner_id', v_room.winner_id,
      'phase_ends_at', v_room.phase_ends_at,
      'answer_seconds', v_secs,
      'chaos', v_chaos,
      'settings', v_cfg),
    'prompt', (select text from prompts where id = v_room.prompt_id),
    'me', v_me_json,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'avatar_url', p.avatar_url,
        'class', case when v_hide and p.id is distinct from v_me.id then null else p.class end,
        'orig_class', case when v_hide and p.id is distinct from v_me.id then null else p.orig_class end,
        'strikes', p.strikes, 'points', p.points,
        'eliminated', p.eliminated, 'perk_used', p.perk_used, 'is_host', p.id = v_room.host_id,
        'connected', p.last_seen > now() - interval '20 seconds',
        'react_ready', p.react_ready,
        'letters_stacked', p.letters_stacked,
        'quit', p.quit,
        'exposed', p.exposed,
        'hacked', coalesce(v_live and not p.eliminated and p.hacked_round = v_room.round, false),
        'betting', coalesce(v_live and p.bet_round = v_room.round, false),
        'latched_to', case when v_live and p.latch_round = v_room.round then p.latch_target end,
        -- the Oracle's price: their word is public the moment they lock it in
        'oracle_word', case when v_room.phase = 'answer' and p.oracle_round = v_room.round
                            then (select a.word from answers a where a.player_id = p.id and a.round = v_room.round) end,
        'letter_count', (select count(*) from banned_letters bl where bl.player_id = p.id),
        'revealed', coalesce((select jsonb_agg(bl.letter::text order by bl.id) from banned_letters bl
                              where bl.player_id = p.id and bl.revealed), '[]'::jsonb),
        'letters', case when v_show_all then coalesce((select jsonb_agg(bl.letter::text order by bl.id)
                              from banned_letters bl where bl.player_id = p.id), '[]'::jsonb) else null end,
        'answered', exists (select 1 from answers a where a.player_id = p.id and a.round = v_room.round),
        'guessed', exists (select 1 from guesses g where g.guesser_id = p.id and g.round = v_room.round)
      ) order by p.joined_at)
      from players p where p.room_id = v_room.id), '[]'::jsonb),
    'hints', coalesce((select jsonb_agg(jsonb_build_object('round', round, 'text', text) order by id)
                       from hints where room_id = v_room.id), '[]'::jsonb),
    'reveal', case when v_room.phase in ('reveal','guess','react','duel_intro','finished') then coalesce((
      select jsonb_agg(jsonb_build_object('player_id', a.player_id, 'word', a.word, 'valid', a.valid,
                                          'reason', a.reason, 'points', a.points) order by a.points desc, a.id)
      from answers a where a.room_id = v_room.id and a.round = v_room.round), '[]'::jsonb) else '[]'::jsonb end,
    'guess_results', case when v_room.phase in ('react','duel_intro','finished') then coalesce((
      select jsonb_agg(jsonb_build_object('guesser_id', g.guesser_id, 'target_id', g.target_id, 'correct', g.correct,
                                          'letter', case when g.correct then g.letter::text end) order by g.id)
      from guesses g where g.room_id = v_room.id and g.round = v_room.round), '[]'::jsonb) else '[]'::jsonb end,
    'pending', case when v_room.phase = 'react' then coalesce((
      select jsonb_agg(jsonb_build_object('id', pa.id, 'target_id', pa.target_id,
                                          'source_id', case when pa.kind = 'hack' and not coalesce(src.exposed, false) then null
                                                            when v_hide and pa.source_id is distinct from v_me.id then null
                                                            else pa.source_id end,
                                          'source_class', case when pa.source_id is not null then coalesce(src.orig_class, src.class) end,
                                          'kind', pa.kind, 'amount', pa.amount, 'status', pa.status,
                                          'absorbed_by', pa.absorbed_by) order by pa.id)
      from pending_additions pa left join players src on src.id = pa.source_id
      where pa.room_id = v_room.id and pa.round = v_room.round), '[]'::jsonb)
      else '[]'::jsonb end,
    'feed', coalesce((select jsonb_agg(
                        case when v_hide and f.payload->>'from' is distinct from v_me.id::text
                                  and f.payload->>'type' not in ('chicken', 'caught', 'trace_miss', 'chaos')
                             then (f.payload - 'from' - 'what') || jsonb_build_object('from', null)
                             else f.payload end
                        || jsonb_build_object('id', f.id, 'round', f.round,
                             'from_class', case when f.payload->>'type' = 'mimic' then 'mimic' else fp.class::text end)
                        order by f.id)
                      from (select * from events where room_id = v_room.id and kind = 'action'
                            order by id desc limit 15) f
                      left join players fp on fp.id::text = f.payload->>'from'), '[]'::jsonb),
    'titles', v_titles
  );
end $$;


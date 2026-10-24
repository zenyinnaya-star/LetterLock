-- Classic/Duel: once every living player has a valid answer locked in, cut the answer clock to ~3s.
create or replace function public.submit_answer(p_token uuid, p_word text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_res jsonb; v_me players; v_pid bigint; v_room rooms; v_missing int;
begin
  v_res := _answer_036(p_token, p_word);
  v_me := _me(p_token);
  if v_res->>'reason' = 'OFF_TOPIC' then
    select prompt_id into v_pid from rooms where id = v_me.room_id;
    if v_pid is not null then
      insert into fit_misses (prompt_id, word) values (v_pid, v_res->>'word')
        on conflict (prompt_id, word) do update set n = fit_misses.n + 1, last_at = now();
    end if;
  end if;
  if (v_res->>'valid')::boolean is true then
    select * into v_room from rooms where id = v_me.room_id for update;
    if v_room.phase = 'answer' and coalesce(_cfg(v_room.id)->>'mode', '') <> 'team'
       and v_room.phase_ends_at is not null and v_room.phase_ends_at > now() + interval '3 seconds' then
      select count(*) into v_missing from players p
        where p.room_id = v_room.id and not p.eliminated
          and not exists (select 1 from answers a where a.player_id = p.id and a.round = v_room.round and a.valid);
      if v_missing = 0 then
        update rooms set phase_ends_at = now() + interval '3 seconds' where id = v_room.id;
        perform _bump(v_room.id, 'answers_in', jsonb_build_object('round', v_room.round));
      end if;
    end if;
  end if;
  return v_res;
end $$;
grant execute on function public.submit_answer(uuid, text) to anon, authenticated;

create index if not exists events_reaction_idx on events(room_id, created_at) where kind = 'reaction';

create or replace function send_reaction(p_token uuid, p_kind text, p_content text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_content text := trim(coalesce(p_content, ''));
begin
  v_me := _me(p_token);
  if p_kind not in ('emoji', 'sticker', 'gif') then raise exception 'BAD_REACTION'; end if;
  if p_kind = 'emoji' and (char_length(v_content) < 1 or char_length(v_content) > 8) then raise exception 'BAD_REACTION'; end if;
  if p_kind = 'sticker' and v_content not in
     ('GG','SKILL ISSUE','COOKED','NO WAY','EZ','RIGGED','CALM DOWN','L','W','BRUH','LET HIM COOK','WHO DID THIS') then
    raise exception 'BAD_REACTION';
  end if;
  if p_kind = 'gif' and (v_content !~ '^https://media[0-9]*\.giphy\.com/[A-Za-z0-9_./?=&-]+$' or char_length(v_content) > 300) then
    raise exception 'BAD_REACTION';
  end if;
  if exists (select 1 from events where room_id = v_me.room_id and kind = 'reaction'
             and payload->>'player_id' = v_me.id::text and created_at > now() - interval '1200 milliseconds') then
    raise exception 'SLOW_DOWN';
  end if;
  insert into events (room_id, kind, payload)
  values (v_me.room_id, 'reaction', jsonb_build_object('player_id', v_me.id, 'type', p_kind, 'content', v_content));
end $$;

revoke execute on function send_reaction(uuid, text, text) from public, anon, authenticated;
grant execute on function send_reaction(uuid, text, text) to anon, authenticated;

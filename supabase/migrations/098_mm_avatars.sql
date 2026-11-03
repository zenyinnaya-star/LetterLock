-- Mastermind: players can show their uploaded profile photo on the cork board.
-- Purely additive: one nullable column and two new functions; no existing function is changed.
alter table mm_players add column if not exists avatar_url text;

create or replace function mm_set_avatar(p_token uuid, p_url text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare me mm_players; u text := nullif(btrim(coalesce(p_url, '')), '');
begin
  me := _mm_player(p_token);
  if u is not null and (length(u) > 500 or u !~ '^https://[^/]+/storage/v1/object/public/avatars/[A-Za-z0-9._-]+$') then raise exception 'BAD_URL'; end if;
  update mm_players set avatar_url = u where id = me.id;
end $$;

create or replace function mm_avatars(p_token uuid) returns table(player_id uuid, avatar_url text)
language plpgsql security definer set search_path to 'public' stable as $$
declare me mm_players;
begin
  me := _mm_player(p_token);
  return query select p.id, p.avatar_url from mm_players p where p.room_id = me.room_id and p.avatar_url is not null;
end $$;

grant execute on function mm_set_avatar(uuid, text) to anon, authenticated;
grant execute on function mm_avatars(uuid) to anon, authenticated;

create or replace function get_room_id(p_code text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from rooms where code = upper(trim(p_code));
$$;
revoke execute on function get_room_id(text) from public, anon, authenticated;
grant execute on function get_room_id(text) to anon, authenticated;

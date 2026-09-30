create table if not exists client_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  room_code text,
  message text not null,
  stack text,
  url text,
  ua text
);
alter table client_errors enable row level security;

create or replace function log_client_error(p_room text, p_message text, p_stack text, p_url text, p_ua text) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- global throttle: at most 60 rows a minute so nobody can flood the table
  if (select count(*) from client_errors where created_at > now() - interval '1 minute') >= 60 then return; end if;
  insert into client_errors (room_code, message, stack, url, ua)
  values (left(p_room, 8), left(coalesce(p_message, ''), 500), left(p_stack, 2000), left(p_url, 300), left(p_ua, 200));
end $$;

revoke execute on function log_client_error(text, text, text, text, text) from public;
grant execute on function log_client_error(text, text, text, text, text) to anon, authenticated;

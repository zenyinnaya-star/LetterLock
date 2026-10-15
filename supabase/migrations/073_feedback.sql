-- Player feedback: anyone can submit a short note; only the owner can read it (no select policy, read via the dashboard).
create table if not exists feedback (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  message text not null,
  contact text,
  room_code text,
  url text,
  ua text
);
alter table feedback enable row level security;

create or replace function submit_feedback(p_message text, p_contact text, p_room text, p_url text, p_ua text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_message, ''))) < 3 then raise exception 'EMPTY'; end if;
  -- global throttle so nobody can flood the table
  if (select count(*) from feedback where created_at > now() - interval '1 minute') >= 20 then raise exception 'BUSY'; end if;
  insert into feedback (message, contact, room_code, url, ua)
  values (left(trim(p_message), 1000), left(nullif(trim(coalesce(p_contact, '')), ''), 120), left(p_room, 8), left(p_url, 300), left(p_ua, 200));
end $$;

revoke execute on function submit_feedback(text, text, text, text, text) from public;
grant execute on function submit_feedback(text, text, text, text, text) to anon, authenticated;

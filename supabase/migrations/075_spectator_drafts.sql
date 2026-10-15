-- Spectator mode: eliminated players can watch other players' in-progress answers.
-- Drafts live in their own table and are only readable through get_drafts(), which
-- refuses anyone who is still alive (so active players can't peek at rivals' words).
create table if not exists spectator_drafts (
  player_id uuid primary key references players(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  body text not null default '',
  updated_at timestamptz not null default now()
);
alter table spectator_drafts enable row level security;

create or replace function set_draft(p_token uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_r rooms;
begin
  select * into v_me from players where token = p_token;
  if not found or v_me.eliminated then return; end if;
  select * into v_r from rooms where id = v_me.room_id;
  if v_r.phase <> 'answer' then return; end if;
  insert into spectator_drafts (player_id, room_id, round, body, updated_at)
    values (v_me.id, v_me.room_id, v_r.round, left(coalesce(p_text, ''), 30), now())
    on conflict (player_id) do update set round = excluded.round, body = excluded.body, updated_at = now();
end $$;

create or replace function get_drafts(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me players; v_r rooms;
begin
  select * into v_me from players where token = p_token;
  if not found or not v_me.eliminated then return '[]'::jsonb; end if;
  select * into v_r from rooms where id = v_me.room_id;
  if v_r.phase <> 'answer' then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('player_id', d.player_id, 'word', d.body))
    from spectator_drafts d join players p on p.id = d.player_id
    where d.room_id = v_me.room_id and d.round = v_r.round and not p.eliminated and d.body <> ''), '[]'::jsonb);
end $$;

revoke execute on function set_draft(uuid, text), get_drafts(uuid) from public;
grant execute on function set_draft(uuid, text), get_drafts(uuid) to anon, authenticated;

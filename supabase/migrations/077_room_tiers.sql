-- Mastery tier of each seated player for the class they are playing in this room (cosmetic flair only).
create or replace function room_tiers(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me players;
begin
  select * into v_me from players where token = p_token;
  if not found then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(p.id::text, _mastery_tier(pc.xp))
                   from players p join profile_classes pc on pc.profile_id = p.profile_id and pc.class = p.class::text
                   where p.room_id = v_me.room_id and p.profile_id is not null), '{}'::jsonb);
end $$;
revoke execute on function room_tiers(uuid) from public;
grant execute on function room_tiers(uuid) to anon, authenticated;

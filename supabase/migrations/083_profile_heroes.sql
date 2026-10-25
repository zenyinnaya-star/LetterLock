-- Client read: a player's hero loadout plus every hero's unlock state, so the class-select screen and profile can render them.
-- Guests (null/unknown secret) get the three starters.
create or replace function profile_heroes(p_secret uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_p profiles;
begin
  if p_secret is not null then select * into v_p from profiles where secret = p_secret; end if;
  return jsonb_build_object(
    'xp', coalesce(v_p.xp, 0),
    'loadout', to_jsonb(_loadout_of(v_p.id)),
    'heroes', (select coalesce(jsonb_agg(jsonb_build_object('class', h.class, 'xp_required', h.xp_required,
                 'open', _hero_open(v_p.id, h.class)) order by h.sort), '[]'::jsonb) from hero_unlocks h));
end $$;
grant execute on function profile_heroes(uuid) to anon, authenticated;

-- internal helpers must not be callable straight from the public API
revoke execute on function public._apply_upgrades(uuid) from public, anon, authenticated;
revoke execute on function public._break_add(uuid, integer) from public, anon, authenticated;
revoke execute on function public._hero_entry(uuid, text) from public, anon, authenticated;
revoke execute on function public._hero_open(uuid, player_class) from public, anon, authenticated;
revoke execute on function public._loadout_of(uuid) from public, anon, authenticated;

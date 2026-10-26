-- profile_restore used to RAISE on a wrong code, which rolled back the _rate_limit hit, so code-guessing was never throttled.
-- It now returns null on a miss. Apply together with the client change (lib/profile.ts restoreProfile checks for null).
create or replace function profile_restore(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_p profiles; v_c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin perform _rate_limit('profile_restore', 30, 600);
  select * into v_p from profiles where code = v_c;
  if not found then return null; end if;
  return jsonb_build_object('secret', v_p.secret, 'code', v_p.code);
end $$;

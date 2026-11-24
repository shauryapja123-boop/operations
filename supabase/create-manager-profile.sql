-- Link an existing Supabase Auth user to a restaurant manager profile.
-- Edit all three values below, then run this script in the Supabase SQL Editor.
do $$
declare
  manager_email text := 'janakpuri@btwgmail.com';
  manager_name text := 'Amit Sharma';
  outlet_code text := 'NOI-018';
  auth_user_id uuid;
  outlet_id uuid;
begin
  select id into auth_user_id
  from auth.users
  where lower(email) = lower(manager_email);

  if auth_user_id is null then
    raise exception 'No Supabase Auth user found for %. Create the user in Authentication > Users first.', manager_email;
  end if;

  select id into outlet_id
  from public.restaurants
  where code = outlet_code and is_active = true;

  if outlet_id is null then
    raise exception 'No active restaurant found with code %. Check public.restaurants and update outlet_code.', outlet_code;
  end if;

  if exists (select 1 from public.profiles where id = auth_user_id) then
    raise exception 'This Auth user already has a profile. Update the existing profile instead of inserting a duplicate.';
  end if;

  insert into public.profiles (id, full_name, email, role, restaurant_id, department)
  values (auth_user_id, manager_name, lower(manager_email), 'restaurant_manager', outlet_id, null);
end $$;

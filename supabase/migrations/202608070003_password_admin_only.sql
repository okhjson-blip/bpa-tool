begin;

-- Administrators now authenticate through the server-only password session.
-- Remove legacy Supabase super-admin profiles so an old user JWT cannot bypass
-- company membership RLS policies.
update public.profiles
set app_role = 'company_user', updated_at = now()
where app_role = 'super_admin';

alter table public.profiles
  drop constraint if exists profiles_app_role_check;

alter table public.profiles
  add constraint profiles_app_role_check
  check (app_role = 'company_user');

create or replace function public.is_super_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

commit;

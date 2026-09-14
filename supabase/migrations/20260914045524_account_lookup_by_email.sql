begin;

-- Auth 사용자는 브라우저마다 바뀔 수 있다. 같은 협력사·이메일의
-- 디렉터리 계정이면 임시 저장 RLS가 계속 허용되어야 한다.
create or replace function public.company_account_id_for(
  target_company_id bigint,
  check_user uuid default auth.uid()
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select account.id
  from public.company_user_accounts account
  where account.company_id = target_company_id
    and (
      account.auth_user_id = check_user
      or account.email = (
        select lower(trim(profile.email))
        from public.profiles profile
        where profile.user_id = check_user
        limit 1
      )
    )
  order by case when account.auth_user_id = check_user then 0 else 1 end
  limit 1;
$$;

comment on function public.company_account_id_for(bigint, uuid) is
  '현재 Auth 사용자 또는 같은 이메일의 협력사 사용자 계정 ID';

commit;

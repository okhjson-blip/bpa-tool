begin;

alter table public.projects
  add column if not exists status_before_company_suspend text,
  add column if not exists suspended_by_company boolean not null default false;

alter table public.tasks
  add column if not exists status_before_company_suspend text,
  add column if not exists suspended_by_company boolean not null default false;

create index if not exists idx_projects_company_status
  on public.projects (company_id, status);

create index if not exists idx_tasks_status
  on public.tasks (status);

create or replace function public.set_company_operational_status(
  p_company_id bigint,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies%rowtype;
  v_project_count integer := 0;
  v_task_count integer := 0;
begin
  if p_status not in ('active', 'suspended') then
    raise exception 'Unsupported company status: %', p_status
      using errcode = '22023';
  end if;

  select *
    into v_company
    from public.companies
   where id = p_company_id
   for update;

  if not found then
    raise exception 'Company % was not found', p_company_id
      using errcode = 'P0002';
  end if;

  if p_status = 'suspended' then
    update public.projects
       set status_before_company_suspend = status,
           suspended_by_company = true,
           status = 'suspended',
           updated_at = now()
     where company_id = p_company_id
       and status <> 'suspended';
    get diagnostics v_project_count = row_count;

    update public.tasks
       set status_before_company_suspend = status,
           suspended_by_company = true,
           status = 'suspended',
           updated_at = now()
     where project_id in (
       select id from public.projects where company_id = p_company_id
     )
       and status <> 'suspended';
    get diagnostics v_task_count = row_count;
  else
    update public.projects
       set status = coalesce(status_before_company_suspend, 'active'),
           status_before_company_suspend = null,
           suspended_by_company = false,
           updated_at = now()
     where company_id = p_company_id
       and suspended_by_company = true;
    get diagnostics v_project_count = row_count;

    update public.tasks
       set status = coalesce(status_before_company_suspend, 'registered'),
           status_before_company_suspend = null,
           suspended_by_company = false,
           updated_at = now()
     where project_id in (
       select id from public.projects where company_id = p_company_id
     )
       and suspended_by_company = true;
    get diagnostics v_task_count = row_count;
  end if;

  update public.companies
     set status = p_status,
         updated_at = now()
   where id = p_company_id
   returning * into v_company;

  return jsonb_build_object(
    'company', to_jsonb(v_company),
    'project_count', v_project_count,
    'task_count', v_task_count
  );
end;
$$;

-- Bring projects and tasks that belong to already suspended companies into
-- the same operational state when this migration is first applied.
do $$
declare
  v_company_id bigint;
begin
  for v_company_id in
    select id from public.companies where status = 'suspended'
  loop
    perform public.set_company_operational_status(v_company_id, 'suspended');
  end loop;
end;
$$;

revoke all on function public.set_company_operational_status(bigint, text) from public;
revoke all on function public.set_company_operational_status(bigint, text) from anon;
revoke all on function public.set_company_operational_status(bigint, text) from authenticated;
grant execute on function public.set_company_operational_status(bigint, text) to service_role;

commit;

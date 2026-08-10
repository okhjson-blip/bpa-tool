begin;

create or replace function public.admin_delete_bpa_task(p_task_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_interview_ids bigint[];
  v_process_count integer;
  v_report_count integer;
  v_orphan_interview_count integer := 0;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception '과제를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select
    coalesce(array_agg(distinct interview_id) filter (where interview_id is not null), '{}'::bigint[]),
    count(*)
  into v_interview_ids, v_process_count
  from public.processes
  where task_id = p_task_id;

  select count(*) into v_report_count
  from public.task_reports
  where task_id = p_task_id;

  delete from public.tasks where id = p_task_id;

  if cardinality(v_interview_ids) > 0 then
    with deleted as (
      delete from public.interviews interview
      where interview.id = any(v_interview_ids)
        and not exists (
          select 1 from public.processes process
          where process.interview_id = interview.id
        )
      returning id
    )
    select count(*) into v_orphan_interview_count from deleted;
  end if;

  return jsonb_build_object(
    'task_id', p_task_id,
    'project_id', v_task.project_id,
    'process_count', v_process_count,
    'report_count', v_report_count,
    'orphan_interview_count', v_orphan_interview_count
  );
end;
$$;

create or replace function public.admin_delete_bpa_project(p_project_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_task_count integer;
  v_process_count integer;
  v_report_count integer;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception '프로젝트를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select count(*) into v_task_count from public.tasks where project_id = p_project_id;
  select count(*) into v_process_count from public.processes where project_id = p_project_id;
  select count(*) into v_report_count from public.task_reports where project_id = p_project_id;

  delete from public.projects where id = p_project_id;

  return jsonb_build_object(
    'project_id', p_project_id,
    'company_id', v_project.company_id,
    'task_count', v_task_count,
    'process_count', v_process_count,
    'report_count', v_report_count
  );
end;
$$;

create or replace function public.admin_delete_bpa_company(p_company_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_project_count integer;
  v_task_count integer;
  v_user_count integer;
  v_report_count integer;
begin
  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception '협력사를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select count(*) into v_project_count from public.projects where company_id = p_company_id;
  select count(*) into v_task_count
  from public.tasks task
  join public.projects project on project.id = task.project_id
  where project.company_id = p_company_id;
  select count(*) into v_user_count from public.company_user_accounts where company_id = p_company_id;
  select count(*) into v_report_count from public.task_reports where company_id = p_company_id;

  delete from public.projects where company_id = p_company_id;
  delete from public.companies where id = p_company_id;

  return jsonb_build_object(
    'company_id', p_company_id,
    'project_count', v_project_count,
    'task_count', v_task_count,
    'user_count', v_user_count,
    'report_count', v_report_count
  );
end;
$$;

revoke all on function public.admin_delete_bpa_task(bigint) from public, anon, authenticated;
revoke all on function public.admin_delete_bpa_project(bigint) from public, anon, authenticated;
revoke all on function public.admin_delete_bpa_company(bigint) from public, anon, authenticated;
grant execute on function public.admin_delete_bpa_task(bigint) to service_role;
grant execute on function public.admin_delete_bpa_project(bigint) to service_role;
grant execute on function public.admin_delete_bpa_company(bigint) to service_role;

commit;

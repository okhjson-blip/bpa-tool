-- L6 도구 구분은 email/document/excel/web/erp/other로 고정하고,
-- other일 때만 선택 입력 도구명을 tool_other에 저장한다.

alter table public.processes
  add column if not exists tool_other text;

update public.processes
set tool_other = left(btrim(tool), 80),
    tool = 'other'
where level = 'L6'
  and tool is not null
  and tool not in ('email', 'document', 'excel', 'web', 'erp', 'other');

update public.processes
set tool_other = null
where tool is distinct from 'other'
   or coalesce(btrim(tool_other), '') = '';

update public.processes
set tool = null,
    tool_other = null
where level is distinct from 'L6';

alter table public.processes
  drop constraint if exists processes_tool_check;
alter table public.processes
  add constraint processes_tool_check
  check (tool is null or tool in ('email', 'document', 'excel', 'web', 'erp', 'other'));

alter table public.processes
  drop constraint if exists processes_tool_other_check;
alter table public.processes
  add constraint processes_tool_other_check
  check (
    (
      tool = 'other'
      and (tool_other is null or char_length(btrim(tool_other)) between 1 and 80)
    )
    or (
      tool is distinct from 'other'
      and tool_other is null
    )
  );

comment on column public.processes.tool is 'L6 도구 구분: email, document, excel, web, erp, other';
comment on column public.processes.tool_other is 'tool=other일 때 선택 입력한 도구명. 미입력 시 null';

create or replace function public.sync_task_processes(
  p_project_id bigint,
  p_task_id bigint,
  p_interview_id bigint,
  p_deleted_ids bigint[],
  p_processes jsonb
)
returns setof public.processes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted bigint[] := coalesce(p_deleted_ids, '{}'::bigint[]);
  v_existing bigint[] := '{}'::bigint[];
  v_saved bigint[] := '{}'::bigint[];
  v_item jsonb;
  v_index integer;
  v_id bigint;
  v_updated_id bigint;
  v_level text;
  v_is_act boolean;
  v_tool text;
  v_tool_other text;
begin
  if not exists (
    select 1 from public.tasks task
    where task.id = p_task_id and task.project_id = p_project_id
  ) then
    raise exception '프로젝트에 속한 과제를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(process.id), '{}'::bigint[])
  into v_existing
  from public.processes process
  where process.project_id = p_project_id
    and process.task_id = p_task_id;

  delete from public.processes process
  where process.project_id = p_project_id
    and process.task_id = p_task_id
    and process.id = any(v_deleted);

  for v_item, v_index in
    select entry.element, (entry.ord - 1)::integer
    from jsonb_array_elements(coalesce(p_processes, '[]'::jsonb))
      with ordinality as entry(element, ord)
  loop
    v_level := coalesce(v_item->>'level', 'L6');
    v_is_act := v_level = 'L6';
    v_id := nullif(v_item->>'id', '')::bigint;

    if v_is_act then
      v_tool := nullif(btrim(coalesce(v_item->>'tool', '')), '');
      v_tool_other := nullif(left(btrim(coalesce(v_item->>'tool_other', '')), 80), '');
      if v_tool is null or v_tool = 'other' or v_tool not in ('email', 'document', 'excel', 'web', 'erp', 'other') then
        if v_tool is not null and v_tool <> 'other' then
          v_tool_other := coalesce(v_tool_other, left(v_tool, 80));
        end if;
        v_tool := 'other';
      else
        v_tool_other := null;
      end if;
    else
      v_tool := null;
      v_tool_other := null;
    end if;

    if v_id is not null and (not (v_id = any(v_existing)) or v_id = any(v_deleted)) then
      v_id := null;
    end if;

    v_updated_id := null;
    if v_id is not null then
      update public.processes process
      set level = v_level,
          name = v_item->>'name',
          description = coalesce(v_item->>'description', ''),
          execution_time = coalesce((v_item->>'execution_time')::integer, 0),
          waiting_time = coalesce((v_item->>'waiting_time')::numeric, 0),
          approval_waiting_time = coalesce((v_item->>'approval_waiting_time')::numeric, 0),
          method = case when v_is_act then coalesce(v_item->>'method', 'manual') else null end,
          tool = v_tool,
          tool_other = v_tool_other,
          sort_order = v_index,
          status = 'confirmed',
          updated_at = now()
      where process.id = v_id
      returning process.id into v_updated_id;
    end if;

    if v_updated_id is null then
      insert into public.processes (
        project_id, task_id, interview_id, level, name, description,
        execution_time, waiting_time, approval_waiting_time,
        method, tool, tool_other, sort_order, status
      ) values (
        p_project_id,
        p_task_id,
        p_interview_id,
        v_level,
        v_item->>'name',
        coalesce(v_item->>'description', ''),
        coalesce((v_item->>'execution_time')::integer, 0),
        coalesce((v_item->>'waiting_time')::numeric, 0),
        coalesce((v_item->>'approval_waiting_time')::numeric, 0),
        case when v_is_act then coalesce(v_item->>'method', 'manual') else null end,
        v_tool,
        v_tool_other,
        v_index,
        'confirmed'
      )
      returning id into v_updated_id;
    end if;

    v_saved := v_saved || v_updated_id;
  end loop;

  update public.tasks task
  set current_step = 3, updated_at = now()
  where task.id = p_task_id;

  return query
    select process.*
    from public.processes process
    where process.id = any(v_saved)
    order by process.sort_order, process.id;
end;
$$;

revoke all on function public.sync_task_processes(bigint, bigint, bigint, bigint[], jsonb) from public, anon;
grant execute on function public.sync_task_processes(bigint, bigint, bigint, bigint[], jsonb) to authenticated, service_role;

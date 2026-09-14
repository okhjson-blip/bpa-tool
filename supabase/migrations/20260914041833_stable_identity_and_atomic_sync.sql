begin;

-- ---------------------------------------------------------------------------
-- 1. 임시 저장 소유자를 브라우저에 종속된 Auth 사용자에서
--    이메일 기준 협력사 사용자 계정(company_user_accounts)으로 이전한다.
--    로그인 방식이 이메일 OTP로 바뀌어도, 다른 기기나 브라우저에서 접속해도
--    같은 이메일이면 직전 임시 저장본을 그대로 이어받는다.
-- ---------------------------------------------------------------------------

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
    and account.auth_user_id = check_user
  limit 1;
$$;

revoke all on function public.company_account_id_for(bigint, uuid) from public, anon;
grant execute on function public.company_account_id_for(bigint, uuid) to authenticated, service_role;

alter table public.panel_drafts
  add column if not exists account_id bigint references public.company_user_accounts(id) on delete cascade;

-- 기존 행은 Auth 사용자 직접 연결을 우선 사용하고, 이미 다른 세션으로 재연결된
-- 디렉터리 계정은 프로필 이메일로 되찾는다.
update public.panel_drafts draft
set account_id = (
  select account.id
  from public.company_user_accounts account
  where account.company_id = draft.company_id
    and (
      account.auth_user_id = draft.user_id
      or account.email = (
        select lower(trim(profile.email))
        from public.profiles profile
        where profile.user_id = draft.user_id
      )
    )
  order by (account.auth_user_id = draft.user_id) desc, account.id
  limit 1
)
where draft.account_id is null;

-- 소유자를 끝내 찾을 수 없는 행은 어떤 사용자도 읽을 수 없으므로 정리한다.
delete from public.panel_drafts where account_id is null;

-- user_id 를 포함한 기존 유니크 제약을 제거한다.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.panel_drafts'::regclass
      and con.contype = 'u'
      and exists (
        select 1
        from pg_attribute att
        where att.attrelid = con.conrelid
          and att.attnum = any(con.conkey)
          and att.attname = 'user_id'
      )
  loop
    execute format('alter table public.panel_drafts drop constraint %I', v_constraint.conname);
  end loop;
end $$;

alter table public.panel_drafts alter column user_id drop not null;

-- 새 유니크 키 기준으로 중복이 생겼다면 최신 저장본만 남긴다.
delete from public.panel_drafts older
using public.panel_drafts newer
where older.company_id = newer.company_id
  and older.account_id = newer.account_id
  and older.panel_key = newer.panel_key
  and older.scope_key = newer.scope_key
  and (newer.saved_at, newer.id) > (older.saved_at, older.id);

alter table public.panel_drafts alter column account_id set not null;

create unique index if not exists panel_drafts_account_scope_key
  on public.panel_drafts (company_id, account_id, panel_key, scope_key);

drop index if exists public.idx_panel_drafts_lookup;

-- Supabase 가 Auth 사용자를 정리해도 임시 저장본이 함께 삭제되지 않도록 한다.
alter table public.panel_drafts drop constraint if exists panel_drafts_user_id_fkey;
alter table public.panel_drafts
  add constraint panel_drafts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

drop policy if exists panel_drafts_select on public.panel_drafts;
create policy panel_drafts_select on public.panel_drafts for select to authenticated
  using (
    account_id = public.company_account_id_for(company_id)
    and public.is_active_company_member(company_id)
  );

drop policy if exists panel_drafts_insert on public.panel_drafts;
create policy panel_drafts_insert on public.panel_drafts for insert to authenticated
  with check (
    account_id = public.company_account_id_for(company_id)
    and public.can_write_company(company_id)
  );

drop policy if exists panel_drafts_update on public.panel_drafts;
create policy panel_drafts_update on public.panel_drafts for update to authenticated
  using (
    account_id = public.company_account_id_for(company_id)
    and public.can_write_company(company_id)
  )
  with check (
    account_id = public.company_account_id_for(company_id)
    and public.can_write_company(company_id)
  );

drop policy if exists panel_drafts_delete on public.panel_drafts;
create policy panel_drafts_delete on public.panel_drafts for delete to authenticated
  using (
    account_id = public.company_account_id_for(company_id)
    and public.can_write_company(company_id)
  );

comment on column public.panel_drafts.account_id is
  '임시 저장 소유자. 이메일 기준 협력사 사용자 계정이라 기기나 세션이 바뀌어도 유지된다.';
comment on column public.panel_drafts.user_id is
  '마지막으로 저장한 Auth 사용자(감사용). 소유자 판정에는 사용하지 않는다.';

-- ---------------------------------------------------------------------------
-- 2. 프로세스 일괄 저장을 단일 트랜잭션으로 처리한다.
--    중간 실패 시 부분 커밋이 남지 않고, 임시 저장본이 들고 있던
--    이미 삭제된 프로세스 ID 때문에 영구히 저장하지 못하는 상태도 사라진다.
-- ---------------------------------------------------------------------------

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

  -- 이미 사라진 ID는 오류 대신 무시한다.
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

    -- 과제에 존재하지 않거나 방금 삭제된 ID는 신규 행으로 되살린다.
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
          tool = case when v_is_act then coalesce(v_item->>'tool', 'other') else null end,
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
        method, tool, sort_order, status
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
        case when v_is_act then coalesce(v_item->>'tool', 'other') else null end,
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

comment on function public.sync_task_processes(bigint, bigint, bigint, bigint[], jsonb) is
  '프로세스 편집 결과를 단일 트랜잭션으로 저장한다. 존재하지 않는 ID는 신규 행으로 처리한다.';

-- ---------------------------------------------------------------------------
-- 3. 전수 조회를 없애기 위한 조회 인덱스
-- ---------------------------------------------------------------------------

create index if not exists idx_bdw_tags_process on public.bdw_tags (process_id);

commit;

begin;

alter table public.interviews
  add column if not exists task_id bigint references public.tasks(id) on delete cascade,
  add column if not exists answers jsonb;

update public.interviews interview
set task_id = linked.task_id
from (
  select interview_id, min(task_id) as task_id
  from public.processes
  where interview_id is not null and task_id is not null
  group by interview_id
) linked
where interview.id = linked.interview_id
  and interview.task_id is null;

create index if not exists idx_interviews_task
  on public.interviews (task_id, created_at desc);

update public.tasks task
set status = 'completed', current_step = 6, updated_at = coalesce(report.saved_at, now())
from public.task_reports report
where report.task_id = task.id
  and task.status <> 'suspended';

update public.tasks task
set status_before_company_suspend = 'completed', current_step = 6, updated_at = coalesce(report.saved_at, now())
from public.task_reports report
where report.task_id = task.id
  and task.status = 'suspended'
  and task.suspended_by_company = true;

comment on column public.interviews.task_id is
  '인터뷰 답변을 재접속 시 과제별로 복원하기 위한 직접 연결';
comment on column public.interviews.answers is
  '화면 질문 순서대로 저장한 구조화 인터뷰 답변 배열';

commit;

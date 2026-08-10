begin;

alter table public.processes
  add column if not exists sort_order integer not null default 0;

with ranked as (
  select id, row_number() over (
    partition by project_id, coalesce(task_id, 0)
    order by created_at, id
  ) - 1 as next_order
  from public.processes
)
update public.processes process
set sort_order = ranked.next_order
from ranked
where process.id = ranked.id;

update public.processes
set method = null, tool = null
where level in ('L4', 'L5');

create index if not exists idx_processes_task_order
  on public.processes (task_id, sort_order, id);

alter table public.ai_analysis
  add column if not exists difficulty text;

update public.ai_analysis
set difficulty = case
  when fit_category = 'A' and ai_possibility >= 4 then 'low'
  when fit_category in ('A', 'C') then 'medium'
  else 'high'
end
where difficulty is null;

alter table public.ai_analysis
  alter column difficulty set default 'medium',
  alter column difficulty set not null,
  drop constraint if exists ai_analysis_difficulty_check,
  add constraint ai_analysis_difficulty_check check (difficulty in ('low', 'medium', 'high'));

comment on column public.processes.sort_order is '프로세스 테이블과 플로우차트 공통 표시 순서';
comment on column public.ai_analysis.difficulty is '비개발자 관점 AI 구현 난이도(low/medium/high)';

commit;

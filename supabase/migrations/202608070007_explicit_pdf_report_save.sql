begin;

alter table public.task_reports
  add column if not exists report_title text,
  add column if not exists report_format text not null default 'pdf',
  add column if not exists report_version smallint not null default 1,
  add column if not exists saved_at timestamptz not null default now();

alter table public.task_reports
  drop constraint if exists task_reports_report_format_check,
  drop constraint if exists task_reports_report_version_check;

alter table public.task_reports
  add constraint task_reports_report_format_check
    check (report_format = 'pdf'),
  add constraint task_reports_report_version_check
    check (report_version > 0);

update public.task_reports
set report_title = coalesce(
  nullif(report_title, ''),
  concat(coalesce(report_data ->> 'task_name', '과제'), ' AX 분석 결과')
)
where report_title is null or report_title = '';

create index if not exists idx_task_reports_saved
  on public.task_reports (company_id, saved_at desc);

comment on table public.task_reports is
  '협력사 사용자가 명시적으로 저장한 과제별 최신 PDF 리포트 스냅샷';
comment on column public.task_reports.report_data is
  'PDF 프리뷰와 관리자 상세 팝업을 동일하게 렌더링하는 구조화 리포트 JSON';

commit;

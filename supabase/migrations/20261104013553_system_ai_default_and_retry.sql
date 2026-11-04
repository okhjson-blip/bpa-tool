begin;

alter table public.system_ai_credentials
  add column if not exists is_default boolean not null default false;

-- 기존 데이터가 있으면 우선순위가 가장 앞선 활성(또는 전체) 행 1건을 기본으로 지정한다.
with ranked as (
  select id
  from public.system_ai_credentials
  order by
    case when status = 'active' then 0 else 1 end,
    priority asc,
    id asc
  limit 1
)
update public.system_ai_credentials c
set is_default = (c.id in (select id from ranked));

create unique index if not exists uniq_system_ai_credentials_default
  on public.system_ai_credentials ((is_default))
  where is_default = true;

commit;

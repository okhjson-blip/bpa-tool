begin;

alter table public.companies
  add column if not exists consulting_year smallint,
  add column if not exists consulting_half text;

alter table public.companies
  drop constraint if exists companies_consulting_year_check,
  drop constraint if exists companies_consulting_half_check;

alter table public.companies
  add constraint companies_consulting_year_check
    check (consulting_year is null or consulting_year between 2000 and 2100),
  add constraint companies_consulting_half_check
    check (consulting_half is null or consulting_half in ('상반기', '하반기'));

-- The same company can participate in a different consulting round.
alter table public.companies
  drop constraint if exists companies_name_key;

create unique index if not exists companies_name_consulting_round_unique
  on public.companies (name, consulting_year, consulting_half)
  where consulting_year is not null and consulting_half is not null;

commit;

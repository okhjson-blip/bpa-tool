begin;

-- GitHub Models 만료에 따라 Groq로 교체한다.
update public.system_ai_credentials
set provider = 'groq',
    status = 'disabled',
    updated_at = now()
where provider = 'github';

update public.companies
set default_ai_provider = 'groq'
where default_ai_provider = 'github';

update public.projects
set ai_engine = 'groq'
where ai_engine = 'github';

alter table public.system_ai_credentials
  drop constraint if exists system_ai_credentials_provider_check;

alter table public.system_ai_credentials
  add constraint system_ai_credentials_provider_check
  check (provider in ('gemini', 'chatgpt', 'claude', 'openrouter', 'groq'));

alter table public.companies
  drop constraint if exists companies_default_ai_provider_check;

alter table public.companies
  add constraint companies_default_ai_provider_check
  check (
    default_ai_provider is null
    or default_ai_provider in ('gemini', 'chatgpt', 'claude', 'openrouter', 'groq')
  );

commit;

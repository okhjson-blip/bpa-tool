import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseSecretKey } from '../backend/src/config/supabaseEnv.js';

const service = createClient(process.env.SUPABASE_URL, resolveSupabaseSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false }
});
const mode = process.argv[2];
const apiBase = process.env.TEST_API_BASE || 'http://localhost:5000/api';

async function api(path, token, method = 'GET', body) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`${method} ${path} (${response.status}): ${data.error || text}`);
  return data;
}

async function removeBrowserFixture(companyId) {
  const memberships = await service.from('company_memberships').select('user_id').eq('company_id', companyId);
  const userIds = (memberships.data || []).map((item) => item.user_id);
  const projects = await service.from('projects').select('id').eq('company_id', companyId);
  if (projects.data?.length) {
    await service.from('projects').delete().in('id', projects.data.map((item) => item.id));
  }
  await service.from('audit_logs').delete().eq('company_id', companyId);
  await service.from('companies').delete().eq('id', companyId);
  for (const userId of userIds) await service.auth.admin.deleteUser(userId);
}

if (mode === 'create') {
  const staleFixtures = await service.from('companies').select('id').like('name', 'BPA 브라우저 검증 %');
  if (staleFixtures.error) throw staleFixtures.error;
  for (const fixture of staleFixtures.data || []) await removeBrowserFixture(fixture.id);

  const runId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const email = `bpa-browser-${runId}@example.com`;
  const companyResult = await service.from('companies')
    .insert({
      name: `BPA 브라우저 검증 ${runId}`,
      consulting_year: 2026,
      consulting_half: '하반기',
      status: 'active'
    })
    .select().single();
  if (companyResult.error) throw companyResult.error;
  const company = companyResult.data;

  const browserClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const signIn = await browserClient.auth.signInAnonymously({
    options: { data: { name: '브라우저 검증 사용자', email, company_id: company.id, auth_mode: 'partner' } }
  });
  if (signIn.error) throw signIn.error;
  const token = signIn.data.session.access_token;
  await api('/auth/complete-profile', token, 'POST', {
    name: '브라우저 검증 사용자', email, company_id: company.id
  });
  const projectResult = await service.from('projects').insert({
    name: '브라우저 검증 프로젝트',
    company_name: company.name,
    company_id: company.id,
    department_name: '디지털혁신',
    description: '업무 프로세스 분석',
    l1_domain: '디지털혁신',
    analysis_goal: '저장 리포트 관리자 조회 검증',
    analysis_period: '2026-08-01 ~ 2026-12-31',
    ai_engine: 'gemini',
    start_date: '2026-08-01',
    end_date: '2026-12-31',
    created_by_user_id: signIn.data.user.id,
    status: 'active',
    participants: [
      { name: '검증 리더', position: '팀장', role: '프로젝트 리더', email: '' },
      { name: '검증 담당자', position: '매니저', role: '프로젝트 담당자', email: '' },
      { name: '검증 컨설턴트', position: '수석', role: '컨설턴트', email: '' }
    ]
  }).select().single();
  if (projectResult.error) throw projectResult.error;
  const taskResult = await service.from('tasks').insert({
    project_id: projectResult.data.id,
    name: '저장 리포트 상세 조회 검증',
    l1: '디지털혁신',
    l2: '업무 프로세스 분석',
    l3: '브라우저 검증 프로젝트',
    l4: '저장 리포트를 조회한다',
    goal: '협력사 생성본을 관리자 팝업에서 단순 조회한다',
    start_date: '2026-08-01',
    end_date: '2026-10-31',
    status: 'registered',
    participants: [
      { name: '과제 리더', position: '팀장', role: '과제 리더', email: '' },
      { name: '과제 담당자', position: '매니저', role: '과제 담당자', email: '' }
    ]
  }).select().single();
  if (taskResult.error) throw taskResult.error;
  const processResult = await service.from('processes').insert({
    project_id: projectResult.data.id,
    task_id: taskResult.data.id,
    level: 'L6',
    name: 'SNS 채널을 관리한다',
    description: '브라우저 플로우차트 보조 문구 검증',
    execution_time: 60,
    waiting_time: 0,
    approval_waiting_time: 0,
    method: 'manual',
    tool: 'web',
    status: 'confirmed'
  }).select().single();
  if (processResult.error) throw processResult.error;
  await api(`/analysis/project/${projectResult.data.id}/report?task_id=${taskResult.data.id}`, token);
  const savedReport = await api(
    `/analysis/project/${projectResult.data.id}/report/save`,
    token,
    'POST',
    { taskId: taskResult.data.id, frequency_unit: 'week', frequency_count: 1 }
  );

  console.log(JSON.stringify({
    companyId: company.id,
    projectId: projectResult.data.id,
    taskId: taskResult.data.id,
    reportCreatedAt: savedReport.report.created_at,
    reportSavedAt: savedReport.saved_at,
    email
  }));
} else if (mode === 'cleanup') {
  const companyId = Number(process.argv[3]);
  if (!Number.isInteger(companyId)) {
    throw new Error('정리할 테스트 식별자가 올바르지 않습니다.');
  }
  const company = await service.from('companies').select('name').eq('id', companyId).maybeSingle();
  const memberships = await service.from('company_memberships').select('user_id').eq('company_id', companyId);
  const userIds = (memberships.data || []).map((item) => item.user_id);
  const profiles = userIds.length
    ? await service.from('profiles').select('user_id,email').in('user_id', userIds)
    : { data: [] };
  if (!company.data?.name?.startsWith('BPA 브라우저 검증 ') ||
      (profiles.data || []).some((profile) => !profile.email?.startsWith('bpa-browser-'))) {
    throw new Error('테스트 데이터가 아니므로 정리를 중단했습니다.');
  }
  await removeBrowserFixture(companyId);
  console.log(JSON.stringify({ ok: true }));
} else {
  throw new Error('create 또는 cleanup 모드를 지정하세요.');
}

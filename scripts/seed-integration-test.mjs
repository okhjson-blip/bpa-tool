import 'dotenv/config';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseSecretKey } from '../backend/src/config/supabaseEnv.js';

const apiBase = process.env.TEST_API_BASE || 'http://localhost:5000/api';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = resolveSupabaseSecretKey();
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

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

async function backfillConsultingRounds() {
  const { data: companies, error } = await service
    .from('companies')
    .select('id,name,consulting_year,consulting_half')
    .order('id');
  if (error) throw error;

  const used = new Set(companies
    .filter((company) => company.consulting_year && company.consulting_half)
    .map((company) => `${company.name}|${company.consulting_year}|${company.consulting_half}`));
  const candidates = [];
  for (let year = 2024; year <= 2030; year += 1) {
    candidates.push([year, '상반기'], [year, '하반기']);
  }

  const updated = [];
  for (const company of companies.filter((item) => !item.consulting_year || !item.consulting_half)) {
    const candidate = candidates.find(([year, half]) => !used.has(`${company.name}|${year}|${half}`));
    if (!candidate) throw new Error(`컨설팅 차수를 배정할 수 없습니다: company_id=${company.id}`);
    const [consultingYear, consultingHalf] = candidate;
    const result = await service.from('companies')
      .update({ consulting_year: consultingYear, consulting_half: consultingHalf })
      .eq('id', company.id)
      .select('id')
      .single();
    if (result.error) throw result.error;
    used.add(`${company.name}|${consultingYear}|${consultingHalf}`);
    updated.push({ company_id: company.id, consulting_year: consultingYear, consulting_half: consultingHalf });
    candidates.push(candidates.shift());
  }
  return updated;
}

async function cleanupIncompleteTestSets() {
  const companiesResult = await service.from('companies')
    .select('id,name')
    .like('name', 'BPA 연동 테스트 %');
  if (companiesResult.error) throw companiesResult.error;
  const projectsResult = await service.from('projects').select('company_id');
  if (projectsResult.error) throw projectsResult.error;
  const companyIdsWithProjects = new Set((projectsResult.data || []).map((project) => Number(project.company_id)));
  const incomplete = (companiesResult.data || [])
    .filter((company) => !companyIdsWithProjects.has(Number(company.id)));

  for (const company of incomplete) {
    const memberships = await service.from('company_memberships')
      .select('user_id')
      .eq('company_id', company.id);
    if (memberships.error) throw memberships.error;
    await service.from('audit_logs').delete().eq('company_id', company.id);
    const deleted = await service.from('companies').delete().eq('id', company.id);
    if (deleted.error) throw deleted.error;
    for (const membership of memberships.data || []) {
      const result = await service.auth.admin.deleteUser(membership.user_id);
      if (result.error) throw result.error;
    }
  }
  return incomplete.length;
}

async function createIntegrationSet(index, runId) {
  const suffix = String(index).padStart(2, '0');
  const companyName = `BPA 연동 테스트 ${runId}-${suffix}`;
  const consultingHalf = index % 2 ? '상반기' : '하반기';
  const companyResult = await service.from('companies').insert({
    name: companyName,
    consulting_year: 2026,
    consulting_half: consultingHalf,
    default_ai_provider: 'gemini',
    status: 'active'
  }).select().single();
  if (companyResult.error) throw companyResult.error;
  const company = companyResult.data;

  const email = `integration-${runId}-${suffix}@example.com`;
  const userName = `연동테스트 사용자 ${suffix}`;
  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signIn = await userClient.auth.signInAnonymously({
    options: { data: { name: userName, email, company_id: company.id, auth_mode: 'partner' } }
  });
  if (signIn.error) throw signIn.error;
  const token = signIn.data.session.access_token;

  await api('/auth/complete-profile', token, 'POST', {
    name: userName,
    email,
    company_id: company.id
  });

  const projectResult = await api('/projects', token, 'POST', {
    name: `연동 테스트 프로젝트 ${suffix}`,
    department_name: `테스트 부서 ${suffix}`,
    business_name: `테스트 업무 ${suffix}`,
    analysis_goal: '앱과 Supabase 데이터 연동 검증',
    start_date: '2026-08-01',
    end_date: '2026-12-31',
    participants: [
      { name: `리더 ${suffix}`, position: '팀장', role: '프로젝트 리더', email: '' },
      { name: `담당자 ${suffix}`, position: '매니저', role: '프로젝트 담당자', email: '' },
      { name: `컨설턴트 ${suffix}`, position: '수석', role: '컨설턴트', email: '' }
    ]
  });
  const project = projectResult.project;

  const taskResult = await api(`/projects/${project.id}/tasks`, token, 'POST', {
    name: `연동 테스트 과제 ${suffix}`,
    l4: `테스트 업무 모듈 ${suffix}`,
    goal: '테스트 데이터의 생성·조회·격리를 확인한다',
    start_date: '2026-08-01',
    end_date: '2026-10-31',
    participants: [
      { name: `과제리더 ${suffix}`, position: '팀장', role: '과제 리더', email: '' },
      { name: `과제담당자 ${suffix}`, position: '매니저', role: '과제 담당자', email: '' }
    ]
  });
  const task = taskResult.task;

  const visibleProjects = await api('/projects', token);
  assert.equal(visibleProjects.some((item) => Number(item.id) === Number(project.id)), true);
  const storedCompany = await service.from('companies').select('id').eq('id', company.id).single();
  const storedProject = await service.from('projects').select('id,company_id').eq('id', project.id).single();
  const storedTask = await service.from('tasks').select('id,project_id').eq('id', task.id).single();
  if (storedCompany.error) throw storedCompany.error;
  if (storedProject.error) throw storedProject.error;
  if (storedTask.error) throw storedTask.error;
  assert.equal(Number(storedProject.data.company_id), Number(company.id));
  assert.equal(Number(storedTask.data.project_id), Number(project.id));

  return {
    company_id: company.id,
    company_name: companyName,
    consulting_round: `2026년 ${consultingHalf}`,
    project_id: project.id,
    project_name: project.name,
    task_id: task.id,
    task_name: task.name,
    user_id: signIn.data.user.id
  };
}

const runId = `${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
const cleanedIncompleteCount = await cleanupIncompleteTestSets();
const backfilled = await backfillConsultingRounds();
const created = [];
for (let index = 1; index <= 5; index += 1) {
  created.push(await createIntegrationSet(index, runId));
}

console.log(JSON.stringify({
  ok: true,
  run_id: runId,
  cleaned_incomplete_count: cleanedIncompleteCount,
  backfilled_count: backfilled.length,
  created_count: created.length,
  backfilled,
  created
}, null, 2));

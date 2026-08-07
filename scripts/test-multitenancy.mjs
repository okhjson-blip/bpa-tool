import 'dotenv/config';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  getCompanyApiKey,
  removeCompanyCredential,
  saveCompanyCredential
} from '../backend/src/services/companyCredentialService.js';

const apiBase = process.env.TEST_API_BASE || 'http://localhost:5000/api';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const realGeminiKey = String(process.env.TEST_GEMINI_API_KEY || '').trim();
const runId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const createdUserIds = [];
const createdCompanyIds = [];
const createdProjectIds = [];

function userClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function api(path, { token, cookie, method = 'GET', body } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { response, data, text };
}

async function createTestUser(label) {
  const email = `bpa-${label}-${runId}@example.com`;
  const client = userClient();
  const { data, error } = await client.auth.signInAnonymously({
    options: { data: { name: `검증 사용자 ${label.toUpperCase()}`, email, auth_mode: 'partner' } }
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  return { user: data.user, email, client, token: data.session.access_token };
}

async function createTestCompany(label) {
  const { data, error } = await service.from('companies')
    .insert({
      name: `BPA 자동검증 ${label} ${runId}`,
      consulting_year: 2026,
      consulting_half: '하반기',
      status: 'active'
    })
    .select().single();
  if (error) throw error;
  createdCompanyIds.push(data.id);
  return data;
}

async function cleanup() {
  if (createdProjectIds.length) {
    await service.from('projects').delete().in('id', createdProjectIds);
  }
  if (createdCompanyIds.length) {
    await service.from('audit_logs').delete().in('company_id', createdCompanyIds);
    await service.from('companies').delete().in('id', createdCompanyIds);
  }
  for (const userId of createdUserIds) {
    await service.auth.admin.deleteUser(userId);
  }
}

async function main() {
  const health = await api('/health');
  assert.equal(health.response.status, 200, `health 실패: ${health.text}`);

  const [companyA, companyB, userA, userB] = await Promise.all([
    createTestCompany('A'),
    createTestCompany('B'),
    createTestUser('a'),
    createTestUser('b')
  ]);

  for (const [user, company, name] of [[userA, companyA, '검증 사용자 A'], [userB, companyB, '검증 사용자 B']]) {
    const completed = await Promise.all([1, 2].map(() => api('/auth/complete-profile', {
      token: user.token,
      method: 'POST',
      body: { name, email: user.email, company_id: company.id }
    })));
    const statuses = completed.map((result) => result.response.status).sort();
    assert.deepEqual(statuses, [200, 409], `중복 가입 요청 처리 실패: ${completed.map((result) => result.text).join(' / ')}`);
    const duplicate = completed.find((result) => result.response.status === 409);
    assert.equal(duplicate.data.code, 'ALREADY_REGISTERED');
    assert.equal(duplicate.data.error, '이미 가입하셨습니다. 시작하기를 클릭하여 로그인하십시오.');
  }

  const dummyKey = `dummy-${crypto.randomBytes(24).toString('base64url')}`;
  await saveCompanyCredential({
    companyId: companyA.id,
    engine: 'gemini',
    apiKey: dummyKey,
    model: 'encryption-roundtrip-test',
    userId: userA.user.id
  });
  const { data: encryptedRow, error: encryptedError } = await service
    .from('company_ai_credentials').select('*')
    .eq('company_id', companyA.id).eq('provider', 'gemini').single();
  if (encryptedError) throw encryptedError;
  assert.notEqual(encryptedRow.encrypted_key, dummyKey);
  assert.equal(JSON.stringify(encryptedRow).includes(dummyKey), false, 'DB 행에 Key 원문이 포함됨');
  assert.equal(await getCompanyApiKey(companyA.id, 'gemini'), dummyKey);
  await removeCompanyCredential(companyA.id, 'gemini');

  const invalidKey = `invalid-${crypto.randomBytes(12).toString('hex')}`;
  const invalid = await api('/connections/gemini', {
    token: userA.token,
    method: 'PUT',
    body: { apiKey: invalidKey }
  });
  assert.notEqual(invalid.response.status, 200, '잘못된 API Key가 성공 처리됨');
  assert.equal(invalid.text.includes(invalidKey), false, '검증 오류 응답에 API Key가 노출됨');

  if (realGeminiKey) {
    const saved = await api('/connections/gemini', {
      token: userA.token,
      method: 'PUT',
      body: { apiKey: realGeminiKey }
    });
    assert.equal(saved.response.status, 200, `실제 Gemini 연결/저장 실패: ${saved.text}`);
    const listed = await api('/connections', { token: userA.token });
    assert.equal(listed.response.status, 200);
    const gemini = listed.data.find((item) => item.engine === 'gemini');
    assert.equal(gemini?.configured, true);
    assert.equal(gemini?.is_default, true);
    assert.equal(JSON.stringify(listed.data).includes('encrypted_key'), false);
    assert.equal(JSON.stringify(listed.data).includes(realGeminiKey), false);
    assert.equal(await getCompanyApiKey(companyA.id, 'gemini'), realGeminiKey);
  } else {
    await service.from('companies').update({ default_ai_provider: 'gemini' }).eq('id', companyA.id);
  }

  const projectBody = {
    name: `격리 검증 프로젝트 ${runId}`,
    department_name: '검증 L1',
    business_name: '검증 L2',
    analysis_goal: '협력사별 RLS 격리 확인',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    participants: [
      { name: '리더', position: '팀장', role: '프로젝트 리더', email: '' },
      { name: '담당', position: '매니저', role: '프로젝트 담당자', email: '' },
      { name: '컨설턴트', position: '수석', role: '컨설턴트', email: '' }
    ]
  };
  const created = await api('/projects', { token: userA.token, method: 'POST', body: projectBody });
  assert.equal(created.response.status, 201, `프로젝트 생성 실패: ${created.text}`);
  createdProjectIds.push(created.data.project.id);

  const listA = await api('/projects', { token: userA.token });
  assert.equal(listA.data.some((item) => item.id === created.data.project.id), true);
  const listB = await api('/projects', { token: userB.token });
  assert.equal(listB.data.some((item) => item.id === created.data.project.id), false);
  const directB = await api(`/projects/${created.data.project.id}`, { token: userB.token });
  assert.equal(directB.response.status, 404);

  const wrongAdmin = await api('/auth/admin-login', {
    method: 'POST',
    body: { password: 'not-the-admin-password' }
  });
  assert.equal(wrongAdmin.response.status, 401);
  assert.equal(wrongAdmin.text.includes('not-the-admin-password'), false);
  const testAdminPassword = process.env.BPA_TEST_ADMIN_PASSWORD;
  if (testAdminPassword) {
    const adminLogin = await api('/auth/admin-login', {
      method: 'POST',
      body: { password: testAdminPassword }
    });
    assert.equal(adminLogin.response.status, 200, `관리자 비밀번호 로그인 실패: ${adminLogin.text}`);
    const adminCookie = String(adminLogin.response.headers.get('set-cookie') || '').split(';')[0];
    assert.equal(adminCookie.startsWith('bpa_admin_session='), true);
    const adminSession = await api('/auth/admin-session', { cookie: adminCookie });
    assert.equal(adminSession.response.status, 200);
    const adminOverview = await api('/admin/overview', { cookie: adminCookie });
    assert.equal(adminOverview.response.status, 200);
    assert.equal(adminOverview.data.some((company) => Number(company.id) === Number(companyA.id)), true);
  }

  const rlsA = await userA.client.from('projects').select('id').eq('id', created.data.project.id);
  const rlsB = await userB.client.from('projects').select('id').eq('id', created.data.project.id);
  if (rlsA.error) throw rlsA.error;
  if (rlsB.error) throw rlsB.error;
  assert.equal(rlsA.data.length, 1);
  assert.equal(rlsB.data.length, 0);

  if (realGeminiKey) {
    const task = await api(`/projects/${created.data.project.id}/tasks`, {
      token: userA.token,
      method: 'POST',
      body: {
        name: `AI 자동검증 과제 ${runId}`,
        l4: '월간 판매실적 보고',
        goal: '반복 집계와 보고서 작성 시간을 단축한다',
        start_date: '2026-08-01',
        end_date: '2026-08-31',
        participants: [
          { name: '과제리더', position: '팀장', role: '과제 리더', email: '' },
          { name: '과제담당', position: '매니저', role: '과제 담당자', email: '' }
        ]
      }
    });
    assert.equal(task.response.status, 201, `과제 생성 실패: ${task.text}`);
    const interview = await api(`/interviews/project/${created.data.project.id}`, {
      token: userA.token,
      method: 'POST',
      body: {
        interview_type: 'text',
        text: '매월 ERP에서 판매 데이터를 내려받는다. 엑셀에서 지역별 매출을 집계한다. 전월 실적과 비교하고 특이사항을 확인한다. 보고서를 작성하여 팀장에게 이메일로 전달한다. 데이터 다운로드 10분, 집계 20분, 비교 15분, 보고서 작성 25분이 걸린다.'
      }
    });
    assert.equal(interview.response.status, 201, `인터뷰 저장 실패: ${interview.text}`);
    const draft = await api(`/interviews/${interview.data.interview.id}/analyze`, {
      token: userA.token,
      method: 'POST',
      body: { projectId: created.data.project.id, taskId: task.data.task.id }
    });
    assert.equal(draft.response.status, 200, `저장 Key 기반 AI Draft 실패: ${draft.text}`);
    assert.equal(draft.data.analysis.processes.some((item) => item.level === 'L6'), true);
    const bdw = await api(`/analysis/project/${created.data.project.id}/bdw/analyze`, {
      token: userA.token,
      method: 'POST',
      body: { taskId: task.data.task.id }
    });
    assert.equal(bdw.response.status, 200, `저장 Key 기반 BDW 실패: ${bdw.text}`);
    const aiFit = await api(`/analysis/project/${created.data.project.id}/ai-fit`, {
      token: userA.token,
      method: 'POST',
      body: { taskId: task.data.task.id }
    });
    assert.equal(aiFit.response.status, 200, `저장 Key 기반 AI FIT 실패: ${aiFit.text}`);
  }

  console.log(JSON.stringify({
    ok: true,
    checks: [
      'health', 'anonymous-free-registration', 'idempotent-free-signup-membership',
      testAdminPassword ? 'supabase-secret-admin-session-and-overview' : 'admin-login-skipped',
      'credential-encryption-roundtrip',
      'invalid-key-rejected-without-secret-leak',
      realGeminiKey ? 'real-gemini-connection-persistence-and-analysis' : 'real-gemini-skipped',
      'project-create', 'api-company-isolation', 'direct-rls-isolation'
    ]
  }));
}

try {
  await main();
} finally {
  await cleanup();
}

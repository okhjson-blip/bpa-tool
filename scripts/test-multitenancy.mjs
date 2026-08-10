import 'dotenv/config';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  getCompanyApiKey,
  removeCompanyCredential,
  saveCompanyCredential
} from '../backend/src/services/companyCredentialService.js';
import { resolveSupabaseSecretKey } from '../backend/src/config/supabaseEnv.js';

const apiBase = process.env.TEST_API_BASE || 'http://localhost:5000/api';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = resolveSupabaseSecretKey();
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

async function assertNoRows(table, column, value, message) {
  const result = await service.from(table).select('id', { count: 'exact', head: true }).eq(column, value);
  if (result.error) throw result.error;
  assert.equal(result.count, 0, message || `${table}.${column}=${value} 데이터가 남아 있습니다.`);
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

    const repeatedLogin = await api('/auth/complete-profile', {
      token: user.token,
      method: 'POST',
      body: { name, email: user.email, company_id: company.id }
    });
    assert.equal(repeatedLogin.response.status, 200, `기존 가입 세션 재로그인 실패: ${repeatedLogin.text}`);
    assert.equal(repeatedLogin.data.existing, true);
  }

  const returningClient = userClient();
  const { data: returningAuth, error: returningAuthError } = await returningClient.auth.signInAnonymously({
    options: { data: { name: '검증 사용자 A', email: userA.email, company_id: companyA.id, auth_mode: 'partner' } }
  });
  if (returningAuthError) throw returningAuthError;
  createdUserIds.push(returningAuth.user.id);
  const returningLogin = await api('/auth/complete-profile', {
    token: returningAuth.session.access_token,
    method: 'POST',
    body: { name: '검증 사용자 A', email: userA.email, company_id: companyA.id }
  });
  assert.equal(returningLogin.response.status, 200, `새 익명 세션의 기존 이메일 로그인 복원 실패: ${returningLogin.text}`);
  const returningMe = await api('/auth/me', { token: returningAuth.session.access_token });
  assert.equal(returningMe.response.status, 200, `복원된 기존 이메일 세션 조회 실패: ${returningMe.text}`);
  assert.ok(returningMe.data.memberships.some((item) =>
    Number(item.company_id) === Number(companyA.id) && item.status === 'active'
  ), '복원된 기존 이메일 세션에 활성 협력사 멤버십이 없습니다.');

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

    const managedUserEmail = `managed-${runId}@example.com`;
    const createdManagedUser = await api('/admin/users', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        company_id: companyA.id,
        name: '관리자 선등록 사용자',
        email: managedUserEmail
      }
    });
    assert.equal(createdManagedUser.response.status, 201, `관리자 사용자 등록 실패: ${createdManagedUser.text}`);
    assert.equal(createdManagedUser.data.user.linked, false);
    const managedUserId = createdManagedUser.data.user.id;

    const listedManagedUsers = await api('/admin/users', { cookie: adminCookie });
    assert.equal(listedManagedUsers.response.status, 200, `관리자 사용자 목록 실패: ${listedManagedUsers.text}`);
    assert.equal(listedManagedUsers.data.some((user) => Number(user.id) === Number(managedUserId)), true);

    const updatedManagedUser = await api(`/admin/users/${managedUserId}`, {
      cookie: adminCookie,
      method: 'PATCH',
      body: {
        company_id: companyA.id,
        name: '수정된 선등록 사용자',
        email: managedUserEmail
      }
    });
    assert.equal(updatedManagedUser.response.status, 200, `관리자 사용자 수정 실패: ${updatedManagedUser.text}`);
    assert.equal(updatedManagedUser.data.user.name, '수정된 선등록 사용자');

    const deletedManagedUser = await api(`/admin/users/${managedUserId}`, {
      cookie: adminCookie,
      method: 'DELETE'
    });
    assert.equal(deletedManagedUser.response.status, 200, `관리자 사용자 삭제 실패: ${deletedManagedUser.text}`);
    const deletedManagedUserRow = await service.from('company_user_accounts')
      .select('id').eq('id', managedUserId).maybeSingle();
    if (deletedManagedUserRow.error) throw deletedManagedUserRow.error;
    assert.equal(deletedManagedUserRow.data, null);

    const { data: cascadeTask, error: cascadeTaskError } = await service.from('tasks').insert({
      project_id: created.data.project.id,
      name: `company-status-cascade-${runId}`,
      l1: projectBody.department_name,
      l2: projectBody.business_name,
      l3: projectBody.name,
      l4: '협력사 상태 연동 검증',
      status: 'registered'
    }).select().single();
    if (cascadeTaskError) throw cascadeTaskError;

    const { data: syncProcess, error: syncProcessError } = await service.from('processes').insert({
      project_id: created.data.project.id,
      task_id: cascadeTask.id,
      level: 'L6',
      name: 'SNS 채널을 관리한다',
      execution_time: 30,
      waiting_time: 0,
      approval_waiting_time: 0,
      method: 'manual',
      tool: 'web',
      status: 'draft'
    }).select().single();
    if (syncProcessError) throw syncProcessError;
    const syncedProcesses = await api('/interviews/processes/sync', {
      token: userA.token,
      method: 'PUT',
      body: {
        processes: [{
          id: syncProcess.id,
          name: syncProcess.name,
          description: '',
          execution_time: 60,
          waiting_time: 0,
          approval_waiting_time: 0,
          method: 'manual',
          tool: 'web'
        }]
      }
    });
    assert.equal(syncedProcesses.response.status, 200, `프로세스 일괄 동기화 실패: ${syncedProcesses.text}`);
    assert.equal(syncedProcesses.data.processes[0].execution_time, 60);
    assert.equal(syncedProcesses.data.processes[0].method, 'manual');
    assert.equal(syncedProcesses.data.processes[0].tool, 'web');

    const generatedReport = await api(`/analysis/project/${created.data.project.id}/report?task_id=${cascadeTask.id}`, {
      token: userA.token
    });
    assert.equal(generatedReport.response.status, 200, `협력사 결과 리포트 프리뷰 생성 실패: ${generatedReport.text}`);
    const beforeSave = await service.from('task_reports').select('id').eq('task_id', cascadeTask.id).maybeSingle();
    if (beforeSave.error) throw beforeSave.error;
    assert.equal(beforeSave.data, null, '명시적 저장 전에 리포트 스냅샷이 생성되었습니다.');

    const savedReportResponse = await api(`/analysis/project/${created.data.project.id}/report/save`, {
      token: userA.token,
      method: 'POST',
      body: { taskId: cascadeTask.id, frequency_unit: 'week', frequency_count: 1 }
    });
    assert.equal(savedReportResponse.response.status, 200, `협력사 결과 리포트 명시적 저장 실패: ${savedReportResponse.text}`);
    const { data: savedReport, error: savedReportError } = await service
      .from('task_reports').select('*').eq('task_id', cascadeTask.id).single();
    if (savedReportError) throw savedReportError;
    assert.equal(savedReport.report_data.task_name, cascadeTask.name);
    assert.equal(savedReport.report_format, 'pdf');
    assert.equal(savedReport.report_title, `${cascadeTask.name} AX 분석 결과`);

    const adminTaskReport = await api(`/admin/tasks/${cascadeTask.id}/report`, { cookie: adminCookie });
    assert.equal(adminTaskReport.response.status, 200, `관리자 저장 리포트 조회 실패: ${adminTaskReport.text}`);
    assert.equal(adminTaskReport.data.task_name, savedReportResponse.data.report.task_name);
    assert.equal(adminTaskReport.data.created_at, savedReportResponse.data.report.created_at);
    assert.equal(adminTaskReport.data.report_saved_at, savedReport.saved_at);

    const reportOverview = await api('/admin/overview', { cookie: adminCookie });
    const reportCompany = reportOverview.data.find((company) => Number(company.id) === Number(companyA.id));
    const reportTask = reportCompany.projects
      .flatMap((project) => project.tasks || [])
      .find((task) => Number(task.id) === Number(cascadeTask.id));
    assert.equal(reportTask.has_report, true);

    const suspended = await api(`/admin/companies/${companyA.id}/status`, {
      cookie: adminCookie,
      method: 'PATCH',
      body: { status: 'suspended' }
    });
    assert.equal(suspended.response.status, 200, `협력사 완료 처리 연동 실패: ${suspended.text}`);
    assert.equal(Number(suspended.data.affected.projects) >= 1, true);
    assert.equal(Number(suspended.data.affected.tasks) >= 1, true);

    const suspendedRows = await Promise.all([
      service.from('projects').select('status').eq('id', created.data.project.id).single(),
      service.from('tasks').select('status').eq('id', cascadeTask.id).single()
    ]);
    suspendedRows.forEach((result) => { if (result.error) throw result.error; });
    assert.equal(suspendedRows[0].data.status, 'suspended');
    assert.equal(suspendedRows[1].data.status, 'suspended');

    const suspendedOverview = await api('/admin/overview', { cookie: adminCookie });
    const suspendedCompany = suspendedOverview.data.find((company) => Number(company.id) === Number(companyA.id));
    assert.equal(suspendedCompany.status, 'suspended');
    assert.equal(Number(suspendedCompany.active_project_count), 0);
    assert.equal(Number(suspendedCompany.active_task_count), 0);

    const activated = await api(`/admin/companies/${companyA.id}/status`, {
      cookie: adminCookie,
      method: 'PATCH',
      body: { status: 'active' }
    });
    assert.equal(activated.response.status, 200, `협력사 활성 복원 실패: ${activated.text}`);

    const restoredRows = await Promise.all([
      service.from('projects').select('status').eq('id', created.data.project.id).single(),
      service.from('tasks').select('status').eq('id', cascadeTask.id).single()
    ]);
    restoredRows.forEach((result) => { if (result.error) throw result.error; });
    assert.equal(restoredRows[0].data.status, 'active');
    assert.equal(restoredRows[1].data.status, 'registered');

    const deleteCompanyFixture = await createTestCompany('ADMIN-DELETE');
    const { data: taskDeleteProject, error: taskDeleteProjectError } = await service.from('projects').insert({
      company_id: deleteCompanyFixture.id,
      company_name: deleteCompanyFixture.name,
      name: `과제 삭제 검증 프로젝트 ${runId}`,
      status: 'active'
    }).select().single();
    if (taskDeleteProjectError) throw taskDeleteProjectError;
    createdProjectIds.push(taskDeleteProject.id);
    const { data: taskDeleteTask, error: taskDeleteTaskError } = await service.from('tasks').insert({
      project_id: taskDeleteProject.id,
      name: `삭제 검증 과제 ${runId}`,
      l1: '검증 L1', l2: '검증 L2', l3: '검증 L3', l4: '검증 L4'
    }).select().single();
    if (taskDeleteTaskError) throw taskDeleteTaskError;
    const { data: taskDeleteInterview, error: taskDeleteInterviewError } = await service.from('interviews').insert({
      project_id: taskDeleteProject.id,
      interview_type: 'text',
      text: '관리자 과제 cascade 삭제 검증'
    }).select().single();
    if (taskDeleteInterviewError) throw taskDeleteInterviewError;
    const { data: taskDeleteProcess, error: taskDeleteProcessError } = await service.from('processes').insert({
      project_id: taskDeleteProject.id,
      task_id: taskDeleteTask.id,
      interview_id: taskDeleteInterview.id,
      level: 'L6',
      name: '삭제할 단위 업무를 확인한다',
      execution_time: 10
    }).select().single();
    if (taskDeleteProcessError) throw taskDeleteProcessError;
    const relatedTaskRows = await Promise.all([
      service.from('bdw_tags').insert({ process_id: taskDeleteProcess.id, bdw_type: 'normal' }),
      service.from('ai_analysis').insert({
        process_id: taskDeleteProcess.id, project_id: taskDeleteProject.id,
        name: taskDeleteProcess.name, ai_possibility: 3, inefficiency: 3,
        fit_category: 'B', estimated_time_savings: 3
      }),
      service.from('to_be_processes').insert({
        original_process_id: taskDeleteProcess.id, project_id: taskDeleteProject.id,
        name: '삭제된 To-Be', ai_applied: true
      }),
      service.from('task_reports').insert({
        company_id: deleteCompanyFixture.id, project_id: taskDeleteProject.id,
        task_id: taskDeleteTask.id, report_data: { task_name: taskDeleteTask.name },
        report_title: `${taskDeleteTask.name} AX 분석 결과`
      })
    ]);
    relatedTaskRows.forEach((result) => { if (result.error) throw result.error; });

    const deletedTask = await api(`/admin/tasks/${taskDeleteTask.id}`, {
      cookie: adminCookie,
      method: 'DELETE'
    });
    assert.equal(deletedTask.response.status, 200, `관리자 과제 cascade 삭제 실패: ${deletedTask.text}`);
    await Promise.all([
      assertNoRows('tasks', 'id', taskDeleteTask.id),
      assertNoRows('processes', 'id', taskDeleteProcess.id),
      assertNoRows('bdw_tags', 'process_id', taskDeleteProcess.id),
      assertNoRows('ai_analysis', 'process_id', taskDeleteProcess.id),
      assertNoRows('to_be_processes', 'original_process_id', taskDeleteProcess.id),
      assertNoRows('task_reports', 'task_id', taskDeleteTask.id),
      assertNoRows('interviews', 'id', taskDeleteInterview.id)
    ]);
    const taskDeleteProjectStillExists = await service.from('projects').select('id').eq('id', taskDeleteProject.id).single();
    if (taskDeleteProjectStillExists.error) throw taskDeleteProjectStillExists.error;

    const { data: projectDeleteProject, error: projectDeleteProjectError } = await service.from('projects').insert({
      company_id: deleteCompanyFixture.id,
      company_name: deleteCompanyFixture.name,
      name: `프로젝트 삭제 검증 ${runId}`,
      status: 'active'
    }).select().single();
    if (projectDeleteProjectError) throw projectDeleteProjectError;
    createdProjectIds.push(projectDeleteProject.id);
    const { data: projectDeleteTask, error: projectDeleteTaskError } = await service.from('tasks').insert({
      project_id: projectDeleteProject.id,
      name: `프로젝트 종속 과제 ${runId}`,
      l1: '검증 L1', l2: '검증 L2', l3: '검증 L3', l4: '검증 L4'
    }).select().single();
    if (projectDeleteTaskError) throw projectDeleteTaskError;
    const { data: projectDeleteProcess, error: projectDeleteProcessError } = await service.from('processes').insert({
      project_id: projectDeleteProject.id,
      task_id: projectDeleteTask.id,
      level: 'L6',
      name: '프로젝트 삭제 대상을 확인한다'
    }).select().single();
    if (projectDeleteProcessError) throw projectDeleteProcessError;
    const projectReportResult = await service.from('task_reports').insert({
      company_id: deleteCompanyFixture.id, project_id: projectDeleteProject.id,
      task_id: projectDeleteTask.id, report_data: { task_name: projectDeleteTask.name },
      report_title: `${projectDeleteTask.name} AX 분석 결과`
    });
    if (projectReportResult.error) throw projectReportResult.error;

    const deletedProject = await api(`/admin/projects/${projectDeleteProject.id}`, {
      cookie: adminCookie,
      method: 'DELETE'
    });
    assert.equal(deletedProject.response.status, 200, `관리자 프로젝트 cascade 삭제 실패: ${deletedProject.text}`);
    await Promise.all([
      assertNoRows('projects', 'id', projectDeleteProject.id),
      assertNoRows('tasks', 'id', projectDeleteTask.id),
      assertNoRows('processes', 'id', projectDeleteProcess.id),
      assertNoRows('task_reports', 'task_id', projectDeleteTask.id)
    ]);

    const companyDeleteFixture = await createTestCompany('COMPANY-DELETE');
    const { data: companyDeleteProject, error: companyDeleteProjectError } = await service.from('projects').insert({
      company_id: companyDeleteFixture.id,
      company_name: companyDeleteFixture.name,
      name: `협력사 삭제 검증 프로젝트 ${runId}`,
      status: 'active'
    }).select().single();
    if (companyDeleteProjectError) throw companyDeleteProjectError;
    createdProjectIds.push(companyDeleteProject.id);
    const { data: companyDeleteTask, error: companyDeleteTaskError } = await service.from('tasks').insert({
      project_id: companyDeleteProject.id,
      name: `협력사 삭제 검증 과제 ${runId}`,
      l1: '검증 L1', l2: '검증 L2', l3: '검증 L3', l4: '검증 L4'
    }).select().single();
    if (companyDeleteTaskError) throw companyDeleteTaskError;
    const { data: companyDeleteAccount, error: companyDeleteAccountError } = await service.from('company_user_accounts').insert({
      company_id: companyDeleteFixture.id,
      name: '삭제 검증 사용자',
      email: `delete-${runId}@example.com`
    }).select().single();
    if (companyDeleteAccountError) throw companyDeleteAccountError;
    await saveCompanyCredential({
      companyId: companyDeleteFixture.id,
      engine: 'gemini',
      apiKey: `delete-${crypto.randomBytes(24).toString('base64url')}`,
      model: 'cascade-delete-test',
      userId: userA.user.id
    });

    const deletedCompany = await api(`/admin/companies/${companyDeleteFixture.id}`, {
      cookie: adminCookie,
      method: 'DELETE'
    });
    assert.equal(deletedCompany.response.status, 200, `관리자 협력사 cascade 삭제 실패: ${deletedCompany.text}`);
    assert.equal(Number(deletedCompany.data.deleted.project_count), 1);
    assert.equal(Number(deletedCompany.data.deleted.task_count), 1);
    await Promise.all([
      assertNoRows('companies', 'id', companyDeleteFixture.id),
      assertNoRows('projects', 'id', companyDeleteProject.id),
      assertNoRows('tasks', 'id', companyDeleteTask.id),
      assertNoRows('company_user_accounts', 'id', companyDeleteAccount.id),
      assertNoRows('company_ai_credentials', 'company_id', companyDeleteFixture.id)
    ]);
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
      'health', 'anonymous-free-registration', 'idempotent-free-signup-membership', 'email-only-session-rebind',
      testAdminPassword ? 'admin-user-crud-report-status-delete-cascade-and-bulk-process-sync' : 'admin-login-skipped',
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

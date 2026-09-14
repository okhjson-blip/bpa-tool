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
import { minutesToClock, parseClockToMinutes } from '../backend/src/utils/timeFormat.js';
import { processToolLabel } from '../backend/src/utils/processTool.js';
import {
  remainingMinutesAfterAutomation,
  normalizeAiFitSavings,
  resolveAiFitSavings,
  toBeExecutionMinutes
} from '../backend/src/utils/aiFitTime.js';
import { TASK_CSV_HEADERS, buildTaskCsvContent } from '../backend/src/services/reportService.js';

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

// 화면 로그인은 익명 세션이지만, API 검증은 안정적인 이메일+비밀번호 계정으로 수행한다.
async function createTestUser(label) {
  const email = `bpa-${label}-${runId}@example.com`;
  const password = `Bpa1!${crypto.randomBytes(16).toString('base64url')}`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `검증 사용자 ${label.toUpperCase()}`, auth_mode: 'partner' }
  });
  if (created.error) throw created.error;
  createdUserIds.push(created.data.user.id);
  const client = userClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: data.user, email, password, client, token: data.session.access_token };
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
  assert.equal(minutesToClock(25), '0h:25s');
  assert.equal(minutesToClock(88), '1h:28s');
  assert.equal(minutesToClock(60), '1h:00s');
  assert.equal(parseClockToMinutes('1h:30s'), 90);
  assert.equal(parseClockToMinutes('12h:30s'), 750);
  assert.equal(parseClockToMinutes('25'), 25);
  assert.equal(processToolLabel('web'), '웹');
  assert.equal(processToolLabel('other'), '기타 도구');
  assert.equal(processToolLabel('other', '카카오워크'), '기타 도구(카카오워크)');
  assert.equal(remainingMinutesAfterAutomation(25, 5), 3);
  assert.equal(remainingMinutesAfterAutomation(200, 5), 20);
  assert.equal(remainingMinutesAfterAutomation(25, 4), 5);
  assert.equal(remainingMinutesAfterAutomation(400, 4), 60);
  assert.equal(remainingMinutesAfterAutomation(20, 3), 9);
  assert.equal(normalizeAiFitSavings(25, 5, 5), 22);
  assert.equal(normalizeAiFitSavings(200, 50, 5), 180);
  assert.equal(normalizeAiFitSavings(25, 24, 5), 24);
  assert.equal(normalizeAiFitSavings(25, 3, 2), 3);
  assert.equal(toBeExecutionMinutes(25, 23), 2);
  assert.equal(resolveAiFitSavings(25, 2, 2, 5), 23);
  assert.equal(resolveAiFitSavings(25, 23, 2, 5), 23);
  assert.equal(resolveAiFitSavings(25, 3, 22, 2), 3);
  const sampleCsv = buildTaskCsvContent({
    task_name: 'CSV 검증 과제',
    task_start_date: '2026-01-01',
    task_end_date: '2026-12-31',
    task_goal: '성과목표',
    project_name: 'CSV 검증 프로젝트',
    hierarchy: { l1: '경영지원', l2: '재무', l3: '정산', l4: '전표' },
    task_participants: [{ name: '홍길동', position: '과장', role: '담당', email: 'a@example.com' }],
    as_is_processes: [{
      name: '판매 데이터를 검토한다', method: 'manual', tool: 'excel', tool_other: null,
      execution_time: 25, waiting_time: 1, approval_waiting_time: 0, bdw_type: 'normal'
    }],
    to_be_processes: [{
      name: '판매 데이터를 검토한다', method: 'ai', tool: 'AI 초안', tool_other: null,
      estimated_execution_time: 5, ai_applied: true, difficulty: 'low'
    }],
    ai_fit_analysis: [{
      name: '판매 데이터를 검토한다', recommended_tech: 'AI 초안', difficulty: 'low',
      ai_possibility: 5, inefficiency: 4, fit_category: 'A', estimated_time_savings: 20
    }],
    bdw_diagnosis: { bottlenecks: 0, delays: 0, wastes: 0 },
    statistics: {
      as_is_total_time: 25, to_be_total_time: 5, time_savings: 20, time_savings_rate: 80,
      automation_rate: 100, automation_difficulty: '하', frequency_unit: 'year',
      frequency_count: 4, annual_frequency: 4, annual_savings_hours: 1.3,
      fte_equivalent: 0.001, estimated_development_cost: 8321500
    }
  });
  assert.equal(sampleCsv.split('\r\n')[0].replace(/^\ufeff/, ''), TASK_CSV_HEADERS.map((header) => `"${header}"`).join(','));
  assert.match(sampleCsv, /"추정 외주개발비"/);
  assert.match(sampleCsv, /경영지원/);
  assert.match(sampleCsv, /병목 0개 · Delay 0개 · Waste 0개/);
  assert.match(sampleCsv.replace(/,/g, ''), /₩8321500/);

  const health = await api('/health');
  assert.equal(health.response.status, 200, `health 실패: ${health.text}`);

  const [companyA, companyB, userA, userB] = await Promise.all([
    createTestCompany('A'),
    createTestCompany('B'),
    createTestUser('a'),
    createTestUser('b')
  ]);

  for (const [user, company, name] of [[userA, companyA, '검증 사용자 A'], [userB, companyB, '검증 사용자 B']]) {
    const unregisteredCheck = await api('/auth/check-registration', {
      token: user.token,
      method: 'POST',
      body: { email: user.email, company_id: company.id }
    });
    assert.equal(unregisteredCheck.response.status, 200, `미등록 사용자 확인 실패: ${unregisteredCheck.text}`);
    assert.equal(unregisteredCheck.data.registered, false, '미등록 사용자가 기존 등록자로 판별됨');

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
    const registeredCheck = await api('/auth/check-registration', {
      token: user.token,
      method: 'POST',
      body: { email: user.email, company_id: company.id }
    });
    assert.equal(registeredCheck.response.status, 200, `기존 등록 사용자 확인 실패: ${registeredCheck.text}`);
    assert.equal(registeredCheck.data.registered, true, '등록 완료 사용자를 미등록자로 판별함');
  }

  // 같은 이메일 비밀번호 세션은 동일한 Auth 사용자로 다시 붙는다.
  const returningClient = userClient();
  const { data: returningAuth, error: returningAuthError } = await returningClient.auth.signInWithPassword({
    email: userA.email,
    password: userA.password
  });
  if (returningAuthError) throw returningAuthError;
  assert.equal(returningAuth.user.id, userA.user.id, '같은 이메일 재접속이 다른 Auth 사용자로 연결됨');
  const returningToken = returningAuth.session.access_token;
  const returningRegistrationCheck = await api('/auth/check-registration', {
    token: returningToken,
    method: 'POST',
    body: { email: userA.email, company_id: companyA.id }
  });
  assert.equal(returningRegistrationCheck.response.status, 200, `재접속 사용자 등록 확인 실패: ${returningRegistrationCheck.text}`);
  assert.equal(returningRegistrationCheck.data.registered, true, '새 세션의 기존 이메일을 등록자로 확인하지 못함');
  const returningLogin = await api('/auth/complete-profile', {
    token: returningToken,
    method: 'POST',
    body: { name: '검증 사용자 A', email: userA.email, company_id: companyA.id }
  });
  assert.equal(returningLogin.response.status, 200, `재접속 세션의 기존 이메일 로그인 복원 실패: ${returningLogin.text}`);
  const returningMe = await api('/auth/me', { token: returningToken });
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

  const draftScope = `project:${created.data.project.id}`;
  const savedPanelDraft = await api('/drafts/project_basic', {
    token: userA.token,
    method: 'PUT',
    body: {
      scope_key: draftScope,
      project_id: created.data.project.id,
      payload: { name: '임시 프로젝트명', analysis_goal: '' }
    }
  });
  assert.equal(savedPanelDraft.response.status, 200, `패널 임시 저장 실패: ${savedPanelDraft.text}`);
  const loadedPanelDraft = await api(`/drafts/project_basic?scope_key=${encodeURIComponent(draftScope)}`, { token: userA.token });
  assert.equal(loadedPanelDraft.response.status, 200, `패널 임시 저장 자동 로딩 실패: ${loadedPanelDraft.text}`);
  assert.equal(loadedPanelDraft.data.payload.name, '임시 프로젝트명');
  // 다른 기기에서 다시 접속한 세션도 직전 임시 저장본을 그대로 이어받아야 한다.
  const rejoinedPanelDraft = await api(`/drafts/project_basic?scope_key=${encodeURIComponent(draftScope)}`, { token: returningToken });
  assert.equal(rejoinedPanelDraft.response.status, 200, `재접속 세션 임시 저장 조회 실패: ${rejoinedPanelDraft.text}`);
  assert.equal(rejoinedPanelDraft.data?.payload?.name, '임시 프로젝트명', '재접속 세션이 직전 임시 저장 내용을 불러오지 못했습니다.');
  // 화면 로그인처럼 Auth 사용자가 바뀌어도 같은 이메일이면 임시 저장을 이어받는다.
  const reboundDevice = await createTestUser('a-rebind');
  const reboundLogin = await api('/auth/complete-profile', {
    token: reboundDevice.token,
    method: 'POST',
    body: { name: '검증 사용자 A', email: userA.email, company_id: companyA.id }
  });
  assert.equal(reboundLogin.response.status, 200, `다른 Auth 사용자 이메일 재연결 실패: ${reboundLogin.text}`);
  const reboundDraft = await api(`/drafts/project_basic?scope_key=${encodeURIComponent(draftScope)}`, { token: reboundDevice.token });
  assert.equal(reboundDraft.response.status, 200, `재연결 세션 임시 저장 조회 실패: ${reboundDraft.text}`);
  assert.equal(reboundDraft.data?.payload?.name, '임시 프로젝트명', 'Auth 사용자가 바뀐 뒤에도 이메일 계정의 임시 저장을 불러오지 못했습니다.');
  const originalAfterRebind = await api(`/drafts/project_basic?scope_key=${encodeURIComponent(draftScope)}`, { token: userA.token });
  assert.equal(originalAfterRebind.response.status, 200, `원래 세션 임시 저장 조회 실패: ${originalAfterRebind.text}`);
  assert.equal(originalAfterRebind.data?.payload?.name, '임시 프로젝트명', '다른 기기 재연결 후 원래 세션이 임시 저장을 잃었습니다.');
  const isolatedPanelDraft = await api(`/drafts/project_basic?scope_key=${encodeURIComponent(draftScope)}`, { token: userB.token });
  assert.equal(isolatedPanelDraft.response.status, 200);
  assert.equal(isolatedPanelDraft.data, null, '다른 협력사 사용자가 임시 저장 내용을 조회함');
  const deletedPanelDraft = await api(`/drafts/project_basic?scope_key=${encodeURIComponent(draftScope)}`, { token: userA.token, method: 'DELETE' });
  assert.equal(deletedPanelDraft.response.status, 200, `패널 임시 저장 정리 실패: ${deletedPanelDraft.text}`);

  const outsideProjectPeriodTask = await api(`/projects/${created.data.project.id}/tasks`, {
    token: userA.token,
    method: 'POST',
    body: {
      name: '기간 초과 검증 과제',
      l4: '기간을 검증한다',
      goal: '프로젝트 기간 밖 과제 차단',
      start_date: '2026-07-31',
      end_date: '2026-09-01',
      participants: [
        { name: '과제 리더', position: '팀장', role: '과제 리더', email: '' },
        { name: '과제 담당자', position: '매니저', role: '과제 담당자', email: '' }
      ]
    }
  });
  assert.equal(outsideProjectPeriodTask.response.status, 400, '상위 프로젝트 기간을 벗어난 과제가 등록됨');

  const taskParticipants = [
    { name: '과제 리더', position: '팀장', role: '과제 리더', email: '' },
    { name: '과제 담당자', position: '매니저', role: '과제 담당자', email: '' }
  ];
  const restorableTask = await api(`/projects/${created.data.project.id}/tasks`, {
    token: userA.token,
    method: 'POST',
    body: {
      name: '복원 검증 과제', l4: '기존 내용을 복원한다', goal: '과제와 인터뷰 재로딩 검증',
      start_date: '2026-08-02', end_date: '2026-08-20', participants: taskParticipants
    }
  });
  assert.equal(restorableTask.response.status, 201, `복원 검증 과제 생성 실패: ${restorableTask.text}`);
  const updatedTask = await api(`/projects/${created.data.project.id}/tasks/${restorableTask.data.task.id}`, {
    token: userA.token,
    method: 'PUT',
    body: {
      name: '수정된 복원 검증 과제', l4: '기존 내용을 다시 불러온다', goal: '수정 후 Supabase 복원 검증',
      start_date: '2026-08-03', end_date: '2026-08-21', participants: taskParticipants
    }
  });
  assert.equal(updatedTask.response.status, 200, `기존 과제 수정 실패: ${updatedTask.text}`);
  assert.equal(updatedTask.data.task.goal, '수정 후 Supabase 복원 검증');

  const answerValues = ['업무 순서를 확인한다', '반복 작업을 확인한다', '승인 대기를 확인한다', '', '고객 불편을 확인한다'];
  const savedInterview = await api(`/interviews/project/${created.data.project.id}`, {
    token: userA.token,
    method: 'POST',
    body: {
      interview_type: 'text', taskId: restorableTask.data.task.id, answers: answerValues,
      text: answerValues.map((answer, index) => `답변 ${index + 1}: ${answer}`).join('\n')
    }
  });
  assert.equal(savedInterview.response.status, 201, `구조화 인터뷰 저장 실패: ${savedInterview.text}`);
  const interviewStep = await service.from('tasks').select('current_step').eq('id', restorableTask.data.task.id).single();
  if (interviewStep.error) throw interviewStep.error;
  assert.equal(interviewStep.data.current_step, 2, '인터뷰 저장 후 현재 단계가 2로 기록되지 않았습니다.');
  const restoredInterview = await api(`/interviews/project/${created.data.project.id}/task/${restorableTask.data.task.id}/latest`, { token: userA.token });
  assert.equal(restoredInterview.response.status, 200, `인터뷰 답변 복원 실패: ${restoredInterview.text}`);
  assert.deepEqual(restoredInterview.data.answers, answerValues);

  const coreProcessSync = await api('/interviews/processes/sync', {
    token: userA.token,
    method: 'PUT',
    body: {
      projectId: created.data.project.id,
      taskId: restorableTask.data.task.id,
      interviewId: savedInterview.data.interview.id,
      deleted_process_ids: [],
      processes: [
        { level: 'L5', name: '데이터 검토', description: '', execution_time: 25, waiting_time: 0, approval_waiting_time: 0, method: 'manual', tool: 'excel' },
        { level: 'L6', name: '판매 데이터를 검토한다', description: '', execution_time: 25, waiting_time: 0, approval_waiting_time: 0, method: 'manual', tool: 'excel' }
      ]
    }
  });
  assert.equal(coreProcessSync.response.status, 200, `프로세스 행 추가·순서 동기화 실패: ${coreProcessSync.text}`);
  assert.equal(coreProcessSync.data.processes[0].sort_order, 0);
  assert.equal(coreProcessSync.data.processes[0].method, null);
  assert.equal(coreProcessSync.data.processes[0].tool, null);
  assert.equal(coreProcessSync.data.processes[1].sort_order, 1);

  const coreL5Id = coreProcessSync.data.processes[0].id;
  const coreL6 = coreProcessSync.data.processes[1];
  const coreProcessDelete = await api('/interviews/processes/sync', {
    token: userA.token,
    method: 'PUT',
    body: {
      projectId: created.data.project.id,
      taskId: restorableTask.data.task.id,
      interviewId: savedInterview.data.interview.id,
      deleted_process_ids: [coreL5Id],
      processes: [{
        id: coreL6.id,
        level: 'L6',
        name: coreL6.name,
        description: '',
        execution_time: 25,
        waiting_time: 0,
        approval_waiting_time: 0,
        method: 'manual',
        tool: 'excel'
      }]
    }
  });
  assert.equal(coreProcessDelete.response.status, 200, `프로세스 행 삭제 동기화 실패: ${coreProcessDelete.text}`);
  assert.equal(coreProcessDelete.data.processes[0].sort_order, 0);
  await assertNoRows('processes', 'id', coreL5Id, '삭제한 L5 프로세스가 남아 있습니다.');
  const processStep = await service.from('tasks').select('current_step').eq('id', restorableTask.data.task.id).single();
  if (processStep.error) throw processStep.error;
  assert.equal(processStep.data.current_step, 3, '프로세스 저장 후 현재 단계가 3으로 기록되지 않았습니다.');

  // 임시 저장본이 이미 삭제된 프로세스 ID를 들고 있어도 저장이 막히면 안 된다.
  const staleProcessSync = await api('/interviews/processes/sync', {
    token: userA.token,
    method: 'PUT',
    body: {
      projectId: created.data.project.id,
      taskId: restorableTask.data.task.id,
      interviewId: savedInterview.data.interview.id,
      deleted_process_ids: [coreL5Id],
      processes: [{
        id: coreL5Id,
        level: 'L6',
        name: '되살아난 단위 업무를 확인한다',
        description: '',
        execution_time: 30,
        waiting_time: 0,
        approval_waiting_time: 0,
        method: 'manual',
        tool: 'excel'
      }, {
        id: coreL6.id,
        level: 'L6',
        name: coreL6.name,
        description: '',
        execution_time: 25,
        waiting_time: 0,
        approval_waiting_time: 0,
        method: 'manual',
        tool: 'excel'
      }]
    }
  });
  assert.equal(staleProcessSync.response.status, 200, `사라진 프로세스 ID 포함 동기화 실패: ${staleProcessSync.text}`);
  assert.equal(staleProcessSync.data.processes.length, 2);
  assert.notEqual(Number(staleProcessSync.data.processes[0].id), Number(coreL5Id), '존재하지 않는 ID가 새 행으로 저장되지 않았습니다.');
  assert.equal(staleProcessSync.data.processes[0].name, '되살아난 단위 업무를 확인한다');
  const restoredStaleId = Number(staleProcessSync.data.processes[0].id);
  const cleanupStaleSync = await api('/interviews/processes/sync', {
    token: userA.token,
    method: 'PUT',
    body: {
      projectId: created.data.project.id,
      taskId: restorableTask.data.task.id,
      interviewId: savedInterview.data.interview.id,
      deleted_process_ids: [restoredStaleId, coreL5Id],
      processes: [{
        id: coreL6.id,
        level: 'L6',
        name: coreL6.name,
        description: '',
        execution_time: 25,
        waiting_time: 0,
        approval_waiting_time: 0,
        method: 'manual',
        tool: 'excel'
      }]
    }
  });
  assert.equal(cleanupStaleSync.response.status, 200, `사라진 삭제 ID 포함 동기화 실패: ${cleanupStaleSync.text}`);
  assert.equal(cleanupStaleSync.data.processes.length, 1);

  const coreReport = await api(`/analysis/project/${created.data.project.id}/report?task_id=${restorableTask.data.task.id}`, { token: userA.token });
  assert.equal(coreReport.response.status, 200, `과제 리포트 생성 실패: ${coreReport.text}`);
  assert.equal(coreReport.data.task_participants.length, 2);
  assert.equal(coreReport.data.as_is_processes[0].method, 'manual');
  assert.equal(coreReport.data.as_is_processes[0].tool, 'excel');
  const csvBeforeSave = await api(`/analysis/project/${created.data.project.id}/report.csv?task_id=${restorableTask.data.task.id}`, { token: userA.token });
  assert.equal(csvBeforeSave.response.status, 200, `과제정보 CSV 생성 실패: ${csvBeforeSave.text}`);
  assert.match(csvBeforeSave.data.raw || '', /^\ufeff?"과제명","시작일","완료일","성과목표","프로젝트명"/);
  assert.match(csvBeforeSave.data.raw || '', /"추정 외주개발비"/);
  assert.match(csvBeforeSave.data.raw || '', /판매 데이터를 검토한다 \[수작업 \| 엑셀 \| 0h:25s\]/);
  const emptyStoredAiFit = await api(`/analysis/project/${created.data.project.id}/ai-fit?task_id=${restorableTask.data.task.id}`, { token: userA.token });
  assert.equal(emptyStoredAiFit.response.status, 200, `저장 AI FIT 조회 실패: ${emptyStoredAiFit.text}`);
  assert.deepEqual(emptyStoredAiFit.data.analysis, []);
  const yearlyReport = await api(`/analysis/project/${created.data.project.id}/report?task_id=${restorableTask.data.task.id}&frequency_unit=year&frequency_count=4`, { token: userA.token });
  assert.equal(yearlyReport.response.status, 200, `연 단위 수행 빈도 리포트 실패: ${yearlyReport.text}`);
  assert.equal(yearlyReport.data.statistics.frequency_unit, 'year');
  assert.equal(yearlyReport.data.statistics.annual_frequency, 4);
  const savedYearlyReport = await api(`/analysis/project/${created.data.project.id}/report/save`, {
    token: userA.token,
    method: 'POST',
    body: { taskId: restorableTask.data.task.id, frequency_unit: 'year', frequency_count: 4 }
  });
  assert.equal(savedYearlyReport.response.status, 200, `연 단위 결과 리포트 저장 실패: ${savedYearlyReport.text}`);
  const coreCsv = await api(`/analysis/project/${created.data.project.id}/report.csv?task_id=${restorableTask.data.task.id}&frequency_unit=year&frequency_count=4`, { token: userA.token });
  assert.equal(coreCsv.response.status, 200, `과제정보 CSV 생성 실패: ${coreCsv.text}`);
  assert.match(coreCsv.data.raw || '', /^\ufeff?"과제명","시작일","완료일","성과목표","프로젝트명"/);
  assert.match(coreCsv.data.raw || '', /연간 4회/);
  assert.match(coreCsv.data.raw || '', /판매 데이터를 검토한다 \[수작업 \| 엑셀 \| 0h:25s\]/);

  // 앞 단계 임시 저장이 이미 지나온 진행 단계를 되돌리면 안 된다.
  const backwardDraft = await api('/drafts/interview_answers', {
    token: userA.token,
    method: 'PUT',
    body: {
      scope_key: `task:${restorableTask.data.task.id}`,
      project_id: created.data.project.id,
      task_id: restorableTask.data.task.id,
      payload: { answers: ['다시 검토 중'] }
    }
  });
  assert.equal(backwardDraft.response.status, 200, `앞 단계 임시 저장 실패: ${backwardDraft.text}`);
  const stepAfterBackwardDraft = await service.from('tasks').select('current_step').eq('id', restorableTask.data.task.id).single();
  if (stepAfterBackwardDraft.error) throw stepAfterBackwardDraft.error;
  assert.equal(stepAfterBackwardDraft.data.current_step, 6, '앞 단계 임시 저장이 진행 단계를 되돌렸습니다.');
  await api(`/drafts/interview_answers?scope_key=${encodeURIComponent(`task:${restorableTask.data.task.id}`)}`, { token: userA.token, method: 'DELETE' });

  const listedCompletedTasks = await api(`/projects/${created.data.project.id}/tasks`, { token: userA.token });
  const listedCompletedTask = listedCompletedTasks.data.find((item) => Number(item.id) === Number(restorableTask.data.task.id));
  assert.equal(listedCompletedTask.status, 'completed');
  assert.equal(listedCompletedTask.current_step, 6);
  assert.equal(listedCompletedTask.has_report, true);

  const listA = await api('/projects', { token: userA.token });
  assert.equal(listA.data.some((item) => item.id === created.data.project.id), true);
  const listB = await api('/projects', { token: userB.token });
  assert.equal(listB.data.some((item) => item.id === created.data.project.id), false);
  const directB = await api(`/projects/${created.data.project.id}`, { token: userB.token });
  assert.equal(directB.response.status, 404);

  const disposableProject = await api('/projects', {
    token: userA.token,
    method: 'POST',
    body: { ...projectBody, name: `삭제 검증 프로젝트 ${runId}` }
  });
  assert.equal(disposableProject.response.status, 201, `삭제 검증 프로젝트 생성 실패: ${disposableProject.text}`);
  createdProjectIds.push(disposableProject.data.project.id);
  const disposableTask = await api(`/projects/${disposableProject.data.project.id}/tasks`, {
    token: userA.token,
    method: 'POST',
    body: {
      name: '연쇄 삭제 검증 과제', l4: '삭제를 검증한다', goal: '프로젝트 삭제 연동 확인',
      start_date: '2026-08-02', end_date: '2026-08-20', participants: taskParticipants
    }
  });
  assert.equal(disposableTask.response.status, 201, `삭제 검증 과제 생성 실패: ${disposableTask.text}`);
  const disposableProcess = await service.from('processes').insert({
    project_id: disposableProject.data.project.id,
    task_id: disposableTask.data.task.id,
    level: 'L6',
    name: '과제 삭제를 검증한다',
    execution_time: 5,
    method: 'manual',
    tool: 'web',
    status: 'confirmed'
  }).select().single();
  if (disposableProcess.error) throw disposableProcess.error;
  const deletedTask = await api(`/projects/${disposableProject.data.project.id}/tasks/${disposableTask.data.task.id}`, {
    token: userA.token,
    method: 'DELETE'
  });
  assert.equal(deletedTask.response.status, 200, `사용자 과제 삭제 실패: ${deletedTask.text}`);
  await Promise.all([
    assertNoRows('tasks', 'id', disposableTask.data.task.id, '삭제한 과제가 남아 있습니다.'),
    assertNoRows('processes', 'id', disposableProcess.data.id, '삭제한 과제의 프로세스가 남아 있습니다.')
  ]);
  const projectAfterTaskDelete = await service.from('projects').select('id').eq('id', disposableProject.data.project.id).maybeSingle();
  if (projectAfterTaskDelete.error) throw projectAfterTaskDelete.error;
  assert.equal(projectAfterTaskDelete.data.id, disposableProject.data.project.id);

  const projectDeleteTask = await api(`/projects/${disposableProject.data.project.id}/tasks`, {
    token: userA.token,
    method: 'POST',
    body: {
      name: '프로젝트 연쇄 삭제 검증 과제', l4: '프로젝트 삭제를 검증한다', goal: '프로젝트 삭제 연동 확인',
      start_date: '2026-08-02', end_date: '2026-08-20', participants: taskParticipants
    }
  });
  assert.equal(projectDeleteTask.response.status, 201, `프로젝트 연쇄 삭제 검증 과제 생성 실패: ${projectDeleteTask.text}`);
  const deletedProject = await api(`/projects/${disposableProject.data.project.id}`, {
    token: userA.token,
    method: 'DELETE'
  });
  assert.equal(deletedProject.response.status, 200, `사용자 프로젝트 삭제 실패: ${deletedProject.text}`);
  const [deletedProjectRow, deletedTaskRow] = await Promise.all([
    service.from('projects').select('id').eq('id', disposableProject.data.project.id).maybeSingle(),
    service.from('tasks').select('id').eq('id', projectDeleteTask.data.task.id).maybeSingle()
  ]);
  if (deletedProjectRow.error) throw deletedProjectRow.error;
  if (deletedTaskRow.error) throw deletedTaskRow.error;
  assert.equal(deletedProjectRow.data, null);
  assert.equal(deletedTaskRow.data, null);

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
        projectId: created.data.project.id,
        taskId: cascadeTask.id,
        interviewId: null,
        deleted_process_ids: [],
        processes: [{
          level: 'L5',
          name: 'SNS 채널 관리 단위',
          description: '',
          execution_time: 60,
          waiting_time: 0,
          approval_waiting_time: 0,
          method: 'manual',
          tool: 'web'
        }, {
          id: syncProcess.id,
          level: 'L6',
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
    assert.equal(syncedProcesses.data.processes[0].level, 'L5');
    assert.equal(syncedProcesses.data.processes[0].method, null);
    assert.equal(syncedProcesses.data.processes[0].tool, null);
    assert.equal(syncedProcesses.data.processes[0].sort_order, 0);
    assert.equal(syncedProcesses.data.processes[1].execution_time, 60);
    assert.equal(syncedProcesses.data.processes[1].method, 'manual');
    assert.equal(syncedProcesses.data.processes[1].tool, 'web');
    assert.equal(syncedProcesses.data.processes[1].sort_order, 1);

    const customToolSync = await api('/interviews/processes/sync', {
      token: userA.token,
      method: 'PUT',
      body: {
        projectId: created.data.project.id,
        taskId: cascadeTask.id,
        interviewId: null,
        deleted_process_ids: [],
        processes: [{
          id: syncedProcesses.data.processes[0].id,
          level: 'L5',
          name: 'SNS 채널 관리 단위',
          description: '',
          execution_time: 60,
          waiting_time: 0,
          approval_waiting_time: 0,
          method: 'manual',
          tool: 'web'
        }, {
          id: syncProcess.id,
          level: 'L6',
          name: syncProcess.name,
          description: '',
          execution_time: 60,
          waiting_time: 0,
          approval_waiting_time: 0,
          method: 'manual',
          tool: 'other',
          tool_other: '  카카오워크  '
        }]
      }
    });
    assert.equal(customToolSync.response.status, 200, `기타 도구 직접 입력 동기화 실패: ${customToolSync.text}`);
    assert.equal(customToolSync.data.processes[1].tool, 'other');
    assert.equal(customToolSync.data.processes[1].tool_other, '카카오워크');

    const customToolCsv = await api(`/analysis/project/${created.data.project.id}/report.csv?task_id=${cascadeTask.id}`, { token: userA.token });
    assert.equal(customToolCsv.response.status, 200, `기타 도구 CSV 생성 실패: ${customToolCsv.text}`);
    assert.match(customToolCsv.data.raw || '', /SNS 채널을 관리한다 \[수작업 \| 기타 도구\(카카오워크\) \| 1h:00s\]/);

    const emptyOtherToolSync = await api('/interviews/processes/sync', {
      token: userA.token,
      method: 'PUT',
      body: {
        projectId: created.data.project.id,
        taskId: cascadeTask.id,
        interviewId: null,
        deleted_process_ids: [],
        processes: [{
          id: syncedProcesses.data.processes[0].id,
          level: 'L5',
          name: 'SNS 채널 관리 단위',
          description: '',
          execution_time: 60,
          waiting_time: 0,
          approval_waiting_time: 0
        }, {
          id: syncProcess.id,
          level: 'L6',
          name: syncProcess.name,
          description: '',
          execution_time: 60,
          waiting_time: 0,
          approval_waiting_time: 0,
          method: 'manual',
          tool: 'other',
          tool_other: ''
        }]
      }
    });
    assert.equal(emptyOtherToolSync.response.status, 200, `기타 도구 미입력 동기화 실패: ${emptyOtherToolSync.text}`);
    assert.equal(emptyOtherToolSync.data.processes[1].tool, 'other');
    assert.equal(emptyOtherToolSync.data.processes[1].tool_other, null);

    const deletedAddedProcess = await api('/interviews/processes/sync', {
      token: userA.token,
      method: 'PUT',
      body: {
        projectId: created.data.project.id,
        taskId: cascadeTask.id,
        interviewId: null,
        deleted_process_ids: [syncedProcesses.data.processes[0].id],
        processes: [{
          id: syncProcess.id,
          level: 'L6',
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
    assert.equal(deletedAddedProcess.response.status, 200, `추가 행 삭제 동기화 실패: ${deletedAddedProcess.text}`);
    assert.equal(deletedAddedProcess.data.processes[0].sort_order, 0);
    await assertNoRows('processes', 'id', syncedProcesses.data.processes[0].id, '삭제한 프로세스 행이 남아 있습니다.');

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
    assert.equal(savedReport.report_data.project_participants.length, 3);
    assert.equal(savedReport.report_data.task_participants.length, 0);
    assert.equal(savedReport.report_format, 'pdf');
    assert.equal(savedReport.report_title, `${cascadeTask.name} AX 분석 결과`);
    const completedTask = await service.from('tasks').select('status,current_step').eq('id', cascadeTask.id).single();
    if (completedTask.error) throw completedTask.error;
    assert.equal(completedTask.data.status, 'completed');
    assert.equal(completedTask.data.current_step, 6);

    const taskCsv = await api(`/analysis/project/${created.data.project.id}/report.csv?task_id=${cascadeTask.id}`, {
      token: userA.token
    });
    assert.equal(taskCsv.response.status, 200, `과제정보 CSV 생성 실패: ${taskCsv.text}`);
    assert.match(taskCsv.data.raw || '', /^\ufeff?"과제명","시작일","완료일","성과목표","프로젝트명"/);
    assert.match(taskCsv.data.raw || '', /"BDW 요약"/);
    assert.match(taskCsv.data.raw || '', /"AI FIT"/);
    assert.match(taskCsv.data.raw || '', /SNS 채널을 관리한다 \[수작업 \| 웹 \| 1h:00s\]/);

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
      'clock-time-format', 'health', 'registration-status-check', 'explicit-profile-membership-registration', 'idempotent-signup-membership', 'email-only-session-rebind', 'anonymous-style-auth-rebind-keeps-drafts',
      testAdminPassword ? 'admin-user-crud-report-status-delete-cascade-and-bulk-process-sync' : 'admin-login-skipped',
      'credential-encryption-roundtrip',
      'invalid-key-rejected-without-secret-leak',
      realGeminiKey ? 'real-gemini-connection-persistence-and-analysis' : 'real-gemini-skipped',
      'project-create-and-cascade-delete', 'partner-task-delete-and-cascade', 'panel-draft-save-load-isolation-delete', 'panel-draft-follows-email-across-devices', 'task-period-boundary', 'task-update-and-interview-restore', 'report-participants-and-completion', 'api-company-isolation', 'direct-rls-isolation',
      'process-add-reorder-delete-l6-fields-task-csv-year-frequency-and-step-restore',
      'stale-process-id-recovered-as-insert', 'draft-save-keeps-current-step-monotonic'
    ]
  }));
}

try {
  await main();
} finally {
  await cleanup();
}

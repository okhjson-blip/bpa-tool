import { getServiceClient, serviceDb } from '../config/database.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function adminUserPayload(account, company) {
  return {
    id: account.id,
    company_id: account.company_id,
    company_name: company?.name || '',
    company_status: company?.status || 'suspended',
    consulting_year: company?.consulting_year || null,
    consulting_half: company?.consulting_half || null,
    name: account.name,
    email: account.email,
    last_access_at: account.last_access_at,
    linked: Boolean(account.auth_user_id),
    created_at: account.created_at,
    updated_at: account.updated_at
  };
}

async function writeAdminUserAudit({ companyId, action, accountId, metadata = {} }) {
  await serviceDb.insert('audit_logs', {
    actor_user_id: null,
    company_id: companyId,
    action,
    target_type: 'company_user_account',
    target_id: String(accountId),
    metadata: { ...metadata, actor: 'password_admin' }
  });
}

export async function getCompanies(_req, res) {
  try {
    const companies = (await serviceDb.select('companies')).sort((left, right) =>
      Number(right.consulting_year || 0) - Number(left.consulting_year || 0) ||
      Number(right.consulting_half === '하반기') - Number(left.consulting_half === '하반기') ||
      left.name.localeCompare(right.name, 'ko')
    );
    res.json(companies);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 목록을 불러올 수 없습니다.' });
  }
}

export async function getCompanyUsers(_req, res) {
  try {
    const [accounts, companies] = await Promise.all([
      serviceDb.select('company_user_accounts'),
      serviceDb.select('companies')
    ]);
    const companyById = new Map(companies.map((company) => [Number(company.id), company]));
    const users = accounts
      .map((account) => adminUserPayload(account, companyById.get(Number(account.company_id))))
      .sort((left, right) =>
        left.company_name.localeCompare(right.company_name, 'ko') ||
        left.name.localeCompare(right.name, 'ko') ||
        left.email.localeCompare(right.email)
      );
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 사용자 목록을 불러올 수 없습니다.' });
  }
}

export async function createCompanyUser(req, res) {
  const companyId = Number(req.body.company_id);
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  try {
    const company = await serviceDb.selectOne('companies', { id: companyId });
    if (!company) return res.status(404).json({ error: '협력사를 찾을 수 없습니다.' });
    const duplicate = await serviceDb.selectOne('company_user_accounts', {
      company_id: companyId,
      email
    });
    if (duplicate) return res.status(409).json({ error: '해당 협력사에 이미 등록된 이메일 주소입니다.' });

    const account = await serviceDb.insert('company_user_accounts', {
      company_id: companyId,
      auth_user_id: null,
      name,
      email,
      last_access_at: null
    });
    await writeAdminUserAudit({
      companyId,
      action: 'company_user_create',
      accountId: account.id,
      metadata: { name, email }
    });
    res.status(201).json({
      message: '협력사 사용자가 등록되었습니다. 해당 이메일로 처음 접속하면 계정이 자동 연결됩니다.',
      user: adminUserPayload(account, company)
    });
  } catch (error) {
    console.error(error);
    if (error?.code === '23505') {
      return res.status(409).json({ error: '해당 협력사에 이미 등록된 이메일 주소입니다.' });
    }
    res.status(500).json({ error: '협력사 사용자를 등록할 수 없습니다.' });
  }
}

export async function updateCompanyUser(req, res) {
  const accountId = Number(req.params.userId);
  const companyId = Number(req.body.company_id);
  const name = String(req.body.name || '').trim();
  const email = normalizeEmail(req.body.email);
  try {
    const [account, company] = await Promise.all([
      serviceDb.selectOne('company_user_accounts', { id: accountId }),
      serviceDb.selectOne('companies', { id: companyId })
    ]);
    if (!account) return res.status(404).json({ error: '협력사 사용자를 찾을 수 없습니다.' });
    if (!company) return res.status(404).json({ error: '협력사를 찾을 수 없습니다.' });

    const duplicate = await serviceDb.selectOne('company_user_accounts', {
      company_id: companyId,
      email
    });
    if (duplicate && Number(duplicate.id) !== accountId) {
      return res.status(409).json({ error: '해당 협력사에 이미 등록된 이메일 주소입니다.' });
    }

    if (account.auth_user_id) {
      const client = getServiceClient();
      const membership = await serviceDb.selectOne('company_memberships', {
        user_id: account.auth_user_id
      });
      if (membership && Number(membership.company_id) !== companyId) {
        await serviceDb.update('company_memberships', membership.id, { company_id: companyId });
      }
      const profileResult = await client.from('profiles').update({
        name,
        email,
        updated_at: new Date().toISOString()
      }).eq('user_id', account.auth_user_id);
      if (profileResult.error) throw profileResult.error;
      const authResult = await client.auth.admin.updateUserById(account.auth_user_id, {
        user_metadata: { name, email, company_id: companyId, auth_mode: 'partner' }
      });
      if (authResult.error) {
        console.error('Supabase Auth 사용자 메타데이터 동기화 실패:', authResult.error.message);
      }
    }

    const updated = await serviceDb.update('company_user_accounts', accountId, {
      company_id: companyId,
      name,
      email
    });
    await writeAdminUserAudit({
      companyId,
      action: 'company_user_update',
      accountId,
      metadata: {
        previous_company_id: account.company_id,
        previous_email: account.email,
        name,
        email
      }
    });
    res.json({
      message: '협력사 사용자 정보가 수정되었습니다.',
      user: adminUserPayload(updated, company)
    });
  } catch (error) {
    console.error(error);
    if (error?.code === '23505') {
      return res.status(409).json({ error: '해당 협력사에 이미 등록된 이메일 주소입니다.' });
    }
    res.status(500).json({ error: '협력사 사용자 정보를 수정할 수 없습니다.' });
  }
}

export async function deleteCompanyUser(req, res) {
  const accountId = Number(req.params.userId);
  try {
    const account = await serviceDb.selectOne('company_user_accounts', { id: accountId });
    if (!account) return res.status(404).json({ error: '협력사 사용자를 찾을 수 없습니다.' });

    if (account.auth_user_id) {
      const result = await getServiceClient().auth.admin.deleteUser(account.auth_user_id);
      if (result.error) throw result.error;
    }
    await serviceDb.delete('company_user_accounts', accountId);
    await writeAdminUserAudit({
      companyId: account.company_id,
      action: 'company_user_delete',
      accountId,
      metadata: { name: account.name, email: account.email, linked: Boolean(account.auth_user_id) }
    });
    res.json({ message: '협력사 사용자가 삭제되었습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 사용자를 삭제할 수 없습니다.' });
  }
}

export async function createCompany(req, res) {
  const name = String(req.body.name || '').trim();
  const consultingYear = Number(req.body.consulting_year);
  const consultingHalf = String(req.body.consulting_half || '').trim();
  try {
    const existing = await serviceDb.selectOne('companies', {
      name,
      consulting_year: consultingYear,
      consulting_half: consultingHalf
    });
    if (existing) return res.status(409).json({ error: '같은 컨설팅 차수에 이미 등록된 협력사입니다.' });
    const company = await serviceDb.insert('companies', {
      name,
      consulting_year: consultingYear,
      consulting_half: consultingHalf,
      status: 'active',
      created_by: null
    });
    await serviceDb.insert('audit_logs', {
      actor_user_id: null,
      company_id: company.id,
      action: 'company_create',
      target_type: 'company',
      target_id: String(company.id),
      metadata: {
        name,
        consulting_year: consultingYear,
        consulting_half: consultingHalf,
        actor: 'password_admin'
      }
    });
    res.status(201).json({ message: '협력사가 등록되었습니다.', company });
  } catch (error) {
    console.error(error);
    if (error?.code === '23505') {
      return res.status(409).json({ error: '같은 컨설팅 차수에 이미 등록된 협력사입니다.' });
    }
    res.status(500).json({ error: '협력사 등록 중 오류가 발생했습니다.' });
  }
}

async function runAdminDeleteRpc(functionName, payload) {
  const { data, error } = await getServiceClient().rpc(functionName, payload);
  if (error) throw error;
  return data || {};
}

export async function deleteCompany(req, res) {
  const companyId = Number(req.params.companyId);
  try {
    const company = await serviceDb.selectOne('companies', { id: companyId });
    if (!company) return res.status(404).json({ error: '협력사를 찾을 수 없습니다.' });

    const deleted = await runAdminDeleteRpc('admin_delete_bpa_company', {
      p_company_id: companyId
    });
    await serviceDb.insert('audit_logs', {
      actor_user_id: null,
      company_id: null,
      action: 'company_delete',
      target_type: 'company',
      target_id: String(companyId),
      metadata: {
        actor: 'password_admin',
        company_name: company.name,
        consulting_year: company.consulting_year,
        consulting_half: company.consulting_half,
        deleted_projects: Number(deleted.project_count || 0),
        deleted_tasks: Number(deleted.task_count || 0),
        deleted_users: Number(deleted.user_count || 0)
      }
    });
    res.json({
      message: `${company.name} 협력사와 프로젝트 ${Number(deleted.project_count || 0)}건, 과제 ${Number(deleted.task_count || 0)}건이 삭제되었습니다.`,
      deleted
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사와 소속 데이터를 삭제할 수 없습니다.' });
  }
}

export async function deleteProject(req, res) {
  const projectId = Number(req.params.projectId);
  try {
    const project = await serviceDb.selectOne('projects', { id: projectId });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const deleted = await runAdminDeleteRpc('admin_delete_bpa_project', {
      p_project_id: projectId
    });
    await serviceDb.insert('audit_logs', {
      actor_user_id: null,
      company_id: project.company_id,
      action: 'project_delete',
      target_type: 'project',
      target_id: String(projectId),
      metadata: {
        actor: 'password_admin',
        project_name: project.name,
        deleted_tasks: Number(deleted.task_count || 0)
      }
    });
    res.json({
      message: `${project.name} 프로젝트와 과제 ${Number(deleted.task_count || 0)}건이 삭제되었습니다.`,
      deleted
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로젝트와 소속 과제를 삭제할 수 없습니다.' });
  }
}

export async function deleteTask(req, res) {
  const taskId = Number(req.params.taskId);
  try {
    const task = await serviceDb.selectOne('tasks', { id: taskId });
    if (!task) return res.status(404).json({ error: '과제를 찾을 수 없습니다.' });
    const project = await serviceDb.selectOne('projects', { id: task.project_id });
    if (!project) return res.status(404).json({ error: '과제의 프로젝트를 찾을 수 없습니다.' });

    const deleted = await runAdminDeleteRpc('admin_delete_bpa_task', {
      p_task_id: taskId
    });
    await serviceDb.insert('audit_logs', {
      actor_user_id: null,
      company_id: project.company_id,
      action: 'task_delete',
      target_type: 'task',
      target_id: String(taskId),
      metadata: {
        actor: 'password_admin',
        project_id: project.id,
        project_name: project.name,
        task_name: task.name || task.l4,
        deleted_processes: Number(deleted.process_count || 0)
      }
    });
    res.json({
      message: `${task.name || task.l4} 과제와 분석 데이터가 삭제되었습니다.`,
      deleted
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제와 분석 데이터를 삭제할 수 없습니다.' });
  }
}

export async function getOverview(_req, res) {
  try {
    const [companies, projects, tasks, taskReports] = await Promise.all([
      serviceDb.select('companies'),
      serviceDb.select('projects'),
      serviceDb.select('tasks'),
      serviceDb.select('task_reports')
    ]);
    const reportByTaskId = new Map(
      taskReports.map((report) => [Number(report.task_id), report])
    );
    const tasksByProject = new Map();
    tasks.forEach((task) => {
      const list = tasksByProject.get(Number(task.project_id)) || [];
      const savedReport = reportByTaskId.get(Number(task.id));
      list.push({
        ...task,
        has_report: Boolean(savedReport),
        report_generated_at: savedReport?.generated_at || null,
        report_saved_at: savedReport?.saved_at || null
      });
      tasksByProject.set(Number(task.project_id), list);
    });
    const projectsByCompany = new Map();
    projects.forEach((project) => {
      const list = projectsByCompany.get(Number(project.company_id)) || [];
      list.push({ ...project, tasks: tasksByProject.get(Number(project.id)) || [] });
      projectsByCompany.set(Number(project.company_id), list);
    });
    res.json(companies.map((company) => {
      const companyProjects = projectsByCompany.get(Number(company.id)) || [];
      const companyIsActive = company.status === 'active';
      return {
        ...company,
        project_count: companyProjects.length,
        active_project_count: companyIsActive
          ? companyProjects.filter((project) => project.status !== 'suspended').length
          : 0,
        task_count: companyProjects.reduce((sum, project) => sum + project.tasks.length, 0),
        active_task_count: companyIsActive
          ? companyProjects.reduce(
            (sum, project) => sum + project.tasks.filter((task) => !['suspended', 'completed'].includes(task.status)).length,
            0
          )
          : 0,
        projects: companyProjects
      };
    }).sort((a, b) =>
      Number(b.consulting_year || 0) - Number(a.consulting_year || 0) ||
      Number(b.consulting_half === '하반기') - Number(a.consulting_half === '하반기') ||
      a.name.localeCompare(b.name, 'ko')
    ));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '관리자 현황을 불러올 수 없습니다.' });
  }
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportTaskCsv(req, res) {
  const consultingYear = Number(req.query.consulting_year);
  const consultingHalf = String(req.query.consulting_half || '').trim();
  try {
    const [companies, projects, tasks] = await Promise.all([
      serviceDb.select('companies'),
      serviceDb.select('projects'),
      serviceDb.select('tasks')
    ]);
    const selectedCompanies = companies.filter((company) =>
      Number(company.consulting_year) === consultingYear &&
      company.consulting_half === consultingHalf
    );
    const companyById = new Map(selectedCompanies.map((company) => [Number(company.id), company]));
    const projectById = new Map(projects.map((project) => [Number(project.id), project]));
    const rows = tasks.map((task) => {
      const project = projectById.get(Number(task.project_id));
      const company = project ? companyById.get(Number(project.company_id)) : null;
      if (!project || !company) return null;
      return [company?.name || '', project?.name || '', task.name || task.l4 || ''];
    }).filter(Boolean).sort((left, right) =>
      left[0].localeCompare(right[0], 'ko') ||
      left[1].localeCompare(right[1], 'ko') ||
      left[2].localeCompare(right[2], 'ko')
    );
    const content = `\uFEFF${[
      ['협력사명', '프로젝트명', '과제명'],
      ...rows
    ].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bpa-admin-tasks.csv"; filename*=UTF-8''${encodeURIComponent(`${consultingYear}년_${consultingHalf}_협력사_프로젝트_과제`)}.csv`
    );
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '관리자 CSV 생성 중 오류가 발생했습니다.' });
  }
}

export async function getTaskReport(req, res) {
  const taskId = Number(req.params.taskId);
  try {
    const task = await serviceDb.selectOne('tasks', { id: taskId });
    if (!task) return res.status(404).json({ error: '과제를 찾을 수 없습니다.' });
    const savedReport = await serviceDb.selectOne('task_reports', { task_id: taskId });
    if (!savedReport) {
      return res.status(404).json({
        code: 'REPORT_NOT_GENERATED',
        error: '협력사 모드에서 생성된 결과 리포트가 없습니다.'
      });
    }
    const company = await serviceDb.selectOne('companies', { id: savedReport.company_id });
    res.json({
      ...savedReport.report_data,
      company_name: company?.name || '',
      report_title: savedReport.report_title,
      report_generated_at: savedReport.generated_at,
      report_saved_at: savedReport.saved_at
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || '과제 상세 리포트를 불러올 수 없습니다.' });
  }
}

export async function updateCompanyStatus(req, res) {
  const companyId = Number(req.params.companyId);
  const status = req.body.status;
  try {
    const existingCompany = await serviceDb.selectOne('companies', { id: companyId });
    if (!existingCompany) return res.status(404).json({ error: '협력사를 찾을 수 없습니다.' });

    const { data: cascadeResult, error: cascadeError } = await getServiceClient().rpc(
      'set_company_operational_status',
      { p_company_id: companyId, p_status: status }
    );
    if (cascadeError) throw cascadeError;

    const company = cascadeResult.company;
    const projectCount = Number(cascadeResult.project_count || 0);
    const taskCount = Number(cascadeResult.task_count || 0);
    await serviceDb.insert('audit_logs', {
      actor_user_id: null,
      company_id: companyId,
      action: status === 'active' ? 'company_activate' : 'company_suspend',
      target_type: 'company',
      target_id: String(companyId),
      metadata: {
        status,
        actor: 'password_admin',
        affected_projects: projectCount,
        affected_tasks: taskCount
      }
    });
    res.json({
      message: status === 'active'
        ? `협력사와 소속 프로젝트 ${projectCount}건, 과제 ${taskCount}건이 활성 상태로 복원되었습니다.`
        : `협력사와 소속 프로젝트 ${projectCount}건, 과제 ${taskCount}건이 완료 처리되었습니다.`,
      company,
      affected: { projects: projectCount, tasks: taskCount }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사와 소속 프로젝트·과제 상태를 변경할 수 없습니다.' });
  }
}

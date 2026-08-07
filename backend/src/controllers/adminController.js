import { getServiceClient, serviceDb } from '../config/database.js';

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
        report_generated_at: savedReport?.generated_at || null
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
            (sum, project) => sum + project.tasks.filter((task) => task.status !== 'suspended').length,
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
      report_generated_at: savedReport.generated_at
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

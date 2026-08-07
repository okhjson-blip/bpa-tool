import { serviceDb } from '../config/database.js';

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
    const companies = await serviceDb.select('companies');
    const projects = await serviceDb.select('projects');
    const tasks = await serviceDb.select('tasks');
    const tasksByProject = new Map();
    tasks.forEach((task) => {
      const list = tasksByProject.get(Number(task.project_id)) || [];
      list.push(task);tasksByProject.set(Number(task.project_id), list);
    });
    const projectsByCompany = new Map();
    projects.forEach((project) => {
      const list = projectsByCompany.get(Number(project.company_id)) || [];
      list.push({ ...project, tasks: tasksByProject.get(Number(project.id)) || [] });
      projectsByCompany.set(Number(project.company_id), list);
    });
    res.json(companies.map((company) => {
      const companyProjects = projectsByCompany.get(Number(company.id)) || [];
      return {
        ...company,
        project_count: companyProjects.length,
        task_count: companyProjects.reduce((sum, project) => sum + project.tasks.length, 0),
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

export async function updateCompanyStatus(req, res) {
  const companyId = Number(req.params.companyId);
  const status = req.body.status;
  try {
    const company = await serviceDb.update('companies', companyId, { status });
    if (!company) return res.status(404).json({ error: '협력사를 찾을 수 없습니다.' });
    await serviceDb.insert('audit_logs', {
      actor_user_id: null,
      company_id: companyId,
      action: status === 'active' ? 'company_activate' : 'company_suspend',
      target_type: 'company',
      target_id: String(companyId),
      metadata: { status, actor: 'password_admin' }
    });
    res.json({ message: status === 'active' ? '협력사가 활성화되었습니다.' : '협력사가 중지되었습니다.', company });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 상태 변경 중 오류가 발생했습니다.' });
  }
}

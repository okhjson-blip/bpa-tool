import { db, serviceDb } from '../config/database.js';

export async function createCompany(req, res) {
  const name = String(req.body.name || '').trim();
  const businessNumber = String(req.body.business_number || '').trim() || null;
  try {
    const existing = await serviceDb.selectOne('companies', { name });
    if (existing) return res.status(409).json({ error: '이미 등록된 협력사명입니다.' });
    const company = await db.insert('companies', {
      name,
      business_number: businessNumber,
      status: 'active',
      created_by: req.auth.user.id
    });
    await serviceDb.insert('audit_logs', {
      actor_user_id: req.auth.user.id,
      company_id: company.id,
      action: 'company_create',
      target_type: 'company',
      target_id: String(company.id),
      metadata: { name }
    });
    res.status(201).json({ message: '협력사가 등록되었습니다.', company });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 등록 중 오류가 발생했습니다.' });
  }
}

export async function getOverview(_req, res) {
  try {
    const companies = await db.select('companies');
    const projects = await db.select('projects');
    const tasks = await db.select('tasks');
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
    }).sort((a, b) => a.name.localeCompare(b.name, 'ko')));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '관리자 현황을 불러올 수 없습니다.' });
  }
}

export async function updateCompanyStatus(req, res) {
  const companyId = Number(req.params.companyId);
  const status = req.body.status;
  try {
    const company = await db.update('companies', companyId, { status });
    if (!company) return res.status(404).json({ error: '협력사를 찾을 수 없습니다.' });
    await serviceDb.insert('audit_logs', {
      actor_user_id: req.auth.user.id,
      company_id: companyId,
      action: status === 'active' ? 'company_activate' : 'company_suspend',
      target_type: 'company',
      target_id: String(companyId),
      metadata: { status }
    });
    res.json({ message: status === 'active' ? '협력사가 활성화되었습니다.' : '협력사가 중지되었습니다.', company });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 상태 변경 중 오류가 발생했습니다.' });
  }
}

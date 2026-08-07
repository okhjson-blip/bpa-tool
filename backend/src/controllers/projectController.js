import { db } from '../config/database.js';

const PROJECT_ROLES = ['프로젝트 리더', '프로젝트 담당자', '컨설턴트'];
const TASK_ROLES = ['과제 리더', '과제 담당자'];

function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizeParticipants(participants, allowedRoles) {
  if (!Array.isArray(participants)) return [];
  return participants
    .map((participant) => ({
      name: cleanText(participant?.name),
      position: cleanText(participant?.position),
      role: cleanText(participant?.role),
      email: cleanText(participant?.email)
    }))
    .filter((participant) => participant.name || participant.position || participant.email)
    .map((participant) => ({
      ...participant,
      role: allowedRoles.includes(participant.role) ? participant.role : ''
    }));
}

function validateParticipants(participants, requiredRoles, label) {
  const issues = [];
  participants.forEach((participant, index) => {
    if (!participant.name) issues.push(`${label} ${index + 1}의 이름을 입력해 주세요.`);
    if (!participant.position) issues.push(`${label} ${index + 1}의 직급을 입력해 주세요.`);
    if (!participant.role) issues.push(`${label} ${index + 1}의 역할을 선택해 주세요.`);
  });
  requiredRoles.forEach((role) => {
    if (!participants.some((participant) => participant.role === role)) {
      issues.push(`${role}를 최소 1명 등록해 주세요.`);
    }
  });
  return issues;
}

function validateDateRange(startDate, endDate, label) {
  const issues = [];
  if (!startDate) issues.push(`${label} 시작일을 선택해 주세요.`);
  if (!endDate) issues.push(`${label} 종료일을 선택해 주세요.`);
  if (startDate && endDate && startDate > endDate) {
    issues.push(`${label} 종료일은 시작일 이후여야 합니다.`);
  }
  return issues;
}

function projectView(project) {
  return project ? { ...project, business_name: project.description || '' } : project;
}

async function syncProjectHierarchy(projectId, l1, l2, l3) {
  const existing = await db.select('domains', { project_id: projectId });
  let parentId = null;
  for (const [index, item] of [
    { level: 'L1', name: l1 },
    { level: 'L2', name: l2 },
    { level: 'L3', name: l3 }
  ].entries()) {
    const current = existing.find((domain) => domain.level === item.level);
    const values = {
      project_id: projectId,
      parent_id: parentId,
      level: item.level,
      name: item.name,
      sort_order: index
    };
    const saved = current
      ? await db.update('domains', current.id, values)
      : await db.insert('domains', values);
    parentId = saved.id;
  }
}

function projectPayload(body, existing = {}) {
  const departmentName = cleanText(body.department_name ?? existing.department_name);
  const businessName = cleanText(body.business_name ?? body.description ?? existing.description);
  const name = cleanText(body.name ?? existing.name);
  const startDate = cleanText(body.start_date ?? existing.start_date);
  const endDate = cleanText(body.end_date ?? existing.end_date);
  const participants = normalizeParticipants(body.participants ?? existing.participants, PROJECT_ROLES);
  return {
    name,
    company_name: cleanText(body.company_name ?? existing.company_name),
    department_name: departmentName,
    description: businessName,
    l1_domain: departmentName,
    analysis_goal: cleanText(body.analysis_goal ?? existing.analysis_goal),
    analysis_period: startDate && endDate ? `${startDate} ~ ${endDate}` : '',
    ai_engine: cleanText(body.ai_engine ?? existing.ai_engine) || 'chatgpt',
    start_date: startDate,
    end_date: endDate,
    participants
  };
}

function validateProject(project) {
  const issues = [];
  if (!project.company_name) issues.push('회사명을 등록해 주세요.');
  if (!project.department_name) issues.push('부서명(L1 구분)을 입력해 주세요.');
  if (!project.description) issues.push('업무명(L2 대분류)을 입력해 주세요.');
  if (!project.name) issues.push('프로젝트명(L3 기능)을 입력해 주세요.');
  if (!project.analysis_goal) issues.push('프로젝트 목적을 입력해 주세요.');
  issues.push(...validateDateRange(project.start_date, project.end_date, '프로젝트 기간'));
  issues.push(...validateParticipants(project.participants, PROJECT_ROLES, '프로젝트 참여자'));
  return issues;
}

export const createProject = async (req, res) => {
  try {
    if (!req.auth.company.default_ai_provider) {
      return res.status(400).json({
        error: '협력사 기본 AI 엔진을 먼저 설정해 주세요.',
        issues: ['상단 AI API 관리에서 Key를 등록하고 새 프로젝트 기본 엔진을 지정해 주세요.']
      });
    }
    const values = projectPayload({
      ...req.body,
      company_name: req.auth.company.name,
      ai_engine: req.auth.company.default_ai_provider
    });
    const issues = validateProject(values);
    if (issues.length) return res.status(400).json({ error: '프로젝트 정보를 보완해 주세요.', issues });

    const project = await db.insert('projects', {
      ...values,
      company_id: req.auth.companyId,
      status: 'active',
      created_by_user_id: req.auth.user.id
    });
    await syncProjectHierarchy(project.id, values.department_name, values.description, values.name);

    res.status(201).json({ message: '프로젝트가 생성되었습니다.', project: projectView(project) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로젝트 생성 중 오류가 발생했습니다.' });
  }
};

export const getProjects = async (req, res) => {
  try {
    const projects = await db.select('projects', { company_id: req.auth.companyId });

    res.json(await Promise.all(projects.map(async (project) => {
      const tasks = await db.select('tasks', { project_id: project.id });
      return {
        ...projectView(project),
        task_count: tasks.length,
        in_progress_count: tasks.filter((task) => task.status !== 'completed').length,
        completed_count: tasks.filter((task) => task.status === 'completed').length
      };
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로젝트 조회 중 오류가 발생했습니다.' });
  }
};

export const getProject = async (req, res) => {
  try {
    const project = await db.selectOne('projects', { id: parseInt(req.params.projectId) });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    res.json(projectView(project));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로젝트 조회 중 오류가 발생했습니다.' });
  }
};

export const updateProject = async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  try {
    const existing = await db.selectOne('projects', { id: projectId });
    if (!existing) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    const values = projectPayload({
      ...req.body,
      company_name: req.auth.company.name,
      ai_engine: existing.ai_engine
    }, existing);
    const issues = validateProject(values);
    if (issues.length) return res.status(400).json({ error: '프로젝트 정보를 보완해 주세요.', issues });

    const project = await db.update('projects', projectId, values);
    await syncProjectHierarchy(projectId, values.department_name, values.description, values.name);
    res.json({ message: '프로젝트 정보가 수정되었습니다.', project: projectView(project) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로젝트 수정 중 오류가 발생했습니다.' });
  }
};

export const deleteProject = async (req, res) => {
  try {
    await db.delete('projects', parseInt(req.params.projectId));
    res.json({ message: '프로젝트가 삭제되었습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로젝트 삭제 중 오류가 발생했습니다.' });
  }
};

export const getTasks = async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const project = await db.selectOne('projects', { id: projectId });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    res.json(await db.select('tasks', { project_id: projectId }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제 조회 중 오류가 발생했습니다.' });
  }
};

export const createTask = async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const project = await db.selectOne('projects', { id: projectId });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const participants = normalizeParticipants(req.body.participants, TASK_ROLES);
    const values = {
      project_id: projectId,
      name: cleanText(req.body.name),
      l1: cleanText(project.department_name || project.l1_domain),
      l2: cleanText(project.description),
      l3: cleanText(project.name),
      l4: cleanText(req.body.l4),
      goal: cleanText(req.body.goal),
      start_date: cleanText(req.body.start_date),
      end_date: cleanText(req.body.end_date),
      participants,
      status: 'registered',
      current_step: 1
    };
    const issues = [];
    if (!values.l1 || !values.l2 || !values.l3) issues.push('프로젝트의 L1~L3 정보를 먼저 완성해 주세요.');
    if (!values.l4) issues.push('L4 과제명을 입력해 주세요.');
    if (!values.name) issues.push('과제명을 입력해 주세요.');
    if (!values.goal) issues.push('과제 목표를 입력해 주세요.');
    issues.push(...validateDateRange(values.start_date, values.end_date, '과제 기간'));
    issues.push(...validateParticipants(participants, TASK_ROLES, '과제 참여자'));
    if (issues.length) return res.status(400).json({ error: '과제 정보를 보완해 주세요.', issues });

    const task = await db.insert('tasks', values);
    res.status(201).json({ message: '과제가 등록되었습니다.', task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제 등록 중 오류가 발생했습니다.' });
  }
};

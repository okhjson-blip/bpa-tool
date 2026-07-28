import { db } from '../config/database.js';

export const createProject = async (req, res) => {
  const { name, description, l1_domain, analysis_goal, analysis_period, ai_engine } = req.body;

  try {
    const project = db.insert('projects', {
      name,
      description,
      l1_domain,
      analysis_goal,
      analysis_period,
      ai_engine: ai_engine || 'chatgpt',
      created_by: 1,
      tenant_id: 1
    });

    // L1 도메인 자동 생성
    db.insert('domains', {
      project_id: project.id,
      level: 'L1',
      name: l1_domain,
      sort_order: 0
    });

    // 과제 멤버 추가 (고정 사용자 1)
    db.insert('project_members', {
      project_id: project.id,
      user_id: 1,
      role: 'owner'
    });

    res.status(201).json({
      message: '과제가 생성되었습니다',
      project
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제 생성 중 오류가 발생했습니다' });
  }
};

export const getProjects = async (req, res) => {
  try {
    // 모든 프로젝트 반환 (user_id = 1로 필터링)
    const members = db.select('project_members', { user_id: 1 });
    const projectIds = members.map((m) => m.project_id);

    const projects = db.select('projects').filter((p) => projectIds.includes(p.id));

    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제 조회 중 오류가 발생했습니다' });
  }
};

export const getProject = async (req, res) => {
  const { projectId } = req.params;

  try {
    const project = db.selectOne('projects', { id: parseInt(projectId) });

    if (!project) {
      return res.status(404).json({ error: '과제를 찾을 수 없습니다' });
    }

    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제 조회 중 오류가 발생했습니다' });
  }
};

export const updateProject = async (req, res) => {
  const { projectId } = req.params;
  const { name, description } = req.body;

  try {
    const project = db.update('projects', parseInt(projectId), {
      name,
      description
    });

    res.json({
      message: '과제가 업데이트되었습니다',
      project
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제 업데이트 중 오류가 발생했습니다' });
  }
};

export const deleteProject = async (req, res) => {
  const { projectId } = req.params;

  try {
    db.delete('projects', parseInt(projectId));

    res.json({ message: '과제가 삭제되었습니다' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제 삭제 중 오류가 발생했습니다' });
  }
};

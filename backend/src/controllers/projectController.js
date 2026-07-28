import { db } from '../config/database.js';

export const createProject = async (req, res) => {
  const { name, description, l1_domain, analysis_goal, analysis_period, ai_engine, ai_api_key } =
    req.body;
  const userId = req.user.id;

  try {
    const project = db.insert('projects', {
      name,
      description,
      l1_domain,
      analysis_goal,
      analysis_period,
      ai_engine,
      ai_api_key,
      created_by: userId,
      tenant_id: userId
    });

    // L1 도메인 자동 생성
    db.insert('domains', {
      project_id: project.id,
      level: 'L1',
      name: l1_domain,
      sort_order: 0
    });

    // 과제 멤버 추가 (생성자)
    db.insert('project_members', {
      project_id: project.id,
      user_id: userId,
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
  const userId = req.user.id;

  try {
    const members = db.select('project_members', { user_id: userId });
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
  const userId = req.user.id;

  try {
    const member = db.selectOne('project_members', {
      project_id: parseInt(projectId),
      user_id: userId
    });

    if (!member) {
      return res.status(404).json({ error: '과제를 찾을 수 없습니다' });
    }

    const project = db.selectOne('projects', { id: parseInt(projectId) });

    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제 조회 중 오류가 발생했습니다' });
  }
};

export const updateProject = async (req, res) => {
  const { projectId } = req.params;
  const { name, description, ai_engine, ai_api_key } = req.body;
  const userId = req.user.id;

  try {
    const member = db.selectOne('project_members', {
      project_id: parseInt(projectId),
      user_id: userId
    });

    if (!member || !['owner', 'editor'].includes(member.role)) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }

    const project = db.update('projects', parseInt(projectId), {
      name,
      description,
      ai_engine,
      ai_api_key
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
  const userId = req.user.id;

  try {
    const member = db.selectOne('project_members', {
      project_id: parseInt(projectId),
      user_id: userId
    });

    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: '과제를 삭제할 권한이 없습니다' });
    }

    db.delete('projects', parseInt(projectId));

    res.json({ message: '과제가 삭제되었습니다' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제 삭제 중 오류가 발생했습니다' });
  }
};

export const addProjectMember = async (req, res) => {
  const { projectId } = req.params;
  const { email, role } = req.body;
  const userId = req.user.id;

  try {
    // 권한 확인
    const member = db.selectOne('project_members', {
      project_id: parseInt(projectId),
      user_id: userId
    });

    if (!member || !['owner', 'editor'].includes(member.role)) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }

    // 사용자 조회
    const newUser = db.selectOne('users', { email });
    if (!newUser) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
    }

    // 기존 멤버 확인
    const existingMember = db.selectOne('project_members', {
      project_id: parseInt(projectId),
      user_id: newUser.id
    });

    if (existingMember) {
      db.update('project_members', existingMember.id, { role });
    } else {
      db.insert('project_members', {
        project_id: parseInt(projectId),
        user_id: newUser.id,
        role
      });
    }

    res.json({ message: '과제 멤버가 추가되었습니다' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '멤버 추가 중 오류가 발생했습니다' });
  }
};

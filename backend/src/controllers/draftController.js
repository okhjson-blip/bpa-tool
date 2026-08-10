import { db } from '../config/database.js';

async function validateScopeReferences(req) {
  const projectId = req.body.project_id == null ? null : Number(req.body.project_id);
  const taskId = req.body.task_id == null ? null : Number(req.body.task_id);

  if (projectId) {
    const project = await db.selectOne('projects', { id: projectId });
    if (!project || Number(project.company_id) !== Number(req.auth.companyId)) {
      const error = new Error('임시 저장 대상 프로젝트를 찾을 수 없습니다.');
      error.status = 404;
      throw error;
    }
  }
  if (taskId) {
    const task = await db.selectOne('tasks', { id: taskId });
    if (!task || (projectId && Number(task.project_id) !== projectId)) {
      const error = new Error('임시 저장 대상 과제를 찾을 수 없습니다.');
      error.status = 404;
      throw error;
    }
  }
  return { projectId, taskId };
}

function draftCondition(req) {
  return {
    company_id: Number(req.auth.companyId),
    user_id: req.auth.user.id,
    panel_key: req.params.panelKey,
    scope_key: String(req.query.scope_key || req.body.scope_key || '').trim()
  };
}

export async function getDraft(req, res) {
  try {
    const draft = await db.selectOne('panel_drafts', draftCondition(req));
    res.json(draft || null);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '임시 저장 내용을 불러올 수 없습니다.' });
  }
}

export async function saveDraft(req, res) {
  try {
    const { projectId, taskId } = await validateScopeReferences(req);
    const now = new Date().toISOString();
    const draft = await db.upsert('panel_drafts', {
      ...draftCondition(req),
      project_id: projectId,
      task_id: taskId,
      payload: req.body.payload,
      saved_at: now,
      updated_at: now
    }, { onConflict: 'company_id,user_id,panel_key,scope_key' });
    res.json({ message: '임시 저장되었습니다.', draft });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || '임시 저장할 수 없습니다.' });
  }
}

export async function deleteDraft(req, res) {
  try {
    await db.deleteWhere('panel_drafts', draftCondition(req));
    res.json({ message: '임시 저장 내용을 정리했습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '임시 저장 내용을 정리할 수 없습니다.' });
  }
}

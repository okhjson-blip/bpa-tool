import { db } from '../config/database.js';
import { resolveCompanyAccountId } from '../middleware/auth.js';

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function validateScopeReferences(req) {
  const projectId = req.body.project_id == null ? null : Number(req.body.project_id);
  const taskId = req.body.task_id == null ? null : Number(req.body.task_id);

  if (projectId) {
    const project = await db.selectOne('projects', { id: projectId });
    if (!project || Number(project.company_id) !== Number(req.auth.companyId)) {
      throw httpError('임시 저장 대상 프로젝트를 찾을 수 없습니다.', 404);
    }
  }
  let task = null;
  if (taskId) {
    task = await db.selectOne('tasks', { id: taskId });
    if (!task || (projectId && Number(task.project_id) !== projectId)) {
      throw httpError('임시 저장 대상 과제를 찾을 수 없습니다.', 404);
    }
  }
  return { projectId, taskId, task };
}

async function draftCondition(req) {
  const accountId = await resolveCompanyAccountId(req);
  if (!accountId) {
    throw httpError('협력사 사용자 등록을 먼저 완료해 주세요.', 403);
  }
  return {
    company_id: Number(req.auth.companyId),
    account_id: accountId,
    panel_key: req.params.panelKey,
    scope_key: String(req.query.scope_key || req.body.scope_key || '').trim()
  };
}

export async function getDraft(req, res) {
  try {
    const draft = await db.selectOne('panel_drafts', await draftCondition(req));
    res.json(draft || null);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || '임시 저장 내용을 불러올 수 없습니다.' });
  }
}

export async function saveDraft(req, res) {
  try {
    const condition = await draftCondition(req);
    const { projectId, taskId, task } = await validateScopeReferences(req);
    const now = new Date().toISOString();
    const draft = await db.upsert('panel_drafts', {
      ...condition,
      user_id: req.auth.user.id,
      project_id: projectId,
      task_id: taskId,
      payload: req.body.payload,
      saved_at: now,
      updated_at: now
    }, { onConflict: 'company_id,account_id,panel_key,scope_key' });

    // 임시 저장이 이미 지나온 단계를 되돌리면 재접속 시 뒤 단계 결과가
    // 사라진 것처럼 보이므로 진행 단계는 앞으로만 움직인다.
    const stepByPanel = { task_basic: 1, interview_answers: 2, process_editor: 3, report_frequency: 6 };
    const savedStep = stepByPanel[req.params.panelKey];
    if (task && savedStep && Number(task.current_step || 1) < savedStep) {
      await db.update('tasks', Number(task.id), { current_step: savedStep });
    }
    res.json({ message: '임시 저장되었습니다.', draft });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || '임시 저장할 수 없습니다.' });
  }
}

export async function deleteDraft(req, res) {
  try {
    await db.deleteWhere('panel_drafts', await draftCondition(req));
    res.json({ message: '임시 저장 내용을 정리했습니다.' });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || '임시 저장 내용을 정리할 수 없습니다.' });
  }
}

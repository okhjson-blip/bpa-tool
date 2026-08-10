import { db } from '../config/database.js';
import maskSensitiveData from '../middleware/dataMasking.js';
import LLMService from '../services/llmService.js';
import { getCompanyApiKey } from '../services/companyCredentialService.js';

export const createInterview = async (req, res) => {
  const { projectId } = req.params;
  const { domain_l3_id, text, transcription, interview_type, taskId, answers } = req.body;

  try {
    const project = await db.selectOne('projects', { id: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ error: '과제를 찾을 수 없습니다' });
    }
    let task = null;
    if (taskId) {
      task = await db.selectOne('tasks', { id: parseInt(taskId) });
      if (!task || Number(task.project_id) !== parseInt(projectId)) {
        return res.status(400).json({ error: '과제와 프로젝트가 일치하지 않습니다' });
      }
    }

    // 데이터 마스킹
    const textMasked = text ? maskSensitiveData(text) : null;
    const transcriptionMasked = transcription ? maskSensitiveData(transcription) : null;

    const interview = await db.insert('interviews', {
      project_id: parseInt(projectId),
      task_id: task ? Number(task.id) : null,
      domain_l3_id: domain_l3_id ? parseInt(domain_l3_id) : null,
      interview_type,
      answers: Array.isArray(answers) ? answers.map((answer) => String(answer || '')) : null,
      text,
      text_masked: textMasked,
      transcription,
      transcription_masked: transcriptionMasked
    });

    res.status(201).json({
      message: '인터뷰가 저장되었습니다',
      interview
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '인터뷰 저장 중 오류가 발생했습니다' });
  }
};

export const analyzeInterview = async (req, res) => {
  const { projectId, interviewId } = req.params;
  const { taskId } = req.body;

  try {
    // 인터뷰 조회
    const interview = await db.selectOne('interviews', { id: parseInt(interviewId) });
    if (!interview) {
      return res.status(404).json({ error: '인터뷰를 찾을 수 없습니다' });
    }

    // 프로젝트의 AI 엔진 정보 조회
    const project = await db.selectOne('projects', { id: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다' });
    }
    if (Number(interview.project_id) !== parseInt(projectId)) {
      return res.status(400).json({ error: '인터뷰와 프로젝트가 일치하지 않습니다' });
    }
    let task = null;
    if (taskId) {
      task = await db.selectOne('tasks', { id: parseInt(taskId) });
      if (!task || Number(task.project_id) !== parseInt(projectId)) {
        return res.status(400).json({ error: '과제와 프로젝트가 일치하지 않습니다' });
      }
    }

    // 텍스트 선택 (마스킹된 버전 우선)
    const textToAnalyze = interview.text_masked || interview.text;
    const transcriptionToAnalyze = interview.transcription_masked || interview.transcription;
    const fullText = textToAnalyze || transcriptionToAnalyze || '';

    if (!fullText.trim()) {
      return res.status(400).json({ error: 'AI Draft를 생성할 인터뷰 내용이 없습니다' });
    }

    // 프로젝트에 등록된 AI 엔진으로 실제 분석 수행
    const apiKey = await getCompanyApiKey(req.auth.companyId, project.ai_engine);
    const analysisResult = await LLMService.analyzeInterview(
      project.ai_engine,
      apiKey,
      fullText,
      task || {}
    );
    const allowedLevels = new Set(['L4', 'L5', 'L6']);
    const allowedMethods = new Set(['manual', 'system']);
    const allowedTools = new Set(['email', 'document', 'excel', 'web', 'erp', 'other']);
    const normalizedProcesses = (analysisResult.processes || [])
      .filter((proc) => allowedLevels.has(proc.level) && String(proc.name || '').trim())
      .map((proc, index) => ({
        ...proc,
        name: String(proc.name).trim(),
        description: String(proc.description || '').trim(),
        execution_time: Math.max(0, Math.round(Number(proc.execution_time) || 0)),
        waiting_time: Math.max(0, Number(proc.waiting_time) || 0),
        approval_waiting_time: Math.max(0, Number(proc.approval_waiting_time) || 0),
        method: proc.level === 'L6' ? (allowedMethods.has(proc.method) ? proc.method : 'manual') : null,
        tool: proc.level === 'L6' ? (allowedTools.has(proc.tool) ? proc.tool : 'other') : null,
        sort_order: index
      }));
    if (!normalizedProcesses.length || !normalizedProcesses.some((proc) => proc.level === 'L6')) {
      return res.status(502).json({ error: 'AI 엔진이 프로세스 Draft를 반환하지 않았습니다' });
    }
    const invalidL6Names = normalizedProcesses
      .filter((proc) => proc.level === 'L6')
      .filter((proc) => !/(을|를)\s*[^.]+다\.?$/.test(proc.name) || /(\s및\s|\/|하고\s)/.test(proc.name));
    if (invalidL6Names.length) {
      return res.status(502).json({
        error: 'AI 엔진이 STATIK L6 Act 명명 규칙(목적어 + 단일 동사)을 지키지 않았습니다. AI Draft를 다시 생성해 주세요.'
      });
    }

    // 같은 과제에서 Draft를 재생성할 때 이전 프로세스와 파생 분석이 누적되지 않도록 교체
    const previousProcesses = taskId
      ? await db.select('processes', { task_id: parseInt(taskId) })
      : await db.select('processes', { interview_id: parseInt(interviewId) });
    await Promise.all(previousProcesses.flatMap((process) => [
      db.deleteWhere('bdw_tags', { process_id: process.id }),
      db.deleteWhere('ai_analysis', { process_id: process.id }),
      db.deleteWhere('to_be_processes', { original_process_id: process.id })
    ]));
    await db.deleteWhere(
      'processes',
      taskId ? { task_id: parseInt(taskId) } : { interview_id: parseInt(interviewId) }
    );

    // 프로세스 저장
    const processes = [];
    for (const proc of normalizedProcesses) {
      const savedProcess = await db.insert('processes', {
        project_id: parseInt(projectId),
        interview_id: parseInt(interviewId),
        task_id: taskId ? parseInt(taskId) : null,
        level: proc.level,
        name: proc.name,
        description: proc.description,
        execution_time: proc.execution_time,
        waiting_time: proc.waiting_time,
        approval_waiting_time: proc.approval_waiting_time,
        method: proc.method,
        tool: proc.tool,
        sort_order: proc.sort_order,
        status: 'draft'
      });
      processes.push(savedProcess);
    }

    res.json({
      message: 'AI 분석이 완료되었습니다',
      analysis: {
        ...analysisResult,
        analysis_timestamp: new Date().toISOString(),
        engine_used: project.ai_engine,
        model_used: LLMService.getModel(project.ai_engine),
        processes
      }
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: error.message || 'AI 분석 중 오류가 발생했습니다' });
  }
};

export const getInterviews = async (req, res) => {
  const { projectId } = req.params;

  try {
    const interviews = (await db
      .select('interviews', { project_id: parseInt(projectId) }))
      .map((int) => {
        const { text_masked, transcription_masked, ...safe } = int;
        return safe;
      });

    res.json(interviews);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '인터뷰 조회 중 오류가 발생했습니다' });
  }
};

export const getProcesses = async (req, res) => {
  const { projectId } = req.params;

  try {
    const condition = { project_id: parseInt(projectId) };
    if (req.query.task_id) condition.task_id = parseInt(req.query.task_id);
    const processes = (await db.select('processes', condition))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id) - Number(b.id));

    res.json(processes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로세스 조회 중 오류가 발생했습니다' });
  }
};

export const updateProcess = async (req, res) => {
  const { processId } = req.params;
  const {
    name, description, execution_time, waiting_time,
    approval_waiting_time, method, tool, status
  } = req.body;

  try {
    const current = await db.selectOne('processes', { id: parseInt(processId) });
    if (!current) {
      return res.status(404).json({ error: '프로세스를 찾을 수 없습니다' });
    }
    const values = {
      name,
      description,
      execution_time,
      waiting_time,
      approval_waiting_time,
      status
    };
    if (current.level === 'L6') {
      values.method = method;
      values.tool = tool;
    } else {
      values.method = null;
      values.tool = null;
    }
    Object.keys(values).forEach((key) => values[key] === undefined && delete values[key]);
    const process = await db.update('processes', parseInt(processId), values);

    if (!process) {
      return res.status(404).json({ error: '프로세스를 찾을 수 없습니다' });
    }

    res.json({
      message: '프로세스가 업데이트되었습니다',
      process
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로세스 업데이트 중 오류가 발생했습니다' });
  }
};

function parseStoredAnswers(interview) {
  if (Array.isArray(interview?.answers)) return interview.answers.map((answer) => String(answer || ''));
  const text = String(interview?.text || '');
  if (!text) return [];
  const matches = [...text.matchAll(/(?:^|\n)답변\s+\d+:\s*([\s\S]*?)(?=\n답변\s+\d+:|$)/g)];
  return matches.map((match) => match[1].trim());
}

export const getLatestTaskInterview = async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const taskId = parseInt(req.params.taskId);
  try {
    const task = await db.selectOne('tasks', { id: taskId });
    if (!task || Number(task.project_id) !== projectId) {
      return res.status(404).json({ error: '프로젝트에 속한 과제를 찾을 수 없습니다.' });
    }
    const interviews = await db.select('interviews', { project_id: projectId, task_id: taskId });
    const latest = interviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    if (!latest) return res.json(null);
    const { text_masked, transcription_masked, ...safe } = latest;
    res.json({ ...safe, answers: parseStoredAnswers(latest) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '저장된 인터뷰 답변을 불러올 수 없습니다.' });
  }
};

export const syncProcesses = async (req, res) => {
  const requestedProcesses = req.body.processes || [];
  try {
    const projectId = Number(req.body.projectId);
    const taskId = Number(req.body.taskId);
    const interviewId = req.body.interviewId ? Number(req.body.interviewId) : null;
    const task = await db.selectOne('tasks', { id: taskId });
    if (!task || Number(task.project_id) !== projectId) {
      return res.status(404).json({ error: '프로젝트에 속한 과제를 찾을 수 없습니다.' });
    }
    const ids = requestedProcesses.filter((process) => process.id != null).map((process) => Number(process.id));
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: '중복된 프로세스가 포함되어 있습니다.' });
    }

    const accessibleProcesses = await db.select('processes', { project_id: projectId, task_id: taskId });
    const accessibleIds = new Set(accessibleProcesses.map((process) => Number(process.id)));
    if (ids.some((id) => !accessibleIds.has(id))) {
      return res.status(404).json({ error: '접근할 수 없는 프로세스가 포함되어 있습니다.' });
    }
    const deletedIds = (req.body.deleted_process_ids || []).map(Number);
    if (new Set(deletedIds).size !== deletedIds.length || deletedIds.some((id) => ids.includes(id))) {
      return res.status(400).json({ error: '삭제 목록에 중복되거나 현재 저장할 프로세스가 포함되어 있습니다.' });
    }
    if (deletedIds.some((id) => !accessibleIds.has(id))) {
      return res.status(404).json({ error: '삭제할 수 없는 프로세스가 포함되어 있습니다.' });
    }
    await Promise.all(deletedIds.map((id) => db.delete('processes', id)));

    const processes = [];
    for (let index = 0; index < requestedProcesses.length; index += 1) {
      const process = requestedProcesses[index];
      const level = process.level;
      const values = {
        level,
        name: process.name,
        description: process.description || '',
        execution_time: Number(process.execution_time) || 0,
        waiting_time: Number(process.waiting_time) || 0,
        approval_waiting_time: Number(process.approval_waiting_time) || 0,
        method: level === 'L6' ? (process.method || 'manual') : null,
        tool: level === 'L6' ? (process.tool || 'other') : null,
        sort_order: index,
        status: 'confirmed'
      };
      if (process.id != null) processes.push(await db.update('processes', Number(process.id), values));
      else processes.push(await db.insert('processes', {
        project_id: projectId,
        task_id: taskId,
        interview_id: interviewId,
        ...values
      }));
    }

    res.json({
      message: `${processes.length}개 프로세스를 저장하고 플로우차트와 동기화했습니다.`,
      processes
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로세스 일괄 동기화 중 오류가 발생했습니다.' });
  }
};

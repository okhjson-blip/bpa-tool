import { db } from '../config/database.js';
import maskSensitiveData from '../middleware/dataMasking.js';
import LLMService from '../services/llmService.js';
import { getCompanyApiKey } from '../services/companyCredentialService.js';

export const createInterview = async (req, res) => {
  const { projectId } = req.params;
  const { domain_l3_id, text, transcription, interview_type } = req.body;

  try {
    const project = await db.selectOne('projects', { id: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ error: '과제를 찾을 수 없습니다' });
    }

    // 데이터 마스킹
    const textMasked = text ? maskSensitiveData(text) : null;
    const transcriptionMasked = transcription ? maskSensitiveData(transcription) : null;

    const interview = await db.insert('interviews', {
      project_id: parseInt(projectId),
      domain_l3_id: domain_l3_id ? parseInt(domain_l3_id) : null,
      interview_type,
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
      .map((proc) => ({
        ...proc,
        name: String(proc.name).trim(),
        description: String(proc.description || '').trim(),
        execution_time: Math.max(0, Math.round(Number(proc.execution_time) || 0)),
        waiting_time: Math.max(0, Number(proc.waiting_time) || 0),
        approval_waiting_time: Math.max(0, Number(proc.approval_waiting_time) || 0),
        method: allowedMethods.has(proc.method) ? proc.method : 'manual',
        tool: allowedTools.has(proc.tool) ? proc.tool : 'other'
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
    const processes = await db.select('processes', condition);

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
    const process = await db.update('processes', parseInt(processId), {
      name,
      description,
      execution_time,
      waiting_time,
      approval_waiting_time,
      method,
      tool,
      status
    });

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

export const syncProcesses = async (req, res) => {
  const requestedProcesses = req.body.processes || [];
  try {
    const ids = requestedProcesses.map((process) => Number(process.id));
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: '중복된 프로세스가 포함되어 있습니다.' });
    }

    const accessibleProcesses = await db.select('processes');
    const accessibleIds = new Set(accessibleProcesses.map((process) => Number(process.id)));
    if (ids.some((id) => !accessibleIds.has(id))) {
      return res.status(404).json({ error: '접근할 수 없는 프로세스가 포함되어 있습니다.' });
    }

    const processes = await Promise.all(requestedProcesses.map((process) =>
      db.update('processes', Number(process.id), {
        name: process.name,
        description: process.description || '',
        execution_time: Number(process.execution_time) || 0,
        waiting_time: Number(process.waiting_time) || 0,
        approval_waiting_time: Number(process.approval_waiting_time) || 0,
        method: process.method || 'manual',
        tool: process.tool || 'other',
        status: 'confirmed'
      })
    ));

    res.json({
      message: `${processes.length}개 프로세스를 저장하고 플로우차트와 동기화했습니다.`,
      processes
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로세스 일괄 동기화 중 오류가 발생했습니다.' });
  }
};

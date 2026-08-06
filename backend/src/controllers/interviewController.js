import { db } from '../config/database.js';
import maskSensitiveData from '../middleware/dataMasking.js';
import LLMService from '../services/llmService.js';

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
  const { apiKey, taskId } = req.body;

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
    if (taskId) {
      const task = await db.selectOne('tasks', { id: parseInt(taskId) });
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
    const analysisResult = await LLMService.analyzeInterview(
      project.ai_engine,
      apiKey,
      fullText,
      'L4'
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

    // 같은 인터뷰를 재분석할 때 이전 Draft가 중복되지 않도록 교체
    await db.deleteWhere('processes', { interview_id: parseInt(interviewId) });

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

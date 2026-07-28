import { db } from '../config/database.js';
import maskSensitiveData from '../middleware/dataMasking.js';

// 모의 LLM 분석 (테스트용)
const mockAnalyzeInterview = (transcription, level) => {
  const processes = [
    {
      level: 'L4',
      name: '🗂 SNS 채널 관리',
      description: '소셜 미디어 채널 운영',
      execution_time: null,
      method: null,
      tool: null
    },
    {
      level: 'L5',
      name: '게시물 기획',
      description: '콘텐츠 주제 및 일정 계획',
      execution_time: null,
      method: 'manual',
      tool: 'web'
    },
    {
      level: 'L6',
      name: '트렌드 키워드를 검색한다',
      description: '최신 트렌드 조사',
      execution_time: 10,
      method: 'manual',
      tool: 'web'
    },
    {
      level: 'L6',
      name: '초안을 입력한다',
      description: '게시물 텍스트 작성',
      execution_time: 30,
      method: 'manual',
      tool: 'document'
    }
  ];

  return {
    processes,
    analysis_timestamp: new Date().toISOString(),
    engine_used: 'mock'
  };
};

export const createInterview = async (req, res) => {
  const { projectId } = req.params;
  const { domain_l3_id, text, transcription, interview_type } = req.body;

  try {
    const project = db.selectOne('projects', { id: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ error: '과제를 찾을 수 없습니다' });
    }

    // 데이터 마스킹
    const textMasked = text ? maskSensitiveData(text) : null;
    const transcriptionMasked = transcription ? maskSensitiveData(transcription) : null;

    const interview = db.insert('interviews', {
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

  try {
    // 인터뷰 조회
    const interview = db.selectOne('interviews', { id: parseInt(interviewId) });
    if (!interview) {
      return res.status(404).json({ error: '인터뷰를 찾을 수 없습니다' });
    }

    // 프로젝트의 AI 엔진 정보 조회
    const project = db.selectOne('projects', { id: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다' });
    }

    // 텍스트 선택 (마스킹된 버전 우선)
    const textToAnalyze = interview.text_masked || interview.text;
    const transcriptionToAnalyze = interview.transcription_masked || interview.transcription;
    const fullText = textToAnalyze || transcriptionToAnalyze || '';

    // AI 분석 수행 (모의 구현)
    const analysisResult = mockAnalyzeInterview(fullText, 'L4');

    // 프로세스 저장
    const processes = [];
    for (const proc of analysisResult.processes) {
      const savedProcess = db.insert('processes', {
        project_id: parseInt(projectId),
        interview_id: parseInt(interviewId),
        level: proc.level,
        name: proc.name,
        description: proc.description,
        execution_time: proc.execution_time,
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
        processes
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'AI 분석 중 오류가 발생했습니다' });
  }
};

export const getInterviews = async (req, res) => {
  const { projectId } = req.params;

  try {
    const interviews = db
      .select('interviews', { project_id: parseInt(projectId) })
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
    const processes = db.select('processes', { project_id: parseInt(projectId) });

    res.json(processes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '프로세스 조회 중 오류가 발생했습니다' });
  }
};

export const updateProcess = async (req, res) => {
  const { processId } = req.params;
  const { name, description, execution_time, method, tool, status } = req.body;

  try {
    const process = db.update('processes', parseInt(processId), {
      name,
      description,
      execution_time,
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

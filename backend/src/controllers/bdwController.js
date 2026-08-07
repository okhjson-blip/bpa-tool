import { db } from '../config/database.js';
import LLMService from '../services/llmService.js';
import { getCompanyApiKey } from '../services/companyCredentialService.js';

async function getTaskL6Processes(projectId, taskId) {
  const condition = { project_id: parseInt(projectId) };
  if (taskId) condition.task_id = parseInt(taskId);
  return (await db.select('processes', condition))
    .filter((process) => process.level === 'L6');
}

function requireCompleteAnalysis(items, processes, fieldName) {
  const byProcessId = new Map((items || []).map((item) => [Number(item.process_id), item]));
  const missing = processes.filter((process) => !byProcessId.has(Number(process.id)));
  if (missing.length) {
    throw new Error(`AI 엔진의 ${fieldName} 결과에 ${missing.length}개 프로세스가 누락되었습니다.`);
  }
  return byProcessId;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

// BDW 진단: Bottleneck, Delay, Waste 태그 부착
export const tagBDW = async (req, res) => {
  const { processId } = req.params;
  const { bdw_type } = req.body;

  try {
    // 재태깅 시 이전 태그가 남아 조회 결과에 혼선을 주지 않도록 기존 태그 제거 후 저장
    await db.deleteWhere('bdw_tags', { process_id: parseInt(processId) });

    const bdwTag = await db.insert('bdw_tags', {
      process_id: parseInt(processId),
      bdw_type, // 'bottleneck', 'delay', 'waste', 'normal'
      severity: req.body.severity || 'medium'
    });

    res.json({ message: 'BDW 태그가 부착되었습니다', bdwTag });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'BDW 태그 부착 중 오류' });
  }
};

export const analyzeBDW = async (req, res) => {
  const { projectId } = req.params;
  const { taskId } = req.body;

  try {
    const project = await db.selectOne('projects', { id: parseInt(projectId) });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    const processes = await getTaskL6Processes(projectId, taskId);
    if (!processes.length) {
      return res.status(400).json({ error: 'BDW 진단을 수행할 L6 프로세스가 없습니다.' });
    }

    const apiKey = await getCompanyApiKey(req.auth.companyId, project.ai_engine);
    const result = await LLMService.analyzeBDW(project.ai_engine, apiKey, processes);
    const diagnosesById = requireCompleteAnalysis(result.diagnoses, processes, 'BDW');
    const diagnoses = await Promise.all(processes.map(async (process) => {
      const diagnosis = diagnosesById.get(Number(process.id));
      if (!['bottleneck', 'delay', 'waste', 'normal'].includes(diagnosis.bdw_type) ||
          !['low', 'medium', 'high'].includes(diagnosis.severity)) {
        throw new Error('AI 엔진이 유효하지 않은 BDW 진단값을 반환했습니다.');
      }
      await db.deleteWhere('bdw_tags', { process_id: process.id });
      const saved = await db.insert('bdw_tags', {
        process_id: process.id,
        bdw_type: diagnosis.bdw_type,
        severity: diagnosis.severity
      });
      return { ...saved, process_name: process.name, rationale: diagnosis.rationale };
    }));

    res.json({
      message: '등록된 AI 엔진으로 BDW 진단을 완료했습니다.',
      engine_used: project.ai_engine,
      model_used: LLMService.getModel(project.ai_engine),
      diagnoses
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: error.message || 'BDW AI 진단 중 오류가 발생했습니다.' });
  }
};

// BDW 진단 결과 조회
export const getBDWDiagnosis = async (req, res) => {
  const { projectId } = req.params;

  try {
    const processes = await getTaskL6Processes(projectId, req.query.task_id);
    const tags = await db.select('bdw_tags');

    // 각 프로세스에 태그 연결
    const processesWithTags = processes.map((proc) => {
      const tag = tags.find((t) => Number(t.process_id) === Number(proc.id));
      return { ...proc, bdw_tag: tag?.bdw_type || 'normal' };
    });

    // 통계
    const bottlenecks = processesWithTags.filter((p) => p.bdw_tag === 'bottleneck');
    const delays = processesWithTags.filter((p) => p.bdw_tag === 'delay');
    const wastes = processesWithTags.filter((p) => p.bdw_tag === 'waste');

    const totalExecutionTime = processesWithTags.reduce(
      (sum, p) => sum + (Number(p.execution_time) || 0),
      0
    );
    const totalWaitingHours = processesWithTags.reduce(
      (sum, p) => sum + (Number(p.waiting_time) || 0) + (Number(p.approval_waiting_time) || 0),
      0
    );
    const inefficientTime =
      bottlenecks.reduce((sum, p) => sum + (Number(p.execution_time) || 0), 0) +
      delays.reduce((sum, p) => sum + (Number(p.execution_time) || 0) +
        ((Number(p.waiting_time) || 0) + (Number(p.approval_waiting_time) || 0)) * 60, 0) +
      wastes.reduce((sum, p) => sum + (Number(p.execution_time) || 0), 0);
    const totalElapsedMinutes = totalExecutionTime + totalWaitingHours * 60;

    res.json({
      processes: processesWithTags,
      diagnosis: {
        bottleneck_count: bottlenecks.length,
        delay_count: delays.length,
        waste_count: wastes.length,
        total_execution_time: totalExecutionTime,
        total_waiting_time_hours: totalWaitingHours,
        inefficient_time: inefficientTime,
        inefficiency_rate: totalElapsedMinutes > 0 ? (inefficientTime / totalElapsedMinutes) * 100 : 0
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'BDW 진단 조회 중 오류' });
  }
};

// AI FIT 분석
export const analyzeAIFit = async (req, res) => {
  const { projectId } = req.params;
  const { taskId } = req.body;

  try {
    const project = await db.selectOne('projects', { id: parseInt(projectId) });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    const processes = await getTaskL6Processes(projectId, taskId);

    if (processes.length === 0) {
      return res.status(400).json({ error: '분석할 프로세스가 없습니다. 먼저 인터뷰 및 AI Draft를 생성하세요' });
    }

    const apiKey = await getCompanyApiKey(req.auth.companyId, project.ai_engine);
    const aiResult = await LLMService.analyzeAIFit(project.ai_engine, apiKey, processes);
    const analysisById = requireCompleteAnalysis(aiResult.analysis, processes, 'AI FIT');
    const fitAnalysis = processes.map((proc) => {
      const generated = analysisById.get(Number(proc.id));
      const executionTime = Number(proc.execution_time) || 0;
      const aiPossibility = Math.round(clamp(generated.ai_possibility, 1, 5) * 10) / 10;
      const inefficiency = Math.round(clamp(generated.inefficiency, 1, 5) * 10) / 10;
      let category = 'D';
      if (aiPossibility >= 3 && inefficiency >= 3) category = 'A';
      else if (aiPossibility < 3 && inefficiency >= 3) category = 'B';
      else if (aiPossibility >= 3 && inefficiency < 3) category = 'C';

      return {
        process_id: proc.id,
        project_id: parseInt(projectId),
        name: proc.name,
        ai_possibility: aiPossibility,
        inefficiency,
        fit_category: category,
        recommended_tech: String(generated.recommended_tech || '업무 표준화'),
        estimated_time_savings: Math.round(clamp(generated.estimated_time_savings, 0, executionTime)),
        rationale: String(generated.rationale || '')
      };
    });

    // 재분석 시 이전 결과가 누적되지 않도록 기존 분석 삭제 후 저장
    await Promise.all(processes.map((process) =>
      db.deleteWhere('ai_analysis', { process_id: process.id })
    ));
    await Promise.all(fitAnalysis.map(({ rationale, ...analysis }) =>
      db.insert('ai_analysis', analysis)
    ));

    // 통계
    const categoryA = fitAnalysis.filter((a) => a.fit_category === 'A');
    const estimatedTotalSavings = fitAnalysis.reduce(
      (sum, a) => sum + a.estimated_time_savings,
      0
    );

    res.json({
      engine_used: project.ai_engine,
      model_used: LLMService.getModel(project.ai_engine),
      analysis: fitAnalysis,
      summary: {
        immediate_application_count: categoryA.length,
        automation_rate: Math.round((categoryA.length / fitAnalysis.length) * 100),
        estimated_total_time_savings: estimatedTotalSavings
      }
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: error.message || 'AI FIT 분석 중 오류' });
  }
};

// To-Be 프로세스 생성
export const createToBe = async (req, res) => {
  const { projectId } = req.params;
  const { taskId, accepted_process_ids: acceptedProcessIds } = req.body;

  try {
    const task = await db.selectOne('tasks', { id: parseInt(taskId) });
    if (!task || Number(task.project_id) !== parseInt(projectId)) {
      return res.status(404).json({ error: '프로젝트에 속한 과제를 찾을 수 없습니다.' });
    }
    const processes = await getTaskL6Processes(projectId, taskId);
    if (!processes.length) {
      return res.status(400).json({ error: 'To-Be를 생성할 L6 프로세스가 없습니다.' });
    }

    const processIds = new Set(processes.map((process) => Number(process.id)));
    const acceptedIds = new Set(acceptedProcessIds.map(Number));
    const invalidIds = [...acceptedIds].filter((processId) => !processIds.has(processId));
    if (invalidIds.length) {
      return res.status(400).json({ error: '현재 과제에 속하지 않은 AI 제안이 포함되어 있습니다.' });
    }
    const storedAnalysis = (await db.select('ai_analysis', { project_id: parseInt(projectId) }))
      .filter((analysis) => processIds.has(Number(analysis.process_id)));
    const analysisByProcessId = new Map(
      storedAnalysis.map((analysis) => [Number(analysis.process_id), analysis])
    );
    if ([...acceptedIds].some((processId) => !analysisByProcessId.has(processId))) {
      return res.status(400).json({ error: '선택한 프로세스의 AI FIT 결과가 없습니다. AI FIT 분석을 다시 실행해 주세요.' });
    }

    // 같은 과제의 원본 프로세스에 연결된 To-Be 결과만 교체
    await Promise.all(processes.map((process) =>
      db.deleteWhere('to_be_processes', { original_process_id: process.id })
    ));

    // 각 프로세스에 대해 To-Be 버전 생성
    const toBeProcesses = await Promise.all(processes.map(async (proc) => {
      const isAccepted = acceptedIds.has(Number(proc.id));
      const analysis = isAccepted ? analysisByProcessId.get(Number(proc.id)) : null;
      const executionTime = proc.execution_time || 0;

      return await db.insert('to_be_processes', {
        original_process_id: proc.id,
        project_id: parseInt(projectId),
        name: proc.name,
        ai_applied: isAccepted,
        original_execution_time: executionTime,
        estimated_execution_time: analysis
          ? Math.max(0, executionTime - analysis.estimated_time_savings)
          : executionTime,
        automation_method: analysis?.recommended_tech || 'manual'
      });
    }));

    res.json({
      message: 'To-Be 프로세스가 생성되었습니다',
      accepted_count: acceptedIds.size,
      toBeProcesses
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'To-Be 생성 중 오류' });
  }
};

// 리포트 생성
export const generateReport = async (req, res) => {
  const { projectId } = req.params;
  const taskId = parseInt(req.query.task_id);

  try {
    const project = await db.selectOne('projects', { id: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ error: '과제를 찾을 수 없습니다' });
    }

    const task = await db.selectOne('tasks', { id: taskId });
    if (!task || Number(task.project_id) !== parseInt(projectId)) {
      return res.status(404).json({ error: '프로젝트에 속한 과제를 찾을 수 없습니다.' });
    }

    const processes = await getTaskL6Processes(projectId, taskId);
    const processIds = new Set(processes.map((process) => Number(process.id)));

    const bdwTags = (await db.select('bdw_tags'))
      .filter((tag) => processIds.has(Number(tag.process_id)));
    const aiAnalysis = (await db.select('ai_analysis', { project_id: parseInt(projectId) }))
      .filter((analysis) => processIds.has(Number(analysis.process_id)));
    const toBeProcesses = (await db.select('to_be_processes', { project_id: parseInt(projectId) }))
      .filter((process) => processIds.has(Number(process.original_process_id)));
    const bdwByProcessId = new Map(bdwTags.map((tag) => [Number(tag.process_id), tag.bdw_type]));
    const toBeByProcessId = new Map(toBeProcesses.map((process) => [Number(process.original_process_id), process]));

    const asIsTime = processes.reduce((sum, process) => sum + (Number(process.execution_time) || 0), 0);
    const asIsWaitingHours = processes.reduce((sum, process) => sum +
      (Number(process.waiting_time) || 0) + (Number(process.approval_waiting_time) || 0), 0);
    const toBeTime = processes.reduce((sum, process) => {
      const toBe = toBeByProcessId.get(Number(process.id));
      return sum + (toBe ? Number(toBe.estimated_execution_time) : Number(process.execution_time) || 0);
    }, 0);
    const timeSavings = Math.max(0, asIsTime - toBeTime);

    const frequencyUnit = ['day', 'week', 'month'].includes(req.query.frequency_unit)
      ? req.query.frequency_unit
      : 'week';
    const frequencyCount = Math.max(1, parseInt(req.query.frequency_count || '1'));
    const frequencyMultipliers = { day: 365, week: 52, month: 12 };
    const annualFrequency = req.query.annual_frequency
      ? Math.max(1, parseInt(req.query.annual_frequency))
      : frequencyCount * frequencyMultipliers[frequencyUnit];
    const annualSavingsHours = (timeSavings * annualFrequency) / 60;
    const fte = annualSavingsHours / 2248;
    const automatedCount = toBeProcesses.filter((process) => process.ai_applied === true).length;
    const automationRate = processes.length ? Math.round((automatedCount / processes.length) * 100) : 0;
    const timeSavingsRate = asIsTime ? Math.round((timeSavings / asIsTime) * 100) : 0;
    const estimatedDevelopmentCost = automatedCount * 8321500;

    const asIsProcesses = processes.map((process) => ({
      ...process,
      bdw_type: bdwByProcessId.get(Number(process.id)) || 'normal'
    }));
    const reportToBeProcesses = processes.map((process) => {
      const toBe = toBeByProcessId.get(Number(process.id));
      return {
        original_process_id: process.id,
        name: toBe?.name || process.name,
        ai_applied: toBe?.ai_applied ?? false,
        original_execution_time: Number(process.execution_time) || 0,
        estimated_execution_time: toBe
          ? Number(toBe.estimated_execution_time) || 0
          : Number(process.execution_time) || 0,
        automation_method: toBe?.automation_method || 'manual'
      };
    });

    const report = {
      project_name: project.name,
      task_name: task.name,
      task_goal: task.goal,
      task_start_date: task.start_date || null,
      task_end_date: task.end_date || null,
      hierarchy: { l1: task.l1, l2: task.l2, l3: task.l3, l4: task.l4 },
      analysis_period: project.analysis_period,
      created_at: new Date().toISOString(),
      statistics: {
        total_processes: processes.length,
        as_is_total_time: asIsTime,
        as_is_waiting_hours: asIsWaitingHours,
        to_be_total_time: toBeTime,
        time_savings: timeSavings,
        time_savings_rate: timeSavingsRate,
        automation_rate: automationRate,
        automated_process_count: automatedCount,
        frequency_unit: frequencyUnit,
        frequency_count: frequencyCount,
        annual_frequency: annualFrequency,
        annual_savings_hours: Math.round(annualSavingsHours * 10) / 10,
        fte_equivalent: Math.round(fte * 1000) / 1000,
        estimated_development_cost: estimatedDevelopmentCost
      },
      bdw_diagnosis: {
        bottlenecks: bdwTags.filter((t) => t.bdw_type === 'bottleneck').length,
        delays: bdwTags.filter((t) => t.bdw_type === 'delay').length,
        wastes: bdwTags.filter((t) => t.bdw_type === 'waste').length
      },
      as_is_processes: asIsProcesses,
      to_be_processes: reportToBeProcesses,
      ai_fit_analysis: aiAnalysis,
      recommendations: generateRecommendations(aiAnalysis)
    };

    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '리포트 생성 중 오류' });
  }
};

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// 과제당 한 행으로 구성된 CSV 다운로드
export const exportTaskCsv = async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const taskId = parseInt(req.query.task_id);

  try {
    const project = await db.selectOne('projects', { id: projectId });
    const task = await db.selectOne('tasks', { id: taskId });
    if (!project || !task || Number(task.project_id) !== projectId) {
      return res.status(404).json({ error: '프로젝트에 속한 과제를 찾을 수 없습니다.' });
    }

    const processes = await getTaskL6Processes(projectId, taskId);
    const processIds = new Set(processes.map((process) => Number(process.id)));
    const toBeProcesses = (await db.select('to_be_processes', { project_id: projectId }))
      .filter((process) => processIds.has(Number(process.original_process_id)));
    const toBeByProcessId = new Map(
      toBeProcesses.map((process) => [Number(process.original_process_id), process])
    );
    const asIsFlow = processes.map((process) => process.name).join(' > ');
    const toBeFlow = processes
      .map((process) => toBeByProcessId.get(Number(process.id))?.name || process.name)
      .join(' > ');
    const taskPeriod = [task.start_date, task.end_date].filter(Boolean).join(' ~ ');
    const rows = [
      ['프로젝트명', '과제명', 'L1', 'L2', 'L3', 'L4', '과제 목표', '과제 기간', 'AS-IS 프로세스', 'To-Be 프로세스'],
      [project.name, task.name, task.l1, task.l2, task.l3, task.l4, task.goal || '', taskPeriod, asIsFlow, toBeFlow]
    ];
    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const safeBaseName = `${project.name}_${task.name}_task`.replace(/[\\/:*?"<>|]/g, '_');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="task-info.csv"; filename*=UTF-8''${encodeURIComponent(safeBaseName)}.csv`
    );
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '과제정보 CSV 생성 중 오류' });
  }
};

function generateRecommendations(aiAnalysis) {
  const recommendations = [];

  const categoryA = aiAnalysis.filter((a) => a.fit_category === 'A');
  if (categoryA.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      title: '즉시 적용 가능한 AI 자동화',
      count: categoryA.length,
      description: `${categoryA.length}개의 프로세스에 AI를 즉시 적용하여 자동화할 수 있습니다.`
    });
  }

  const categoryB = aiAnalysis.filter((a) => a.fit_category === 'B');
  if (categoryB.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      title: '수동 개선 우선',
      count: categoryB.length,
      description: `${categoryB.length}개의 프로세스는 먼저 수동 개선 후 자동화를 검토하세요.`
    });
  }

  return recommendations;
}

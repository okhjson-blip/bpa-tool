import { db } from '../config/database.js';
import LLMService from '../services/llmService.js';
import { getCompanyApiKey } from '../services/companyCredentialService.js';
import { buildTaskReport } from '../services/reportService.js';

async function getTaskL6Processes(projectId, taskId) {
  const condition = { project_id: parseInt(projectId) };
  if (taskId) condition.task_id = parseInt(taskId);
  return (await db.select('processes', condition))
    .filter((process) => process.level === 'L6')
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id) - Number(b.id));
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
    const process = await db.selectOne('processes', { id: parseInt(processId) });
    if (process?.task_id) await db.update('tasks', Number(process.task_id), { current_step: 4 });

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
      return res.status(400).json({ error: 'BDW 진단을 수행할 L6 Act가 없습니다.' });
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
    if (taskId) await db.update('tasks', Number(taskId), { current_step: 4 });

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
        difficulty: ['low', 'medium', 'high'].includes(generated.difficulty) ? generated.difficulty : 'medium',
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
    if (taskId) await db.update('tasks', Number(taskId), { current_step: 5 });

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

export const getStoredAIFit = async (req, res) => {
  const projectId = Number(req.params.projectId);
  const taskId = Number(req.query.task_id);
  try {
    const task = await db.selectOne('tasks', { id: taskId });
    if (!task || Number(task.project_id) !== projectId) {
      return res.status(404).json({ error: '프로젝트에 속한 과제를 찾을 수 없습니다.' });
    }
    const processes = await getTaskL6Processes(projectId, taskId);
    const processOrder = new Map(processes.map((process, index) => [Number(process.id), index]));
    const processIds = new Set(processes.map((process) => Number(process.id)));
    const [storedAnalysis, projectToBe] = await Promise.all([
      db.select('ai_analysis', { project_id: projectId }),
      db.select('to_be_processes', { project_id: projectId })
    ]);
    const analysis = storedAnalysis
      .filter((item) => processIds.has(Number(item.process_id)))
      .sort((a, b) => (processOrder.get(Number(a.process_id)) ?? Number.MAX_SAFE_INTEGER) -
        (processOrder.get(Number(b.process_id)) ?? Number.MAX_SAFE_INTEGER));
    const toBeProcesses = projectToBe.filter((item) => processIds.has(Number(item.original_process_id)));
    const immediateCount = analysis.filter((item) => item.fit_category === 'A').length;
    res.json({
      model_used: null,
      analysis,
      toBeProcesses,
      summary: {
        immediate_application_count: immediateCount,
        automation_rate: analysis.length ? Math.round((immediateCount / analysis.length) * 100) : 0,
        estimated_total_time_savings: analysis.reduce((sum, item) => sum + Number(item.estimated_time_savings || 0), 0)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '저장된 AI FIT 분석을 불러올 수 없습니다.' });
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
      return res.status(400).json({ error: 'To-Be를 생성할 L6 Act가 없습니다.' });
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
    await db.update('tasks', Number(taskId), { current_step: 5 });

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
export const getSavedReport = async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const taskId = Number(req.query.task_id);
    const task = await db.selectOne('tasks', { id: taskId });
    if (!task || Number(task.project_id) !== projectId) {
      return res.status(404).json({ error: '프로젝트에 속한 과제를 찾을 수 없습니다.' });
    }
    const saved = await db.selectOne('task_reports', { task_id: taskId });
    res.json(saved ? { report: saved.report_data, saved_at: saved.saved_at } : null);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '저장된 결과 리포트를 불러올 수 없습니다.' });
  }
};

export const generateReport = async (req, res) => {
  try {
    const report = await buildTaskReport({
      database: db,
      projectId: req.params.projectId,
      taskId: req.query.task_id,
      frequencyUnit: req.query.frequency_unit,
      frequencyCount: req.query.frequency_count,
      annualFrequency: req.query.annual_frequency
    });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || '리포트 생성 중 오류' });
  }
};

export const saveReport = async (req, res) => {
  try {
    const report = await buildTaskReport({
      database: db,
      projectId: req.params.projectId,
      taskId: req.body.taskId,
      frequencyUnit: req.body.frequency_unit,
      frequencyCount: req.body.frequency_count,
      annualFrequency: req.body.annual_frequency
    });
    const savedAt = new Date().toISOString();
    const reportTitle = `${report.task_name || '과제'} AX 분석 결과`;
    await db.upsert('task_reports', {
      company_id: Number(req.auth.companyId),
      project_id: Number(report.project_id),
      task_id: Number(report.task_id),
      report_data: report,
      generated_by: req.auth.user.id,
      generated_at: report.created_at,
      report_title: reportTitle,
      report_format: 'pdf',
      report_version: 1,
      saved_at: savedAt,
      updated_at: savedAt
    }, { onConflict: 'task_id' });
    await db.update('tasks', Number(report.task_id), { status: 'completed', current_step: 6 });
    res.json({
      message: '결과 리포트가 저장되었습니다. 관리자 모드의 과제 상세에서 조회할 수 있습니다.',
      report,
      report_title: reportTitle,
      saved_at: savedAt
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || '결과 리포트 저장 중 오류' });
  }
};

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const REPORT_CSV_SCHEMA_VERSION = 'bpa-task-report-csv-v2';

function jsonCsvValue(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function reportDataWithoutBdwAndAiFit(report) {
  const { bdw_diagnosis, ai_fit_analysis, recommendations, ...filteredReport } = report || {};
  return {
    ...filteredReport,
    as_is_processes: (report?.as_is_processes || []).map((process) => {
      const { bdw_type, bdw_severity, ...filteredProcess } = process;
      return filteredProcess;
    })
  };
}

// 저장된 PDF 리포트 스냅샷을 다른 DB에서 복원할 수 있는 과제당 한 행 CSV 다운로드
export const exportTaskCsv = async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const taskId = parseInt(req.query.task_id);

  try {
    const project = await db.selectOne('projects', { id: projectId });
    const task = await db.selectOne('tasks', { id: taskId });
    if (!project || !task || Number(task.project_id) !== projectId) {
      return res.status(404).json({ error: '프로젝트에 속한 과제를 찾을 수 없습니다.' });
    }

    const [savedReport, company] = await Promise.all([
      db.selectOne('task_reports', { task_id: taskId }),
      db.selectOne('companies', { id: Number(project.company_id) })
    ]);
    if (!savedReport) {
      return res.status(409).json({ error: 'DB 이관용 CSV를 출력하려면 결과 리포트를 먼저 저장해 주세요.' });
    }
    const report = savedReport.report_data || {};
    const csvReport = reportDataWithoutBdwAndAiFit(report);
    const rows = [
      [
        'csv_schema_version', 'source_table', 'source_company_id', 'source_project_id',
        'source_task_id', 'company_name', 'project_name', 'task_name', 'task_start_date', 'task_end_date',
        'report_title', 'report_format', 'report_version', 'report_generated_at',
        'report_saved_at', 'analysis_period', 'hierarchy_json', 'task_goal',
        'project_participants_json', 'task_participants_json', 'as_is_processes_json',
        'to_be_processes_json', 'statistics_json', 'report_data_json'
      ],
      [
        REPORT_CSV_SCHEMA_VERSION,
        'task_reports',
        savedReport.company_id ?? report.company_id ?? '',
        savedReport.project_id ?? report.project_id ?? projectId,
        savedReport.task_id ?? report.task_id ?? taskId,
        company?.name || '',
        report.project_name || project.name || '',
        report.task_name || task.name || '',
        report.task_start_date || task.start_date || '',
        report.task_end_date || task.end_date || '',
        savedReport.report_title || `${report.task_name || task.name || '과제'} AX 분석 결과`,
        savedReport.report_format || 'pdf',
        savedReport.report_version || 1,
        savedReport.generated_at || report.created_at || '',
        savedReport.saved_at || '',
        report.analysis_period || '',
        jsonCsvValue(report.hierarchy, {}),
        report.task_goal || task.goal || '',
        jsonCsvValue(report.project_participants, []),
        jsonCsvValue(report.task_participants, []),
        jsonCsvValue(csvReport.as_is_processes, []),
        jsonCsvValue(csvReport.to_be_processes, []),
        jsonCsvValue(csvReport.statistics, {}),
        jsonCsvValue(csvReport, {})
      ]
    ];
    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const safeBaseName = `${project.name}_${task.name}_result-report-db`.replace(/[\\/:*?"<>|]/g, '_');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="result-report-db.csv"; filename*=UTF-8''${encodeURIComponent(safeBaseName)}.csv`
    );
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '결과 리포트 DB 이관용 CSV 생성 중 오류' });
  }
};

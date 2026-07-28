import { db } from '../config/database.js';

// BDW 진단: Bottleneck, Delay, Waste 태그 부착
export const tagBDW = async (req, res) => {
  const { processId } = req.params;
  const { bdw_type } = req.body;

  try {
    // 재태깅 시 이전 태그가 남아 조회 결과에 혼선을 주지 않도록 기존 태그 제거 후 저장
    db.deleteWhere('bdw_tags', { process_id: parseInt(processId) });

    const bdwTag = db.insert('bdw_tags', {
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

// BDW 진단 결과 조회
export const getBDWDiagnosis = async (req, res) => {
  const { projectId } = req.params;

  try {
    const processes = db.select('processes', { project_id: parseInt(projectId) });
    const tags = db.select('bdw_tags');

    // 각 프로세스에 태그 연결
    const processesWithTags = processes.map((proc) => {
      const tag = tags.find((t) => t.process_id === proc.id);
      return { ...proc, bdw_tag: tag?.bdw_type || 'normal' };
    });

    // 통계
    const bottlenecks = processesWithTags.filter((p) => p.bdw_tag === 'bottleneck');
    const delays = processesWithTags.filter((p) => p.bdw_tag === 'delay');
    const wastes = processesWithTags.filter((p) => p.bdw_tag === 'waste');

    const totalExecutionTime = processesWithTags.reduce(
      (sum, p) => sum + (p.execution_time || 0),
      0
    );
    const inefficientTime =
      bottlenecks.reduce((sum, p) => sum + (p.execution_time || 0), 0) +
      delays.reduce((sum, p) => sum + (p.execution_time || 0), 0);

    res.json({
      processes: processesWithTags,
      diagnosis: {
        bottleneck_count: bottlenecks.length,
        delay_count: delays.length,
        waste_count: wastes.length,
        total_execution_time: totalExecutionTime,
        inefficient_time: inefficientTime,
        inefficiency_rate: totalExecutionTime > 0 ? (inefficientTime / totalExecutionTime) * 100 : 0
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

  try {
    const processes = db.select('processes', { project_id: parseInt(projectId) });

    if (processes.length === 0) {
      return res.status(400).json({ error: '분석할 프로세스가 없습니다. 먼저 인터뷰 및 AI Draft를 생성하세요' });
    }

    // 모의 AI FIT 분석
    const fitAnalysis = processes.map((proc) => {
      // AI 적용 가능성: 1~5
      const aiPossibility = Math.random() * 5;
      // 비효율성: 1~5
      const inefficiency = Math.random() * 5;
      // FIT 스코어
      const fitScore = (aiPossibility * inefficiency) / 25;

      // A: 즉시 적용 (AI ↑, 비효율 ↑)
      // B: 수동 개선 先 (AI ↓, 비효율 ↑)
      // C: 장기 검토 (AI ↑, 비효율 ↓)
      // D: 현상 유지 (AI ↓, 비효율 ↓)
      let category = 'D';
      if (aiPossibility > 2.5 && inefficiency > 2.5) category = 'A';
      else if (aiPossibility < 2.5 && inefficiency > 2.5) category = 'B';
      else if (aiPossibility > 2.5 && inefficiency < 2.5) category = 'C';

      return {
        process_id: proc.id,
        project_id: parseInt(projectId),
        name: proc.name,
        ai_possibility: Math.round(aiPossibility * 10) / 10,
        inefficiency: Math.round(inefficiency * 10) / 10,
        fit_category: category,
        recommended_tech: getRecommendedTech(proc.method, category),
        estimated_time_savings: Math.round((proc.execution_time || 0) * (fitScore * 0.7))
      };
    });

    // 재분석 시 이전 결과가 누적되지 않도록 기존 분석 삭제 후 저장
    db.deleteWhere('ai_analysis', { project_id: parseInt(projectId) });
    fitAnalysis.forEach((analysis) => {
      db.insert('ai_analysis', analysis);
    });

    // 통계
    const categoryA = fitAnalysis.filter((a) => a.fit_category === 'A');
    const estimatedTotalSavings = fitAnalysis.reduce(
      (sum, a) => sum + a.estimated_time_savings,
      0
    );

    res.json({
      analysis: fitAnalysis,
      summary: {
        immediate_application_count: categoryA.length,
        automation_rate: Math.round((categoryA.length / fitAnalysis.length) * 100),
        estimated_total_time_savings: estimatedTotalSavings
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'AI FIT 분석 중 오류' });
  }
};

// To-Be 프로세스 생성
export const createToBe = async (req, res) => {
  const { projectId } = req.params;
  const { ai_analysis } = req.body;

  try {
    const processes = db.select('processes', { project_id: parseInt(projectId) });

    // 재생성 시 이전 To-Be 결과가 누적되지 않도록 기존 결과 삭제
    db.deleteWhere('to_be_processes', { project_id: parseInt(projectId) });

    // 각 프로세스에 대해 To-Be 버전 생성
    const toBeProcesses = processes.map((proc) => {
      const analysis = ai_analysis.find((a) => a.process_id === proc.id);
      const executionTime = proc.execution_time || 0;

      return db.insert('to_be_processes', {
        original_process_id: proc.id,
        project_id: parseInt(projectId),
        name: proc.name,
        ai_applied: analysis ? analysis.fit_category === 'A' : false,
        original_execution_time: executionTime,
        estimated_execution_time: analysis
          ? Math.max(0, executionTime - analysis.estimated_time_savings)
          : executionTime,
        automation_method: analysis?.recommended_tech || 'manual'
      });
    });

    res.json({
      message: 'To-Be 프로세스가 생성되었습니다',
      toBeProcesses
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'To-Be 생성 중 오류' });
  }
};

function getRecommendedTech(method, category) {
  if (category !== 'A') return 'Manual improvement';

  if (method === 'manual') {
    return 'LLM (Generative AI) 또는 RPA';
  } else if (method === 'system') {
    return 'Workflow Automation 또는 RPA';
  }
  return 'LLM';
}

// 리포트 생성
export const generateReport = async (req, res) => {
  const { projectId } = req.params;

  try {
    const project = db.selectOne('projects', { id: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ error: '과제를 찾을 수 없습니다' });
    }

    const processes = db.select('processes', { project_id: parseInt(projectId) });
    const processIds = new Set(processes.map((p) => p.id));

    // 다른 과제의 데이터가 섞이지 않도록 이 과제의 프로세스에 속한 항목만 필터링
    const bdwTags = db.select('bdw_tags').filter((t) => processIds.has(t.process_id));
    const aiAnalysis = db.select('ai_analysis', { project_id: parseInt(projectId) });
    const toBeProcesses = db.select('to_be_processes', { project_id: parseInt(projectId) });

    const asIsTime = processes.reduce((sum, p) => sum + (p.execution_time || 0), 0);
    const toBeTime = toBeProcesses.reduce(
      (sum, p) => sum + (p.estimated_execution_time || 0),
      0
    );
    const timeSavings = asIsTime - toBeTime;

    // FTE 계산: 절감 시간(분)은 주 1회 반복되는 업무 기준으로 가정
    // 연간 절감시간(시간) = 절감시간(분) × 52주 ÷ 60분 → FTE = 연간 절감시간 ÷ 2248시간/년
    const fte = ((timeSavings * 52) / 60 / 2248).toFixed(3);

    const report = {
      project_name: project.name,
      analysis_period: project.analysis_period,
      created_at: new Date().toISOString(),
      statistics: {
        total_processes: processes.length,
        as_is_total_time: asIsTime,
        to_be_total_time: toBeTime,
        time_savings: timeSavings,
        automation_rate:
          processes.length > 0
            ? Math.round((aiAnalysis.filter((a) => a.fit_category === 'A').length / processes.length) * 100)
            : 0,
        fte_equivalent: fte
      },
      bdw_diagnosis: {
        bottlenecks: bdwTags.filter((t) => t.bdw_type === 'bottleneck').length,
        delays: bdwTags.filter((t) => t.bdw_type === 'delay').length,
        wastes: bdwTags.filter((t) => t.bdw_type === 'waste').length
      },
      recommendations: generateRecommendations(aiAnalysis)
    };

    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '리포트 생성 중 오류' });
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

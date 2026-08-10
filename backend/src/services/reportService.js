function reportError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function generateRecommendations(aiAnalysis) {
  const recommendations = [];
  const categoryA = aiAnalysis.filter((item) => item.fit_category === 'A');
  const categoryB = aiAnalysis.filter((item) => item.fit_category === 'B');

  if (categoryA.length) {
    recommendations.push({
      priority: 'HIGH',
      title: '즉시 적용 가능한 AI 자동화',
      count: categoryA.length,
      description: `${categoryA.length}개의 프로세스에 AI를 즉시 적용하여 자동화할 수 있습니다.`
    });
  }
  if (categoryB.length) {
    recommendations.push({
      priority: 'MEDIUM',
      title: '수동 개선 우선',
      count: categoryB.length,
      description: `${categoryB.length}개의 프로세스는 먼저 수동 개선 후 자동화를 검토하세요.`
    });
  }
  return recommendations;
}

export async function buildTaskReport({
  database,
  projectId,
  taskId,
  frequencyUnit = 'week',
  frequencyCount = 1,
  annualFrequency = null
}) {
  const normalizedProjectId = Number(projectId);
  const normalizedTaskId = Number(taskId);
  const project = await database.selectOne('projects', { id: normalizedProjectId });
  if (!project) throw reportError('프로젝트를 찾을 수 없습니다.', 404);

  const task = await database.selectOne('tasks', { id: normalizedTaskId });
  if (!task || Number(task.project_id) !== normalizedProjectId) {
    throw reportError('프로젝트에 속한 과제를 찾을 수 없습니다.', 404);
  }

  const processes = (await database.select('processes', {
    project_id: normalizedProjectId,
    task_id: normalizedTaskId
  })).filter((process) => process.level === 'L6')
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id) - Number(b.id));
  const processIds = new Set(processes.map((process) => Number(process.id)));
  const [allBdwTags, projectAiAnalysis, projectToBeProcesses] = await Promise.all([
    database.select('bdw_tags'),
    database.select('ai_analysis', { project_id: normalizedProjectId }),
    database.select('to_be_processes', { project_id: normalizedProjectId })
  ]);
  const bdwTags = allBdwTags.filter((tag) => processIds.has(Number(tag.process_id)));
  const processOrder = new Map(processes.map((process, index) => [Number(process.id), index]));
  const aiAnalysis = projectAiAnalysis
    .filter((analysis) => processIds.has(Number(analysis.process_id)))
    .sort((a, b) => (processOrder.get(Number(a.process_id)) ?? Number.MAX_SAFE_INTEGER) -
      (processOrder.get(Number(b.process_id)) ?? Number.MAX_SAFE_INTEGER));
  const toBeProcesses = projectToBeProcesses.filter((process) =>
    processIds.has(Number(process.original_process_id))
  );
  const bdwByProcessId = new Map(bdwTags.map((tag) => [Number(tag.process_id), tag.bdw_type]));
  const bdwSeverityByProcessId = new Map(bdwTags.map((tag) => [Number(tag.process_id), tag.severity || 'medium']));
  const analysisByProcessId = new Map(aiAnalysis.map((analysis) => [Number(analysis.process_id), analysis]));
  const toBeByProcessId = new Map(
    toBeProcesses.map((process) => [Number(process.original_process_id), process])
  );

  const asIsTime = processes.reduce((sum, process) => sum + (Number(process.execution_time) || 0), 0);
  const asIsWaitingHours = processes.reduce((sum, process) => sum +
    (Number(process.waiting_time) || 0) + (Number(process.approval_waiting_time) || 0), 0);
  const toBeTime = processes.reduce((sum, process) => {
    const toBe = toBeByProcessId.get(Number(process.id));
    return sum + (toBe ? Number(toBe.estimated_execution_time) : Number(process.execution_time) || 0);
  }, 0);
  const timeSavings = Math.max(0, asIsTime - toBeTime);
  const normalizedUnit = ['day', 'week', 'month'].includes(frequencyUnit) ? frequencyUnit : 'week';
  const normalizedCount = Math.max(1, Number.parseInt(frequencyCount, 10) || 1);
  const frequencyMultipliers = { day: 365, week: 52, month: 12 };
  const normalizedAnnualFrequency = annualFrequency
    ? Math.max(1, Number.parseInt(annualFrequency, 10))
    : normalizedCount * frequencyMultipliers[normalizedUnit];
  const annualSavingsHours = (timeSavings * normalizedAnnualFrequency) / 60;
  const automatedCount = toBeProcesses.filter((process) => process.ai_applied === true).length;
  const automatedDifficultyScores = toBeProcesses.filter((process) => process.ai_applied === true).map((process) => {
    const difficulty = analysisByProcessId.get(Number(process.original_process_id))?.difficulty || 'medium';
    return { low: 1, medium: 2, high: 3 }[difficulty] || 2;
  });
  const averageDifficultyScore = automatedDifficultyScores.length
    ? automatedDifficultyScores.reduce((sum, score) => sum + score, 0) / automatedDifficultyScores.length
    : 0;
  const averageDifficulty = averageDifficultyScore === 0 ? '해당 없음' : averageDifficultyScore < 1.5 ? '하' : averageDifficultyScore < 2.5 ? '중' : '상';
  const automationRate = processes.length ? Math.round((automatedCount / processes.length) * 100) : 0;
  const timeSavingsRate = asIsTime ? Math.round((timeSavings / asIsTime) * 100) : 0;

  return {
    project_id: normalizedProjectId,
    task_id: normalizedTaskId,
    company_id: Number(project.company_id),
    project_name: project.name,
    task_name: task.name,
    task_goal: task.goal,
    project_participants: Array.isArray(project.participants) ? project.participants : [],
    task_participants: Array.isArray(task.participants) ? task.participants : [],
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
      frequency_unit: normalizedUnit,
      frequency_count: normalizedCount,
      annual_frequency: normalizedAnnualFrequency,
      annual_savings_hours: Math.round(annualSavingsHours * 10) / 10,
      fte_equivalent: Math.round((annualSavingsHours / 2248) * 1000) / 1000,
      estimated_development_cost: automatedCount * 8321500,
      automation_difficulty: averageDifficulty
    },
    bdw_diagnosis: {
      bottlenecks: bdwTags.filter((tag) => tag.bdw_type === 'bottleneck').length,
      delays: bdwTags.filter((tag) => tag.bdw_type === 'delay').length,
      wastes: bdwTags.filter((tag) => tag.bdw_type === 'waste').length
    },
    as_is_processes: processes.map((process) => ({
      ...process,
      bdw_type: bdwByProcessId.get(Number(process.id)) || 'normal',
      bdw_severity: bdwSeverityByProcessId.get(Number(process.id)) || 'medium'
    })),
    to_be_processes: processes.map((process) => {
      const toBe = toBeByProcessId.get(Number(process.id));
      return {
        original_process_id: process.id,
        level: 'L6',
        name: toBe?.name || process.name,
        ai_applied: toBe?.ai_applied ?? false,
        original_execution_time: Number(process.execution_time) || 0,
        estimated_execution_time: toBe
          ? Number(toBe.estimated_execution_time) || 0
          : Number(process.execution_time) || 0,
        automation_method: toBe?.automation_method || 'manual',
        method: toBe?.ai_applied ? 'ai' : (process.method || 'manual'),
        tool: toBe?.ai_applied ? (toBe?.automation_method || 'AI') : (process.tool || 'other'),
        difficulty: analysisByProcessId.get(Number(process.id))?.difficulty || 'medium'
      };
    }),
    ai_fit_analysis: aiAnalysis,
    recommendations: generateRecommendations(aiAnalysis)
  };
}

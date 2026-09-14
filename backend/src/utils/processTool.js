export const PROCESS_TOOL_VALUES = ['email', 'document', 'excel', 'web', 'erp', 'other'];
export const PRESET_PROCESS_TOOLS = ['email', 'document', 'excel', 'web', 'erp'];

const TOOL_LABELS = {
  email: '이메일',
  document: '문서',
  excel: '엑셀',
  web: '웹',
  erp: 'ERP',
  other: '기타 도구'
};

export function normalizeProcessToolFields(level, tool, toolOther) {
  if (level !== 'L6') return { tool: null, tool_other: null };
  const allowed = new Set(PROCESS_TOOL_VALUES);
  const rawTool = String(tool ?? '').trim();
  const rawOther = String(toolOther ?? '').trim().slice(0, 80);
  if (!rawTool || rawTool === 'other' || !allowed.has(rawTool)) {
    const extra = allowed.has(rawTool) ? rawOther : (rawOther || rawTool);
    return { tool: 'other', tool_other: extra || null };
  }
  return { tool: rawTool, tool_other: null };
}

export function processToolLabel(tool, toolOther) {
  const extra = String(toolOther || '').trim();
  if (TOOL_LABELS[tool]) {
    return tool === 'other' && extra ? `${TOOL_LABELS[tool]}(${extra})` : TOOL_LABELS[tool];
  }
  return extra || String(tool || '기타 도구');
}

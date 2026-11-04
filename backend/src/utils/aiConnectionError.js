import { isQuotaOrRateLimitError } from '../services/llmService.js';

const RETRY_GUIDANCE = '잠시 후 다시 시도해 주세요. 문제가 계속되면 시스템 관리자에게 문의해 주세요.';

function sanitizeDetail(message) {
  const text = String(message || '').trim();
  if (!text) return null;
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/key[=:]\s*[^\s,;]+/gi, 'key=***')
    .slice(0, 240);
}

export function isAiConnectionFailureError(error) {
  const code = String(error?.code || '');
  if (['AI_CREDENTIAL_NOT_FOUND', 'AI_CREDENTIAL_DECRYPT_FAILED', 'AI_QUOTA_EXHAUSTED', 'AI_CONNECTION_FAILED'].includes(code)) {
    return true;
  }
  if (isQuotaOrRateLimitError(error)) return true;
  const status = Number(error?.status);
  if ([408, 429, 502, 503, 504].includes(status)) return true;
  const message = String(error?.message || '');
  return /API 오류|응답 시간이 초과|연결|network|ECONN|ETIMEDOUT|fetch failed|AbortError|사용한도|rate limit|quota/i.test(message);
}

export function buildAiConnectionFailure(error, operationLabel = 'AI 분석') {
  const code = error?.code || (isAiConnectionFailureError(error) ? 'AI_CONNECTION_FAILED' : 'AI_ANALYSIS_FAILED');
  const detail = sanitizeDetail(error?.message);
  const issues = [];

  if (code === 'AI_CREDENTIAL_NOT_FOUND') {
    issues.push('시스템 관리자가 등록한 활성 AI API가 없습니다.');
    issues.push('관리자 AI API 관리에서 Key를 등록한 뒤 다시 시도해 주세요.');
  } else if (code === 'AI_CREDENTIAL_DECRYPT_FAILED') {
    issues.push('저장된 AI API Key를 사용할 수 없습니다.');
    issues.push('시스템 관리자에게 AI API 재등록을 요청한 뒤 다시 시도해 주세요.');
  } else if (code === 'AI_QUOTA_EXHAUSTED' || isQuotaOrRateLimitError(error)) {
    issues.push('등록된 AI API 연결에 실패했거나 사용한도가 소진되었습니다.');
    issues.push(RETRY_GUIDANCE);
  } else if (isAiConnectionFailureError(error)) {
    issues.push(`${operationLabel}을(를) 위한 AI API 연결에 실패했습니다.`);
    if (detail) issues.push(`상세: ${detail}`);
    issues.push(RETRY_GUIDANCE);
  } else {
    issues.push(`${operationLabel}에 실패했습니다.`);
    if (detail) issues.push(`상세: ${detail}`);
    issues.push(RETRY_GUIDANCE);
  }

  return {
    status: code === 'AI_CREDENTIAL_NOT_FOUND' ? 503 : 502,
    body: {
      error: issues[0],
      code,
      retry: true,
      issues
    }
  };
}

export function sendAiConnectionFailure(res, error, operationLabel) {
  const failure = buildAiConnectionFailure(error, operationLabel);
  return res.status(failure.status).json(failure.body);
}

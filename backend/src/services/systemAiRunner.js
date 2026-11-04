import LLMService, { isQuotaOrRateLimitError } from './llmService.js';
import {
  decryptSystemCredential,
  listActiveSystemCredentials
} from './systemCredentialService.js';

const DEFAULT_API_MAX_ATTEMPTS = 3; // 최초 1회 + 에러 시 2회 재시도
const FALLBACK_API_MAX_ATTEMPTS = 1;
const RETRY_DELAY_MS = 800;

function credentialModel(credential) {
  return credential.model_override || credential.tested_model || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNonFallbackError(error) {
  return error?.code === 'AI_CREDENTIAL_DECRYPT_FAILED' || error?.code === 'AI_CREDENTIAL_NOT_FOUND';
}

function shouldRetryOrFallback(error) {
  if (isNonFallbackError(error)) return false;
  const status = Number(error?.status);
  if (!Number.isFinite(status)) return true; // 네트워크/타임아웃 등
  if (status === 401 || status === 403) return true; // 다른 Key로 전환 가능
  if (status >= 500) return true;
  if (isQuotaOrRateLimitError(error)) return true;
  return true; // 연결/호출 실패 시 다음 순위 전환
}

function rankLabel(credential, index) {
  if (credential.is_default || index === 0) return '기본';
  return `${index + 1}순위`;
}

async function invokeWithRetries({
  operationName,
  credential,
  rank,
  maxAttempts,
  invoke
}) {
  const provider = credential.provider;
  const model = credentialModel(credential);
  const apiKey = decryptSystemCredential(credential);
  const attempts = [];
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await invoke(provider, apiKey, model);
      return {
        result,
        attempts,
        attempt_used: attempt
      };
    } catch (error) {
      lastError = error;
      attempts.push({
        attempt,
        status: error.status || null,
        message: error.message
      });
      console.warn(
        `[system-ai] ${operationName}: ${rank} (${provider}) ${attempt}/${maxAttempts} 실패`,
        error.message
      );
      if (attempt < maxAttempts && shouldRetryOrFallback(error)) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      break;
    }
  }

  throw Object.assign(lastError || new Error(`${rank} AI API 연결에 실패했습니다.`), {
    retryAttempts: attempts
  });
}

async function runWithPriorityFallback(operationName, invoke) {
  const credentials = await listActiveSystemCredentials();
  if (!credentials.length) {
    const error = new Error('시스템 관리자가 등록한 활성 AI API가 없습니다. 관리자 AI API 관리에서 Key를 등록해 주세요.');
    error.code = 'AI_CREDENTIAL_NOT_FOUND';
    throw error;
  }

  const failures = [];
  for (let index = 0; index < credentials.length; index += 1) {
    const credential = credentials[index];
    const rank = rankLabel(credential, index);
    const maxAttempts = credential.is_default || index === 0
      ? DEFAULT_API_MAX_ATTEMPTS
      : FALLBACK_API_MAX_ATTEMPTS;

    try {
      const outcome = await invokeWithRetries({
        operationName,
        credential,
        rank,
        maxAttempts,
        invoke
      });
      return {
        result: outcome.result,
        engine_used: credential.provider,
        model_used: LLMService.getModel(credential.provider, credentialModel(credential)),
        credential_id: credential.id,
        rank_used: rank,
        is_default_used: Boolean(credential.is_default),
        priority_used: Number(credential.priority),
        attempt_used: outcome.attempt_used,
        fallback_attempts: failures.length
      };
    } catch (error) {
      failures.push({
        provider: credential.provider,
        rank,
        is_default: Boolean(credential.is_default),
        priority: Number(credential.priority),
        credential_id: credential.id,
        attempts: error.retryAttempts || [],
        status: error.status || null,
        message: error.message
      });

      if (!shouldRetryOrFallback(error) || index === credentials.length - 1) {
        error.fallbackFailures = failures;
        throw error;
      }

      console.warn(
        `[system-ai] ${operationName}: ${rank} (${credential.provider}) 연결 실패 → 다음 순위로 전환`,
        error.message
      );
    }
  }

  const error = new Error(
    `등록된 모든 시스템 AI API 연결에 실패했습니다. (${failures.map((item) => item.rank).join(' → ')})`
  );
  error.code = 'AI_QUOTA_EXHAUSTED';
  error.fallbackFailures = failures;
  throw error;
}

export async function analyzeInterviewWithSystemAi(transcription, taskContext = {}) {
  const outcome = await runWithPriorityFallback('analyzeInterview', (engine, apiKey, model) =>
    LLMService.analyzeInterview(engine, apiKey, transcription, taskContext, model)
  );
  return { ...outcome, analysis: outcome.result };
}

export async function analyzeBDWWithSystemAi(processes) {
  const outcome = await runWithPriorityFallback('analyzeBDW', (engine, apiKey, model) =>
    LLMService.analyzeBDW(engine, apiKey, processes, model)
  );
  return { ...outcome, analysis: outcome.result };
}

export async function analyzeAIFitWithSystemAi(processes) {
  const outcome = await runWithPriorityFallback('analyzeAIFit', (engine, apiKey, model) =>
    LLMService.analyzeAIFit(engine, apiKey, processes, model)
  );
  return { ...outcome, analysis: outcome.result };
}

export async function getSystemAiAvailability() {
  const credentials = await listActiveSystemCredentials();
  const primary = credentials.find((item) => item.is_default) || credentials[0] || null;
  return {
    available: credentials.length > 0,
    active_count: credentials.length,
    primary_provider: primary?.provider || null,
    default_provider: primary?.provider || null,
    providers: credentials.map((credential, index) => ({
      id: credential.id,
      provider: credential.provider,
      is_default: Boolean(credential.is_default),
      priority: Number(credential.priority),
      rank_label: rankLabel(credential, index),
      model: credentialModel(credential)
    }))
  };
}

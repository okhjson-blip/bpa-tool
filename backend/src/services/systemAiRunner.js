import LLMService, { isQuotaOrRateLimitError } from './llmService.js';
import {
  decryptSystemCredential,
  listActiveSystemCredentials
} from './systemCredentialService.js';

function credentialModel(credential) {
  return credential.model_override || credential.tested_model || null;
}

async function runWithPriorityFallback(operationName, invoke) {
  const credentials = await listActiveSystemCredentials();
  if (!credentials.length) {
    const error = new Error('시스템 관리자가 등록한 활성 AI API가 없습니다. 관리자 AI API 관리에서 Key를 등록해 주세요.');
    error.code = 'AI_CREDENTIAL_NOT_FOUND';
    throw error;
  }

  const failures = [];
  for (const credential of credentials) {
    const provider = credential.provider;
    const model = credentialModel(credential);
    try {
      const apiKey = decryptSystemCredential(credential);
      const result = await invoke(provider, apiKey, model);
      return {
        result,
        engine_used: provider,
        model_used: LLMService.getModel(provider, model),
        credential_id: credential.id,
        priority_used: Number(credential.priority),
        fallback_attempts: failures.length
      };
    } catch (error) {
      failures.push({
        provider,
        priority: Number(credential.priority),
        credential_id: credential.id,
        status: error.status || null,
        message: error.message
      });
      if (!isQuotaOrRateLimitError(error)) {
        error.fallbackFailures = failures;
        throw error;
      }
      console.warn(
        `[system-ai] ${operationName}: priority ${credential.priority} (${provider}) 사용한도/레이트 제한 → 다음 API 시도`,
        error.message
      );
    }
  }

  const error = new Error(
    `등록된 모든 시스템 AI API의 사용한도 또는 요청 한도가 소진되었습니다. (${failures.map((item) => `${item.provider}#${item.priority}`).join(' → ')})`
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
  return {
    available: credentials.length > 0,
    active_count: credentials.length,
    primary_provider: credentials[0]?.provider || null,
    providers: credentials.map((credential) => ({
      id: credential.id,
      provider: credential.provider,
      priority: Number(credential.priority),
      model: credentialModel(credential)
    }))
  };
}

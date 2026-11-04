import { serviceDb } from '../config/database.js';
import LLMService from '../services/llmService.js';
import {
  listSystemCredentials,
  removeSystemCredential,
  reorderSystemCredentials,
  saveSystemCredential,
  setDefaultSystemCredential,
  SYSTEM_AI_PROVIDERS
} from '../services/systemCredentialService.js';

async function writeAdminAiAudit(action, targetId, metadata = {}) {
  await serviceDb.insert('audit_logs', {
    actor_user_id: null,
    company_id: null,
    action,
    target_type: 'system_ai_credential',
    target_id: targetId == null ? null : String(targetId),
    metadata: { ...metadata, actor: 'password_admin' }
  });
}

export async function listAdminAiCredentials(_req, res) {
  try {
    res.json({
      providers: SYSTEM_AI_PROVIDERS,
      credentials: await listSystemCredentials()
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '시스템 AI API 설정을 불러올 수 없습니다.' });
  }
}

export async function saveAdminAiCredential(req, res) {
  try {
    const provider = req.body.provider || req.params.provider;
    const connection = await LLMService.testConnection(provider, req.body.apiKey, req.body.model);
    const credential = await saveSystemCredential({
      id: req.params.id || req.body.id || null,
      provider: connection.engine,
      apiKey: req.body.apiKey,
      model: req.body.model || connection.model,
      displayName: req.body.display_name || req.body.displayName,
      makeDefault: Boolean(req.body.is_default || req.body.make_default || req.body.makeDefault),
      testedModel: connection.model
    });
    await writeAdminAiAudit('system_ai_credential_save', credential.id, {
      provider: credential.provider,
      model: credential.model,
      is_default: credential.is_default,
      priority: credential.priority
    });
    res.json({
      connected: true,
      credential,
      message: `${connection.model} 연결을 확인하고 시스템 AI API로 암호화 저장했습니다.`
    });
  } catch (error) {
    console.error(error);
    const status = error.code === 'INVALID_API_KEY' ? 401 : 502;
    res.status(status).json({
      connected: false,
      error: error.userMessage || error.message || 'API 공급자에 연결할 수 없습니다.'
    });
  }
}

export async function deleteAdminAiCredential(req, res) {
  try {
    await removeSystemCredential(req.params.id);
    await writeAdminAiAudit('system_ai_credential_delete', req.params.id, {});
    res.json({ message: '시스템 AI API Key를 삭제했습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'AI API Key 삭제 중 오류가 발생했습니다.' });
  }
}

export async function setAdminAiDefault(req, res) {
  try {
    const credential = await setDefaultSystemCredential(req.params.id);
    const credentials = await listSystemCredentials();
    await writeAdminAiAudit('system_ai_credential_default', credential.id, {
      provider: credential.provider
    });
    res.json({
      message: '기본 AI API로 설정했습니다. 오류 시 2회 재시도 후 다음 순위로 전환됩니다.',
      credential,
      credentials
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || '기본 AI API를 설정할 수 없습니다.' });
  }
}

export async function reorderAdminAiCredentials(req, res) {
  try {
    const credentials = await reorderSystemCredentials(req.body.ordered_ids || req.body.orderedIds);
    await writeAdminAiAudit('system_ai_credential_reorder', null, {
      ordered_ids: credentials.map((item) => item.id)
    });
    res.json({ message: '연결 우선순위 순서를 저장했습니다.', credentials });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || '우선순위 순서를 저장할 수 없습니다.' });
  }
}

import { serviceDb } from '../config/database.js';
import LLMService from '../services/llmService.js';
import {
  listCompanyCredentials,
  removeCompanyCredential,
  saveCompanyCredential,
  setDefaultCompanyEngine
} from '../services/companyCredentialService.js';

export async function getConnections(req, res) {
  try {
    res.json(await listCompanyCredentials(req.auth.companyId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 AI API 설정을 불러올 수 없습니다.' });
  }
}

export async function saveConnection(req, res) {
  const engine = req.params.engine;
  try {
    const connection = await LLMService.testConnection(engine, req.body.apiKey);
    const credential = await saveCompanyCredential({
      companyId: req.auth.companyId,
      engine,
      apiKey: req.body.apiKey,
      model: connection.model,
      userId: req.auth.user.id
    });
    const company = await serviceDb.selectOne('companies', { id: req.auth.companyId });
    if (!company.default_ai_provider) {
      await setDefaultCompanyEngine(req.auth.companyId, engine);
    }
    await serviceDb.insert('audit_logs', {
      actor_user_id: req.auth.user.id,
      company_id: req.auth.companyId,
      action: 'ai_credential_save',
      target_type: 'company_ai_credential',
      target_id: String(credential.id),
      metadata: { engine: connection.engine, model: connection.model }
    });
    res.json({
      connected: true,
      engine: connection.engine,
      model: connection.model,
      key_hint: credential.key_last_four ? `••••${credential.key_last_four}` : '등록됨',
      message: `${connection.model} API 연결을 확인하고 협력사 설정에 암호화 저장했습니다.`
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

export async function deleteConnection(req, res) {
  try {
    const deleted = await removeCompanyCredential(req.auth.companyId, req.params.engine);
    const company = await serviceDb.selectOne('companies', { id: req.auth.companyId });
    if (company?.default_ai_provider === req.params.engine) {
      await serviceDb.update('companies', req.auth.companyId, { default_ai_provider: null });
    }
    await serviceDb.insert('audit_logs', {
      actor_user_id: req.auth.user.id,
      company_id: req.auth.companyId,
      action: 'ai_credential_delete',
      target_type: 'company_ai_credential',
      metadata: { engine: req.params.engine }
    });
    res.json({ message: deleted ? 'AI API Key를 삭제했습니다.' : '삭제할 AI API Key가 없습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'AI API Key 삭제 중 오류가 발생했습니다.' });
  }
}

export async function setDefaultConnection(req, res) {
  try {
    await setDefaultCompanyEngine(req.auth.companyId, req.params.engine);
    await serviceDb.insert('audit_logs', {
      actor_user_id: req.auth.user.id,
      company_id: req.auth.companyId,
      action: 'ai_default_provider_update',
      target_type: 'company',
      target_id: String(req.auth.companyId),
      metadata: { engine: req.params.engine }
    });
    res.json({ message: '새 프로젝트의 기본 AI 엔진을 변경했습니다.' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || '기본 AI 엔진을 변경할 수 없습니다.' });
  }
}

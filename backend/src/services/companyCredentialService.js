import crypto from 'node:crypto';
import { serviceDb } from '../config/database.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const SUPPORTED_ENGINES = new Set(['gemini', 'chatgpt', 'claude']);

function encryptionKey() {
  const secret = String(process.env.BPA_CREDENTIAL_ENCRYPTION_KEY || '');
  if (secret.length < 32) {
    throw new Error('BPA_CREDENTIAL_ENCRYPTION_KEY는 32자 이상으로 설정해야 합니다.');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function normalizedEngine(engine) {
  const value = String(engine || '').trim().toLowerCase();
  if (!SUPPORTED_ENGINES.has(value)) throw new Error('지원하지 않는 AI 엔진입니다.');
  return value;
}

function encryptApiKey(apiKey) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  return {
    encrypted_key: encrypted.toString('base64'),
    encryption_iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64')
  };
}

function decryptApiKey(credential) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(credential.encryption_iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(credential.auth_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(credential.encrypted_key, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

export async function listCompanyCredentials(companyId) {
  const company = await serviceDb.selectOne('companies', { id: Number(companyId) });
  return (await serviceDb.select('company_ai_credentials', { company_id: Number(companyId) }))
    .map((credential) => ({
      engine: credential.provider,
      configured: credential.status === 'active',
      is_default: credential.provider === company?.default_ai_provider,
      key_hint: credential.key_last_four ? `••••${credential.key_last_four}` : '등록됨',
      model: credential.tested_model,
      tested_at: credential.tested_at,
      updated_at: credential.updated_at || credential.created_at
    }));
}

export async function saveCompanyCredential({ companyId, engine, apiKey, model, userId }) {
  const provider = normalizedEngine(engine);
  const normalizedKey = String(apiKey || '').trim();
  if (!normalizedKey) throw new Error('API Key를 입력해 주세요.');

  const encrypted = encryptApiKey(normalizedKey);
  const existing = await serviceDb.selectOne('company_ai_credentials', {
    company_id: Number(companyId),
    provider
  });
  const values = {
    ...encrypted,
    key_last_four: normalizedKey.slice(-4),
    tested_model: model,
    tested_at: new Date().toISOString(),
    status: 'active',
    updated_by: userId
  };
  if (existing) return serviceDb.update('company_ai_credentials', existing.id, values);
  return serviceDb.insert('company_ai_credentials', {
    company_id: Number(companyId),
    provider,
    ...values,
    created_by: userId
  });
}

export async function removeCompanyCredential(companyId, engine) {
  return serviceDb.deleteWhere('company_ai_credentials', {
    company_id: Number(companyId),
    provider: normalizedEngine(engine)
  });
}

export async function getCompanyApiKey(companyId, engine) {
  const provider = normalizedEngine(engine);
  const credential = await serviceDb.selectOne('company_ai_credentials', {
    company_id: Number(companyId),
    provider,
    status: 'active'
  });
  if (!credential) {
    const error = new Error('이 프로젝트의 AI 엔진 API Key가 협력사 설정에 등록되지 않았습니다.');
    error.code = 'AI_CREDENTIAL_NOT_FOUND';
    throw error;
  }
  try {
    return decryptApiKey(credential);
  } catch {
    const error = new Error('저장된 AI API Key를 복호화할 수 없습니다. AI API 설정에서 다시 등록해 주세요.');
    error.code = 'AI_CREDENTIAL_DECRYPT_FAILED';
    throw error;
  }
}

export async function setDefaultCompanyEngine(companyId, engine) {
  const provider = normalizedEngine(engine);
  const credential = await serviceDb.selectOne('company_ai_credentials', {
    company_id: Number(companyId),
    provider,
    status: 'active'
  });
  if (!credential) throw new Error('기본 엔진으로 지정할 API Key를 먼저 등록해 주세요.');
  return serviceDb.update('companies', Number(companyId), { default_ai_provider: provider });
}

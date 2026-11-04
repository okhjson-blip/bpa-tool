import crypto from 'node:crypto';
import { serviceDb } from '../config/database.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export const SYSTEM_AI_PROVIDERS = Object.freeze([
  'gemini',
  'chatgpt',
  'claude',
  'openrouter',
  'github'
]);

const SUPPORTED_PROVIDERS = new Set(SYSTEM_AI_PROVIDERS);

function encryptionKey() {
  const secret = String(process.env.BPA_CREDENTIAL_ENCRYPTION_KEY || '');
  if (secret.length < 32) {
    throw new Error('BPA_CREDENTIAL_ENCRYPTION_KEY는 32자 이상으로 설정해야 합니다.');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function normalizedSystemProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(value)) throw new Error('지원하지 않는 AI 엔진입니다.');
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

function toPublicCredential(credential) {
  return {
    id: credential.id,
    provider: credential.provider,
    display_name: credential.display_name || null,
    configured: credential.status === 'active',
    status: credential.status,
    priority: Number(credential.priority),
    key_hint: credential.key_last_four ? `••••${credential.key_last_four}` : '등록됨',
    model: credential.model_override || credential.tested_model || null,
    model_override: credential.model_override || null,
    tested_model: credential.tested_model || null,
    tested_at: credential.tested_at,
    updated_at: credential.updated_at || credential.created_at
  };
}

function sortByPriority(credentials) {
  return [...credentials].sort((a, b) => {
    const priorityDiff = Number(a.priority) - Number(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return Number(a.id) - Number(b.id);
  });
}

async function nextPriority() {
  const rows = await serviceDb.select('system_ai_credentials');
  if (!rows.length) return 1;
  return Math.max(...rows.map((row) => Number(row.priority) || 0)) + 1;
}

export async function listSystemCredentials() {
  return sortByPriority(await serviceDb.select('system_ai_credentials')).map(toPublicCredential);
}

export async function listActiveSystemCredentials() {
  return sortByPriority(
    await serviceDb.select('system_ai_credentials', { status: 'active' })
  );
}

export async function hasActiveSystemCredential() {
  const rows = await listActiveSystemCredentials();
  return rows.length > 0;
}

export async function getPrimarySystemProvider() {
  const [first] = await listActiveSystemCredentials();
  return first?.provider || null;
}

export async function saveSystemCredential({
  id = null,
  provider,
  apiKey,
  model,
  displayName,
  priority,
  testedModel
}) {
  const normalizedProvider = normalizedSystemProvider(provider);
  const normalizedKey = String(apiKey || '').trim();
  if (!normalizedKey) throw new Error('API Key를 입력해 주세요.');

  const encrypted = encryptApiKey(normalizedKey);
  const values = {
    provider: normalizedProvider,
    display_name: String(displayName || '').trim() || null,
    ...encrypted,
    key_last_four: normalizedKey.slice(-4),
    model_override: String(model || '').trim() || null,
    tested_model: testedModel || String(model || '').trim() || null,
    tested_at: new Date().toISOString(),
    status: 'active'
  };

  if (id) {
    const existing = await serviceDb.selectOne('system_ai_credentials', { id: Number(id) });
    if (!existing) throw new Error('수정할 AI API 설정을 찾을 수 없습니다.');
    if (priority != null) values.priority = Math.max(1, Number(priority) || existing.priority);
    return toPublicCredential(await serviceDb.update('system_ai_credentials', existing.id, values));
  }

  values.priority = Math.max(1, Number(priority) || await nextPriority());
  return toPublicCredential(await serviceDb.insert('system_ai_credentials', values));
}

export async function removeSystemCredential(id) {
  return serviceDb.delete('system_ai_credentials', Number(id));
}

export async function updateSystemCredentialPriority(id, priority) {
  const existing = await serviceDb.selectOne('system_ai_credentials', { id: Number(id) });
  if (!existing) throw new Error('AI API 설정을 찾을 수 없습니다.');
  return toPublicCredential(await serviceDb.update('system_ai_credentials', existing.id, {
    priority: Math.max(1, Number(priority) || 1)
  }));
}

export async function reorderSystemCredentials(orderedIds) {
  const ids = (orderedIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) throw new Error('우선순위 순서를 전달해 주세요.');

  const existing = await serviceDb.select('system_ai_credentials');
  const byId = new Map(existing.map((row) => [Number(row.id), row]));
  for (const id of ids) {
    if (!byId.has(id)) throw new Error(`AI API 설정(#${id})을 찾을 수 없습니다.`);
  }

  await Promise.all(ids.map((id, index) =>
    serviceDb.update('system_ai_credentials', id, { priority: index + 1 })
  ));
  return listSystemCredentials();
}

export function decryptSystemCredential(credential) {
  try {
    return decryptApiKey(credential);
  } catch {
    const error = new Error('저장된 시스템 AI API Key를 복호화할 수 없습니다. 관리자 설정에서 다시 등록해 주세요.');
    error.code = 'AI_CREDENTIAL_DECRYPT_FAILED';
    throw error;
  }
}

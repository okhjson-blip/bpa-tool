import crypto from 'node:crypto';
import { serviceDb } from '../config/database.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export const SYSTEM_AI_PROVIDERS = Object.freeze([
  'gemini',
  'chatgpt',
  'claude',
  'openrouter',
  'groq'
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

function toPublicCredential(credential, rankLabel = null) {
  return {
    id: credential.id,
    provider: credential.provider,
    display_name: credential.display_name || null,
    configured: credential.status === 'active',
    status: credential.status,
    is_default: Boolean(credential.is_default),
    priority: Number(credential.priority),
    rank_label: rankLabel,
    key_hint: credential.key_last_four ? `••••${credential.key_last_four}` : '등록됨',
    model: credential.model_override || credential.tested_model || null,
    model_override: credential.model_override || null,
    tested_model: credential.tested_model || null,
    tested_at: credential.tested_at,
    updated_at: credential.updated_at || credential.created_at
  };
}

function sortCredentials(credentials) {
  return [...credentials].sort((a, b) => {
    const defaultDiff = Number(Boolean(b.is_default)) - Number(Boolean(a.is_default));
    if (defaultDiff !== 0) return defaultDiff;
    const priorityDiff = Number(a.priority) - Number(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return Number(a.id) - Number(b.id);
  });
}

function withRankLabels(credentials) {
  const sorted = sortCredentials(credentials);
  let fallbackRank = 2;
  return sorted.map((credential) => {
    if (credential.is_default) {
      return toPublicCredential(credential, '기본');
    }
    const label = `${fallbackRank}순위`;
    fallbackRank += 1;
    return toPublicCredential(credential, label);
  });
}

async function nextFallbackPriority() {
  const rows = await serviceDb.select('system_ai_credentials');
  const nonDefaults = rows.filter((row) => !row.is_default);
  // DB check: priority >= 1. 기본=1, 나머지는 2부터.
  if (!nonDefaults.length) return 2;
  return Math.max(2, ...nonDefaults.map((row) => Number(row.priority) || 1)) + 1;
}

async function clearDefaultFlags(exceptId = null) {
  const rows = await serviceDb.select('system_ai_credentials', { is_default: true });
  await Promise.all(
    rows
      .filter((row) => exceptId == null || Number(row.id) !== Number(exceptId))
      .map((row) => serviceDb.update('system_ai_credentials', row.id, { is_default: false }))
  );
}

async function ensureSingleDefault() {
  const rows = sortCredentials(await serviceDb.select('system_ai_credentials'));
  if (!rows.length) return null;
  const currentDefault = rows.find((row) => row.is_default && row.status === 'active')
    || rows.find((row) => row.is_default)
    || rows.find((row) => row.status === 'active')
    || rows[0];
  if (!currentDefault.is_default) {
    await clearDefaultFlags();
    await serviceDb.update('system_ai_credentials', currentDefault.id, { is_default: true });
  } else {
    await clearDefaultFlags(currentDefault.id);
  }
  return currentDefault.id;
}

export async function listSystemCredentials() {
  await ensureSingleDefault();
  return withRankLabels(await serviceDb.select('system_ai_credentials'));
}

export async function listActiveSystemCredentials() {
  await ensureSingleDefault();
  return sortCredentials(
    await serviceDb.select('system_ai_credentials', { status: 'active' })
  );
}

export async function hasActiveSystemCredential() {
  const rows = await listActiveSystemCredentials();
  return rows.length > 0;
}

export async function getPrimarySystemProvider() {
  const credentials = await listActiveSystemCredentials();
  const primary = credentials.find((item) => item.is_default) || credentials[0] || null;
  return primary?.provider || null;
}

export async function saveSystemCredential({
  id = null,
  provider,
  apiKey,
  model,
  displayName,
  makeDefault = false,
  testedModel
}) {
  const normalizedProvider = normalizedSystemProvider(provider);
  const normalizedKey = String(apiKey || '').trim();
  if (!normalizedKey) throw new Error('API Key를 입력해 주세요.');

  const existingRows = await serviceDb.select('system_ai_credentials');
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
    const updated = await serviceDb.update('system_ai_credentials', existing.id, values);
    if (makeDefault || existing.is_default) {
      await setDefaultSystemCredential(existing.id);
    }
    return (await listSystemCredentials()).find((item) => Number(item.id) === Number(existing.id))
      || toPublicCredential(updated, existing.is_default ? '기본' : null);
  }

  const shouldBeDefault = makeDefault || existingRows.length === 0;
  values.is_default = false;
  values.priority = shouldBeDefault ? 1 : await nextFallbackPriority();
  const inserted = await serviceDb.insert('system_ai_credentials', values);
  if (shouldBeDefault) {
    await setDefaultSystemCredential(inserted.id);
  }
  return (await listSystemCredentials()).find((item) => Number(item.id) === Number(inserted.id))
    || toPublicCredential(inserted, shouldBeDefault ? '기본' : null);
}

export async function removeSystemCredential(id) {
  const existing = await serviceDb.selectOne('system_ai_credentials', { id: Number(id) });
  if (!existing) return false;
  await serviceDb.delete('system_ai_credentials', Number(id));
  if (existing.is_default) {
    await ensureSingleDefault();
  }
  return true;
}

export async function setDefaultSystemCredential(id) {
  const existing = await serviceDb.selectOne('system_ai_credentials', { id: Number(id) });
  if (!existing) throw new Error('기본으로 지정할 AI API 설정을 찾을 수 없습니다.');
  if (existing.status !== 'active') throw new Error('활성 상태의 API만 기본으로 지정할 수 있습니다.');

  await clearDefaultFlags(existing.id);
  const updated = await serviceDb.update('system_ai_credentials', existing.id, {
    is_default: true,
    priority: 1
  });

  // 나머지 API의 순위 번호를 2부터 재정렬한다(화면 라벨: 2순위, 3순위...).
  const others = sortCredentials(
    (await serviceDb.select('system_ai_credentials')).filter((row) => Number(row.id) !== Number(existing.id))
  );
  await Promise.all(others.map((row, index) =>
    serviceDb.update('system_ai_credentials', row.id, {
      is_default: false,
      priority: index + 2
    })
  ));

  return toPublicCredential(updated, '기본');
}

export async function reorderSystemCredentials(orderedIds) {
  const ids = (orderedIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) throw new Error('우선순위 순서를 전달해 주세요.');

  const existing = await serviceDb.select('system_ai_credentials');
  const byId = new Map(existing.map((row) => [Number(row.id), row]));
  for (const id of ids) {
    if (!byId.has(id)) throw new Error(`AI API 설정(#${id})을 찾을 수 없습니다.`);
  }

  const defaultCredential = existing.find((row) => row.is_default)
    || byId.get(ids[0]);
  const defaultId = Number(defaultCredential.id);
  const fallbackIds = ids.filter((id) => id !== defaultId);
  // 요청 목록에 기본이 없으면 현재 기본을 유지하고 나머지만 순서 반영
  const missingFallback = existing
    .filter((row) => Number(row.id) !== defaultId && !fallbackIds.includes(Number(row.id)))
    .sort((a, b) => Number(a.priority) - Number(b.priority) || Number(a.id) - Number(b.id))
    .map((row) => Number(row.id));

  await clearDefaultFlags(defaultId);
  await serviceDb.update('system_ai_credentials', defaultId, { is_default: true, priority: 1 });
  const orderedFallback = [...fallbackIds, ...missingFallback];
  await Promise.all(orderedFallback.map((id, index) =>
    serviceDb.update('system_ai_credentials', id, {
      is_default: false,
      priority: index + 2
    })
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

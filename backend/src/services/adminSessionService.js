import crypto from 'node:crypto';

export const ADMIN_COOKIE_NAME = 'bpa_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;

function signingKey() {
  const secret = String(process.env.BPA_CREDENTIAL_ENCRYPTION_KEY || '');
  if (secret.length < 32) {
    throw new Error('BPA_CREDENTIAL_ENCRYPTION_KEY는 32자 이상으로 설정해야 합니다.');
  }
  return crypto.createHash('sha256').update(`bpa-admin-session:${secret}`, 'utf8').digest();
}

function signature(value) {
  return crypto.createHmac('sha256', signingKey()).update(value).digest('base64url');
}

export function createAdminSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    type: 'admin',
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    nonce: crypto.randomBytes(12).toString('base64url')
  })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminSessionToken(token) {
  const [payload, providedSignature, ...extra] = String(token || '').split('.');
  if (!payload || !providedSignature || extra.length) return false;
  const expectedSignature = signature(payload);
  const expected = Buffer.from(expectedSignature, 'utf8');
  const provided = Buffer.from(providedSignature, 'utf8');
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed.type === 'admin' && Number(parsed.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function adminCookie(token) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  return [
    `${ADMIN_COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${SESSION_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : [])
  ].join('; ');
}

export function clearAdminCookie() {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  return [
    `${ADMIN_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : [])
  ].join('; ');
}

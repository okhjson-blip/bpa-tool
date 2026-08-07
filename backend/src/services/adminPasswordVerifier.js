const FUNCTION_NAME = 'admin-password-verify';
const REQUEST_TIMEOUT_MS = 8_000;

function verificationUrl() {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  if (!supabaseUrl) throw new Error('SUPABASE_URL 환경 변수가 필요합니다.');
  return `${supabaseUrl}/functions/v1/${FUNCTION_NAME}`;
}

function serviceKey() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다.');
  return key;
}

export async function verifyAdminPassword(password) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(verificationUrl(), {
      method: 'POST',
      headers: {
        apikey: serviceKey(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: String(password || '') }),
      signal: controller.signal
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error('Supabase 관리자 인증 응답을 해석할 수 없습니다.');
    }
    if (!response.ok) {
      throw new Error(payload.error || `Supabase 관리자 인증 오류 (${response.status})`);
    }
    return payload.valid === true;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Supabase 관리자 인증 요청 시간이 초과되었습니다.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

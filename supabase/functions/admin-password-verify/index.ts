const encoder = new TextEncoder();

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function constantTimeEqual(leftValue: string, rightValue: string) {
  const left = encoder.encode(leftValue);
  const right = encoder.encode(rightValue);
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function configuredSecretKeys() {
  const keys: string[] = [];
  const keyMap = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keyMap) {
    try {
      const parsed = JSON.parse(keyMap) as Record<string, unknown>;
      Object.values(parsed).forEach((value) => {
        if (typeof value === 'string' && value) keys.push(value);
      });
    } catch {
      // Fall through to the legacy service-role key when the JSON map is unavailable.
    }
  }
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacyKey) keys.push(legacyKey);
  return keys;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: '허용되지 않은 요청입니다.' }, 405);

  const callerKey = request.headers.get('apikey') || '';
  const authorized = Boolean(callerKey) && configuredSecretKeys()
    .some((key) => constantTimeEqual(callerKey, key));
  if (!authorized) return json({ error: '서버 인증이 필요합니다.' }, 401);

  const configuredPassword = Deno.env.get('BPA_ADMIN_PASSWORD') || '';
  if (!configuredPassword) return json({ error: '관리자 비밀번호가 설정되지 않았습니다.' }, 503);

  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return json({ error: '요청 형식이 올바르지 않습니다.' }, 400);
  }

  return json({ valid: constantTimeEqual(password, configuredPassword) });
});

const baseUrl = String(process.argv[2] || process.env.DEPLOYMENT_URL || '').replace(/\/$/, '');

if (!/^https?:\/\//i.test(baseUrl)) {
  console.error('사용법: npm run check:deployment -- https://your-app.vercel.app');
  process.exit(1);
}

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    redirect: 'follow'
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data, text };
}

const health = await request('/api/health');
if (!health.response.ok || health.data?.status !== 'OK' || health.data?.db !== 'supabase' || health.data?.data_api !== true) {
  throw new Error(`배포 health 실패 (${health.response.status}): ${health.text}`);
}

const companies = await request('/api/auth/companies');
if (!companies.response.ok || !Array.isArray(companies.data)) {
  throw new Error(`배포 데이터 API 실패 (${companies.response.status}): ${companies.text}`);
}

console.log(JSON.stringify({
  ok: true,
  deployment_url: baseUrl,
  health: {
    status: health.data.status,
    db: health.data.db,
    data_api: health.data.data_api,
    probe: health.data.probe
  },
  data_api: {
    path: '/api/auth/companies',
    status: companies.response.status,
    company_count: companies.data.length
  }
}, null, 2));

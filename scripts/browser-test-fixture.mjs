import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const mode = process.argv[2];

if (mode === 'create') {
  const runId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const email = `bpa-browser-${runId}@example.com`;
  const companyResult = await service.from('companies')
    .insert({
      name: `BPA 브라우저 검증 ${runId}`,
      consulting_year: 2026,
      consulting_half: '하반기',
      status: 'active'
    })
    .select().single();
  if (companyResult.error) throw companyResult.error;
  const company = companyResult.data;

  console.log(JSON.stringify({ companyId: company.id, email }));
} else if (mode === 'cleanup') {
  const companyId = Number(process.argv[3]);
  if (!Number.isInteger(companyId)) {
    throw new Error('정리할 테스트 식별자가 올바르지 않습니다.');
  }
  const company = await service.from('companies').select('name').eq('id', companyId).maybeSingle();
  const memberships = await service.from('company_memberships').select('user_id').eq('company_id', companyId);
  const userIds = (memberships.data || []).map((item) => item.user_id);
  const profiles = userIds.length
    ? await service.from('profiles').select('user_id,email').in('user_id', userIds)
    : { data: [] };
  if (!company.data?.name?.startsWith('BPA 브라우저 검증 ') ||
      (profiles.data || []).some((profile) => !profile.email?.startsWith('bpa-browser-'))) {
    throw new Error('테스트 데이터가 아니므로 정리를 중단했습니다.');
  }
  const projects = await service.from('projects').select('id').eq('company_id', companyId);
  if (projects.data?.length) {
    await service.from('projects').delete().in('id', projects.data.map((item) => item.id));
  }
  await service.from('audit_logs').delete().eq('company_id', companyId);
  await service.from('companies').delete().eq('id', companyId);
  for (const userId of userIds) await service.auth.admin.deleteUser(userId);
  console.log(JSON.stringify({ ok: true }));
} else {
  throw new Error('create 또는 cleanup 모드를 지정하세요.');
}

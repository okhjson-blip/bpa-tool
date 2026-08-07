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
    .insert({ name: `BPA 브라우저 검증 ${runId}`, status: 'active' })
    .select().single();
  if (companyResult.error) throw companyResult.error;
  const company = companyResult.data;

  try {
    const userResult = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name: '브라우저 검증 사용자', company_id: company.id, auth_mode: 'partner' }
    });
    if (userResult.error) throw userResult.error;
    const user = userResult.data.user;
    const linkResult = await service.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: 'http://localhost:3000/' }
    });
    if (linkResult.error) throw linkResult.error;
    console.log(JSON.stringify({
      companyId: company.id,
      userId: user.id,
      email,
      actionLink: linkResult.data.properties.action_link
    }));
  } catch (error) {
    await service.from('companies').delete().eq('id', company.id);
    throw error;
  }
} else if (mode === 'cleanup') {
  const companyId = Number(process.argv[3]);
  const userId = String(process.argv[4] || '');
  if (!Number.isInteger(companyId) || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error('정리할 테스트 식별자가 올바르지 않습니다.');
  }
  const company = await service.from('companies').select('name').eq('id', companyId).maybeSingle();
  const user = await service.auth.admin.getUserById(userId);
  if (!company.data?.name?.startsWith('BPA 브라우저 검증 ') ||
      !user.data?.user?.email?.startsWith('bpa-browser-')) {
    throw new Error('테스트 데이터가 아니므로 정리를 중단했습니다.');
  }
  const projects = await service.from('projects').select('id').eq('company_id', companyId);
  if (projects.data?.length) {
    await service.from('projects').delete().in('id', projects.data.map((item) => item.id));
  }
  await service.from('audit_logs').delete().eq('company_id', companyId);
  await service.from('companies').delete().eq('id', companyId);
  await service.auth.admin.deleteUser(userId);
  console.log(JSON.stringify({ ok: true }));
} else {
  throw new Error('create 또는 cleanup 모드를 지정하세요.');
}


import { serviceDb } from '../config/database.js';

export async function getActiveCompanies(_req, res) {
  try {
    const companies = (await serviceDb.select('companies', { status: 'active' }))
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    res.json(companies);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 목록을 불러올 수 없습니다.' });
  }
}

export async function completeProfile(req, res) {
  const user = req.auth.user;
  const name = String(req.body.name || user.user_metadata?.name || '').trim();
  const companyId = Number(req.body.company_id || user.user_metadata?.company_id);

  try {
    if (!name) return res.status(400).json({ error: '담당자 이름을 입력해 주세요.' });
    if (!Number.isInteger(companyId)) return res.status(400).json({ error: '협력사를 선택해 주세요.' });

    const company = await serviceDb.selectOne('companies', { id: companyId });
    if (!company || company.status !== 'active') {
      return res.status(400).json({ error: '가입할 수 없는 협력사입니다.' });
    }

    const existingMemberships = await serviceDb.select('company_memberships', { user_id: user.id });
    if (existingMemberships.length && !existingMemberships.some((item) => Number(item.company_id) === companyId)) {
      return res.status(409).json({ error: '이미 다른 협력사에 가입된 계정입니다.' });
    }

    const profile = await serviceDb.upsert('profiles', {
      user_id: user.id,
      name,
      email: user.email,
      app_role: req.auth.profile?.app_role === 'super_admin' ? 'super_admin' : 'company_user',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    let membership = existingMemberships.find((item) => Number(item.company_id) === companyId);
    if (!membership) {
      membership = await serviceDb.insert('company_memberships', {
        company_id: companyId,
        user_id: user.id,
        role: 'company_editor',
        status: 'active'
      });
      await serviceDb.insert('audit_logs', {
        actor_user_id: user.id,
        company_id: companyId,
        action: 'company_signup',
        target_type: 'company_membership',
        target_id: String(membership.id),
        metadata: { email: user.email }
      });
    }

    res.json({ profile, membership: { ...membership, company } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '담당자 가입 정보를 저장할 수 없습니다.' });
  }
}

export async function getMe(req, res) {
  res.json({
    user: { id: req.auth.user.id, email: req.auth.user.email },
    profile: req.auth.profile,
    memberships: req.auth.memberships
  });
}

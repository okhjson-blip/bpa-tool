import { getServiceClient, serviceDb } from '../config/database.js';
import {
  adminCookie,
  clearAdminCookie,
  createAdminSessionToken
} from '../services/adminSessionService.js';
import { verifyAdminPassword } from '../services/adminPasswordVerifier.js';

const adminAttempts = new Map();
const ADMIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 5;

function alreadyRegistered(res) {
  return res.status(409).json({
    code: 'ALREADY_REGISTERED',
    error: '이미 가입하셨습니다. 시작하기를 클릭하여 로그인하십시오.'
  });
}

async function linkCompanyUserDirectory({ companyId, userId, name, email, accessedAt, allowRebind = false }) {
  let account = await serviceDb.selectOne('company_user_accounts', {
    company_id: companyId,
    email
  });
  if (account?.auth_user_id && account.auth_user_id !== userId && !allowRebind) return null;

  if (!account) {
    try {
      account = await serviceDb.insert('company_user_accounts', {
        company_id: companyId,
        auth_user_id: userId,
        name,
        email,
        last_access_at: accessedAt
      });
    } catch (error) {
      if (error?.code !== '23505') throw error;
      account = await serviceDb.selectOne('company_user_accounts', {
        company_id: companyId,
        email
      });
      if (!account || (account.auth_user_id && account.auth_user_id !== userId)) return null;
    }
  }

  account = await serviceDb.update('company_user_accounts', account.id, {
    auth_user_id: userId,
    name,
    last_access_at: accessedAt
  });
  return account;
}

function attemptState(ip) {
  const now = Date.now();
  const current = adminAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + ADMIN_ATTEMPT_WINDOW_MS };
    adminAttempts.set(ip, fresh);
    return fresh;
  }
  return current;
}

export async function getActiveCompanies(_req, res) {
  try {
    const companies = (await serviceDb.select('companies', { status: 'active' }))
      .map(({ id, name, consulting_year, consulting_half }) => ({
        id,
        name,
        consulting_year,
        consulting_half
      }))
      .sort((a, b) =>
        Number(b.consulting_year || 0) - Number(a.consulting_year || 0) ||
        Number(b.consulting_half === '하반기') - Number(a.consulting_half === '하반기') ||
        a.name.localeCompare(b.name, 'ko')
      );
    res.json(companies);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 목록을 불러올 수 없습니다.' });
  }
}

export async function checkRegistration(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const companyId = Number(req.body.company_id);
  try {
    const company = await serviceDb.selectOne('companies', { id: companyId });
    if (!company || company.status !== 'active') {
      return res.status(400).json({ error: '가입할 수 없는 협력사입니다.' });
    }
    const account = await serviceDb.selectOne('company_user_accounts', {
      company_id: companyId,
      email
    });
    res.json({ registered: Boolean(account) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '사용자 등록 여부를 확인할 수 없습니다.' });
  }
}

export async function completeProfile(req, res) {
  const user = req.auth.user;
  const name = String(req.body.name || user.user_metadata?.name || '').trim();
  const email = String(req.body.email || user.email || user.user_metadata?.email || '').trim().toLowerCase();
  const companyId = Number(req.body.company_id || user.user_metadata?.company_id);

  try {
    if (!name) return res.status(400).json({ error: '이름을 입력해 주세요.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '올바른 이메일 주소 형식으로 입력해 주세요.' });
    }
    if (!Number.isInteger(companyId)) return res.status(400).json({ error: '협력사를 선택해 주세요.' });

    const company = await serviceDb.selectOne('companies', { id: companyId });
    if (!company || company.status !== 'active') {
      return res.status(400).json({ error: '가입할 수 없는 협력사입니다.' });
    }

    const directoryAccountBeforeLogin = await serviceDb.selectOne('company_user_accounts', {
      company_id: companyId,
      email
    });
    const existingMemberships = await serviceDb.select('company_memberships', { user_id: user.id });
    const existingMembership = existingMemberships.find((item) => Number(item.company_id) === companyId);
    if (existingMemberships.length && !existingMembership) return alreadyRegistered(res);

    const accessedAt = new Date().toISOString();
    const directoryAccount = await linkCompanyUserDirectory({
      companyId,
      userId: user.id,
      name,
      email,
      accessedAt,
      // 협력사 로그인은 이메일 승인/비밀번호 없이 동작하므로 같은 회사와
      // 이메일로 다시 접속한 익명 Auth 세션을 기존 디렉터리에 연결한다.
      allowRebind: true
    });
    if (!directoryAccount) return alreadyRegistered(res);

    const profile = await serviceDb.upsert('profiles', {
      user_id: user.id,
      name,
      email,
      app_role: 'company_user',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    if (existingMembership) {
      return res.json({
        profile,
        membership: { ...existingMembership, company },
        existing: true
      });
    }

    let membership = null;
    if (!membership) {
      let created = false;
      try {
        membership = await serviceDb.insert('company_memberships', {
          company_id: companyId,
          user_id: user.id,
          role: 'company_editor',
          status: 'active'
        });
        created = true;
      } catch (error) {
        if (error?.code !== '23505') throw error;
        return alreadyRegistered(res);
      }
      if (created) {
        await serviceDb.insert('audit_logs', {
          actor_user_id: user.id,
          company_id: companyId,
          action: 'company_signup',
          target_type: 'company_membership',
          target_id: String(membership.id),
          metadata: { email }
        });
      }
    }

    res.json({
      profile,
      membership: { ...membership, company },
      existing: Boolean(directoryAccountBeforeLogin)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 등록 정보를 저장할 수 없습니다.' });
  }
}

export async function getMe(req, res) {
  const activeMembership = req.auth.activeMembership;
  let profile = req.auth.profile;
  if (!profile && activeMembership) {
    const name = String(req.auth.user.user_metadata?.name || '협력사 사용자').trim();
    const email = String(
      req.auth.user.email || req.auth.user.user_metadata?.email || ''
    ).trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const now = new Date().toISOString();
      await linkCompanyUserDirectory({
        companyId: Number(activeMembership.company_id),
        userId: req.auth.user.id,
        name,
        email,
        accessedAt: now
      });
      profile = await serviceDb.upsert('profiles', {
        user_id: req.auth.user.id,
        name,
        email,
        app_role: 'company_user',
        updated_at: now
      }, { onConflict: 'user_id' });
      req.auth.profile = profile;
    }
  }
  if (activeMembership) {
    const now = new Date().toISOString();
    const result = await getServiceClient().from('company_user_accounts').update({
      last_access_at: now,
      updated_at: now
    }).eq('auth_user_id', req.auth.user.id).eq('company_id', activeMembership.company_id);
    if (result.error) console.error('협력사 사용자 최근 접속 시간 갱신 실패:', result.error.message);
  }
  res.json({
    user: { id: req.auth.user.id, email: req.auth.user.email || profile?.email },
    profile,
    memberships: req.auth.memberships
  });
}

export async function adminLogin(req, res) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const state = attemptState(ip);
  if (state.count >= ADMIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' });
  }
  try {
    if (!await verifyAdminPassword(req.body.password)) {
      state.count += 1;
      return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });
    }
    adminAttempts.delete(ip);
    res.setHeader('Set-Cookie', adminCookie(createAdminSessionToken()));
    res.json({ authenticated: true, profile: { name: '시스템 관리자', app_role: 'super_admin' } });
  } catch (error) {
    console.error(error);
    res.status(503).json({ error: '관리자 로그인 환경이 설정되지 않았습니다.' });
  }
}

export function getAdminSession(req, res) {
  res.json({ authenticated: true, profile: req.auth.profile });
}

export function adminLogout(_req, res) {
  res.setHeader('Set-Cookie', clearAdminCookie());
  res.json({ authenticated: false });
}

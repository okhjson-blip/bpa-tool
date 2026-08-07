import { serviceDb } from '../config/database.js';
import {
  adminCookie,
  clearAdminCookie,
  createAdminSessionToken
} from '../services/adminSessionService.js';
import { verifyAdminPassword } from '../services/adminPasswordVerifier.js';

const adminAttempts = new Map();
const ADMIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 5;

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

    const existingMemberships = await serviceDb.select('company_memberships', { user_id: user.id });
    if (existingMemberships.length) {
      return res.status(409).json({
        code: 'ALREADY_REGISTERED',
        error: '이미 가입하셨습니다. 시작하기를 클릭하여 로그인하십시오.'
      });
    }

    const company = await serviceDb.selectOne('companies', { id: companyId });
    if (!company || company.status !== 'active') {
      return res.status(400).json({ error: '가입할 수 없는 협력사입니다.' });
    }

    const profile = await serviceDb.upsert('profiles', {
      user_id: user.id,
      name,
      email,
      app_role: 'company_user',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    let membership = existingMemberships.find((item) => Number(item.company_id) === companyId);
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
        return res.status(409).json({
          code: 'ALREADY_REGISTERED',
          error: '이미 가입하셨습니다. 시작하기를 클릭하여 로그인하십시오.'
        });
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

    res.json({ profile, membership: { ...membership, company } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '협력사 등록 정보를 저장할 수 없습니다.' });
  }
}

export async function getMe(req, res) {
  res.json({
    user: { id: req.auth.user.id, email: req.auth.user.email || req.auth.profile?.email },
    profile: req.auth.profile,
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

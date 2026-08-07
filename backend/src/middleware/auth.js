import { getServiceClient, serviceDb } from '../config/database.js';
import { runWithAuthContext } from '../config/authContext.js';
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '../services/adminSessionService.js';

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function cookieValue(req, name) {
  return String(req.headers.cookie || '').split(';')
    .map((item) => item.trim().split('='))
    .find(([key]) => key === name)?.slice(1).join('=') || '';
}

async function getAuthenticatedUser(accessToken) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await getServiceClient().auth.getUser(accessToken);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function authenticate(req, res, next) {
  const accessToken = bearerToken(req);
  if (!accessToken) return res.status(401).json({ error: '로그인이 필요합니다.' });

  try {
    const { data, error } = await getAuthenticatedUser(accessToken);
    if (error || !data.user) return res.status(401).json({ error: '로그인 세션이 유효하지 않습니다.' });

    const user = data.user;
    const profile = await serviceDb.selectOne('profiles', { user_id: user.id });

    const memberships = await serviceDb.select('company_memberships', { user_id: user.id });
    const companies = memberships.length ? await serviceDb.select('companies') : [];
    const companyById = new Map(companies.map((company) => [Number(company.id), company]));
    const enrichedMemberships = memberships.map((membership) => ({
      ...membership,
      company: companyById.get(Number(membership.company_id)) || null
    }));
    const activeMembership = enrichedMemberships.find((membership) =>
      membership.status === 'active' && membership.company?.status === 'active'
    ) || null;

    req.auth = { user, profile, memberships: enrichedMemberships, activeMembership };
    return runWithAuthContext({ accessToken, userId: user.id }, next);
  } catch (error) {
    console.error('Supabase 사용자 인증 조회 실패:', error?.message || error);
    return res.status(503).json({ error: '사용자 인증 정보를 확인할 수 없습니다.' });
  }
}

export function requireProfile(req, res, next) {
  if (!req.auth?.profile) return res.status(403).json({ error: '협력사 등록을 먼저 완료해 주세요.' });
  next();
}

export function requireCompanyUser(req, res, next) {
  if (!req.auth?.profile) return res.status(403).json({ error: '협력사 등록을 먼저 완료해 주세요.' });
  if (req.auth.profile.app_role === 'super_admin') {
    return res.status(403).json({ error: '관리자 계정은 관리자 모드에서 조회해 주세요.' });
  }
  if (!req.auth.activeMembership) {
    return res.status(403).json({ error: '협력사 컨설팅이 완료되었거나 활성 멤버십이 없습니다.' });
  }
  req.auth.companyId = Number(req.auth.activeMembership.company_id);
  req.auth.company = req.auth.activeMembership.company;
  req.auth.memberRole = req.auth.activeMembership.role;
  next();
}

export function requireCompanyWrite(req, res, next) {
  if (!['company_admin', 'company_editor'].includes(req.auth?.memberRole)) {
    return res.status(403).json({ error: '프로젝트와 과제를 변경할 권한이 없습니다.' });
  }
  next();
}

export function authenticateAdminSession(req, res, next) {
  try {
    const token = cookieValue(req, ADMIN_COOKIE_NAME);
    if (!verifyAdminSessionToken(token)) {
      return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
    }
    req.auth = {
      user: { id: null, email: null },
      profile: { name: '시스템 관리자', app_role: 'super_admin' },
      isPasswordAdmin: true
    };
    next();
  } catch (error) {
    console.error(error);
    res.status(503).json({ error: '관리자 세션을 확인할 수 없습니다.' });
  }
}

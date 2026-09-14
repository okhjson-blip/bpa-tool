import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configured = Boolean(supabaseUrl && publishableKey);
const client = configured ? createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
}) : null;

function authErrorMessage(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '');
  if (status === 429 || /rate limit|too many/i.test(message)) {
    return '로그인 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (/anonymous/i.test(message) && /disabled|not enabled|sign-?ins?/i.test(message)) {
    return '익명 로그인이 비활성화되어 있습니다. 관리자에게 문의해 주세요.';
  }
  return message || '로그인 처리 중 오류가 발생했습니다.';
}

function requireClient() {
  if (!client) throw new Error('Supabase Auth 환경변수가 설정되지 않았습니다.');
  return client;
}

window.bpaAuth = {
  configured,
  async getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  },
  async getAccessToken() {
    return (await this.getSession())?.access_token || '';
  },
  // 브라우저 세션만 만들고, 실제 사용자 식별은 백엔드가 이메일 기준
  // company_user_accounts 에 연결한다. 기기나 Auth 사용자가 바뀌어도
  // 같은 이메일이면 직전 임시 저장본을 이어받는다.
  async signInAnonymously(metadata = {}) {
    const { data, error } = await requireClient().auth.signInAnonymously({
      options: { data: metadata }
    });
    if (error) throw new Error(authErrorMessage(error));
    return data.session;
  },
  async refreshSession() {
    if (!client) return null;
    const { data, error } = await client.auth.refreshSession();
    if (error) return null;
    return data.session;
  },
  // 기본 global 범위는 같은 사용자의 다른 탭 세션까지 끊어 작업 중 로그아웃을
  // 유발하므로, 명시적 로그아웃일 때만 호출 측이 global 을 지정한다.
  async signOut(scope = 'local') {
    if (client) await client.auth.signOut({ scope });
  },
  onAuthStateChange(callback) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
    return () => data.subscription.unsubscribe();
  }
};

window.dispatchEvent(new CustomEvent('bpa-auth-ready'));

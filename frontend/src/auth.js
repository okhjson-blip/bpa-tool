import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configured = Boolean(supabaseUrl && publishableKey);
const client = configured ? createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) : null;

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
  async registerAnonymously(metadata = {}) {
    if (!client) throw new Error('Supabase Auth 환경변수가 설정되지 않았습니다.');
    const { data, error } = await client.auth.signInAnonymously({ options: { data: metadata } });
    if (error) throw error;
    return data.session;
  },
  async signOut() {
    if (client) await client.auth.signOut();
  },
  onAuthStateChange(callback) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
    return () => data.subscription.unsubscribe();
  }
};

window.dispatchEvent(new CustomEvent('bpa-auth-ready'));

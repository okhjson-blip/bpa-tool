import { createClient } from '@supabase/supabase-js';
import { getAuthContext } from './authContext.js';

let serviceClient;

function getConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceRoleKey || !publishableKey) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY 환경 변수가 필요합니다.');
  }
  return { url, serviceRoleKey, publishableKey };
}

export function getServiceClient() {
  if (serviceClient) return serviceClient;
  const { url, serviceRoleKey } = getConfig();
  serviceClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-application-name': 'bpa-tool-backend' } }
  });
  return serviceClient;
}

function getRequestClient() {
  const context = getAuthContext();
  if (!context?.accessToken) {
    throw new Error('인증된 사용자 컨텍스트가 필요합니다.');
  }
  if (context.supabase) return context.supabase;

  const { url, publishableKey } = getConfig();
  context.supabase = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        'x-application-name': 'bpa-tool-backend-user'
      }
    }
  });
  return context.supabase;
}

function applyCondition(query, condition = {}) {
  return Object.entries(condition).reduce((next, [key, value]) => next.eq(key, value), query);
}

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

function createDatabase(clientProvider) {
  return {
    async insert(table, values) {
      return unwrap(await clientProvider().from(table).insert(values).select().single());
    },

    async upsert(table, values, options = {}) {
      return unwrap(await clientProvider().from(table).upsert(values, options).select().single());
    },

    async select(table, condition = null) {
      let query = clientProvider().from(table).select('*');
      if (condition) query = applyCondition(query, condition);
      return unwrap(await query);
    },

    async selectOne(table, condition) {
      const query = applyCondition(clientProvider().from(table).select('*'), condition).limit(1);
      const rows = unwrap(await query);
      return rows[0] || null;
    },

    async update(table, id, values) {
      const data = { ...values, updated_at: new Date().toISOString() };
      return unwrap(await clientProvider().from(table).update(data).eq('id', id).select().maybeSingle());
    },

    async delete(table, id) {
      unwrap(await clientProvider().from(table).delete().eq('id', id));
      return true;
    },

    async deleteWhere(table, condition) {
      const query = applyCondition(clientProvider().from(table).delete(), condition);
      const rows = unwrap(await query.select('id'));
      return rows.length;
    }
  };
}

export const db = createDatabase(getRequestClient);
export const serviceDb = createDatabase(getServiceClient);

export const initializeDatabase = async () => {
  const result = await getServiceClient().from('projects').select('id').limit(1);
  if (result.error) {
    throw new Error(`Supabase 초기화 실패: ${result.error.message}`);
  }
  console.log('✓ Supabase database connected');
};

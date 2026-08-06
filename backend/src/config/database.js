import { createClient } from '@supabase/supabase-js';

let client;

function getClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다.');
  }

  client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-application-name': 'bpa-tool-backend' } }
  });
  return client;
}

function applyCondition(query, condition = {}) {
  return Object.entries(condition).reduce((next, [key, value]) => next.eq(key, value), query);
}

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

export const db = {
  async insert(table, values) {
    return unwrap(await getClient().from(table).insert(values).select().single());
  },

  async select(table, condition = null) {
    let query = getClient().from(table).select('*');
    if (condition) query = applyCondition(query, condition);
    return unwrap(await query);
  },

  async selectOne(table, condition) {
    const query = applyCondition(getClient().from(table).select('*'), condition).limit(1);
    const rows = unwrap(await query);
    return rows[0] || null;
  },

  async update(table, id, values) {
    const data = { ...values, updated_at: new Date().toISOString() };
    return unwrap(await getClient().from(table).update(data).eq('id', id).select().maybeSingle());
  },

  async delete(table, id) {
    unwrap(await getClient().from(table).delete().eq('id', id));
    return true;
  },

  async deleteWhere(table, condition) {
    const query = applyCondition(getClient().from(table).delete(), condition);
    const rows = unwrap(await query.select('id'));
    return rows.length;
  }
};

export const initializeDatabase = async () => {
  const result = await getClient().from('projects').select('id').limit(1);
  if (result.error) {
    throw new Error(`Supabase 초기화 실패: ${result.error.message}`);
  }
  console.log('✓ Supabase database connected');
};

export function resolveSupabaseSecretKey(env = process.env) {
  return String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function resolveSupabaseConfig(env = process.env) {
  return {
    url: String(env.SUPABASE_URL || '').trim(),
    secretKey: resolveSupabaseSecretKey(env),
    publishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || '').trim()
  };
}

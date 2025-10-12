import { createClient } from '@supabase/supabase-js';

const getEnvVar = (...candidates) => {
  for (const key of candidates) {
    const raw = process.env[key];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return raw.trim();
    }
  }
  return '';
};

const readServiceConfig = () => {
  const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
  const serviceRoleKey = getEnvVar(
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_API_KEY',
    'SUPABASE_SERVICE_SECRET',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_KEY'
  );
  const schema = getEnvVar('SUPABASE_DB_SCHEMA', 'NEXT_PUBLIC_SUPABASE_SCHEMA') || 'public';
  return { supabaseUrl, serviceRoleKey, schema };
};

let cachedClient = null;
let cachedConfigKey = null;

export const isSupabaseServiceConfigured = () => {
  const { supabaseUrl, serviceRoleKey } = readServiceConfig();
  return Boolean(supabaseUrl && serviceRoleKey);
};

export const getSupabaseServiceClient = () => {
  const { supabaseUrl, serviceRoleKey, schema } = readServiceConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  const configKey = `${supabaseUrl}::${serviceRoleKey}::${schema}`;
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema },
      global: {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    });
    cachedConfigKey = configKey;
  }

  return cachedClient;
};

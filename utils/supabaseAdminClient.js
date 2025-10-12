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
    'SUPABASE_SECRET_KEY',
    'SUPABASE_KEY'
  );
  return { supabaseUrl, serviceRoleKey };
};

let cachedClient = null;
let cachedConfigKey = null;

export const isSupabaseServiceConfigured = () => {
  const { supabaseUrl, serviceRoleKey } = readServiceConfig();
  return Boolean(supabaseUrl && serviceRoleKey);
};

export const getSupabaseServiceClient = () => {
  const { supabaseUrl, serviceRoleKey } = readServiceConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  const configKey = `${supabaseUrl}::${serviceRoleKey}`;
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    cachedConfigKey = configKey;
  }

  return cachedClient;
};

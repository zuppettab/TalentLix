import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const hasServiceConfig =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.trim() !== '' &&
  typeof serviceRoleKey === 'string' &&
  serviceRoleKey.trim() !== '';

let cachedClient = null;

export const getSupabaseServiceClient = () => {
  if (!hasServiceConfig) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedClient;
};

export const isSupabaseServiceConfigured = hasServiceConfig;

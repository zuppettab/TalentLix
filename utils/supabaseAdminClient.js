import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_PROJECT_URL',
  'SUPABASE_API_URL',
];

const SUPABASE_ANON_KEY_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLIC_ANON_KEY',
  'SUPABASE_ANON',
];

const SUPABASE_SERVICE_ROLE_KEY_ENV_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_API_KEY',
  'SUPABASE_SERVICE',
  'SUPABASE_SERVICE_API',
];

const readFirstEnvValue = (keys) => {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return { key, value: raw.trim() };
    }
  }

  return { key: null, value: '' };
};

const readSupabaseConfigSnapshot = () => {
  const { key: supabaseUrlKey, value: supabaseUrl } = readFirstEnvValue(SUPABASE_URL_ENV_KEYS);
  const { key: supabaseAnonKeyName, value: supabaseAnonKey } = readFirstEnvValue(SUPABASE_ANON_KEY_ENV_KEYS);
  const { key: serviceRoleKeyName, value: serviceRoleKey } = readFirstEnvValue(
    SUPABASE_SERVICE_ROLE_KEY_ENV_KEYS
  );

  return {
    supabaseUrl,
    supabaseUrlKey,
    supabaseAnonKey,
    supabaseAnonKeyName,
    serviceRoleKey,
    serviceRoleKeyName,
  };
};

let cachedClient = null;
let cachedConfigSignature = null;

const signatureForConfig = (supabaseUrl, serviceRoleKey) => `${supabaseUrl}::${serviceRoleKey}`;

export const getSupabaseConfigSnapshot = () => {
  const snapshot = readSupabaseConfigSnapshot();

  return {
    ...snapshot,
    isServiceConfigured: Boolean(snapshot.supabaseUrl && snapshot.serviceRoleKey),
    isPublicConfigured: Boolean(snapshot.supabaseUrl && snapshot.supabaseAnonKey),
  };
};

export const isSupabaseServiceConfigured = () => getSupabaseConfigSnapshot().isServiceConfigured;

export const getSupabaseServiceClient = () => {
  const { supabaseUrl, serviceRoleKey, isServiceConfigured } = getSupabaseConfigSnapshot();

  if (!isServiceConfigured) {
    return null;
  }

  const configSignature = signatureForConfig(supabaseUrl, serviceRoleKey);
  if (!cachedClient || cachedConfigSignature !== configSignature) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          apikey: serviceRoleKey,
        },
      },
    });
    cachedConfigSignature = configSignature;
  }

  return cachedClient;
};

export const getSupabasePublicClient = (options = {}) => {
  const { supabaseUrl, supabaseAnonKey, isPublicConfigured } = getSupabaseConfigSnapshot();

  if (!isPublicConfigured) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, options);
};

export const describeSupabaseConfigRequirements = () => ({
  urlKeys: [...SUPABASE_URL_ENV_KEYS],
  anonKeys: [...SUPABASE_ANON_KEY_ENV_KEYS],
  serviceKeys: [...SUPABASE_SERVICE_ROLE_KEY_ENV_KEYS],
});

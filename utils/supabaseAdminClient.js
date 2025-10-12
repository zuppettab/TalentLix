import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
const SUPABASE_SERVICE_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_API_KEY',
  'SUPABASE_SERVICE_SECRET',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_KEY',
];
const SUPABASE_ANON_KEYS = [
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLIC_ANON_KEY',
  'SUPABASE_PUBLIC_KEY',
  'SUPABASE_ANON',
  'SUPABASE_API_KEY',
  'SUPABASE_KEY',
];
const SUPABASE_SCHEMA_KEYS = ['SUPABASE_DB_SCHEMA', 'NEXT_PUBLIC_SUPABASE_SCHEMA'];

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
  const supabaseUrl = getEnvVar(...SUPABASE_URL_KEYS);
  const serviceRoleKey = getEnvVar(...SUPABASE_SERVICE_KEYS);
  const schema = getEnvVar(...SUPABASE_SCHEMA_KEYS) || 'public';
  return { supabaseUrl, serviceRoleKey, schema };
};

const readPublicConfig = () => {
  const supabaseUrl = getEnvVar(...SUPABASE_URL_KEYS);
  const anonKey = getEnvVar(...SUPABASE_ANON_KEYS);
  const schema = getEnvVar(...SUPABASE_SCHEMA_KEYS) || 'public';
  return { supabaseUrl, anonKey, schema };
};

let cachedServiceClient = null;
let cachedServiceConfigKey = null;
let cachedPublicClient = null;
let cachedPublicConfigKey = null;

export const describeSupabaseConfigRequirements = () => ({
  urlKeys: [...SUPABASE_URL_KEYS],
  serviceKeys: [...SUPABASE_SERVICE_KEYS],
  anonKeys: [...SUPABASE_ANON_KEYS],
  schemaKeys: [...SUPABASE_SCHEMA_KEYS],
});

export const getSupabaseConfigSnapshot = () => {
  const serviceConfig = readServiceConfig();
  const publicConfig = readPublicConfig();
  return {
    supabaseUrl: serviceConfig.supabaseUrl || publicConfig.supabaseUrl,
    serviceRoleKey: serviceConfig.serviceRoleKey,
    anonKey: publicConfig.anonKey,
    schema: serviceConfig.schema || publicConfig.schema || 'public',
  };
};

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
  if (!cachedServiceClient || cachedServiceConfigKey !== configKey) {
    cachedServiceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema },
      global: {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    });
    cachedServiceConfigKey = configKey;
  }

  return cachedServiceClient;
};

export const getSupabasePublicClient = () => {
  const { supabaseUrl, anonKey, schema } = readPublicConfig();
  if (!supabaseUrl || !anonKey) {
    return null;
  }

  const configKey = `${supabaseUrl}::${anonKey}::${schema}`;
  if (!cachedPublicClient || cachedPublicConfigKey !== configKey) {
    cachedPublicClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema },
      global: {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      },
    });
    cachedPublicConfigKey = configKey;
  }

  return cachedPublicClient;
};

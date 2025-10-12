import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
const BASE_SUPABASE_SERVICE_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_API_KEY',
  'SUPABASE_SERVICE_SECRET',
  'SUPABASE_SERVICE_ROLE_SECRET',
  'SUPABASE_SERVICE_ROLE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_PRIVATE_KEY',
  'SUPABASE_SERVICE_ROLE_TOKEN',
  'SUPABASE_SERVICE_TOKEN',
  'SUPABASE_SERVICE_SECRET_KEY',
  'SUPABASE_PRIVATE_KEY',
  'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE',
  'NEXT_PUBLIC_SUPABASE_SERVICE_KEY',
  'NEXT_PUBLIC_SUPABASE_SERVICE_API_KEY',
  'NEXT_PUBLIC_SUPABASE_SERVICE_SECRET',
  'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_SECRET',
  'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_PRIVATE_KEY',
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

const asArray = (value) => (Array.isArray(value) ? value : []);

const SERVICE_ROLE_PATTERN_STRINGS = [
  'SUPABASE.*SERVICE.*ROLE.*(KEY|TOKEN|SECRET|PRIVATE|JWT)',
  'SUPABASE.*(ADMIN|SERVICE).*(KEY|TOKEN|SECRET|PRIVATE|JWT)',
  'SERVICE.*ROLE.*SUPABASE.*(KEY|TOKEN|SECRET|PRIVATE|JWT)',
  'SUPABASE.*ROLE.*(KEY|TOKEN|SECRET|PRIVATE|JWT)',
];

const SERVICE_ROLE_PATTERNS = SERVICE_ROLE_PATTERN_STRINGS.map((pattern) => new RegExp(pattern, 'i'));

const discoverEnvKeys = (tokenGroups, patterns) => {
  const envKeys = Object.keys(process.env || {});
  const matches = new Set();

  for (const key of envKeys) {
    const normalized = key.toUpperCase();
    const tokenMatch = tokenGroups.some((tokens) => tokens.every((token) => normalized.includes(token)));
    const patternMatch = patterns.some((pattern) => pattern.test(key));

    if (tokenMatch || patternMatch) {
      matches.add(key);
    }
  }

  return [...matches];
};

const SERVICE_ALIAS_ENV_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY_ALIASES',
  'SUPABASE_SERVICE_KEY_ALIASES',
  'SUPABASE_ADMIN_KEY_ALIASES',
];

const parseAliasList = (raw) => {
  if (typeof raw !== 'string') return [];

  return raw
    .split(/[,\n\r\t]/)
    .map((value) => value.trim())
    .filter(Boolean);
};

const readConfiguredServiceAliases = () => {
  const aliases = [];

  for (const aliasEnvKey of SERVICE_ALIAS_ENV_KEYS) {
    const raw = process.env[aliasEnvKey];
    aliases.push(...parseAliasList(raw));
  }

  return aliases;
};

const getSupabaseServiceKeys = () => {
  const dynamicCandidates = discoverEnvKeys([
    ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'],
    ['SUPABASE', 'SERVICE', 'ROLE', 'TOKEN'],
    ['SUPABASE', 'SERVICE', 'ROLE', 'SECRET'],
    ['SUPABASE', 'SERVICE', 'ROLE', 'PRIVATE'],
    ['SUPABASE', 'ADMIN', 'KEY'],
    ['SUPABASE', 'ADMIN', 'TOKEN'],
    ['SUPABASE', 'SERVICE', 'ADMIN', 'KEY'],
    ['SUPABASE', 'SERVICE', 'ADMIN', 'TOKEN'],
  ], SERVICE_ROLE_PATTERNS);

  const configuredAliases = readConfiguredServiceAliases();

  const keys = new Set([
    ...BASE_SUPABASE_SERVICE_KEYS,
    ...asArray(dynamicCandidates),
    ...asArray(configuredAliases),
  ]);
  return [...keys];
};

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
  const serviceRoleKey = getEnvVar(...getSupabaseServiceKeys());
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
  serviceKeys: [...getSupabaseServiceKeys()],
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

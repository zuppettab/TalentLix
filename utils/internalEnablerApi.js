import { createClient } from '@supabase/supabase-js';
import { isAdminUser } from './authRoles';
import {
  describeSupabaseConfigRequirements,
  getSupabaseConfigSnapshot,
  getSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from './supabaseAdminClient';

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const extractBearerToken = (req) => {
  const header = req?.headers?.authorization;
  if (!header) return null;
  const matches = header.match(/^Bearer\s+(.+)$/i);
  return matches ? matches[1].trim() : null;
};

export const createHttpError = (status, message, options = {}) => {
  const error = new Error(message);
  error.statusCode = status;
  if (options && typeof options === 'object') {
    Object.assign(error, options);
  }
  return error;
};

const describeMissingConfig = (snapshot) => {
  const requirements = describeSupabaseConfigRequirements();
  const missing = [];

  if (!snapshot?.supabaseUrl) {
    missing.push(`Supabase URL via one of: ${requirements.urlKeys.join(', ')}`);
  }

  if (!snapshot?.serviceRoleKey) {
    missing.push(`Supabase service role key via one of: ${requirements.serviceKeys.join(', ')}`);
  }

  return missing.length
    ? `Missing configuration: ${missing.join('; ')}.`
    : 'Supabase configuration is incomplete.';
};

const buildConfigError = (snapshot) => {
  const error = createHttpError(500, 'Supabase admin client is not configured.', {
    code: 'supabase_admin_client_missing',
  });
  error.details = describeMissingConfig(snapshot);
  return error;
};

const decodeJwtClaims = (token) => {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [, payloadSegment] = token.split('.');
  if (!payloadSegment) return null;

  try {
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const claims = JSON.parse(decoded);
    return isPlainObject(claims) ? claims : null;
  } catch (error) {
    console.error('Failed to decode JWT payload', error);
    return null;
  }
};

const isExpiredClaims = (claims) => {
  if (!isPlainObject(claims)) return false;
  const exp = Number(claims.exp);
  if (!Number.isFinite(exp)) return false;
  return exp * 1000 <= Date.now();
};

const coerceSupabaseUserFromClaims = (claims) => {
  if (!isPlainObject(claims) || isExpiredClaims(claims)) return null;

  const userId = typeof claims.sub === 'string' && claims.sub
    ? claims.sub
    : typeof claims.user_id === 'string' && claims.user_id
      ? claims.user_id
      : null;

  if (!userId) return null;

  const email = typeof claims.email === 'string' ? claims.email : null;

  const userMetadata = isPlainObject(claims.user_metadata)
    ? { ...claims.user_metadata }
    : {};

  if (typeof claims.role === 'string' && !userMetadata.role) {
    userMetadata.role = claims.role;
  }

  const appMetadata = isPlainObject(claims.app_metadata)
    ? { ...claims.app_metadata }
    : {};

  return {
    id: userId,
    email,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  };
};

export const normalizeSupabaseError = (source, error) => {
  if (!error) {
    return createHttpError(500, `${source} query failed for an unknown reason.`);
  }

  const messageParts = [`${source} query failed.`];
  if (error.message) {
    messageParts.push(error.message);
  }

  const statusFromError =
    typeof error.status === 'number'
      ? error.status
      : typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

  return createHttpError(statusFromError, messageParts.join(' '), {
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
    cause: error,
  });
};

export const resolveAdminRequestContext = async (accessToken, options = {}) => {
  if (!accessToken) {
    throw createHttpError(401, 'Missing access token.');
  }

  const { requireServiceRole = true } = options;
  const configSnapshot = getSupabaseConfigSnapshot();

  const supabaseUrl = configSnapshot.supabaseUrl || '';
  const supabaseAnonKey = configSnapshot.anonKey || '';
  const schema = configSnapshot.schema || 'public';

  const serviceConfigured = isSupabaseServiceConfigured();
  const serviceClient = serviceConfigured ? getSupabaseServiceClient() : null;

  let delegatedClient = null;
  if (supabaseUrl && supabaseAnonKey) {
    delegatedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
        },
      },
    });
  }

  if (requireServiceRole && !serviceClient && !delegatedClient) {
    throw buildConfigError(configSnapshot);
  }

  const candidateClients = [
    { label: 'service', client: serviceClient },
    { label: 'delegated', client: delegatedClient },
  ].filter(({ client }) => Boolean(client));

  if (!candidateClients.length) {
    throw buildConfigError(configSnapshot);
  }

  if (requireServiceRole && !serviceClient && delegatedClient) {
    console.warn(
      'Supabase service role key is not configured. Falling back to delegated admin client.'
    );
  }

  let user = null;

  for (const { label, client } of candidateClients) {
    try {
      const { data, error } = await client.auth.getUser(accessToken);
      if (error) {
        console.error(`Failed to verify admin session via ${label} client`, error);
        continue;
      }
      if (data?.user) {
        user = data.user;
        break;
      }
    } catch (authError) {
      console.error(`Failed to verify admin session via ${label} client`, authError);
    }
  }

  if (!user) {
    const claims = decodeJwtClaims(accessToken);
    const derivedUser = coerceSupabaseUserFromClaims(claims);
    if (derivedUser) {
      user = derivedUser;
    }
  }

  if (!user) {
    throw createHttpError(401, 'Invalid session. Please sign in again.');
  }

  if (!isAdminUser(user)) {
    throw createHttpError(403, 'This account is not authorized for admin access.');
  }

  return {
    client: serviceClient ?? delegatedClient,
    user,
    configSnapshot,
  };
};


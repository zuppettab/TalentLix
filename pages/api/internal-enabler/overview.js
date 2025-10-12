import { createClient } from '@supabase/supabase-js';
import { isAdminUser } from '../../../utils/authRoles';
import { getSupabaseServiceClient, isSupabaseServiceConfigured } from '../../../utils/supabaseAdminClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const hasPublicSupabaseConfig =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.trim() !== '' &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.trim() !== '';

const extractBearerToken = (req) => {
  const header = req.headers.authorization;
  if (!header) return null;
  const matches = header.match(/^Bearer\s+(.+)$/i);
  return matches ? matches[1].trim() : null;
};

const canonicalStatus = (value, fallback = 'unknown') => {
  if (!value) return fallback;
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized || fallback;
};

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

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

const createHttpError = (status, message, options = {}) => {
  const error = new Error(message);
  error.statusCode = status;
  if (options && typeof options === 'object') {
    Object.assign(error, options);
  }
  return error;
};

const buildConfigError = () => {
  return createHttpError(500, 'Supabase admin client is not configured.', {
    code: 'supabase_admin_client_missing',
    details:
      'Ensure SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_API_KEY), NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY are defined in the environment.',
  });
};

const normalizeSupabaseError = (source, error) => {
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

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
};

const pickLatestRecord = (records, dateFields = []) => {
  if (!records.length) return null;
  const getTimestamp = (record) => {
    return dateFields.reduce((acc, field) => {
      const raw = record?.[field];
      if (!raw) return acc;
      const ts = new Date(raw).getTime();
      if (Number.isNaN(ts)) return acc;
      return Math.max(acc, ts);
    }, 0);
  };
  return [...records].sort((a, b) => getTimestamp(b) - getTimestamp(a))[0] || null;
};

const normalizeAthleteRow = (row) => {
  const cvRecords = asArray(row.contacts_verification);
  const latestCv = pickLatestRecord(cvRecords, [
    'verification_status_changed_at',
    'submitted_at',
    'updated_at',
    'created_at',
  ]);
  const reviewStatus = canonicalStatus(
    latestCv?.review_status ?? (cvRecords.length ? 'draft' : 'not_started'),
    'not_started'
  );

  const normalizedCv = latestCv
    ? {
        ...latestCv,
        review_status: reviewStatus,
      }
    : null;

  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    cv: normalizedCv,
    review_status: reviewStatus,
  };
};

const normalizeOperatorRow = (row) => {
  const profileArr = asArray(row.op_profile);
  const contactArr = asArray(row.op_contact);
  const typeArr = asArray(row.op_type);
  const requestArr = asArray(row.op_verification_request);

  const latestRequest = pickLatestRecord(requestArr, ['submitted_at', 'updated_at', 'created_at']);
  const documentsArr = asArray(latestRequest?.op_verification_document);

  const reviewState = canonicalStatus(
    latestRequest?.state ?? row.wizard_status ?? 'not_started',
    'not_started'
  );

  return {
    id: row.id,
    status: row.status || '',
    wizard_status: row.wizard_status || '',
    type: typeArr[0]
      ? { id: typeArr[0].id, code: typeArr[0].code, name: typeArr[0].name }
      : null,
    profile: profileArr[0] || null,
    contact: contactArr[0] || null,
    verification: latestRequest
      ? { ...latestRequest, state: canonicalStatus(latestRequest.state, 'unknown') }
      : null,
    documents: documentsArr.map((doc) => ({ doc_type: doc.doc_type, file_key: doc.file_key })),
    review_state: reviewState,
  };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessToken = extractBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: 'Missing access token.' });
  }

  let client = null;
  let user = null;

  try {
    const serviceClient = isSupabaseServiceConfigured()
      ? getSupabaseServiceClient()
      : null;

    if (!serviceClient) {
      throw buildConfigError();
    }

    client = serviceClient;

    const { data: serviceAuthData, error: serviceAuthError } = await serviceClient.auth.getUser(accessToken);
    if (serviceAuthError) {
      console.error('Failed to verify admin session via service client', serviceAuthError);
    } else {
      user = serviceAuthData?.user || null;
    }

    if (!user && hasPublicSupabaseConfig) {
      const delegatedClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseAnonKey,
          },
        },
      });
      const { data: delegatedAuthData, error: delegatedAuthError } = await delegatedClient.auth.getUser(accessToken);
      if (delegatedAuthError) {
        console.error('Failed to verify admin session via delegated client', delegatedAuthError);
      } else {
        user = delegatedAuthData?.user || null;
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

    const [athletesResult, operatorsResult] = await Promise.all([
      client
        .from('athlete')
        .select(
          `
          id, first_name, last_name, phone,
          contacts_verification (
            id, review_status, id_verified, rejected_reason,
            submitted_at, verified_at, verification_status_changed_at,
            id_document_type, id_document_url, id_selfie_url,
            phone_verified, residence_city, residence_country
          )
        `
        ),
      client
        .from('op_account')
        .select(
          `
          id, status, wizard_status, type_id,
          op_type:op_type(id, code, name),
          op_profile:op_profile(*),
          op_contact:op_contact(email_primary, phone_e164, phone_verified_at),
          op_verification_request:op_verification_request(
            id, state, reason, submitted_at, created_at, updated_at,
            op_verification_document:op_verification_document(doc_type, file_key)
          )
        `
        ),
    ]);

    if (athletesResult.error) throw normalizeSupabaseError('Athlete overview', athletesResult.error);
    if (operatorsResult.error) throw normalizeSupabaseError('Operator overview', operatorsResult.error);

    const athletes = (athletesResult.data || []).map(normalizeAthleteRow);
    const operators = (operatorsResult.data || []).map(normalizeOperatorRow);

    return res.status(200).json({ athletes, operators });
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to load admin overview data.';
    const code = typeof error?.code === 'string' && error.code ? error.code : null;
    const details = typeof error?.details === 'string' && error.details ? error.details : null;
    const hint = typeof error?.hint === 'string' && error.hint ? error.hint : null;
    console.error('Internal enabler overview failed', error);
    const responseBody = {
      error: message || 'Unable to load admin overview data.',
    };
    if (code) responseBody.code = code;
    if (details) responseBody.details = details;
    if (hint) responseBody.hint = hint;

    return res.status(statusCode).json(responseBody);
  }
}

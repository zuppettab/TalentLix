import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
} from '../../../utils/internalEnablerApi';
import { resolveOperatorRequestContext } from '../../../utils/operatorApi';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeUuid = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!UUID_REGEX.test(trimmed)) return null;
  return trimmed;
};

const mapSocialRow = (row) => ({
  id: row?.id || null,
  platform: row?.platform || '',
  handle: row?.handle || '',
  profile_url: row?.profile_url || '',
  is_public: Boolean(row?.is_public),
  is_primary: Boolean(row?.is_primary),
});

export const loadOperatorContactBundle = async (client, operatorId, athleteId) => {
  const { data: activeUnlock, error: activeUnlockError } = await client
    .from('v_op_unlocks_active')
    .select('unlocked_at, expires_at')
    .eq('op_id', operatorId)
    .eq('athlete_id', athleteId)
    .maybeSingle();

  if (activeUnlockError && activeUnlockError.code !== 'PGRST116') {
    throw normalizeSupabaseError('Active unlock lookup', activeUnlockError);
  }

  const unlocked = Boolean(activeUnlock);
  let unlockedAt = activeUnlock?.unlocked_at || null;
  let expiresAt = activeUnlock?.expires_at || null;

  if (!unlocked) {
    const { data: lastUnlock, error: lastUnlockError } = await client
      .from('v_op_unlocks')
      .select('unlocked_at, expires_at')
      .eq('op_id', operatorId)
      .eq('athlete_id', athleteId)
      .order('unlocked_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (lastUnlockError && lastUnlockError.code !== 'PGRST116') {
      throw normalizeSupabaseError('Unlock history lookup', lastUnlockError);
    }

    if (lastUnlock) {
      unlockedAt = unlockedAt || lastUnlock.unlocked_at || null;
      expiresAt = expiresAt || lastUnlock.expires_at || null;
    }
  }

  let firstName = null;
  let lastName = null;
  let phone = null;
  let email = null;
  let socials = [];

  if (unlocked) {
    const athleteQuery = client
      .from('athlete')
      .select('first_name, last_name, phone, email')
      .eq('id', athleteId)
      .maybeSingle();

    let athleteRow = null;
    let athleteError = null;

    const { data: primaryRow, error: primaryError } = await athleteQuery;

    if (primaryError && primaryError.code === '42703') {
      const {
        data: fallbackRow,
        error: fallbackError,
      } = await client
        .from('athlete')
        .select('first_name, last_name, phone')
        .eq('id', athleteId)
        .maybeSingle();

      athleteRow = fallbackRow;
      athleteError = fallbackError;
    } else {
      athleteRow = primaryRow;
      athleteError = primaryError;
    }

    if (athleteError) {
      throw normalizeSupabaseError('Athlete contact lookup', athleteError);
    }

    if (athleteRow) {
      firstName = athleteRow.first_name || null;
      lastName = athleteRow.last_name || null;
      phone = athleteRow.phone || null;
      if (typeof athleteRow.email === 'string' && athleteRow.email.trim()) {
        email = athleteRow.email.trim();
      }
    }

    const { data: socialRows, error: socialError } = await client
      .from('social_profiles')
      .select('id, platform, handle, profile_url, is_public, is_primary')
      .eq('athlete_id', athleteId)
      .order('sort_order', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (socialError) {
      throw normalizeSupabaseError('Social profiles lookup', socialError);
    }

    socials = Array.isArray(socialRows) ? socialRows.map(mapSocialRow) : [];
  }

  if (!email) {
    try {
      const { data, error } = await client.auth.admin.getUserById(athleteId);
      if (error) throw error;

      const authEmail = data?.user?.email;
      if (typeof authEmail === 'string' && authEmail.trim()) {
        email = authEmail.trim();
      }
    } catch (authError) {
      console.error('Operator contact email lookup failed', authError);
    }
  }

  return {
    athlete_id: athleteId,
    unlocked,
    unlocked_at: unlockedAt,
    expires_at: expiresAt,
    first_name: firstName,
    last_name: lastName,
    phone,
    email: email || '',
    socials,
  };
};

const respondWithError = (res, error, fallbackMessage) => {
  const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
  const message = typeof error?.message === 'string' && error.message
    ? error.message
    : fallbackMessage;

  const body = { error: message };
  if (error?.code) body.code = error.code;
  if (error?.details) body.details = error.details;
  if (error?.hint) body.hint = error.hint;

  console.error('Operator contacts fetch failed', error);
  return res.status(statusCode).json(body);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      throw createHttpError(401, 'Missing access token.');
    }

    const { client, user } = await resolveOperatorRequestContext(accessToken, { requireServiceRole: true });

    const { athleteId, athlete_id: athleteIdAlt, id: idParam } = req.query || {};
    const resolvedId = normalizeUuid(
      Array.isArray(athleteId)
        ? athleteId[0]
        : athleteId || athleteIdAlt || (Array.isArray(idParam) ? idParam[0] : idParam)
    );

    if (!resolvedId) {
      throw createHttpError(400, 'A valid athleteId must be provided.');
    }

    const { data: accountRow, error: accountError } = await client
      .from('op_account')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (accountError) {
      throw normalizeSupabaseError('Operator account lookup', accountError);
    }

    const operatorId = accountRow?.id;
    if (!operatorId) {
      throw createHttpError(403, 'Operator account not found for the current user.');
    }

    const payload = await loadOperatorContactBundle(client, operatorId, resolvedId);

    return res.status(200).json(payload);
  } catch (error) {
    return respondWithError(res, error, 'Unable to load athlete contact information.');
  }
}


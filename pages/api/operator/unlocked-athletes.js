import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
} from '../../../utils/internalEnablerApi';
import { resolveOperatorRequestContext } from '../../../utils/operatorApi';

const ensureArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const mapAthlete = (athlete) => {
  if (!athlete || typeof athlete !== 'object') return null;
  return {
    id: athlete.id ?? null,
    first_name: athlete.first_name ?? null,
    last_name: athlete.last_name ?? null,
    profile_picture_url: athlete.profile_picture_url ?? null,
  };
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

    const { data, error } = await client
      .from('v_op_unlocks_active')
      .select('athlete_id, unlocked_at, expires_at, athlete:athlete_id(id, first_name, last_name, profile_picture_url)')
      .eq('op_id', operatorId)
      .order('expires_at', { ascending: true, nullsFirst: true })
      .order('unlocked_at', { ascending: false, nullsFirst: true });

    if (error) {
      throw normalizeSupabaseError('Unlocked athletes lookup', error);
    }

    const items = ensureArray(data).map((row) => ({
      athlete_id: row?.athlete_id ?? null,
      unlocked_at: row?.unlocked_at ?? null,
      expires_at: row?.expires_at ?? null,
      athlete: mapAthlete(row?.athlete),
    }));

    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error('Failed to load unlocked athletes for operator', error);
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to load unlocked athletes.';
    const body = { error: message };
    if (error?.code) body.code = error.code;
    if (error?.details) body.details = error.details;
    return res.status(statusCode).json(body);
  }
}

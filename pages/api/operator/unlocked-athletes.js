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

const mapUnlockRows = (rows) => {
  const byAthlete = new Map();
  ensureArray(rows)
    .map((row) => ({
      athlete_id: row?.athlete_id ?? row?.athlete?.id ?? null,
      unlocked_at: row?.unlocked_at ?? null,
      expires_at: row?.expires_at ?? null,
      athlete: mapAthlete(row?.athlete),
    }))
    .filter((row) => row.athlete_id)
    .forEach((row) => {
      const existing = byAthlete.get(row.athlete_id);
      if (!existing) {
        byAthlete.set(row.athlete_id, row);
        return;
      }

      const existingTs = existing.unlocked_at ? new Date(existing.unlocked_at).getTime() : -Infinity;
      const candidateTs = row.unlocked_at ? new Date(row.unlocked_at).getTime() : -Infinity;
      if (candidateTs > existingTs) {
        byAthlete.set(row.athlete_id, row);
      }
    });

  const normalized = Array.from(byAthlete.values());
  normalized.sort((a, b) => {
    const expiresA = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
    const expiresB = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;

    if (expiresA !== expiresB) {
      return expiresA - expiresB;
    }

    const unlockA = a.unlocked_at ? new Date(a.unlocked_at).getTime() : 0;
    const unlockB = b.unlocked_at ? new Date(b.unlocked_at).getTime() : 0;
    return unlockB - unlockA;
  });

  return normalized;
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

    let operatorId = null;

    const { data: accountRow, error: accountError } = await client
      .from('op_account')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (accountError && accountError.code !== 'PGRST116') {
      throw normalizeSupabaseError('Operator account lookup', accountError);
    }

    if (!accountError) {
      operatorId = accountRow?.id ?? null;
    } else {
      const {
        data: fallbackRows,
        error: fallbackError,
      } = await client
        .from('op_account')
        .select('id, created_at')
        .eq('auth_user_id', user.id)
        .order('created_at', { ascending: false, nullsLast: false })
        .limit(1);

      if (fallbackError) {
        if (fallbackError.code === '42703') {
          const {
            data: minimalRows,
            error: minimalError,
          } = await client
            .from('op_account')
            .select('id')
            .eq('auth_user_id', user.id)
            .limit(1);

          if (minimalError) {
            throw normalizeSupabaseError('Operator account lookup (minimal fallback)', minimalError);
          }

          if (Array.isArray(minimalRows) && minimalRows[0]) {
            operatorId = minimalRows[0].id ?? null;
          } else if (minimalRows && typeof minimalRows === 'object') {
            operatorId = minimalRows.id ?? null;
          }
        } else {
          throw normalizeSupabaseError('Operator account lookup (fallback)', fallbackError);
        }
      } else if (Array.isArray(fallbackRows) && fallbackRows[0]) {
        operatorId = fallbackRows[0].id ?? null;
      } else if (fallbackRows && typeof fallbackRows === 'object') {
        operatorId = fallbackRows.id ?? null;
      }
    }

    if (!operatorId) {
      throw createHttpError(403, 'Operator account not found for the current user.');
    }

    const loadViewRows = async (viewName) => {
      const { data, error } = await client
        .from(viewName)
        .select(
          'athlete_id, unlocked_at, expires_at, athlete:athlete_id(id, first_name, last_name, profile_picture_url)'
        )
        .eq('op_id', operatorId)
        .order('expires_at', { ascending: true, nullsFirst: true })
        .order('unlocked_at', { ascending: false, nullsFirst: true });

      if (!error) {
        return ensureArray(data);
      }

      const code = typeof error.code === 'string' ? error.code.trim() : '';
      if (code && (code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || code === '42703')) {
        return [];
      }

      throw normalizeSupabaseError(`Unlocked athletes lookup (${viewName})`, error);
    };

    let unlockRows = await loadViewRows('v_op_unlocks_active');

    if (!unlockRows.length) {
      const fallbackRows = await loadViewRows('v_op_unlocks');
      if (fallbackRows.length) {
        unlockRows = fallbackRows;
      }
    }

    const items = mapUnlockRows(unlockRows);

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

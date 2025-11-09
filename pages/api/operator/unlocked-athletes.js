import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
} from '../../../utils/internalEnablerApi';
import { resolveOperatorRequestContext } from '../../../utils/operatorApi';
import {
  OPERATOR_UNLOCK_TABLE_SOURCES,
  OPERATOR_UNLOCK_VIEW_SOURCES,
} from '../../../utils/operatorUnlockSources';

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

const DEBUG_PREFIX = '[api/operator/unlocked-athletes]';
const SELECT_FIELDS_FULL =
  'athlete_id, unlocked_at, expires_at, athlete:athlete_id(id, first_name, last_name, profile_picture_url)';
const SELECT_FIELDS_MIN =
  'athlete_id, unlocked_at, athlete:athlete_id(id, first_name, last_name, profile_picture_url)';
const IGNORABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST204']);

const summarizeUnlockRows = (rows, limit = 5) =>
  ensureArray(rows)
    .slice(0, limit)
    .map((row) => ({
      athlete_id: row?.athlete_id ?? row?.athlete?.id ?? null,
      unlocked_at: row?.unlocked_at ?? null,
      expires_at: row?.expires_at ?? null,
    }));

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

    console.debug(`${DEBUG_PREFIX} resolved operator`, { operatorId, userId: user.id });

    const runUnlockSource = async (source, options = {}) => {
      const { includeExpiresOrder = true } = options || {};

      const buildQuery = (fields, orderExpires) => {
        let query = client.from(source).select(fields).eq('op_id', operatorId);
        if (orderExpires) {
          query = query.order('expires_at', { ascending: true, nullsFirst: true });
        }
        query = query.order('unlocked_at', { ascending: false, nullsFirst: true });
        return query;
      };

      const { data, error } = await buildQuery(SELECT_FIELDS_FULL, includeExpiresOrder);
      if (!error) {
        return { rows: ensureArray(data), meta: { fields: 'full', includeExpiresOrder } };
      }

      const code = typeof error.code === 'string' ? error.code.trim() : '';

      if (code === '42703') {
        const { data: minimalData, error: minimalError } = await buildQuery(SELECT_FIELDS_MIN, false);
        if (!minimalError) {
          const patched = ensureArray(minimalData).map((row) => ({ ...row, expires_at: row.expires_at ?? null }));
          return { rows: patched, meta: { fields: 'minimal', includeExpiresOrder: false, patchedExpires: true } };
        }

        const minimalCode = typeof minimalError?.code === 'string' ? minimalError.code.trim() : '';
        if (minimalCode && IGNORABLE_CODES.has(minimalCode)) {
          return {
            rows: [],
            meta: { fields: 'minimal', includeExpiresOrder: false, missing: true, code: minimalCode },
          };
        }

        throw normalizeSupabaseError(`Unlocked athletes lookup (${source}, minimal)`, minimalError);
      }

      if (code && IGNORABLE_CODES.has(code)) {
        return { rows: [], meta: { fields: 'full', includeExpiresOrder, missing: true, code } };
      }

      throw normalizeSupabaseError(`Unlocked athletes lookup (${source})`, error);
    };

    const probeSource = async (descriptor, label, options) => {
      const source = descriptor?.name ?? label;
      const outcome = await runUnlockSource(source, options);
      console.debug(`${DEBUG_PREFIX} probe`, {
        operatorId,
        source,
        label,
        optional: Boolean(descriptor?.optional),
        meta: outcome.meta,
        count: outcome.rows.length,
        preview: summarizeUnlockRows(outcome.rows),
      });
      return outcome;
    };

    let unlockRows = [];
    let resolvedSource = null;
    let resolvedMeta = null;

    for (let index = 0; index < OPERATOR_UNLOCK_VIEW_SOURCES.length; index += 1) {
      const descriptor = OPERATOR_UNLOCK_VIEW_SOURCES[index];
      const source = descriptor?.name ?? `view.${index}`;
      const label = `view.${source}`;
      const outcome = await probeSource(descriptor, label, { includeExpiresOrder: index === 0 });
      if (outcome.rows.length) {
        unlockRows = outcome.rows;
        resolvedSource = label;
        resolvedMeta = outcome.meta;
        break;
      }
    }

    if (!unlockRows.length) {
      for (const descriptor of OPERATOR_UNLOCK_TABLE_SOURCES) {
        const source = descriptor?.name ?? 'table.unknown';
        const label = `table.${source}`;
        const outcome = await probeSource(descriptor, label, { includeExpiresOrder: false });
        if (outcome.rows.length) {
          unlockRows = outcome.rows;
          resolvedSource = label;
          resolvedMeta = outcome.meta;
          break;
        }
      }
    }

    console.debug(`${DEBUG_PREFIX} dataset resolved`, {
      operatorId,
      source: resolvedSource,
      meta: resolvedMeta,
      count: unlockRows.length,
      preview: summarizeUnlockRows(unlockRows),
    });

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

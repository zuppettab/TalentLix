import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
  resolveAdminRequestContext,
} from '../../../utils/internalEnablerApi';

const DEFAULT_ID_COLUMNS = ['op_id', 'operator_id', 'op_account_id', 'operator_account_id'];
const DEFAULT_EXPIRY_COLUMNS = [
  'expires_at',
  'expires_on',
  'valid_until',
  'valid_to',
  'visibility_expires_at',
  'access_expires_at',
];

const CANDIDATE_TABLES = [
  { name: 'op_contact_unlock' },
  { name: 'op_contact_unlocks' },
  { name: 'op_unlock' },
  { name: 'op_unlocks' },
  { name: 'operator_contact_unlock' },
  { name: 'operator_contact_unlocks' },
  { name: 'op_athlete_unlock' },
  { name: 'op_athlete_unlocks' },
  { name: 'op_contact_unlock_history' },
  { name: 'operator_unlock' },
  { name: 'operator_unlocks' },
  { name: 'v_op_unlocks_active', expiryColumns: ['expires_at'], optional: true },
  { name: 'v_op_unlocks', expiryColumns: ['expires_at'], optional: true },
];

const ERROR_TABLE_MISSING = new Set(['42P01', 'PGRST205']);
const ERROR_COLUMN_MISSING = new Set(['42703', 'PGRST204']);
const ERROR_VIEW_READONLY = new Set(['0A000', '42809']);

const RESET_EXPIRY_VALUE = '1970-01-01T00:00:00.000Z';

const normalizeId = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
};

const normalizeColumns = (source, fallback) => {
  const base = Array.isArray(source) && source.length ? source : fallback;
  return Array.from(
    new Set(
      (base || [])
        .map((column) => (typeof column === 'string' ? column.trim() : ''))
        .filter(Boolean),
    ),
  );
};

const tryExpireUnlocks = async (
  client,
  tableName,
  idColumn,
  operatorId,
  expiryColumns,
  summary,
  nowIso,
) => {
  for (const expiryColumn of expiryColumns) {
    const orFilter = `${expiryColumn}.is.null,${expiryColumn}.gt.${nowIso}`;
    const query = client
      .from(tableName)
      .update({ [expiryColumn]: RESET_EXPIRY_VALUE })
      .eq(idColumn, operatorId)
      .or(orFilter);

    const { data, count, error } = await query.select('id', { count: 'exact' });

    if (!error) {
      const affected = Number.isFinite(count)
        ? count
        : Array.isArray(data)
          ? data.length
          : 0;

      if (affected > 0) {
        summary.expired = (summary.expired || 0) + affected;
      }

      return affected > 0;
    }

    const code = typeof error?.code === 'string' ? error.code.trim() : '';

    if (code && ERROR_COLUMN_MISSING.has(code)) {
      continue;
    }

    if (code && ERROR_VIEW_READONLY.has(code)) {
      summary.skipped = true;
      summary.reason = summary.reason || 'immutable_view';
      return false;
    }

    if (code && ERROR_TABLE_MISSING.has(code)) {
      summary.skipped = true;
      summary.reason = summary.reason || 'table_missing';
      return false;
    }

    throw normalizeSupabaseError(`Operator unlock expiry (${tableName})`, error);
  }

  return false;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      throw createHttpError(401, 'Missing access token.');
    }

    const { client } = await resolveAdminRequestContext(accessToken, { requireServiceRole: true });

    const { operatorId } = req.body || {};
    const normalizedId = normalizeId(operatorId);

    if (normalizedId == null) {
      throw createHttpError(400, 'A valid operatorId must be provided.');
    }

    let totalRemoved = 0;
    const tableSummaries = [];
    let anyAttempted = false;

    const nowIso = new Date().toISOString();

    for (const candidate of CANDIDATE_TABLES) {
      const tableName = candidate.name;
      const idColumns = normalizeColumns(candidate.columns, DEFAULT_ID_COLUMNS);
      const expiryColumns = normalizeColumns(candidate.expiryColumns, DEFAULT_EXPIRY_COLUMNS);

      const summary = {
        table: tableName,
        removed: 0,
        expired: 0,
        attempted: false,
        skipped: false,
      };

      let handled = false;
      const matchedColumns = new Set();

      for (const column of idColumns) {
        const { error: countError, count } = await client
          .from(tableName)
          .select(column, { count: 'exact', head: true })
          .eq(column, normalizedId);

        if (countError) {
          const code = typeof countError.code === 'string' ? countError.code.trim() : '';

          if (code && ERROR_TABLE_MISSING.has(code)) {
            summary.skipped = true;
            summary.reason = 'table_missing';
            handled = true;
            break;
          }

          if (code && ERROR_COLUMN_MISSING.has(code)) {
            continue;
          }

          if (candidate.optional) {
            summary.attempted = true;
            summary.skipped = true;
            summary.reason = summary.reason || 'optional_lookup_failed';
            handled = true;
            break;
          }

          throw normalizeSupabaseError(`Operator unlock lookup (${tableName})`, countError);
        }

        const existing = typeof count === 'number' && Number.isFinite(count) ? count : 0;
        summary.attempted = true;
        handled = true;

        if (existing === 0) {
          matchedColumns.add(column);
          continue;
        }

        const { error: deleteError } = await client
          .from(tableName)
          .delete()
          .eq(column, normalizedId);

        if (deleteError) {
          const code = typeof deleteError.code === 'string' ? deleteError.code.trim() : '';

          if (code && ERROR_VIEW_READONLY.has(code)) {
            summary.skipped = true;
            summary.reason = 'immutable_view';
            handled = true;
            matchedColumns.add(column);
            break;
          }

          if (code && ERROR_COLUMN_MISSING.has(code)) {
            continue;
          }

          if (code && ERROR_TABLE_MISSING.has(code)) {
            summary.skipped = true;
            summary.reason = 'table_missing';
            handled = true;
            break;
          }

          throw normalizeSupabaseError(`Operator unlock reset (${tableName})`, deleteError);
        }

        matchedColumns.add(column);
        summary.removed += existing;
        totalRemoved += existing;
      }

      if (matchedColumns.size > 0 && expiryColumns.length > 0) {
        let expiryHandled = false;

        for (const matchedColumn of matchedColumns) {
          if (expiryHandled) break;
          const expired = await tryExpireUnlocks(
            client,
            tableName,
            matchedColumn,
            normalizedId,
            expiryColumns,
            summary,
            nowIso,
          );
          expiryHandled = expiryHandled || expired;
        }

        handled = handled || expiryHandled;
      }

      if (matchedColumns.size === 1) {
        summary.column = Array.from(matchedColumns)[0];
      } else if (matchedColumns.size > 1) {
        summary.column = Array.from(matchedColumns);
      }

      if (!handled) {
        summary.skipped = true;
        summary.reason = summary.reason || 'column_missing';
      }

      tableSummaries.push(summary);
      anyAttempted = anyAttempted || summary.attempted;
    }

    if (!anyAttempted) {
      console.warn('Operator unlock reset executed with no matching tables.', {
        operatorId: normalizedId,
      });
    }

    let remainingActiveUnlocks = null;
    try {
      const { count: activeCount, error: activeError } = await client
        .from('v_op_unlocks_active')
        .select('athlete_id', { count: 'exact', head: true })
        .eq('op_id', normalizedId);

      if (activeError) {
        const code = typeof activeError.code === 'string' ? activeError.code.trim() : '';
        if (code && (ERROR_TABLE_MISSING.has(code) || ERROR_VIEW_READONLY.has(code))) {
          remainingActiveUnlocks = null;
        } else {
          console.warn('Operator unlock reset verification failed', activeError);
        }
      } else if (Number.isFinite(activeCount)) {
        remainingActiveUnlocks = activeCount;
        if (activeCount > 0) {
          console.warn('Operator unlock reset incomplete: active unlocks remain', {
            operatorId: normalizedId,
            activeUnlocks: activeCount,
          });
        }
      }
    } catch (verifyError) {
      console.warn('Operator unlock reset verification failed', verifyError);
    }

    return res.status(200).json({
      success: true,
      clearedUnlocks: totalRemoved,
      tables: tableSummaries,
      remainingActiveUnlocks,
    });
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to reset operator unlock history.';
    const code = typeof error?.code === 'string' && error.code ? error.code : undefined;
    const details = typeof error?.details === 'string' && error.details ? error.details : undefined;
    const hint = typeof error?.hint === 'string' && error.hint ? error.hint : undefined;

    console.error('Internal enabler unlock reset failed', error);

    const body = { error: message };
    if (code) body.code = code;
    if (details) body.details = details;
    if (hint) body.hint = hint;

    return res.status(statusCode).json(body);
  }
}

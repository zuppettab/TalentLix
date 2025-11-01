import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
  resolveAdminRequestContext,
} from '../../../utils/internalEnablerApi';

const CANDIDATE_TABLES = [
  { name: 'op_contact_unlock', columns: ['op_id', 'operator_id'] },
  { name: 'op_contact_unlocks', columns: ['op_id', 'operator_id'] },
  { name: 'op_unlock', columns: ['op_id', 'operator_id'] },
  { name: 'op_unlocks', columns: ['op_id', 'operator_id'] },
  { name: 'operator_contact_unlock', columns: ['op_id', 'operator_id'] },
  { name: 'operator_contact_unlocks', columns: ['op_id', 'operator_id'] },
];

const ERROR_TABLE_MISSING = new Set(['42P01', 'PGRST205']);
const ERROR_COLUMN_MISSING = new Set(['42703', 'PGRST204']);
const ERROR_VIEW_READONLY = new Set(['0A000', '42809']);

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

    for (const candidate of CANDIDATE_TABLES) {
      const tableName = candidate.name;
      const columns = Array.isArray(candidate.columns) && candidate.columns.length
        ? candidate.columns
        : ['op_id'];

      const summary = {
        table: tableName,
        removed: 0,
        attempted: false,
        skipped: false,
      };

      let handled = false;

      for (const column of columns) {
        const normalizedColumn = typeof column === 'string' ? column.trim() : '';
        if (!normalizedColumn) {
          continue;
        }

        const { error, count } = await client
          .from(tableName)
          .delete({ returning: 'minimal', count: 'exact' })
          .eq(normalizedColumn, normalizedId);

        if (error) {
          const code = typeof error.code === 'string' ? error.code.trim() : '';

          if (code && ERROR_TABLE_MISSING.has(code)) {
            summary.skipped = true;
            summary.reason = 'table_missing';
            handled = true;
            break;
          }

          if (code && ERROR_COLUMN_MISSING.has(code)) {
            // Try the next candidate column.
            continue;
          }

          if (ERROR_VIEW_READONLY.has(code)) {
            summary.skipped = true;
            summary.reason = 'immutable_view';
            handled = true;
            break;
          }

          throw normalizeSupabaseError(`Operator unlock reset (${tableName})`, error);
        }

        summary.attempted = true;
        handled = true;
        const removed = typeof count === 'number' && Number.isFinite(count) ? count : 0;
        summary.removed = removed;
        summary.column = normalizedColumn;
        totalRemoved += removed;
        break;
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

    return res.status(200).json({
      success: true,
      clearedUnlocks: totalRemoved,
      tables: tableSummaries,
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

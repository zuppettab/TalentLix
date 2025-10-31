const UNLOCK_CONTACTS_PRODUCT_CODE = 'UNLOCK_CONTACTS';

const BASE_SELECT_COLUMNS = [
  'id',
  'credits_cost',
  'validity_days',
  'effective_from',
  'effective_to',
];

const MODERN_TIMESTAMP_COLUMN = 'updated_at';
const LEGACY_TIMESTAMP_COLUMN = 'pricing_updated_at';

const buildSelectClause = (timestampColumn) => {
  if (!timestampColumn) {
    return BASE_SELECT_COLUMNS.join(', ');
  }
  return `${BASE_SELECT_COLUMNS.join(', ')}, ${timestampColumn}`;
};

const isMissingColumnError = (error) => {
  const code = typeof error?.code === 'string' ? error.code.trim() : '';
  return code === '42703';
};

const runActiveTariffQuery = (client, productCode, nowIso, timestampColumn) => {
  return client
    .from('pricing')
    .select(buildSelectClause(timestampColumn))
    .eq('code', productCode)
    .lte('effective_from', nowIso)
    .or(`effective_to.is.null,effective_to.gte.${nowIso}`)
    .order('effective_from', { ascending: false, nullsFirst: false })
    .limit(1);
};

export const fetchActiveTariffWithFallback = async (
  client,
  { productCode = UNLOCK_CONTACTS_PRODUCT_CODE, nowIso = new Date().toISOString() } = {}
) => {
  const attempts = [MODERN_TIMESTAMP_COLUMN, LEGACY_TIMESTAMP_COLUMN, null];
  let lastResult = null;

  for (const column of attempts) {
    const result = await runActiveTariffQuery(client, productCode, nowIso, column);
    if (!result.error) {
      return { ...result, timestampColumn: column };
    }

    lastResult = result;
    if (!isMissingColumnError(result.error)) {
      return result;
    }
  }

  return lastResult;
};

export const normalizeTariffRow = (row) => {
  if (!row) return null;

  const toNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const credits = toNumber(row.credits_cost);
  const validity = toNumber(row.validity_days);
  const updatedAt = row.updated_at || row.pricing_updated_at || null;

  return {
    id: row.id || null,
    creditsCost: credits != null ? Math.round(credits * 100) / 100 : null,
    validityDays: validity != null ? Math.max(0, Math.round(validity)) : null,
    effectiveFrom: row.effective_from || null,
    effectiveTo: row.effective_to || null,
    updatedAt,
  };
};

export { UNLOCK_CONTACTS_PRODUCT_CODE };

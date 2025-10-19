import { getSupabaseServiceClient } from '../../../../utils/supabaseAdminClient';

const VIEW_NAME =
  process.env.OPERATOR_SEARCH_VIEW ||
  process.env.NEXT_PUBLIC_OPERATOR_SEARCH_VIEW ||
  'algolia_athlete_search';

const MAX_PER_PAGE = 48;
const DEFAULT_PER_PAGE = 24;

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeList = (value) =>
  asArray(value)
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => typeof item === 'string' && item !== '');

const normalizeToggleMap = (value) => {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value).reduce((acc, [key, raw]) => {
    acc[key] = Boolean(raw);
    return acc;
  }, {});
};

const ensureObjectId = (row) => {
  const candidates = [row?.objectID, row?.objectId, row?.object_id, row?.athlete_id, row?.id, row?.uuid, row?.slug];
  const objectID = candidates.find((item) =>
    item != null && String(item).trim() !== ''
  );
  return { ...row, objectID: objectID ? String(objectID) : `athlete_${Math.random().toString(36).slice(2)}` };
};

const escapeLikeValue = (value) => value.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/'/g, "''");

const toTitleCase = (value) =>
  value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const formatArrayFilterValue = (value) => {
  const jsonArray = JSON.stringify([value]);
  return `{${jsonArray.slice(1, -1)}}`;
};

const createArrayFilterVariants = (attribute, value) => {
  if (value == null) return [];
  const base = String(value).trim();
  if (!base) return [];

  const lower = base.toLowerCase();
  const variations = new Set();
  variations.add(base);
  variations.add(lower);
  variations.add(base.toUpperCase());
  variations.add(toTitleCase(base));

  return [...variations]
    .map((variant) => (typeof variant === 'string' ? variant.trim() : ''))
    .filter((variant) => variant !== '')
    .map((variant) => `${attribute}.cs.${formatArrayFilterValue(variant)}`);
};

const buildArrayFacetFilter = (attribute, values = []) => {
  const normalized = values
    .map((value) => (typeof value === 'string' ? value.trim() : value))
    .filter((value) => typeof value === 'string' && value !== '');

  if (!normalized.length) return '';

  return normalized
    .map((value) => `${attribute}.cs.${formatArrayFilterValue(value)}`)
    .join(',');
};

const applySearchFilters = (builder, { query, facets, toggles, age }) => {
  let chain = builder;

  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  if (normalizedQuery) {
    const escaped = escapeLikeValue(normalizedQuery);
    const like = `%${escaped}%`;
    const orFilters = [
      `role.ilike.${like}`,
      `sport.ilike.${like}`,
      `nationality.ilike.${like}`,
      `category.ilike.${like}`,
      ...createArrayFilterVariants('secondary_role', normalizedQuery),
      ...createArrayFilterVariants('preferred_regions', normalizedQuery),
    ];
    if (orFilters.length) {
      chain = chain.or(orFilters.join(','));
    }
  }

  Object.entries(facets).forEach(([attribute, values]) => {
    const list = normalizeList(values);
    if (!list.length) return;

    if (attribute === 'secondary_role' || attribute === 'preferred_regions') {
      const filterExpression = buildArrayFacetFilter(attribute, list);
      if (filterExpression) {
        chain = chain.or(filterExpression);
      }
    } else {
      chain = chain.in(attribute, list);
    }
  });

  Object.entries(toggles).forEach(([attribute, isActive]) => {
    if (isActive) {
      chain = chain.eq(attribute, true);
    }
  });

  const minAge = age?.min;
  const maxAge = age?.max;
  const parsedMin = minAge === '' ? null : Number(minAge);
  const parsedMax = maxAge === '' ? null : Number(maxAge);
  if (Number.isFinite(parsedMin)) {
    chain = chain.gte('age', parsedMin);
  }
  if (Number.isFinite(parsedMax)) {
    chain = chain.lte('age', parsedMax);
  }

  return chain;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!VIEW_NAME) {
    return res.status(500).json({ error: 'Operator search view is not configured.' });
  }

  const client = getSupabaseServiceClient();
  if (!client) {
    return res.status(500).json({ error: 'Supabase service role client is not configured.' });
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const { query = '', page = 0, perPage = DEFAULT_PER_PAGE } = body;
  const filters = body.filters && typeof body.filters === 'object' ? body.filters : {};

  const normalizedPage = Number.isFinite(Number(page)) ? Math.max(Number(page), 0) : 0;
  const normalizedPerPage = Number.isFinite(Number(perPage))
    ? Math.min(Math.max(Number(perPage), 1), MAX_PER_PAGE)
    : DEFAULT_PER_PAGE;

  const facets = filters.facets && typeof filters.facets === 'object' ? filters.facets : {};
  const toggles = normalizeToggleMap(filters.toggles);
  const age = filters.age && typeof filters.age === 'object' ? filters.age : { min: '', max: '' };

  const from = normalizedPage * normalizedPerPage;
  const to = from + normalizedPerPage - 1;

  try {
    const startedAt = Date.now();

    let builder = client.from(VIEW_NAME).select('*', { count: 'exact' });
    builder = applySearchFilters(builder, { query, facets, toggles, age });

    const { data, error, count } = await builder.range(from, to);
    if (error) throw error;

    const hits = Array.isArray(data) ? data.map(ensureObjectId) : [];
    const total = typeof count === 'number' ? count : hits.length;
    const nbPages = total > 0 ? Math.ceil(total / normalizedPerPage) : 0;
    const processingTimeMS = Date.now() - startedAt;

    return res.status(200).json({
      hits,
      total,
      page: normalizedPage,
      perPage: normalizedPerPage,
      nbPages,
      processingTimeMS,
    });
  } catch (error) {
    console.error('Operator search query failed', error);
    const message = error?.message || 'Unable to fetch athlete directory records.';
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({ error: message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

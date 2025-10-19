import { getSupabaseServiceClient } from '../../../../utils/supabaseAdminClient';

const VIEW_NAME =
  process.env.OPERATOR_SEARCH_VIEW ||
  process.env.NEXT_PUBLIC_OPERATOR_SEARCH_VIEW ||
  'algolia_athlete_search';

const toSortedUnique = (values) => {
  const set = new Set();
  values.forEach((value) => {
    if (value == null) return;
    const str = typeof value === 'string' ? value.trim() : String(value);
    if (str) set.add(str);
  });
  return [...set].sort((a, b) => a.localeCompare(b));
};

const fetchDistinctStrings = async (client, column) => {
  const { data, error } = await client
    .from(VIEW_NAME)
    .select(column, { distinct: true })
    .not(column, 'is', null);
  if (error) throw error;
  return toSortedUnique((data || []).map((row) => row[column]));
};

const fetchArrayValues = async (client, column) => {
  const { data, error } = await client
    .from(VIEW_NAME)
    .select(column)
    .not(column, 'is', null)
    .limit(5000);
  if (error) throw error;
  const collected = [];
  (data || []).forEach((row) => {
    const value = row[column];
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry != null) collected.push(String(entry));
      });
    } else if (value != null) {
      collected.push(String(value));
    }
  });
  return toSortedUnique(collected);
};

const fetchAgeStats = async (client) => {
  const [minResult, maxResult] = await Promise.all([
    client
      .from(VIEW_NAME)
      .select('age')
      .not('age', 'is', null)
      .order('age', { ascending: true })
      .limit(1),
    client
      .from(VIEW_NAME)
      .select('age')
      .not('age', 'is', null)
      .order('age', { ascending: false })
      .limit(1),
  ]);

  if (minResult.error) throw minResult.error;
  if (maxResult.error) throw maxResult.error;

  const toNumberOrNull = (value) => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const minAge = Array.isArray(minResult.data) && minResult.data.length > 0 ? toNumberOrNull(minResult.data[0]?.age) : null;
  const maxAge = Array.isArray(maxResult.data) && maxResult.data.length > 0 ? toNumberOrNull(maxResult.data[0]?.age) : null;

  return {
    min: minAge,
    max: maxAge,
  };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!VIEW_NAME) {
    return res.status(500).json({ error: 'Operator search view is not configured.' });
  }

  const client = getSupabaseServiceClient();
  if (!client) {
    return res.status(500).json({ error: 'Supabase service role client is not configured.' });
  }

  try {
    const [sports, roles, secondaryRoles, genders, nationalities, categories, regions, age] = await Promise.all([
      fetchDistinctStrings(client, 'sport'),
      fetchDistinctStrings(client, 'role'),
      fetchArrayValues(client, 'secondary_role'),
      fetchDistinctStrings(client, 'gender'),
      fetchDistinctStrings(client, 'nationality'),
      fetchDistinctStrings(client, 'category'),
      fetchArrayValues(client, 'preferred_regions'),
      fetchAgeStats(client),
    ]);

    return res.status(200).json({
      options: {
        sport: sports,
        role: roles,
        secondary_role: secondaryRoles,
        gender: genders,
        nationality: nationalities,
        category: categories,
        preferred_regions: regions,
      },
      age,
    });
  } catch (error) {
    console.error('Operator search options query failed', error);
    const message = error?.message || 'Unable to load search filters metadata.';
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({ error: message });
  }
}

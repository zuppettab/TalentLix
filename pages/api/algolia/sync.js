import { createClient } from '@supabase/supabase-js';

const need = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env ${key}`);
  return value;
};

const needOneOf = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error(`Missing env ${keys.join(' or ')}`);
};

const ALGOLIA_APP_ID = need('NEXT_PUBLIC_ALGOLIA_APP_ID');
const ALGOLIA_ADMIN = need('ALGOLIA_ADMIN_API_KEY');
const ALGOLIA_INDEX = need('ALGOLIA_INDEX_ATHLETE_SEARCH');
const SUPABASE_URL = needOneOf('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE = need('SUPABASE_SERVICE_ROLE_KEY');
const SYNC_SECRET = process.env.SYNC_SECRET || null;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

const buildAlgoliaEndpoint = () => `https://${ALGOLIA_APP_ID}.algolia.net/1/indexes/${encodeURIComponent(ALGOLIA_INDEX)}`;

const pushRecords = async (objects) => {
  if (!objects.length) return { pushed: 0 };
  const response = await fetch(`${buildAlgoliaEndpoint()}/batch`, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_ADMIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: objects.map((body) => ({ action: 'updateObject', body })),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Algolia sync failed with status ${response.status}`);
  }

  await response.json();
  return { pushed: objects.length };
};

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    if (SYNC_SECRET && req.query.key !== SYNC_SECRET) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const records = [];
    let from = 0;
    const size = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('algolia_athlete_search')
        .select('*')
        .range(from, from + size - 1);

      if (error) throw error;
      if (!data?.length) break;

      records.push(...data);
      if (data.length < size) break;
      from += size;
    }

    const objects = records.map((record) => ({
      objectID: record.objectID,
      gender: record.gender ?? null,
      sport: record.sport ?? null,
      role: record.role ?? null,
      secondary_role: Array.isArray(record.secondary_role)
        ? record.secondary_role
        : record.secondary_role
        ? [record.secondary_role]
        : [],
      age: typeof record.age === 'number' ? record.age : null,
      nationality: record.nationality ?? null,
      category: record.category ?? null,
      seeking_team: !!record.seeking_team,
      has_active_contract: !!record.has_active_contract,
      is_represented: !!record.is_represented,
      preferred_regions: Array.isArray(record.preferred_regions)
        ? record.preferred_regions
        : record.preferred_regions
        ? [record.preferred_regions]
        : [],
      is_verified: !!record.is_verified,
    }));

    const { pushed } = await pushRecords(objects);
    res.status(200).json({ ok: true, pushed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: String(error.message || error) });
  }
}

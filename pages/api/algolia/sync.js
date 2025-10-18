import algoliasearch from 'algoliasearch';
import { createClient } from '@supabase/supabase-js';

const need = (n) => {
  const v = process.env[n];
  if (!v) throw new Error(`Missing env ${n}`);
  return v;
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
const algolia = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN);
const index = algolia.initIndex(ALGOLIA_INDEX);

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    if (SYNC_SECRET && req.query.key !== SYNC_SECRET) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const all = [];
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('algolia_athlete_search')
        .select('*')
        .range(from, from + size - 1);
      if (error) throw error;
      if (!data?.length) break;
      all.push(...data);
      if (data.length < size) break;
      from += size;
    }

    const objs = all.map((r) => ({
      objectID: r.objectID,
      gender: r.gender ?? null,
      sport: r.sport ?? null,
      role: r.role ?? null,
      secondary_role: Array.isArray(r.secondary_role)
        ? r.secondary_role
        : r.secondary_role
        ? [r.secondary_role]
        : [],
      age: typeof r.age === 'number' ? r.age : null,
      nationality: r.nationality ?? null,
      category: r.category ?? null,
      seeking_team: !!r.seeking_team,
      has_active_contract: !!r.has_active_contract,
      is_represented: !!r.is_represented,
      preferred_regions: Array.isArray(r.preferred_regions)
        ? r.preferred_regions
        : r.preferred_regions
        ? [r.preferred_regions]
        : [],
      is_verified: !!r.is_verified,
    }));

    await index.saveObjects(objs, { autoGenerateObjectIDIfNotExist: false });
    res.status(200).json({ ok: true, pushed: objs.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

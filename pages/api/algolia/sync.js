// pages/api/algolia/sync.js
import { algoliasearch } from 'algoliasearch';
import { createClient } from '@supabase/supabase-js';

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
};

const ALGOLIA_APP_ID = need('NEXT_PUBLIC_ALGOLIA_APP_ID');         // pubblica ok
const ALGOLIA_ADMIN  = need('ALGOLIA_ADMIN_API_KEY');              // server-only
const ALGOLIA_INDEX  = need('ALGOLIA_INDEX_ATHLETE_SEARCH');       // server-only
const SUPABASE_URL   = need('SUPABASE_URL') || need('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SRK   = need('SUPABASE_SERVICE_ROLE_KEY');          // server-only
const SYNC_SECRET    = process.env.ALGOLIA_SYNC_SECRET || process.env.SYNC_SECRET || null;

const supabase = createClient(SUPABASE_URL, SUPABASE_SRK);
const client   = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN);

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    if (SYNC_SECRET && req.query.key !== SYNC_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    // 1) estrai tutto dalla VIEW in pagine da 1000
    const all = [];
    let from = 0;
    const size = 1000;
    for (;;) {
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

    // 2) normalizza tipi/array
    const objects = all.map((r) => ({
      objectID: r.objectID,                                // obbligatorio in v5
      gender: r.gender ?? null,
      sport: r.sport ?? null,
      role: r.role ?? null,
      secondary_role: Array.isArray(r.secondary_role)
        ? r.secondary_role
        : (r.secondary_role ? [r.secondary_role] : []),
      age: typeof r.age === 'number' ? r.age : null,
      nationality: r.nationality ?? null,
      category: r.category ?? null,
      seeking_team: !!r.seeking_team,
      has_active_contract: !!r.has_active_contract,
      is_represented: !!r.is_represented,
      preferred_regions: Array.isArray(r.preferred_regions)
        ? r.preferred_regions
        : (r.preferred_regions ? [r.preferred_regions] : []),
      is_verified: !!r.is_verified
    }));

    // 3) indicizza
    const index = client.initIndex(ALGOLIA_INDEX);

    // default: aggiornamento incrementale
    if (req.query.mode !== 'replace') {
      await index.saveObjects(objects);
      return res.status(200).json({ ok: true, mode: 'saveObjects', pushed: objects.length });
    }

    // opzionale: full replace zero‑downtime (pulisce anche gli stali)
    // NB: opera su indice temporaneo e poi fa lo swap atomico.
    await client.replaceAllObjects(ALGOLIA_INDEX, objects, { batchSize: 1000 });
    return res.status(200).json({ ok: true, mode: 'replaceAllObjects', pushed: objects.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

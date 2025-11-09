import { getSupabaseServiceClient } from '../../../utils/supabaseAdminClient';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const toStringId = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
};

const pickString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const coerceBody = (req) => {
  if (!req) return {};
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.error('[api/athlete/operator-profiles] Failed to parse JSON body', error);
      return {};
    }
  }
  return {};
};

const normalizeOperatorRow = (row) => {
  if (!row || typeof row !== 'object') return null;
  const id = toStringId(row.id);
  if (!id) return null;

  const profileCandidate = (() => {
    if (row.op_profile && typeof row.op_profile === 'object' && !Array.isArray(row.op_profile)) {
      return row.op_profile;
    }
    const arr = ensureArray(row.op_profile);
    return arr.length ? arr[0] : null;
  })();

  const profile = profileCandidate
    ? {
        legal_name: pickString(profileCandidate.legal_name),
        trade_name: pickString(profileCandidate.trade_name),
        logo_url: pickString(profileCandidate.logo_url),
      }
    : null;

  const resolvedName = [profile?.trade_name, profile?.legal_name].find((value) => value) || null;

  return {
    id,
    resolved_name: resolvedName,
    profile,
  };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) {
    console.error('[api/athlete/operator-profiles] Supabase service client is not configured');
    return res.status(500).json({ error: 'Supabase service client is not configured.' });
  }

  const body = coerceBody(req);
  const rawIds = ensureArray(body.operatorIds || body.opIds || body.ids);
  const operatorIds = Array.from(new Set(rawIds.map(toStringId).filter(Boolean)));

  if (!operatorIds.length) {
    return res.status(200).json({ operators: [] });
  }

  try {
    const { data, error } = await serviceClient
      .from('op_account')
      .select('id, op_profile(legal_name, trade_name, logo_url)')
      .in('id', operatorIds);

    if (error) {
      console.error('[api/athlete/operator-profiles] Query failed', error);
      return res.status(500).json({ error: 'Unable to load operator profiles.' });
    }

    const operators = ensureArray(data)
      .map(normalizeOperatorRow)
      .filter((row) => row && row.id);

    const operatorsById = new Map(operators.map((row) => [row.id, row]));
    const ordered = operatorIds
      .map((id) => operatorsById.get(id))
      .filter((row) => Boolean(row));

    return res.status(200).json({ operators: ordered });
  } catch (error) {
    console.error('[api/athlete/operator-profiles] Unexpected failure', error);
    return res.status(500).json({ error: 'Unable to load operator profiles.' });
  }
}

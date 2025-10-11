import { getSupabaseServiceClient, isSupabaseServiceConfigured } from '../../../utils/supabaseAdminClient';

const supabase = getSupabaseServiceClient();

const canonicalStatus = (value, fallback = 'unknown') => {
  if (!value) return fallback;
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized || fallback;
};

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
};

const pickLatestRecord = (records, dateFields = []) => {
  if (!records.length) return null;
  const getTimestamp = (record) => {
    return dateFields.reduce((acc, field) => {
      const raw = record?.[field];
      if (!raw) return acc;
      const ts = new Date(raw).getTime();
      if (Number.isNaN(ts)) return acc;
      return Math.max(acc, ts);
    }, 0);
  };
  return [...records].sort((a, b) => getTimestamp(b) - getTimestamp(a))[0] || null;
};

const normalizeAthleteRow = (row) => {
  const cvRecords = asArray(row.contacts_verification);
  const latestCv = pickLatestRecord(cvRecords, [
    'verification_status_changed_at',
    'submitted_at',
    'updated_at',
    'created_at',
  ]);
  const reviewStatus = canonicalStatus(
    latestCv?.review_status ?? (cvRecords.length ? 'draft' : 'not_started'),
    'not_started'
  );

  const normalizedCv = latestCv
    ? {
        ...latestCv,
        review_status: reviewStatus,
      }
    : null;

  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    cv: normalizedCv,
    review_status: reviewStatus,
  };
};

const normalizeOperatorRow = (row) => {
  const profileArr = asArray(row.op_profile);
  const contactArr = asArray(row.op_contact);
  const typeArr = asArray(row.op_type);
  const requestArr = asArray(row.op_verification_request);

  const latestRequest = pickLatestRecord(requestArr, ['submitted_at', 'updated_at', 'created_at']);
  const documentsArr = asArray(latestRequest?.op_verification_document);

  const reviewState = canonicalStatus(
    latestRequest?.state ?? row.wizard_status ?? 'not_started',
    'not_started'
  );

  return {
    id: row.id,
    status: row.status || '',
    wizard_status: row.wizard_status || '',
    type: typeArr[0]
      ? { id: typeArr[0].id, code: typeArr[0].code, name: typeArr[0].name }
      : null,
    profile: profileArr[0] || null,
    contact: contactArr[0] || null,
    verification: latestRequest
      ? { ...latestRequest, state: canonicalStatus(latestRequest.state, 'unknown') }
      : null,
    documents: documentsArr.map((doc) => ({ doc_type: doc.doc_type, file_key: doc.file_key })),
    review_state: reviewState,
  };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isSupabaseServiceConfigured || !supabase) {
    return res.status(500).json({ error: 'Supabase admin client not configured' });
  }

  try {
    const [athletesResult, operatorsResult] = await Promise.all([
      supabase
        .from('athlete')
        .select(
          `
          id, first_name, last_name, phone,
          contacts_verification (
            id, review_status, id_verified, rejected_reason,
            submitted_at, verified_at, verification_status_changed_at,
            id_document_type, id_document_url, id_selfie_url,
            phone_verified, residence_city, residence_country
          )
        `
        ),
      supabase
        .from('op_account')
        .select(
          `
          id, status, wizard_status, type_id,
          op_type:op_type(id, code, name),
          op_profile:op_profile(legal_name, trade_name, vat_number, tax_id, country, city, address1, address2),
          op_contact:op_contact(email_primary, phone_e164, phone_verified_at),
          op_verification_request:op_verification_request(
            id, state, reason, submitted_at, created_at, updated_at,
            op_verification_document:op_verification_document(doc_type, file_key)
          )
        `
        ),
    ]);

    if (athletesResult.error) throw athletesResult.error;
    if (operatorsResult.error) throw operatorsResult.error;

    const athletes = (athletesResult.data || []).map(normalizeAthleteRow);
    const operators = (operatorsResult.data || []).map(normalizeOperatorRow);

    return res.status(200).json({ athletes, operators });
  } catch (error) {
    console.error('Internal enabler overview failed', error);
    return res.status(500).json({ error: 'Unable to load admin overview data.' });
  }
}

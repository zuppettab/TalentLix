import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
  resolveAdminRequestContext,
} from '../../../utils/internalEnablerApi';

const VALID_ACTIONS = new Set(['start_review', 'request_info', 'approve', 'reject']);

const performStartReview = async (client, athleteId) => {
  const { data, error } = await client
    .from('contacts_verification')
    .update({
      review_status: 'in_review',
      verification_status_changed_at: new Date().toISOString(),
    })
    .eq('athlete_id', athleteId)
    .in('review_status', ['submitted', 'needs_more_info'])
    .select('id');

  if (error) throw normalizeSupabaseError('Athlete review start', error);
  if (!Array.isArray(data) || data.length === 0) {
    throw createHttpError(404, 'No athlete verification record found for the requested action.');
  }
};

const performRequestInfo = async (client, athleteId, reason) => {
  const payload = {
    review_status: 'needs_more_info',
    id_verified: false,
    verification_status_changed_at: new Date().toISOString(),
    rejected_reason: reason || null,
  };

  const { data, error } = await client
    .from('contacts_verification')
    .update(payload)
    .eq('athlete_id', athleteId)
    .in('review_status', ['submitted', 'in_review'])
    .select('id');

  if (error) throw normalizeSupabaseError('Athlete info request', error);
  if (!Array.isArray(data) || data.length === 0) {
    throw createHttpError(404, 'No athlete verification record found for the requested action.');
  }
};

const performApprove = async (client, athleteId) => {
  const timestamp = new Date().toISOString();
  const { data, error } = await client
    .from('contacts_verification')
    .update({
      review_status: 'approved',
      id_verified: true,
      verified_at: timestamp,
      verification_status_changed_at: timestamp,
      rejected_reason: null,
    })
    .eq('athlete_id', athleteId)
    .in('review_status', ['submitted', 'in_review'])
    .select('id');

  if (error) throw normalizeSupabaseError('Athlete approval', error);
  if (!Array.isArray(data) || data.length === 0) {
    throw createHttpError(404, 'No athlete verification record found for the requested action.');
  }
};

const performReject = async (client, athleteId, reason) => {
  const { data, error } = await client
    .from('contacts_verification')
    .update({
      review_status: 'rejected',
      id_verified: false,
      verification_status_changed_at: new Date().toISOString(),
      rejected_reason: reason || null,
    })
    .eq('athlete_id', athleteId)
    .in('review_status', ['submitted', 'in_review'])
    .select('id');

  if (error) throw normalizeSupabaseError('Athlete rejection', error);
  if (!Array.isArray(data) || data.length === 0) {
    throw createHttpError(404, 'No athlete verification record found for the requested action.');
  }
};

const ACTION_HANDLERS = {
  start_review: performStartReview,
  request_info: performRequestInfo,
  approve: performApprove,
  reject: performReject,
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

    const { action, athleteId, reason } = req.body || {};
    if (!VALID_ACTIONS.has(action)) {
      throw createHttpError(400, 'Unsupported athlete action requested.');
    }

    if (!athleteId || (typeof athleteId !== 'string' && typeof athleteId !== 'number')) {
      throw createHttpError(400, 'A valid athleteId must be provided.');
    }

    const handler = ACTION_HANDLERS[action];
    await handler(client, athleteId, typeof reason === 'string' ? reason.trim() : null);

    return res.status(200).json({ success: true });
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to process athlete action.';
    const code = typeof error?.code === 'string' && error.code ? error.code : undefined;
    const details = typeof error?.details === 'string' && error.details ? error.details : undefined;
    const hint = typeof error?.hint === 'string' && error.hint ? error.hint : undefined;
    console.error('Internal enabler athlete action failed', error);

    const responseBody = { error: message };
    if (code) responseBody.code = code;
    if (details) responseBody.details = details;
    if (hint) responseBody.hint = hint;

    return res.status(statusCode).json(responseBody);
  }
}


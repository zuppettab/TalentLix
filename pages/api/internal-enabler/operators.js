import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
  resolveAdminRequestContext,
} from '../../../utils/internalEnablerApi';

const VALID_ACTIONS = new Set(['start_review', 'request_info', 'approve', 'reject']);

const updateVerificationRequest = async (client, verificationId, payload, allowedStates = []) => {
  let query = client
    .from('op_verification_request')
    .update(payload)
    .eq('id', verificationId);

  if (Array.isArray(allowedStates) && allowedStates.length) {
    query = query.in('state', allowedStates);
  }

  const { data, error } = await query.select('id');
  if (error) throw normalizeSupabaseError('Operator verification request update', error);
  if (!Array.isArray(data) || data.length === 0) {
    throw createHttpError(404, 'No verification request found for the requested action.');
  }
};

const updateOperatorAccount = async (client, operatorId, payload) => {
  const { data, error } = await client
    .from('op_account')
    .update(payload)
    .eq('id', operatorId)
    .select('id');

  if (error) throw normalizeSupabaseError('Operator account update', error);
  if (!Array.isArray(data) || data.length === 0) {
    throw createHttpError(404, 'No operator account found for the requested action.');
  }
};

const performStartReview = async (client, operatorId, { verificationId, markSubmitted }) => {
  const timestamp = new Date().toISOString();
  const verificationPayload = {
    state: 'IN_REVIEW',
    reason: null,
  };

  if (markSubmitted) {
    verificationPayload.submitted_at = timestamp;
  }

  await updateVerificationRequest(client, verificationId, verificationPayload, ['NOT_STARTED', 'NEEDS_MORE_INFO']);
  await updateOperatorAccount(client, operatorId, { wizard_status: 'SUBMITTED' });
};

const performRequestInfo = async (client, operatorId, { verificationId, reason }) => {
  if (!reason) {
    throw createHttpError(400, 'A valid reason must be provided.');
  }

  await updateVerificationRequest(
    client,
    verificationId,
    { state: 'NEEDS_MORE_INFO', reason },
    ['IN_REVIEW']
  );
  await updateOperatorAccount(client, operatorId, { wizard_status: 'IN_PROGRESS' });
};

const performApprove = async (client, operatorId, { verificationId }) => {
  await updateVerificationRequest(
    client,
    verificationId,
    { state: 'VERIFIED', reason: null },
    ['IN_REVIEW']
  );
  await updateOperatorAccount(client, operatorId, { status: 'active', wizard_status: 'COMPLETED' });
};

const performReject = async (client, operatorId, { verificationId, reason }) => {
  if (!reason) {
    throw createHttpError(400, 'A valid rejection reason must be provided.');
  }

  await updateVerificationRequest(
    client,
    verificationId,
    { state: 'REJECTED', reason },
    ['IN_REVIEW', 'NEEDS_MORE_INFO', 'VERIFIED']
  );

  await updateOperatorAccount(client, operatorId, { wizard_status: 'IN_PROGRESS' });
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

    const { action, operatorId, verificationId, reason, markSubmitted } = req.body || {};

    if (!VALID_ACTIONS.has(action)) {
      throw createHttpError(400, 'Unsupported operator action requested.');
    }

    if (!operatorId || (typeof operatorId !== 'string' && typeof operatorId !== 'number')) {
      throw createHttpError(400, 'A valid operatorId must be provided.');
    }

    if (!verificationId || (typeof verificationId !== 'string' && typeof verificationId !== 'number')) {
      throw createHttpError(400, 'A valid verificationId must be provided.');
    }

    const handler = ACTION_HANDLERS[action];
    await handler(client, operatorId, {
      verificationId,
      reason: typeof reason === 'string' ? reason.trim() : null,
      markSubmitted: Boolean(markSubmitted),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to process operator action.';
    const code = typeof error?.code === 'string' && error.code ? error.code : undefined;
    const details = typeof error?.details === 'string' && error.details ? error.details : undefined;
    const hint = typeof error?.hint === 'string' && error.hint ? error.hint : undefined;
    console.error('Internal enabler operator action failed', error);

    const responseBody = { error: message };
    if (code) responseBody.code = code;
    if (details) responseBody.details = details;
    if (hint) responseBody.hint = hint;

    return res.status(statusCode).json(responseBody);
  }
}


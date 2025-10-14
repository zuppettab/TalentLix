import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
  resolveAdminRequestContext,
} from '../../../../utils/internalEnablerApi';

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const pushEvent = (target, timestamp, title, description = '') => {
  if (!timestamp) return;
  const date = new Date(timestamp);
  const sortKey = Number.isNaN(date.getTime()) ? null : date.getTime();
  target.push({
    timestamp,
    sortKey,
    title,
    description,
  });
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      throw createHttpError(401, 'Missing access token.');
    }

    const { client } = await resolveAdminRequestContext(accessToken, { requireServiceRole: true });

    const { operatorId } = req.query || {};
    const rawId = Array.isArray(operatorId) ? operatorId[0] : operatorId;
    if (!rawId) {
      throw createHttpError(400, 'A valid operator id must be provided.');
    }

    const accountResult = await client
      .from('op_account')
      .select(`
        *,
        op_type:op_type(*),
        op_profile:op_profile(*),
        op_contact:op_contact(*),
        op_verification_request:op_verification_request(*, op_verification_document:op_verification_document(*)),
        op_social_profiles:op_social_profiles(*)
      `)
      .eq('id', rawId)
      .maybeSingle();

    if (accountResult.error) throw normalizeSupabaseError('Operator account', accountResult.error);

    const accountRow = accountResult.data || null;
    if (!accountRow) {
      throw createHttpError(404, 'Operator not found.');
    }

    const profile = toArray(accountRow.op_profile)[0] || null;
    const contact = toArray(accountRow.op_contact)[0] || null;
    const type = toArray(accountRow.op_type)[0] || accountRow.op_type || null;
    const socialProfiles = toArray(accountRow.op_social_profiles);
    const verificationRequests = toArray(accountRow.op_verification_request).map((request) => ({
      ...request,
      op_verification_document: toArray(request?.op_verification_document),
    }));

    verificationRequests.sort((a, b) => {
      const tsA = new Date(a?.created_at || a?.submitted_at || 0).getTime() || 0;
      const tsB = new Date(b?.created_at || b?.submitted_at || 0).getTime() || 0;
      return tsB - tsA;
    });

    const documents = verificationRequests.flatMap((request) => request.op_verification_document || []);

    const activity = [];
    pushEvent(activity, accountRow.created_at, 'Operator account created');
    pushEvent(activity, accountRow.updated_at, 'Operator account updated');
    pushEvent(activity, accountRow.last_login_at, 'Operator last login');
    pushEvent(activity, accountRow.last_activity_at, 'Operator activity recorded');
    if (contact) {
      pushEvent(activity, contact.phone_verified_at, 'Phone verified');
      pushEvent(activity, contact.updated_at, 'Contact updated');
    }

    verificationRequests.forEach((request) => {
      pushEvent(activity, request.created_at, 'Verification request created', request.state);
      pushEvent(activity, request.submitted_at, 'Verification submitted', request.state);
      pushEvent(activity, request.updated_at, 'Verification updated', request.state);
    });

    const sortedActivity = activity
      .sort((a, b) => (b.sortKey ?? 0) - (a.sortKey ?? 0))
      .slice(0, 25);

    return res.status(200).json({
      account: accountRow,
      profile,
      contact,
      type,
      socialProfiles,
      verificationRequests,
      documents,
      activity: sortedActivity,
    });
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to load operator details.';
    const code = typeof error?.code === 'string' && error.code ? error.code : undefined;
    const details = typeof error?.details === 'string' && error.details ? error.details : undefined;
    const hint = typeof error?.hint === 'string' && error.hint ? error.hint : undefined;

    console.error('Internal enabler operator detail failed', error);

    const body = { error: message };
    if (code) body.code = code;
    if (details) body.details = details;
    if (hint) body.hint = hint;

    return res.status(statusCode).json(body);
  }
}

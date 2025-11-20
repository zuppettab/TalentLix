import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
  resolveAdminRequestContext,
} from '../../../utils/internalEnablerApi';
import { sendEmail } from '../../../utils/emailService';

const VALID_ACTIONS = new Set(['start_review', 'request_info', 'approve', 'reject']);

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeEmail = (value) => normalizeString(value).toLowerCase();

const escapeHtml = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const fetchAthleteIdentity = async (client, athleteId) => {
  try {
    const { data, error } = await client
      .from('athlete')
      .select('first_name, last_name, email')
      .eq('id', athleteId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const firstName = normalizeString(data?.first_name);
    const lastName = normalizeString(data?.last_name);
    let email = normalizeEmail(data?.email);

    if (!email) {
      try {
        const { data: contactsRow, error: contactsError } = await client
          .from('contacts_verification')
          .select('athlete_email')
          .eq('athlete_id', athleteId)
          .order('verification_status_changed_at', { ascending: false })
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (contactsError && contactsError.code !== 'PGRST116') {
          throw contactsError;
        }

        const contactsEmail = normalizeEmail(contactsRow?.athlete_email);
        if (contactsEmail) {
          email = contactsEmail;
        }
      } catch (contactsLookupError) {
        console.error('Unable to load contacts verification email for review notification', contactsLookupError);
      }
    }

    if (!email && client?.auth?.admin?.getUserById) {
      try {
        const { data: authData, error: authError } = await client.auth.admin.getUserById(athleteId);
        if (authError) {
          console.error('Failed to load athlete auth user for review notification', authError);
        } else {
          email = normalizeEmail(authData?.user?.email);
        }
      } catch (adminError) {
        console.error('Unable to fetch athlete auth identity for review notification', adminError);
      }
    }

    return {
      email,
      firstName,
      lastName,
    };
  } catch (identityError) {
    console.error('Unable to resolve athlete identity for review notification', identityError);
    return {
      email: '',
      firstName: '',
      lastName: '',
    };
  }
};

const buildOutcomeEmailPayload = ({ to, fullName, outcome, reason }) => {
  if (!to) return null;
  const safeName = fullName || 'TalentLix athlete';

  if (outcome === 'approved') {
    const subject = 'Your identity verification has been approved';
    const body =
      'The documentation for your verified identification has been approved successfully. This increases the completion percentage of your profile and the trust that operators and clubs place in you. Good luck!';
    const text = `Dear ${safeName},\n\n${body}\n\nTalentLix Team`;
    const html = `<p>Dear ${safeName},</p><p>${body}</p><p>TalentLix Team</p>`;
    return { to, subject, text, html };
  }

  if (outcome === 'rejected') {
    const subject = 'Your identity verification was not approved';
    const normalizedReason = normalizeString(reason);
    const reasonText = normalizedReason
      ? `Reasons provided by our internal team: ${normalizedReason}`
      : 'Reasons provided by our internal team: not specified.';
    const text = `Dear ${safeName},\n\nThe documentation you submitted has been reviewed and unfortunately your verified identity was not approved. ${reasonText}\n\nDo not worry, you can submit a new request right away with the necessary corrections.\n\nTalentLix Team`;
    const htmlReason = normalizedReason
      ? `<p><strong>Reasons provided:</strong> ${escapeHtml(normalizedReason)}</p>`
      : '<p><strong>Reasons provided:</strong> Not specified.</p>';
    const html = `<p>Dear ${safeName},</p><p>The documentation you submitted has been reviewed and unfortunately your verified identity was not approved.</p>${htmlReason}<p>Do not worry, you can submit a new request right away with the necessary corrections.</p><p>TalentLix Team</p>`;
    return { to, subject, text, html };
  }

  return null;
};

const sendOutcomeEmail = async ({ client, athleteId, outcome, reason }) => {
  try {
    const identity = await fetchAthleteIdentity(client, athleteId);
    const fullName = [identity.firstName, identity.lastName].filter(Boolean).join(' ').trim();
    const payload = buildOutcomeEmailPayload({
      to: identity.email,
      fullName,
      outcome,
      reason,
    });
    if (!payload) return;
    await sendEmail(payload);
  } catch (emailError) {
    console.error('Failed to send athlete review outcome email', emailError);
  }
};

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
      verified_at: null,
      verification_status_changed_at: new Date().toISOString(),
      rejected_reason: reason || null,
    })
    .eq('athlete_id', athleteId)
    .in('review_status', ['submitted', 'in_review', 'approved'])
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
    const normalizedReason = typeof reason === 'string' ? reason.trim() : null;
    await handler(client, athleteId, normalizedReason);

    if (action === 'approve') {
      await sendOutcomeEmail({ client, athleteId, outcome: 'approved' });
    } else if (action === 'reject') {
      await sendOutcomeEmail({ client, athleteId, outcome: 'rejected', reason: normalizedReason });
    }

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


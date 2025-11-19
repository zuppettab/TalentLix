import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
} from '../../../utils/internalEnablerApi';
import { resolveOperatorRequestContext } from '../../../utils/operatorApi';
import { loadOperatorContactBundle } from './athlete-contacts';
import { sendEmail } from '../../../utils/emailService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeUuid = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!UUID_REGEX.test(trimmed)) return null;
  return trimmed;
};

const pickFirst = (value) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : null;
  }
  return value ?? null;
};

const normalizeString = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed || '';
};

const normalizeNamePart = (value) => {
  const normalized = normalizeString(value);
  return normalized || null;
};

const buildFirstMessageEmailPayload = ({ to, athleteFirstName, operatorName }) => {
  if (!to) return null;

  const greeting = athleteFirstName ? `Hi ${athleteFirstName},` : 'Hello,';
  const resolvedOperatorName = operatorName || 'a TalentLix operator';
  const operatorDescriptor = resolvedOperatorName.startsWith('Operator ')
    ? resolvedOperatorName
    : `Operator ${resolvedOperatorName}`;

  const subject = 'You have a new TalentLix message';
  const textLines = [
    greeting,
    '',
    `${operatorDescriptor} has contacted you for the first time by sending a message on TalentLix.`,
    'Log in to your dashboard to read it and reply. Good luck!',
    '',
    'TalentLix Team',
  ];
  const htmlLines = [
    `<p>${greeting}</p>`,
    `<p><strong>${operatorDescriptor}</strong> has contacted you for the first time by sending a message on TalentLix.</p>`,
    '<p>Log in to your dashboard to read it and reply. Good luck!</p>',
    '<p>TalentLix Team</p>',
  ];

  return {
    to,
    subject,
    text: textLines.join('\n'),
    html: htmlLines.join(''),
  };
};

const respondWithError = (res, error, fallbackMessage) => {
  const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
  const message =
    typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : fallbackMessage;

  const body = { error: message };
  if (error?.code) body.code = error.code;
  if (error?.details) body.details = error.details;
  if (error?.hint) body.hint = error.hint;

  console.error('First message notification failed', error);
  return res.status(statusCode).json(body);
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

    const { client, user } = await resolveOperatorRequestContext(accessToken, { requireServiceRole: true });

    const threadId = normalizeUuid(req.body?.threadId || req.body?.thread_id);
    if (!threadId) {
      throw createHttpError(400, 'A valid threadId must be provided.');
    }

    const { data: accountRow, error: accountError } = await client
      .from('op_account')
      .select('id, op_profile:op_profile(legal_name, trade_name)')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (accountError) {
      throw normalizeSupabaseError('Operator account lookup', accountError);
    }

    const operatorId = accountRow?.id;
    if (!operatorId) {
      throw createHttpError(403, 'Operator account not found for the current user.');
    }

    const operatorProfile = pickFirst(accountRow?.op_profile);
    const operatorNameCandidates = [
      operatorProfile?.trade_name,
      operatorProfile?.legal_name,
      user?.user_metadata?.full_name,
      user?.user_metadata?.name,
      user?.email,
    ];
    const operatorDisplayName = operatorNameCandidates.map(normalizeNamePart).find(Boolean) || 'a TalentLix operator';

    const { data: threadRow, error: threadError } = await client
      .from('chat_thread')
      .select('id, op_id, athlete_id')
      .eq('id', threadId)
      .maybeSingle();

    if (threadError) {
      throw normalizeSupabaseError('Conversation lookup', threadError);
    }

    if (!threadRow || threadRow.op_id !== operatorId) {
      throw createHttpError(404, 'Conversation not found for this operator.');
    }

    if (!threadRow.athlete_id) {
      throw createHttpError(404, 'Athlete not found for this conversation.');
    }

    const { count: opMessageCount, error: countError } = await client
      .from('chat_message')
      .select('id', { head: true, count: 'exact' })
      .eq('thread_id', threadId)
      .eq('sender_kind', 'OP');

    if (countError) {
      throw normalizeSupabaseError('Operator message count lookup', countError);
    }

    if (opMessageCount !== 1) {
      return res.status(200).json({ notified: false, reason: 'not_first_message' });
    }

    const contactBundle = await loadOperatorContactBundle(client, operatorId, threadRow.athlete_id);
    const athleteEmail = normalizeString(contactBundle?.email);

    if (!athleteEmail) {
      console.warn('Skipping first message email notification due to missing athlete email', {
        threadId,
        athleteId: threadRow.athlete_id,
      });
      return res.status(200).json({ notified: false, reason: 'missing_email' });
    }

    const payload = buildFirstMessageEmailPayload({
      to: athleteEmail,
      athleteFirstName: normalizeNamePart(contactBundle?.first_name),
      operatorName: operatorDisplayName,
    });

    if (!payload) {
      return res.status(200).json({ notified: false, reason: 'payload_unavailable' });
    }

    await sendEmail(payload);

    return res.status(200).json({ notified: true });
  } catch (error) {
    return respondWithError(res, error, 'Unable to notify the athlete about the new message.');
  }
}


import { extractBearerToken } from '../../../utils/internalEnablerApi';
import { resolveAuthenticatedRequestContext } from '../../../utils/authenticatedApi';
import { sendEmail } from '../../../utils/emailService';

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeRequestBody = (body) => {
  if (!isPlainObject(body)) {
    return {};
  }
  return body;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const accessToken = extractBearerToken(req);
    const { user } = await resolveAuthenticatedRequestContext(accessToken, {
      requireServiceRole: false,
    });

    const body = normalizeRequestBody(req.body);
    const {
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      replyTo,
      headers,
    } = body;

    const delivery = await sendEmail({
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      replyTo,
      headers,
      metadata: {
        requestedBy: user?.id ?? null,
        requestedAt: new Date().toISOString(),
      },
    });

    res.status(200).json({
      message: 'Email sent successfully.',
      delivery,
    });
  } catch (error) {
    console.error('Failed to send email', error);
    const status = typeof error?.statusCode === 'number'
      ? error.statusCode
      : typeof error?.status === 'number'
        ? error.status
        : 500;

    res.status(status).json({
      error: error?.message || 'Failed to send email.',
      code: error?.code || null,
      details: error?.details || null,
    });
  }
}

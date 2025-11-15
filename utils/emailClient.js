const EMAIL_ENDPOINT = '/api/email/send';

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const sendEmailRequest = async ({ accessToken, ...payload } = {}) => {
  if (!accessToken) {
    throw new Error('An access token is required to send emails.');
  }

  const response = await fetch(EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload ?? {}),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.error || 'Failed to send email.');
    if (data?.code) error.code = data.code;
    if (data?.details) error.details = data.details;
    throw error;
  }

  return data;
};

export const sendEmailWithSupabase = async (supabaseClient, payload = {}) => {
  if (!supabaseClient) {
    throw new Error('A Supabase client instance is required.');
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    throw error;
  }

  const session = data?.session;
  if (!session?.access_token) {
    throw new Error('You must be signed in to send emails.');
  }

  return sendEmailRequest({ accessToken: session.access_token, ...payload });
};

export const buildEmailPayload = ({
  to,
  subject,
  text,
  html,
  cc,
  bcc,
  replyTo,
  headers,
} = {}) => {
  const payload = {};

  if (to) payload.to = to;
  if (subject) payload.subject = subject;
  if (text) payload.text = text;
  if (html) payload.html = html;
  if (cc) payload.cc = cc;
  if (bcc) payload.bcc = bcc;
  if (replyTo) payload.replyTo = replyTo;
  if (isPlainObject(headers) && Object.keys(headers).length) payload.headers = headers;

  return payload;
};

export default sendEmailWithSupabase;

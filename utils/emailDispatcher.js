const DEFAULT_ENDPOINT = '/api/email/send';
const DISPATCHER_PASSWORD =
  process.env.NEXT_PUBLIC_EMAIL_DISPATCHER_PASSWORD || '010405Lev..!';

function toPayloadMessage(message) {
  if (!message) {
    return '';
  }
  if (Array.isArray(message)) {
    return message
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean)
      .join('\n\n');
  }
  if (typeof message === 'string') {
    return message;
  }
  return String(message);
}

export async function sendEmail({
  to,
  subject,
  message,
  heading,
  previewText,
  endpoint = DEFAULT_ENDPOINT,
} = {}) {
  if (!to) {
    throw new Error('È necessario indicare almeno un destinatario (to).');
  }
  if (!subject) {
    throw new Error('È necessario indicare l\'oggetto (subject).');
  }
  if (!message) {
    throw new Error('È necessario indicare il contenuto (message).');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password: DISPATCHER_PASSWORD,
      to,
      subject,
      message: toPayloadMessage(message),
      heading,
      previewText,
    }),
  });

  if (!response.ok) {
    let errorDetail = 'Invio email fallito';
    try {
      const payload = await response.json();
      errorDetail = payload?.error || payload?.details || errorDetail;
    } catch (err) {
      // ignore
    }
    throw new Error(errorDetail);
  }

  const payload = await response.json();
  return payload;
}

export default {
  sendEmail,
};

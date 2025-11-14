
const DEFAULT_ENDPOINT = '/api/email/send';

function resolveDispatcherPassword() {
  const password = process.env.NEXT_PUBLIC_EMAIL_DISPATCHER_PASSWORD;

  if (!password) {
    throw new Error(
      'Password del dispatcher non configurata. Verifica la variabile di ambiente NEXT_PUBLIC_EMAIL_DISPATCHER_PASSWORD.',
    );
  }

  return password;
}

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

  const dispatcherPassword = resolveDispatcherPassword();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password: dispatcherPassword,
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
      errorDetail = payload?.details || payload?.error || errorDetail;
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

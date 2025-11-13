const DEFAULT_ENDPOINT = '/api/email/send';
const FALLBACK_DISPATCHER_PASSWORD = '010405Lev..!';
const RESOLVED_DISPATCHER_PASSWORD = process.env.NEXT_PUBLIC_EMAIL_DISPATCHER_PASSWORD;

if (typeof window !== 'undefined') {
  if (!RESOLVED_DISPATCHER_PASSWORD) {
    console.warn(
      '[EmailDispatcher] NEXT_PUBLIC_EMAIL_DISPATCHER_PASSWORD non è configurata; verrà utilizzata la password di fallback. Aggiorna le variabili d\'ambiente per ricevere le email di conferma.'
    );
  }
}

const DISPATCHER_PASSWORD = RESOLVED_DISPATCHER_PASSWORD || FALLBACK_DISPATCHER_PASSWORD;

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

  let response;
  try {
    response = await fetch(endpoint, {
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
  } catch (networkError) {
    throw new Error(`Impossibile contattare il servizio email: ${networkError.message}`);
  }

  if (!response.ok) {
    let errorDetail = `Invio email fallito (status ${response.status})`;
    try {
      const payload = await response.json();
      const backendMessage = payload?.error || payload?.details;
      if (backendMessage) {
        errorDetail = `${errorDetail}: ${backendMessage}`;
      }
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

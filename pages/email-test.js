import { useState } from 'react';
import { sendEmail } from '../utils/emailDispatcher';

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    background: '#f4f6fb',
    fontFamily: 'Inter, sans-serif',
    color: '#1f2937',
  },
  card: {
    width: '100%',
    maxWidth: '480px',
    background: '#ffffff',
    borderRadius: '16px',
    padding: '2.5rem 2rem',
    boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
    border: '1px solid #e2e8f0',
  },
  title: {
    marginBottom: '0.75rem',
    fontSize: '1.75rem',
    fontWeight: 600,
    textAlign: 'center',
    color: '#111827',
  },
  description: {
    marginBottom: '2rem',
    textAlign: 'center',
    fontSize: '0.95rem',
    lineHeight: 1.5,
    color: '#4b5563',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#1f2937',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  input: {
    width: '100%',
    padding: '0.85rem 1rem',
    fontSize: '1rem',
    borderRadius: '12px',
    border: '1px solid #d1d5db',
    backgroundColor: '#f9fafb',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  },
  textarea: {
    minHeight: '140px',
    resize: 'vertical',
  },
  button: {
    padding: '0.9rem 1.5rem',
    background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
    color: '#ffffff',
    fontSize: '1rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  status: {
    marginTop: '1rem',
    fontSize: '0.95rem',
    textAlign: 'center',
  },
  success: {
    color: '#059669',
  },
  error: {
    color: '#dc2626',
  },
};

export default function EmailTestPage() {
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus(null);

    if (!to.trim() || !message.trim()) {
      setStatus({
        type: 'error',
        title: 'Dati mancanti',
        text: 'Inserisci sia il destinatario che il contenuto del messaggio.',
      });
      return;
    }

    setIsSending(true);

    try {
      await sendEmail({
        to: to.trim(),
        subject: 'TalentLix · Invio di prova',
        message: message.trim(),
        heading: 'Email di prova TalentLix',
        previewText: 'Invio effettuato dalla pagina di prova pubblica.',
      });

      setStatus({
        type: 'success',
        title: 'Email inviata con successo',
        text: 'Controlla la casella del destinatario per verificare la ricezione del messaggio.',
      });
      setMessage('');
    } catch (error) {
      const detailMessage = error.details;
      const hasDetail = Boolean(detailMessage);
      const fallbackText =
        error.message && error.message !== error.title
          ? error.message
          : 'Invio non riuscito. Riprova più tardi o verifica la configurazione.';

      setStatus({
        type: 'error',
        title: error.title || 'Invio non riuscito',
        text: hasDetail ? 'Consulta il dettaglio tecnico riportato di seguito per capire la causa.' : fallbackText,
        details: hasDetail ? detailMessage : null,
        httpStatus: error.status,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Invio email di prova</h1>
        <p style={styles.description}>
          Usa questo modulo pubblico per testare il motore centralizzato di invio email. Specifica l&apos;indirizzo del destinatario
          e inserisci il contenuto che desideri recapitare.
        </p>

        <form style={styles.form} onSubmit={handleSubmit}>
          <label style={styles.label}>
            Destinatario
            <input
              type="email"
              placeholder="es. nome.cognome@example.com"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              style={styles.input}
              required
            />
          </label>

          <label style={styles.label}>
            Contenuto del messaggio
            <textarea
              placeholder="Scrivi qui il testo dell'email da inviare"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              style={{ ...styles.input, ...styles.textarea }}
              required
            />
          </label>

          <button
            type="submit"
            style={{
              ...styles.button,
              ...(isSending ? styles.buttonDisabled : null),
            }}
            disabled={isSending}
          >
            {isSending ? 'Invio in corso…' : 'Invia email'}
          </button>
        </form>

        {status && (
          <div
            style={{
              ...styles.status,
              ...(status.type === 'success' ? styles.success : styles.error),
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
            role="status"
            aria-live="polite"
          >
            <strong>{status.title}</strong>
            <span>{status.text}</span>
            {status.details && status.details !== status.text && (
              <code
                style={{
                  display: 'block',
                  backgroundColor: 'rgba(220, 38, 38, 0.08)',
                  color: '#7f1d1d',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  textAlign: 'left',
                  wordBreak: 'break-word',
                }}
              >
                {status.details}
              </code>
            )}
            {status.httpStatus && (
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                Codice di risposta: {status.httpStatus}
              </span>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

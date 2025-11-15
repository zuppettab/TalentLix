import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { supabase } from '../utils/supabaseClient';
import { sendEmailWithSupabase } from '../utils/emailClient';

const formStyles = {
  container: {
    maxWidth: '640px',
    margin: '0 auto',
    padding: '2rem 1.5rem 3rem',
    fontFamily: 'Inter, sans-serif',
    color: '#0f172a',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 20px 45px rgba(15, 23, 42, 0.08)',
    padding: '2rem',
    border: '1px solid rgba(15, 23, 42, 0.08)',
  },
  heading: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '1.5rem',
    color: '#0f172a',
  },
  description: {
    fontSize: '1rem',
    lineHeight: 1.6,
    color: '#475569',
    marginBottom: '1.5rem',
  },
  label: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#1e293b',
    display: 'block',
    marginBottom: '0.5rem',
  },
  input: {
    width: '100%',
    padding: '0.85rem 1rem',
    borderRadius: '10px',
    border: '1px solid rgba(148, 163, 184, 0.6)',
    fontSize: '1rem',
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    marginBottom: '1.25rem',
  },
  textarea: {
    width: '100%',
    minHeight: '160px',
    padding: '1rem',
    borderRadius: '10px',
    border: '1px solid rgba(148, 163, 184, 0.6)',
    fontSize: '1rem',
    resize: 'vertical',
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    marginBottom: '1.5rem',
  },
  button: {
    width: '100%',
    padding: '0.95rem 1rem',
    fontSize: '1.05rem',
    fontWeight: 700,
    borderRadius: '9999px',
    border: 'none',
    background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
    color: '#ffffff',
    cursor: 'pointer',
    boxShadow: '0 12px 25px rgba(14, 165, 233, 0.35)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '9999px',
    padding: '0.35rem 0.75rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    color: '#0369a1',
    marginBottom: '1.5rem',
  },
  status: {
    marginTop: '1.5rem',
    fontSize: '0.95rem',
    fontWeight: 600,
  },
  statusSuccess: {
    color: '#0f766e',
  },
  statusError: {
    color: '#dc2626',
  },
  loginPrompt: {
    textAlign: 'center',
    padding: '3rem 1.5rem',
    fontFamily: 'Inter, sans-serif',
    color: '#475569',
  },
  loginPromptHeading: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: '0.75rem',
  },
  loginLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
    marginTop: '1.5rem',
  },
  loginLink: {
    color: '#0ea5e9',
    fontWeight: 600,
    textDecoration: 'none',
  },
};

const initialForm = {
  to: '',
  subject: '',
  text: '',
  html: '',
};

const isValidEmail = (value) => {
  if (typeof value !== 'string') return false;
  return /.+@.+/.test(value.trim());
};

export default function EmailServiceTestPage() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (error) {
        console.error('Failed to load session', error);
      }
      setSession(data?.session ?? null);
      setLoadingSession(false);
    };

    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  const userEmail = useMemo(() => session?.user?.email ?? null, [session]);

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }, []);

  const canSubmit = useMemo(() => {
    if (!session) return false;
    if (!isValidEmail(form.to)) return false;
    if (!form.subject.trim()) return false;
    if (!form.text.trim() && !form.html.trim()) return false;
    return true;
  }, [session, form]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!canSubmit || sending) return;

    setSending(true);
    setResult(null);

    try {
      const response = await sendEmailWithSupabase(supabase, {
        to: form.to,
        subject: form.subject,
        text: form.text.trim() ? form.text : undefined,
        html: form.html.trim() ? form.html : undefined,
      });
      setResult({ type: 'success', message: response?.message ?? 'Email sent successfully.' });
      setForm(initialForm);
    } catch (error) {
      console.error('Failed to send test email', error);
      const details = error?.details ? ` (${error.details})` : '';
      setResult({
        type: 'error',
        message: error?.message ? `${error.message}${details}` : 'Unable to send the email.',
      });
    } finally {
      setSending(false);
    }
  }, [canSubmit, sending, form]);

  if (loadingSession) {
    return (
      <div style={formStyles.loginPrompt}>
        <Head>
          <title>Email Service Test · TalentLix</title>
        </Head>
        <p>Checking authentication status…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={formStyles.loginPrompt}>
        <Head>
          <title>Email Service Test · TalentLix</title>
        </Head>
        <h1 style={formStyles.loginPromptHeading}>Sign in to test the email service</h1>
        <p>You need to authenticate with any TalentLix account before using this testing tool.</p>
        <div style={formStyles.loginLinks}>
          <a href="/login" style={formStyles.loginLink}>Athlete login</a>
          <a href="/login-operator" style={formStyles.loginLink}>Operator login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={formStyles.container}>
      <Head>
        <title>Email Service Test · TalentLix</title>
      </Head>
      <div style={formStyles.card}>
        <span style={formStyles.badge}>Authenticated as {userEmail || 'user'}</span>
        <h1 style={formStyles.heading}>Email service test console</h1>
        <p style={formStyles.description}>
          Use this page to validate the shared email delivery service. Fill in the recipient, subject and message content,
          then submit the form to trigger an email via the authenticated API endpoint.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email-to" style={formStyles.label}>Recipient email</label>
          <input
            id="email-to"
            name="to"
            type="email"
            placeholder="recipient@example.com"
            value={form.to}
            onChange={handleChange}
            style={formStyles.input}
            required
          />

          <label htmlFor="email-subject" style={formStyles.label}>Subject</label>
          <input
            id="email-subject"
            name="subject"
            type="text"
            placeholder="Subject line"
            value={form.subject}
            onChange={handleChange}
            style={formStyles.input}
            required
          />

          <label htmlFor="email-text" style={formStyles.label}>Plain text content</label>
          <textarea
            id="email-text"
            name="text"
            placeholder="Write the message to deliver as plain text"
            value={form.text}
            onChange={handleChange}
            style={formStyles.textarea}
          />

          <label htmlFor="email-html" style={formStyles.label}>HTML content (optional)</label>
          <textarea
            id="email-html"
            name="html"
            placeholder="Paste HTML content if you prefer a rich message"
            value={form.html}
            onChange={handleChange}
            style={formStyles.textarea}
          />

          <button
            type="submit"
            style={{
              ...formStyles.button,
              ...(sending || !canSubmit ? formStyles.buttonDisabled : {}),
            }}
            disabled={sending || !canSubmit}
          >
            {sending ? 'Sending…' : 'Send test email'}
          </button>
        </form>
        {result && (
          <p
            style={{
              ...formStyles.status,
              ...(result.type === 'success' ? formStyles.statusSuccess : formStyles.statusError),
            }}
          >
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}

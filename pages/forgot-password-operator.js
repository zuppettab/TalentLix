import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { OPERATOR_UNAUTHORIZED_MESSAGE } from '../utils/authRoles';
import { fetchOperatorByEmail, isOperatorRecord } from '../utils/operatorHelpers';
import { PASSWORD_RESET_EMAIL_MESSAGE } from '../utils/resetPasswordMessages';

export default function ForgotPasswordOperator() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) router.push('/operator-wizard');
    };
    checkUser();
  }, [router]);

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const { data: operatorRecord, error: lookupError } = await fetchOperatorByEmail(supabase, email);

    if (lookupError) {
      console.error('Unable to verify operator account for reset password flow.', lookupError);
      setError('Impossibile verificare il ruolo operatore. Riprova.');
      return;
    }

    if (!isOperatorRecord(operatorRecord)) {
      setError(OPERATOR_UNAUTHORIZED_MESSAGE);
      return;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.talentlix.com';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password-operator`,
    });
    if (error) setError(error.message);
    else setMessage(PASSWORD_RESET_EMAIL_MESSAGE);
  };

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.card}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <h2 style={styles.title}>Forgot your operator password?</h2>
            <p style={styles.subtitle}>Enter the email associated with your operator account and we'll send you a reset link.</p>
            <form onSubmit={handleReset} style={styles.form}>
              <input
                type="email"
                placeholder="Operator email"
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
                style={styles.input}
                required
              />
              <button type="submit" style={styles.button}>Send Reset Link</button>
            </form>
            <Link href="/login-operator" style={styles.backLink}>← Back to Operator Login</Link>
            {message && <p style={styles.success}>{message}</p>}
            {error && <p style={styles.error}>{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  background: {
    backgroundImage: "url('/BackG.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    width: '100%',
    height: '100vh',
    position: 'relative',
  },
  overlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif', position: 'relative' },
  card: { background: '#F8F9FA', padding: '2rem', borderRadius: '12px', textAlign: 'center', width: '100%', maxWidth: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0' },
  logo: { width: '80px', marginBottom: '1rem' },
  title: { color: '#000000', fontSize: '1.5rem', marginBottom: '0.5rem' },
  subtitle: { color: '#555555', fontSize: '0.95rem', marginBottom: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  input: { padding: '0.8rem', border: '1px solid #CCC', borderRadius: '8px', background: '#FFFFFF', color: '#000000', fontSize: '1rem' },
  button: { padding: '0.8rem', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', border: 'none', borderRadius: '8px', color: '#FFFFFF', fontWeight: 'bold', cursor: 'pointer' },
  backLink: { display: 'inline-block', marginTop: '1rem', color: '#27E3DA', fontSize: '0.9rem', textDecoration: 'none', fontWeight: 'bold' },
  success: { color: '#27E3DA', marginTop: '1rem', fontSize: '0.9rem' },
  error: { color: '#D9534F', marginTop: '1rem', fontSize: '0.9rem' }
};

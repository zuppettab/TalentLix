import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import Link from 'next/link';

export default function Home() {
  const [confirmationStatus, setConfirmationStatus] = useState(null); // null | success | expired
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkConfirmation = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user?.email_confirmed_at) {
        // Email confermata correttamente
        setConfirmationStatus('success');
        setMessage('✅ Your email has been successfully confirmed!');
      } 
      // Se nell'URL è presente "type=signup" ma l'email non è confermata, il link è scaduto
      else if (window.location.href.includes('type=signup')) {
        setConfirmationStatus('expired');
        setMessage('❌ This confirmation link is invalid or has expired.');
      }
    };
    checkConfirmation();
  }, []);

  const resendConfirmation = async () => {
    const email = prompt('Enter your email to resend confirmation:');
    if (email) {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) setMessage('⚠️ Failed to resend confirmation email.');
      else setMessage('📧 A new confirmation email has been sent to your inbox.');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Logo TalentLix */}
        <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
        <h1 style={styles.title}>Welcome to TalentLix</h1>
        <p style={styles.subtitle}>The social platform for young athletes, built for sports.</p>

        {/* Blocco messaggi conferma/scadenza */}
        {confirmationStatus && (
          <div style={styles.alert}>
            <p>{message}</p>
            {confirmationStatus === 'expired' && (
              <button style={styles.button} onClick={resendConfirmation}>
                Resend Confirmation Email
              </button>
            )}
          </div>
        )}

        {/* Pulsanti di navigazione */}
        <div style={styles.buttonGroup}>
          <Link href="/login" style={styles.button}>Login</Link>
          <Link href="/register" style={styles.buttonOutline}>Register</Link>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
  },
  card: {
    textAlign: 'center',
    maxWidth: '500px',
    width: '100%',
    padding: '2rem',
    borderRadius: '12px',
    background: '#F8F9FA',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    border: '1px solid #E0E0E0',
  },
  logo: { width: '100px', marginBottom: '1rem' },
  title: { color: '#000000', fontSize: '2rem', marginBottom: '0.5rem' },
  subtitle: { color: '#555555', fontSize: '1rem', marginBottom: '1.5rem' },
  alert: {
    background: '#FFF8E1',
    padding: '1rem',
    borderRadius: '8px',
    marginBottom: '1.5rem',
    color: '#333',
    fontSize: '0.95rem',
  },
  buttonGroup: { display: 'flex', gap: '1rem', justifyContent: 'center' },
  button: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#FFFFFF',
    padding: '0.8rem 1.5rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
  buttonOutline: {
    border: '2px solid #27E3DA',
    color: '#27E3DA',
    padding: '0.8rem 1.5rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
};

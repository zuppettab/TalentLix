import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function EmailConfirmed() {
  const [status, setStatus] = useState('loading'); // loading | success | expired
  const [message, setMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkEmailStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user?.email_confirmed_at) {
        setStatus('success');
        setMessage('Your email has been successfully confirmed!');
      } else {
        setStatus('expired');
        setMessage('This confirmation link is invalid or has expired.');
      }
    };
    checkEmailStatus();
  }, []);

  const resendConfirmation = async () => {
    const email = router.query.email; // Optional: retrieve email from query if included
    if (!email) {
      setMessage('We could not retrieve your email. Please login to resend confirmation.');
      return;
    }
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) setMessage('Failed to resend confirmation email. Please try again.');
    else setMessage('A new confirmation email has been sent to your inbox.');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
        <h2 style={styles.title}>
          {status === 'loading' && 'Verifying...'}
          {status === 'success' && 'Email Confirmed ✅'}
          {status === 'expired' && 'Link Expired ❌'}
        </h2>
        <p style={styles.message}>{message}</p>

        {status === 'success' && (
          <button onClick={() => router.push('/login')} style={styles.button}>
            Go to Login
          </button>
        )}

        {status === 'expired' && (
          <button onClick={resendConfirmation} style={styles.button}>
            Resend Confirmation Email
          </button>
        )}
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
    fontFamily: 'Inter, sans-serif' 
  },
  card: { 
    background: '#F8F9FA', 
    padding: '2rem', 
    borderRadius: '12px', 
    textAlign: 'center', 
    width: '100%', 
    maxWidth: '400px', 
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)', 
    border: '1px solid #E0E0E0' 
  },
  logo: { width: '80px', marginBottom: '1rem' },
  title: { color: '#000000', fontSize: '1.5rem', marginBottom: '1rem' },
  message: { color: '#555555', fontSize: '0.95rem', marginBottom: '1.5rem' },
  button: { 
    padding: '0.8rem', 
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', 
    border: 'none', 
    borderRadius: '8px', 
    color: '#FFFFFF', 
    fontWeight: 'bold', 
    cursor: 'pointer', 
    width: '100%' 
  }
};

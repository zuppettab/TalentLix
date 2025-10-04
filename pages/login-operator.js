import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import {
  isOperatorUser,
  OPERATOR_GUARD_REDIRECT_QUERY_KEY,
  OPERATOR_GUARD_UNAUTHORIZED_VALUE,
  OPERATOR_LOGIN_PATH,
  OPERATOR_UNAUTHORIZED_MESSAGE,
} from '../utils/authRoles';
import { useRouter } from 'next/router';

export default function LoginOperator() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    const reasonParam = router.query[OPERATOR_GUARD_REDIRECT_QUERY_KEY];
    if (reasonParam === OPERATOR_GUARD_UNAUTHORIZED_VALUE) {
      setError(OPERATOR_UNAUTHORIZED_MESSAGE);
      router.replace(OPERATOR_LOGIN_PATH, undefined, { shallow: true });
    }
  }, [router]);

  useEffect(() => {
    const checkUser = async () => {
      if (!supabase) return;

      const { data, error } = await supabase.auth.getUser();
      if (error) return;

      const user = data?.user;
      if (user && isOperatorUser(user)) {
        router.push('/operator-wizard');
      } else if (user) {
        await supabase.auth.signOut();
        setError(OPERATOR_UNAUTHORIZED_MESSAGE);
      }
    };

    checkUser();
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError('Incorrect email or password. Please try again.');
      } else if (error.message.includes('Email not confirmed')) {
        setError('Your email is not confirmed. Please check your inbox.');
      } else {
        setError(error.message || 'An unexpected error occurred. Please try again.');
      }
    } else {
      const { data, error: userError } = await supabase.auth.getUser();
      const user = data?.user;

      if (userError || !user) {
        await supabase.auth.signOut();
        setError('Impossibile verificare il ruolo operatore. Riprova.');
      } else if (!isOperatorUser(user)) {
        await supabase.auth.signOut();
        setError(OPERATOR_UNAUTHORIZED_MESSAGE);
      } else {
        router.push('/operator-wizard');
      }
    }

    setLoading(false);
  };

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.card}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <h2 style={styles.title}>Operator Sign in</h2>
            <form onSubmit={handleLogin} style={styles.form}>
              <input type="email" placeholder="Operator email" value={email} onChange={(e)=>setEmail(e.target.value)} style={styles.input} required />
              <input type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} style={styles.input} required />
              <button type="submit" style={{ ...styles.button, opacity: loading ? 0.6 : 1 }} disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
            {error && <p style={styles.error}>{error}</p>}
            <p style={styles.footerText}>
              Forgot your password? <a href="/forgot-password-operator" style={styles.link}>Reset it here</a>
            </p>
            <p style={styles.footerText}>
              Don’t have an operator account? <a href="/register-operator" style={styles.link}>Register</a>
            </p>
            <p style={styles.footerText}>
              Want to return to the main site? <a href="/" style={styles.link}>Go back home</a>
            </p>
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
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
  },
  card: { background: '#F8F9FA', padding: '2rem', borderRadius: '12px', textAlign: 'center', width: '100%', maxWidth: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0' },
  logo: { width: '80px', marginBottom: '1rem' },
  title: { color: '#000000', fontSize: '1.5rem', marginBottom: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  input: { padding: '0.8rem', border: '1px solid #CCC', borderRadius: '8px', background: '#FFFFFF', color: '#000000', fontSize: '1rem' },
  button: { padding: '0.8rem', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', border: 'none', borderRadius: '8px', color: '#FFFFFF', fontWeight: 'bold', cursor: 'pointer' },
  error: { color: '#D9534F', marginTop: '1rem', fontSize: '0.9rem' },
  footerText: { marginTop: '1rem', color: '#555555', fontSize: '0.9rem' },
  link: { color: '#27E3DA', textDecoration: 'none' }
};

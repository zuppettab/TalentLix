import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError('Incorrect email or password. Please try again.');
      } else if (error.message.includes('Email not confirmed')) {
        setError('Your email is not confirmed. Please check your inbox.');
      } else {
        setError('An unexpected error occurred. Please try again later.');
      }
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
        <h2 style={styles.title}>Sign in to TalentLix</h2>
        <form onSubmit={handleLogin} style={styles.form}>
          <input type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} style={styles.input} required />
          <input type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} style={styles.input} required />
          <button type="submit" style={styles.button}>Sign In</button>
        </form>
        {error && <p style={styles.error}>{error}</p>}
        <p style={styles.footerText}>
          Forgot your password? <a href="/forgot-password" style={styles.link}>Reset it here</a>
        </p>
        <p style={styles.footerText}>
          Don’t have an account? <a href="/register" style={styles.link}>Register</a>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#FFFFFF', fontFamily: 'Inter, sans-serif' },
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

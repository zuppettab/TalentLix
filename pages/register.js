import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    else {
      setSuccess('Registration successful! Redirecting to login...');
      setTimeout(() => router.push('/login'), 2000);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
        <h2 style={styles.title}>Create your account</h2>
        <form onSubmit={handleRegister} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            style={styles.input}
            required
          />
          <button type="submit" style={styles.button}>Register</button>
        </form>
        {error && <p style={styles.error}>{error}</p>}
        {success && <p style={styles.success}>{success}</p>}
        <p style={styles.footerText}>
          Already have an account? <a href="/login" style={styles.link}>Login</a>
        </p>
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
    background: '#121212',
    fontFamily: 'Inter, sans-serif',
  },
  card: {
    background: '#1E1E1E',
    padding: '2rem',
    borderRadius: '16px',
    textAlign: 'center',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  logo: {
    width: '80px',
    marginBottom: '1rem',
  },
  title: {
    color: '#FFFFFF',
    fontSize: '1.5rem',
    marginBottom: '1.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  input: {
    padding: '0.8rem',
    border: '1px solid #2A2A2A',
    borderRadius: '8px',
    background: '#2A2A2A',
    color: '#FFFFFF',
    fontSize: '1rem',
    outline: 'none',
  },
  button: {
    padding: '0.8rem',
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    border: 'none',
    borderRadius: '8px',
    color: '#121212',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'opacity 0.3s',
  },
  error: {
    color: '#FF6B6B',
    marginTop: '1rem',
    fontSize: '0.9rem',
  },
  success: {
    color: '#27E3DA',
    marginTop: '1rem',
    fontSize: '0.9rem',
  },
  footerText: {
    marginTop: '1rem',
    color: '#AAAAAA',
    fontSize: '0.9rem',
  },
  link: {
    color: '#27E3DA',
    textDecoration: 'none',
  },
};

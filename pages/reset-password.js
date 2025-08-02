import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else {
      setMessage('Password updated successfully. Redirecting to login...');
      setTimeout(() => router.push('/login'), 2000);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Reset Your Password</h2>
        <form onSubmit={handleUpdatePassword} style={styles.form}>
          <input type="password" placeholder="New Password" value={password} onChange={(e)=>setPassword(e.target.value)} style={styles.input} required />
          <button type="submit" style={styles.button}>Update Password</button>
        </form>
        {message && <p style={styles.success}>{message}</p>}
        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#121212', fontFamily: 'Inter, sans-serif' },
  card: { background: '#1E1E1E', padding: '2rem', borderRadius: '16px', textAlign: 'center', width: '100%', maxWidth: '400px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
  title: { color: '#FFFFFF', fontSize: '1.5rem', marginBottom: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  input: { padding: '0.8rem', border: '1px solid #2A2A2A', borderRadius: '8px', background: '#2A2A2A', color: '#FFFFFF', fontSize: '1rem' },
  button: { padding: '0.8rem', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', border: 'none', borderRadius: '8px', color: '#121212', fontWeight: 'bold', cursor: 'pointer' },
  success: { color: '#27E3DA', marginTop: '1rem', fontSize: '0.9rem' },
  error: { color: '#FF6B6B', marginTop: '1rem', fontSize: '0.9rem' }
};

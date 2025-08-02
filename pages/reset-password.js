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
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#FFFFFF', fontFamily: 'Inter, sans-serif' },
  card: { background: '#F8F9FA', padding: '2rem', borderRadius: '12px', textAlign: 'center', width: '100%', maxWidth: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0' },
  title: { color: '#000000', fontSize: '1.5rem', marginBottom: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  input: { padding: '0.8rem', border: '1px solid #CCC', borderRadius: '8px', background: '#FFFFFF', color: '#000000', fontSize: '1rem' },
  button: { padding: '0.8rem', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', border: 'none', borderRadius: '8px', color: '#FFFFFF', fontWeight: 'bold', cursor: 'pointer' },
  success: { color: '#27E3DA', marginTop: '1rem', fontSize: '0.9rem' },
  error: { color: '#D9534F', marginTop: '1rem', fontSize: '0.9rem' }
};

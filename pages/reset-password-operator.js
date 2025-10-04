import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function ResetPasswordOperator() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordValid, setPasswordValid] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) router.push('/operator');
    };
    checkUser();
  }, [router]);

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  const validatePassword = (pwd) => passwordRegex.test(pwd);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!validatePassword(password)) {
      setError('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message || 'An unexpected error occurred.');
    } else {
      setMessage('Password updated successfully. Redirecting to operator login...');
      setTimeout(() => router.push('/login-operator'), 2000);
    }

    setLoading(false);
  };

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.card}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <h2 style={styles.title}>Reset Operator Password</h2>
            <form onSubmit={handleUpdatePassword} style={styles.form}>
              <input type="password" placeholder="New Password" value={password} onChange={(e) => { setPassword(e.target.value); setPasswordValid(validatePassword(e.target.value)); }} style={styles.input} required />
              <div style={styles.passwordHints}>
                <p style={{ color: password.length >= 8 ? '#27E3DA' : '#D9534F' }}>• At least 8 characters</p>
                <p style={{ color: /[A-Z]/.test(password) ? '#27E3DA' : '#D9534F' }}>• Uppercase letter</p>
                <p style={{ color: /[a-z]/.test(password) ? '#27E3DA' : '#D9534F' }}>• Lowercase letter</p>
                <p style={{ color: /\d/.test(password) ? '#27E3DA' : '#D9534F' }}>• Number</p>
                <p style={{ color: /[@$!%*?&]/.test(password) ? '#27E3DA' : '#D9534F' }}>• Special character (@$!%*?&)</p>
              </div>
              <button type="submit" style={{ ...styles.button, opacity: passwordValid && !loading ? 1 : 0.6 }} disabled={!passwordValid || loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
            {message && <p style={styles.success}>{message}</p>}
            {error && <p style={styles.error}>{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  background: { backgroundImage: "url('/BackG.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', width: '100%', height: '100vh', position: 'relative' },
  overlay: { backgroundColor: 'rgba(255, 255, 255, 0.7)', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif', position: 'relative' },
  card: { background: '#F8F9FA', padding: '2rem', borderRadius: '12px', textAlign: 'center', width: '100%', maxWidth: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0' },
  logo: { width: '80px', marginBottom: '1rem' },
  title: { color: '#000000', fontSize: '1.5rem', marginBottom: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  input: { padding: '0.8rem', border: '1px solid #CCC', borderRadius: '8px', background: '#FFFFFF', color: '#000000', fontSize: '1rem' },
  passwordHints: { textAlign: 'left', fontSize: '0.85rem', marginBottom: '1rem' },
  button: { padding: '0.8rem', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', border: 'none', borderRadius: '8px', color: '#FFFFFF', fontWeight: 'bold', cursor: 'pointer' },
  success: { color: '#27E3DA', marginTop: '1rem', fontSize: '0.9rem' },
  error: { color: '#D9534F', marginTop: '1rem', fontSize: '0.9rem' }
};

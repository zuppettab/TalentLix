import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.push('/login');
      else setUser(user);
    };
    checkUser();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Welcome to your Dashboard</h2>
        {user && <p style={styles.text}>Logged in as: {user.email}</p>}
        <button onClick={handleLogout} style={styles.button}>Logout</button>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#121212', fontFamily: 'Inter, sans-serif' },
  card: { background: '#1E1E1E', padding: '2rem', borderRadius: '16px', textAlign: 'center', width: '100%', maxWidth: '400px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
  title: { color: '#FFFFFF', fontSize: '1.5rem', marginBottom: '1rem' },
  text: { color: '#AAAAAA', marginBottom: '2rem' },
  button: { padding: '0.8rem', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', border: 'none', borderRadius: '8px', color: '#121212', fontWeight: 'bold', cursor: 'pointer' }
};

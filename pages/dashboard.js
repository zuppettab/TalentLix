import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkUserAndProfile = async () => {
      // ✅ 1. Ottieni utente loggato
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // ✅ 2. Controlla se esiste il record in "athlete"
      const { data: athlete, error } = await supabase
        .from('athlete')
        .select('completion_percentage, profile_published')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching athlete profile:', error);
        return;
      }

      // ✅ 3. Se non esiste record → primo accesso → vai al Wizard
      if (!athlete) {
        router.push('/onboarding-wizard');
        return;
      }

      // ✅ 4. Se profilo incompleto (< es. 40%) → vai al Wizard
      const MIN_COMPLETION = 40; // soglia minima per considerare "base completato"
      if (athlete.completion_percentage < MIN_COMPLETION || !athlete.profile_published) {
        router.push('/onboarding-wizard');
        return;
      }

      // ✅ 5. Altrimenti resta sulla Dashboard
      setLoading(false);
    };

    checkUserAndProfile();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.text}>Checking your profile...</p>
        </div>
      </div>
    );
  }

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
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#FFFFFF', fontFamily: 'Inter, sans-serif' },
  card: { background: '#F8F9FA', padding: '2rem', borderRadius: '12px', textAlign: 'center', width: '100%', maxWidth: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0' },
  title: { color: '#000000', fontSize: '1.5rem', marginBottom: '1rem' },
  text: { color: '#555555', marginBottom: '2rem' },
  button: { padding: '0.8rem', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', border: 'none', borderRadius: '8px', color: '#FFFFFF', fontWeight: 'bold', cursor: 'pointer' }
};

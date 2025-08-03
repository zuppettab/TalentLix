import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publishLoading, setPublishLoading] = useState(false);

  // Check session and profile data
  useEffect(() => {
    const initDashboard = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      const { data: athleteData, error } = await supabase
        .from('athlete')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        router.push('/wizard?step=1');
        return;
      }

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      if (!athleteData || athleteData.completion_percentage < 40) {
        const redirectStep = athleteData?.current_step || 1;
        router.push(`/wizard?step=${redirectStep}`);
        return;
      }

      setAthlete(athleteData);
      setLoading(false);
    };

    initDashboard();
  }, [router]);

  const togglePublish = async () => {
    if (!athlete) return;
    setPublishLoading(true);

    const newStatus = !athlete.profile_published;
    const { error } = await supabase
      .from('athlete')
      .update({ profile_published: newStatus })
      .eq('id', athlete.id);

    if (!error) {
      setAthlete({ ...athlete, profile_published: newStatus });
    } else {
      console.error('Error updating publish status:', error);
    }

    setPublishLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p>🔄 Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
        <h1 style={styles.title}>Hello, {athlete.first_name}!</h1>
        <p style={styles.subtitle}>Welcome to your personal Dashboard.</p>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>📊 Profile Status</h2>
          <p><strong>Completion:</strong> {athlete.completion_percentage}%</p>
          <p>
            <strong>Publication:</strong> {athlete.profile_published ? '✅ Published' : '❌ Not Published'}
          </p>

          <button 
            onClick={togglePublish} 
            disabled={publishLoading} 
            style={athlete.profile_published ? styles.buttonOff : styles.buttonOn}
          >
            {publishLoading 
              ? '⏳ Updating...' 
              : athlete.profile_published 
                ? 'Unpublish Profile' 
                : 'Publish Profile'}
          </button>
        </div>

        <div style={styles.buttonGroup}>
          <button style={styles.buttonOutline} onClick={() => router.push('/wizard')}>
            ✏️ Edit or Complete Profile
          </button>
          <button style={styles.buttonLogout} onClick={handleLogout}>
            🚪 Logout
          </button>
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
  section: { marginBottom: '2rem' },
  sectionTitle: { fontSize: '1.2rem', color: '#333', marginBottom: '0.5rem' },
  buttonOn: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#FFFFFF',
    padding: '0.8rem 1.2rem',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '0.8rem',
  },
  buttonOff: {
    background: '#DD5555',
    color: '#FFFFFF',
    padding: '0.8rem 1.2rem',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '0.8rem',
  },
  buttonOutline: {
    border: '2px solid #27E3DA',
    color: '#27E3DA',
    padding: '0.8rem 1.2rem',
    borderRadius: '8px',
    background: 'transparent',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginRight: '0.8rem',
  },
  buttonLogout: {
    background: '#F44336',
    color: '#FFF',
    padding: '0.8rem 1.2rem',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
  },
};

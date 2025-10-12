import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useOperatorGuard } from '../hooks/useOperatorGuard';
import { supabase } from '../utils/supabaseClient';

export default function OperatorDashboard() {
  const router = useRouter();
  const { loading, user } = useOperatorGuard({ redirectTo: '/login-operator', includeReason: false });

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login-operator');
    }
  }, [loading, router, user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login-operator');
  };

  if (loading || !user) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <div style={styles.loaderContainer} role="status" aria-live="polite">
              <div style={styles.spinner} aria-hidden="true" />
              <span style={styles.srOnly}>Loading operator dashboard…</span>
            </div>
            <style jsx>{`
              @keyframes operatorDashboardSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.card}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <h1 style={styles.title}>Operator dashboard</h1>
            <p style={styles.message}>
              This is a placeholder for the upcoming operator dashboard. From here, accredited operators will manage their
              activities once the full experience is ready.
            </p>
            <button type="button" style={styles.primaryButton} onClick={() => router.replace('/')}>Go to home page</button>
            <button type="button" style={styles.secondaryButton} onClick={handleSignOut}>Sign out</button>
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
    minHeight: '100vh',
    position: 'relative',
  },
  overlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    width: '100%',
    minHeight: '100%',
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
  card: {
    width: '100%',
    maxWidth: '520px',
    background: 'rgba(248, 249, 250, 0.95)',
    padding: '2.5rem',
    borderRadius: '16px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
    textAlign: 'center',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  logo: { width: '90px', margin: '0 auto' },
  title: { fontSize: '1.75rem', fontWeight: 700, color: '#111' },
  message: { color: '#333', lineHeight: 1.6, margin: 0 },
  primaryButton: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    border: 'none',
    padding: '0.9rem',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  secondaryButton: {
    background: '#fff',
    border: '1px solid #27E3DA',
    color: '#027373',
    padding: '0.9rem',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  loaderContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 16,
    padding: 48,
    textAlign: 'center',
    minHeight: 'calc(100vh - 32px)',
    width: '100%',
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '4px solid #27E3DA',
    borderTopColor: '#F7B84E',
    animation: 'operatorDashboardSpin 1s linear infinite',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
};

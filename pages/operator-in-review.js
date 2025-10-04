import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useOperatorGuard } from '../hooks/useOperatorGuard';
import { supabase } from '../utils/supabaseClient';

export default function OperatorInReview() {
  const router = useRouter();
  const { loading, user } = useOperatorGuard({ redirectTo: '/login-operator', includeReason: false });

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login-operator');
    }
  }, [loading, router, user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login-operator');
  };

  if (loading) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <div style={styles.loaderContainer} role="status" aria-live="polite">
              <div style={styles.spinner} aria-hidden="true" />
              <span style={styles.srOnly}>Checking status…</span>
            </div>
            <style jsx>{`
              @keyframes profilePreviewSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.card}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <h1 style={{ marginBottom: 8 }}>Operator profile in review</h1>
            <p style={{ marginBottom: 20 }}>
              Thank you for submitting your operator details. Our compliance team is reviewing your documents.
              You will receive an email as soon as the review is complete.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button type="button" style={styles.button} onClick={() => router.replace('/operator')}>
                Go to review dashboard
              </button>
              <button type="button" style={styles.secondaryButton} onClick={handleLogout}>
                Sign out
              </button>
            </div>
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
    position: 'static',
    zIndex: 1,
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
    maxWidth: '480px',
    background: 'rgba(248, 249, 250, 0.95)',
    padding: '2rem',
    borderRadius: '16px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
    textAlign: 'center',
    zIndex: 2,
  },
  logo: { width: '80px', marginBottom: '1rem' },
  button: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    border: 'none',
    padding: '0.8rem',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    fontWeight: 'bold',
  },
  secondaryButton: {
    background: '#fff',
    border: '1px solid #27E3DA',
    color: '#027373',
    padding: '0.8rem',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    fontWeight: 'bold',
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
    animation: 'profilePreviewSpin 1s linear infinite',
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

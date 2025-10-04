import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';

export default function OperatorWizard() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login-operator');
        return;
      }

      if (isMounted) {
        setUserEmail(user?.email || '');
        setChecking(false);
      }
    };

    verifySession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const toggleMenu = () => setMenuOpen((open) => !open);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login-operator');
  };

  if (checking) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <div style={styles.loaderContainer} role="status" aria-live="polite">
              <div style={styles.spinner} aria-hidden="true" />
              <span style={styles.srOnly}>Checking operator session…</span>
            </div>
            <style jsx>{`
              @keyframes operatorWizardSpin {
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
          <div style={styles.userMenuContainer}>
            <div
              style={styles.menuIcon}
              onClick={toggleMenu}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleMenu();
                }
              }}
              role="button"
              tabIndex={0}
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              ⋮
            </div>
            {menuOpen && (
              <div style={styles.dropdown}>
                <div style={styles.dropdownUser}>👤 {userEmail || 'Operator'}</div>
                <button type="button" onClick={handleLogout} style={styles.dropdownButton}>
                  Logout
                </button>
              </div>
            )}
          </div>

          <div style={styles.card}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <h1 style={styles.title}>Operator wizard coming soon</h1>
            <p style={styles.subtitle}>
              We are preparing the onboarding experience tailored for operators. Stay tuned!
            </p>
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
  userMenuContainer: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    zIndex: 20,
  },
  menuIcon: {
    background: '#27E3DA',
    color: '#fff',
    width: '35px',
    height: '35px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    userSelect: 'none',
  },
  dropdown: {
    position: 'absolute',
    top: '45px',
    right: '0',
    background: '#FFF',
    border: '1px solid #E0E0E0',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    minWidth: '180px',
    zIndex: 100,
    padding: '0.5rem',
  },
  dropdownUser: {
    padding: '0.5rem',
    fontSize: '0.9rem',
    color: '#555',
    borderBottom: '1px solid #eee',
    marginBottom: '0.5rem',
  },
  dropdownButton: {
    background: '#DD5555',
    color: '#FFF',
    border: 'none',
    padding: '0.5rem',
    width: '100%',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  card: {
    width: '100%',
    maxWidth: '450px',
    background: 'rgba(248, 249, 250, 0.95)',
    padding: '2rem',
    borderRadius: '16px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
    textAlign: 'center',
    zIndex: 2,
  },
  logo: { width: '80px', marginBottom: '1rem' },
  title: { color: '#000', fontSize: '1.8rem', marginBottom: '0.75rem' },
  subtitle: { color: '#555', fontSize: '1rem' },
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
    animation: 'operatorWizardSpin 1s linear infinite',
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

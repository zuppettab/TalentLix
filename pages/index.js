import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';

export default function Home() {
  // === STATE ===
  const [confirmationStatus, setConfirmationStatus] = useState(null); // null | 'success' | 'expired'
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const router = useRouter();

  // === EFFECT: handle email confirmation hash + redirect if logged ===
  useEffect(() => {
    const checkConfirmation = async () => {
      // Read Supabase URL hash (e.g. #type=signup or #error_code=otp_expired)
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
      const type = hashParams.get('type');
      const errorCode = hashParams.get('error_code');
      const errorDescription = hashParams.get('error_description');

      if (type === 'signup') {
        setConfirmationStatus('success');
        setMessage('✅ Your email has been successfully confirmed!');
      } else if (errorCode === 'otp_expired') {
        setConfirmationStatus('expired');
        setMessage(`❌ ${decodeURIComponent(errorDescription || 'The confirmation link has expired.')}`);
      }

      // Clean the hash from URL
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      // If already logged-in, go to dashboard
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUser(data.user);
        router.push('/dashboard');
      } else {
        setUser(null);
      }
    };

    checkConfirmation();
  }, [router]);

  // === ACTIONS ===
  const resendConfirmation = async () => {
    const email = prompt('Enter your email to resend confirmation:');
    if (!email) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      setMessage('⚠️ Failed to resend confirmation email.');
      setConfirmationStatus('expired');
      return;
    }
    setMessage('📧 A new confirmation email has been sent to your inbox.');
    setConfirmationStatus('success');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMessage('You have been logged out.');
  };

  // === UI ===
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
        <h1 style={styles.claim}>The place where talent gets discovered</h1>

        <div style={styles.authBox}>
          {user ? (
            <>
              <span style={styles.authText}>Signed in</span>
              <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
            </>
          ) : (
            <span style={styles.authText}>Welcome</span>
          )}
        </div>
      </header>

      {/* Confirmation / Error alert */}
      {confirmationStatus && (
        <div style={styles.alert}>
          <p style={{ margin: 0 }}>{message}</p>
          {confirmationStatus === 'expired' && (
            <button style={styles.resendBtn} onClick={resendConfirmation}>
              Resend confirmation email
            </button>
          )}
        </div>
      )}

      {/* Generic info messages (when not using confirmationStatus) */}
      {!confirmationStatus && message && (
        <div style={styles.alert}>
          <p style={{ margin: 0 }}>{message}</p>
        </div>
      )}

      <main style={styles.main}>
        {/* ATHLETES PANEL */}
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.badge}>Athletes</span>
            <h2 style={styles.title}>Start your journey</h2>
            <p style={styles.subtitle}>
              Create your profile, showcase your skills, and get discovered by teams and scouts.
            </p>
          </div>

          <div style={styles.panelBody}>
            <ul style={styles.featuresList}>
              <li style={styles.featureItem}>Personal dashboard and profile</li>
              <li style={styles.featureItem}>Upload highlights, stats, and bio</li>
              <li style={styles.featureItem}>Visibility across the TalentLix network</li>
            </ul>

            <div style={styles.buttonGroup}>
              <Link href="/login" style={styles.button}>Login</Link>
              <Link href="/register" style={styles.buttonOutline}>Register</Link>
            </div>
          </div>
        </section>

        {/* OPERATORS PANEL */}
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.badge}>Operators</span>
            <h2 style={styles.title}>Scout and manage</h2>
            <p style={styles.subtitle}>
              Clubs, agents, and staff can access tools to search, track, and manage athletes.
            </p>
          </div>

          <div style={styles.panelBody}>
            <ul style={styles.featuresList}>
              <li style={styles.featureItem}>Advanced search & filtering</li>
              <li style={styles.featureItem}>Shortlists and notes</li>
              <li style={styles.featureItem}>Collaboration with your staff</li>
            </ul>

            <div style={styles.buttonGroup}>
              <Link href="/login-operator" style={styles.button}>Operator Login</Link>
              <Link href="/contact" style={styles.buttonOutline}>Contact Sales</Link>
            </div>
          </div>
        </section>
      </main>

      <footer style={styles.footer}>
        <p style={styles.footerText}>© {new Date().getFullYear()} TalentLix. All rights reserved.</p>
      </footer>
    </div>
  );
}

// === STYLES ===
const styles = {
  page: {
    minHeight: '100dvh',
    background: '#F8FAFB',
    color: '#0A0A0A',
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    position: 'relative',
    padding: '2rem 1.5rem 1rem',
    maxWidth: 1200,
    margin: '0 auto',
    textAlign: 'center',
  },
  logo: {
    height: 56,
    width: 'auto',
    marginBottom: 12,
    display: 'inline-block',
  },
  claim: {
    margin: 0,
    fontSize: '1.9rem',
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: '-0.015em',
  },

  authBox: {
    position: 'absolute',
    right: 16,
    top: 16,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  authText: {
    fontSize: '0.9rem',
    color: '#444',
  },
  logoutBtn: {
    border: '1px solid #e0e0e0',
    background: '#fff',
    padding: '0.4rem 0.7rem',
    borderRadius: 8,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },

  alert: {
    maxWidth: 1080,
    width: '100%',
    margin: '0 auto 1rem',
    background: '#FFF8E1',
    color: '#333',
    border: '1px solid #E0E0E0',
    borderRadius: 12,
    padding: '0.85rem 1rem',
    textAlign: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
  },
  resendBtn: {
    marginTop: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.6rem 0.9rem',
    borderRadius: 10,
    border: '1px solid #E0E0E0',
    background: '#FFFFFF',
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
  },

  main: {
    maxWidth: 1200,
    width: '100%',
    margin: '0 auto',
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    padding: '1rem 1.5rem 2rem',
  },

  panel: {
    background: '#FFFFFF',
    border: '1px solid #E9ECEF',
    borderRadius: 16,
    boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  panelHeader: {
    padding: '1.25rem 1.25rem 0.5rem',
  },
  badge: {
    display: 'inline-block',
    fontSize: '0.75rem',
    fontWeight: 800,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    background: '#E6FFFB',
    color: '#0B8E86',
    padding: '0.25rem 0.5rem',
    borderRadius: 8,
    marginBottom: 6,
  },
  title: {
    margin: '0.25rem 0 0.25rem',
    fontSize: '1.4rem',
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: '-0.01em',
  },
  subtitle: {
    margin: 0,
    color: '#606770',
  },

  panelBody: {
    padding: '0.75rem 1.25rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  featuresList: {
    paddingLeft: '1.1rem',
    margin: 0,
  },
  featureItem: {
    marginBottom: 6,
  },

  buttonGroup: {
    display: 'flex',
    gap: '0.6rem',
    flexWrap: 'wrap',
  },
  button: {
    display: 'inline-block',
    background: '#0FD2C8',
    color: '#000',
    padding: '0.8rem 1.2rem',
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: 'none',
    boxShadow: '0 6px 18px rgba(15,210,200,0.35)',
    border: '1px solid #0FD2C8',
  },
  buttonOutline: {
    display: 'inline-block',
    background: '#FFFFFF',
    color: '#0B8E86',
    padding: '0.8rem 1.2rem',
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: 'none',
    border: '2px solid #0FD2C8',
  },

  footer: {
    padding: '1rem 1.5rem 2rem',
    textAlign: 'center',
  },
  footerText: {
    margin: 0,
    color: '#777',
    fontSize: '0.9rem',
  },
};

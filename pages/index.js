import Link from 'next/link';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    (async () => {
      try {
        const hash = (typeof window !== 'undefined' ? window.location.hash : '') || '';
        const params = new URLSearchParams(hash.replace('#',''));
        const type = params.get('type');
        const errorCode = params.get('error_code');
        const errorDescription = params.get('error_description');

        if (type === 'signup') {
          try { alert('Email confirmed ✅'); } catch (e) {}
        } else if (errorCode === 'otp_expired') {
          const msg = errorDescription ? decodeURIComponent(errorDescription) : 'Confirmation link expired.';
          try { alert(`Confirmation failed ❌\n${msg}`); } catch (e) {}
        }

        // Clean URL hash
        if (typeof window !== 'undefined' && window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (e) {
        // fail silently, do not affect UI
      }
    })();
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo}/>
        <h1 style={styles.claim}>The place where talent gets discovered</h1>
      </header>

      <main style={styles.main}>
        {/* ATHLETES PANEL */}
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.badge}>Athletes</span>
            <h2 style={styles.title}>Start your journey</h2>
            <p style={styles.text}>
              Create your profile, upload media and get discovered by clubs and agents.
            </p>
          </div>

          <div style={styles.ctaRow}>
            <Link href="/login?as=athlete" legacyBehavior>
              <a aria-label="Athlete Login" style={{...styles.button, ...styles.buttonPrimary}}>Login</a>
            </Link>
            <Link href="/register?as=athlete" legacyBehavior>
              <a aria-label="Athlete Register" style={{...styles.button, ...styles.buttonSecondary}}>Register</a>
            </Link>
          </div>
        </section>

        {/* CLUBS & AGENTS PANEL */}
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.badge}>Clubs & Agents</span>
            <h2 style={styles.title}>Find verified talent</h2>
            <p style={styles.text}>
              Access powerful search and connect directly with athletes.
            </p>
          </div>

          <div style={styles.ctaRow}>
            <Link href="/login-operator" legacyBehavior>
              <a aria-label="Clubs & Agents Login" style={{...styles.button, ...styles.buttonPrimary}}>Login</a>
            </Link>
            <Link href="/register-operator" legacyBehavior>
              <a aria-label="Clubs & Agents Register" style={{...styles.button, ...styles.buttonSecondary}}>Register</a>
            </Link>
          </div>
        </section>
      </main>

      <footer style={styles.footer}>
        <p style={styles.footerText}>© {new Date().getFullYear()} TalentLix</p>
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
    color: '#000000',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '2.5rem 1.5rem 1.25rem',
    textAlign: 'center',
  },
  // Larger, bolder logo treatment
  logo: {
    width: 140,                // increased from 84 to 140
    height: 'auto',
    marginBottom: '0.9rem',
    filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.15))', // creates a heavier look
  },
  claim: {
    fontSize: '2rem',
    lineHeight: 1.25,
    margin: 0,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  main: {
    flex: 1,
    display: 'flex',
    gap: '1rem',
    padding: '1.25rem',
    maxWidth: 1080,
    width: '100%',
    margin: '0 auto',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  },
  // Cards are slightly smaller with centered content
  panel: {
    flex: '1 1 320px',
    maxWidth: 420,
    width: '100%',
    background: '#F8F9FA',
    border: '1px solid #E0E0E0',
    borderRadius: 16,
    padding: '1.25rem',
    boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'center',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelHeader: {
    marginBottom: '0.75rem',
    maxWidth: 360,
  },
  // Larger badge styling
  badge: {
    display: 'inline-block',
    fontSize: '0.95rem',
    fontWeight: 800,
    padding: '0.35rem 0.75rem',
    borderRadius: 999,
    border: '1px solid #D7D7D7',
    background: '#FFFFFF',
    marginBottom: 12,
  },
  title: {
    margin: '0.25rem 0 0.4rem',
    fontSize: '1.5rem',
    fontWeight: 800,
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  text: {
    margin: 0,
    color: '#555555',
    fontSize: '0.98rem',
  },
  ctaRow: {
    display: 'flex',
    gap: '0.6rem',
    marginTop: '1rem',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.8rem 1rem',
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: 'none',
    transition: 'transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
    border: '1px solid transparent',
    boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
    minWidth: 120,
  },
  buttonPrimary: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#FFFFFF',
  },
  buttonSecondary: {
    background: '#FFFFFF',
    color: '#000000',
    border: '1px solid #E0E0E0',   // ← fixed
  },
  footer: {
    padding: '1rem 1.5rem',
    textAlign: 'center',
  },
  footerText: {
    margin: 0,
    color: '#777',
    fontSize: '0.9rem',
  }
};

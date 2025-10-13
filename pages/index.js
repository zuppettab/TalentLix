import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const [confirmationResult, setConfirmationResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const hash = (typeof window !== 'undefined' ? window.location.hash : '') || '';
        const params = new URLSearchParams(hash.replace('#',''));
        const type = params.get('type');
        const errorCode = params.get('error_code');
        const errorDescription = params.get('error_description');
        const decodedDescription = errorDescription ? decodeURIComponent(errorDescription) : '';

        let result = null;

        if (type === 'signup') {
          result = {
            status: 'success',
            title: 'Sign-up confirmed',
            message: 'Welcome to TalentLix! Your account has been successfully confirmed.',
          };
        } else if (errorCode === 'otp_expired') {
          result = {
            status: 'error',
            title: 'Link expired',
            message:
              decodedDescription ||
              'The confirmation link has expired. Please request a new code to continue.',
          };
        } else if (errorCode === 'already_confirmed') {
          result = {
            status: 'success',
            title: 'Account already confirmed',
            message:
              'Your account has already been confirmed. You can log in to start using the platform.',
          };
        } else if (decodedDescription) {
          result = {
            status: 'error',
            title: 'Something went wrong',
            message: decodedDescription,
          };
        }

        if (result) {
          setConfirmationResult(result);
        }

        // Clean URL hash
        if (typeof window !== 'undefined' && window.location.hash) {
          // delay cleanup to ensure state has been set
          setTimeout(() => {
            window.history.replaceState(null, '', window.location.pathname);
          }, 0);
        }
      } catch (e) {
        // fail silently, do not affect UI
      }
    })();
  }, []);

  return (
    <div style={styles.page}>
      {confirmationResult && (
        <section
          role="status"
          aria-live="polite"
          style={{
            ...styles.resultCard,
            borderColor: confirmationResult.status === 'success' ? '#27E3DA' : '#FF6B6B',
            boxShadow:
              confirmationResult.status === 'success'
                ? '0 16px 40px rgba(39, 227, 218, 0.25)'
                : '0 16px 40px rgba(255, 107, 107, 0.25)',
          }}
        >
          <img
            src="/logo-talentlix.png"
            alt="TalentLix Logo"
            style={styles.resultLogo}
          />
          <div style={styles.resultIcon} aria-hidden="true">
            {confirmationResult.status === 'success' ? '✅' : '⚠️'}
          </div>
          <h2 style={styles.resultTitle}>{confirmationResult.title}</h2>
          <p style={styles.resultMessage}>{confirmationResult.message}</p>
          <div style={styles.resultActions}>
            <Link href="/login" legacyBehavior>
              <a style={{ ...styles.button, ...styles.buttonPrimary, ...styles.resultButton }}>Go to athlete login</a>
            </Link>
            <Link href="/login-operator" legacyBehavior>
              <a style={{ ...styles.button, ...styles.buttonSecondary, ...styles.resultButton }}>Go to operator login</a>
            </Link>
          </div>
        </section>
      )}

      <header className="hero">
        <img src="/logo-talentlix.png" alt="TalentLix Logo" className="hero__logo"/>
        <h1 style={styles.claim}>The place where talent gets discovered</h1>
      </header>

      <main style={styles.main}>
        {/* ATHLETES PANEL */}
        <section style={styles.panel} className="panel">
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
        <section style={styles.panel} className="panel">
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

      <style jsx>{`
        .hero {
          padding: 3.25rem 1.5rem 0.25rem;
          text-align: center;
        }

        .hero__logo {
          width: 220px;
          height: auto;
          margin-bottom: 0.9rem;
          filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.15));
        }

        .panel {
          --panel-padding: 1.75rem;
          --panel-min-height: auto;
        }

        @media (max-width: 640px) {
          .hero {
            padding: 2.5rem 1.5rem 1.25rem;
          }

          .hero__logo {
            width: 140px;
          }

          .panel {
            --panel-padding: 1.25rem;
            --panel-min-height: auto;
          }
        }
      `}</style>
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
  resultCard: {
    margin: '1rem auto 0',
    width: 'min(960px, 94%)',
    background: '#FFFFFF',
    border: '2px solid #27E3DA',
    borderRadius: 24,
    padding: '2rem 1.75rem',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
  },
  resultLogo: {
    width: 120,
    height: 'auto',
  },
  resultIcon: {
    fontSize: '2.5rem',
  },
  resultTitle: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: 800,
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  resultMessage: {
    margin: 0,
    maxWidth: 640,
    color: '#4A4A4A',
    fontSize: '1rem',
  },
  resultActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    justifyContent: 'center',
  },
  resultButton: {
    minWidth: 180,
  },
  claim: {
    fontSize: 'clamp(2rem, 4vw + 1rem, 3.2rem)',
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
  // CARD più piccole e contenuto centrato
  panel: {
    flex: '1 1 320px',
    maxWidth: 420,
    width: '100%',
    background: '#F8F9FA',
    border: '1px solid #E0E0E0',
    borderRadius: 16,
    padding: 'var(--panel-padding, 1.75rem)',
    minHeight: 'var(--panel-min-height, 360px)',
    boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'center',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  panelHeader: {
    marginBottom: '1.1rem',
    maxWidth: 360,
  },
  // ETICHETTA più grande
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
    margin: '0.25rem 0 0.55rem',
    fontSize: '1.65rem',
    fontWeight: 800,
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  text: {
    margin: 0,
    color: '#555555',
    fontSize: '1.05rem',
    lineHeight: 1.6,
  },
  ctaRow: {
    display: 'flex',
    gap: '0.6rem',
    marginTop: '1.25rem',
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

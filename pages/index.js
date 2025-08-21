import Link from 'next/link';

export default function Home() {
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

        {/* CLUB & AGENTS PANEL */}
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.badge}>Club & Agents Center</span>
            <h2 style={styles.title}>Find verified talent</h2>
            <p style={styles.text}>
              Access powerful search and connect directly with athletes.
            </p>
          </div>

          <div style={styles.ctaRow}>
            <Link href="/login?as=operator" legacyBehavior>
              <a aria-label="Club & Agents Login" style={{...styles.button, ...styles.buttonPrimary}}>Login</a>
            </Link>
            <Link href="/register?as=operator" legacyBehavior>
              <a aria-label="Club & Agents Register" style={{...styles.button, ...styles.buttonSecondary}}>Register</a>
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
    background: '#FFFFFF', // stesso background delle altre pagine
    fontFamily: 'Inter, sans-serif',
    color: '#000000',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '2rem 1.5rem 1rem',
    textAlign: 'center',
  },
  logo: {
    width: 84,
    height: 'auto',
    marginBottom: '0.75rem',
  },
  claim: {
    fontSize: '1.6rem',
    lineHeight: 1.25,
    margin: 0,
    fontWeight: 700,
  },
  main: {
    flex: 1,
    display: 'flex',
    gap: '1.5rem',
    padding: '1.5rem',
    maxWidth: 1080,
    width: '100%',
    margin: '0 auto',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  panel: {
    flex: '1 1 380px',
    maxWidth: 520,
    background: '#F8F9FA',
    border: '1px solid #E0E0E0',
    borderRadius: 14,
    padding: '1.5rem',
    boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  panelHeader: {
    marginBottom: '1rem',
  },
  badge: {
    display: 'inline-block',
    fontSize: '0.78rem',
    padding: '0.25rem 0.55rem',
    borderRadius: 999,
    border: '1px solid #E0E0E0',
    background: '#FFFFFF',
    marginBottom: 10,
  },
  title: {
    margin: '0.25rem 0 0.5rem',
    fontSize: '1.35rem',
    fontWeight: 700,
  },
  text: {
    margin: 0,
    color: '#555555',
    fontSize: '0.98rem',
  },
  ctaRow: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1.25rem',
    flexWrap: 'wrap',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.85rem 1.1rem',
    borderRadius: 10,
    fontWeight: 700,
    textDecoration: 'none',
    transition: 'transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
    border: '1px solid transparent',
    boxShadow: '0 3px 10px rgba(0,0,0,0.08)',
  },
  buttonPrimary: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#FFFFFF',
  },
  buttonSecondary: {
    background: '#FFFFFF',
    color: '#000000',
    border: '1px solid #E0E0E0',
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

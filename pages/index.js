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
            <Link href="/login?as=operator" legacyBehavior>
              <a aria-label="Clubs & Agents Login" style={{...styles.button, ...styles.buttonPrimary}}>Login</a>
            </Link>
            <Link href="/register?as=operator" legacyBehavior>
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
  // LOGO più grande e “pesante”
  logo: {
    width: 140,                // ↑ da 84 → 140
    height: 'auto',
    marginBottom: '0.9rem',
    filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.15))', // look più “massiccio”
  },
  claim: {
    fontSize: '1.7rem',
    lineHeight: 1.25,
    margin: 0,
    fontWeight: 800,
    letterSpacing: '-0.01em',
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
  },
  // CARD più piccole e contenuto centrato
  panel: {
    flex: '1 1 320px',         // ↓ base più compatta
    maxWidth: 420,             // ↓ da 520 → 420
    background: '#F8F9FA',
    border: '1px solid #E0E0E0',
    borderRadius: 16,
    padding: '1.25rem',        // ↓ padding più stretto
    boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'center',       // ← tutto centrato
    alignItems: 'center',      // ← tutto centrato
    justifyContent: 'space-between',
  },
  panelHeader: {
    marginBottom: '0.75rem',
    maxWidth: 360,
  },
  // ETICHETTA più grande
  badge: {
    display: 'inline-block',
    fontSize: '0.95rem',       // ↑ da 0.78 → 0.95
    fontWeight: 800,
    padding: '0.35rem 0.75rem',
    borderRadius: 999,
    border: '1px solid #D7D7D7',
    background: '#FFFFFF',
    marginBottom: 12,
  },
  title: {
    margin: '0.25rem 0 0.4rem',
    fontSize: '1.5rem',        // ↑ leggermente
    fontWeight: 800,
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
    justifyContent: 'center',  // ← centrati
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

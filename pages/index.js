import Link from 'next/link';

export default function Home() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
        <h1 style={styles.title}>Welcome to TalentLix</h1>
        <p style={styles.subtitle}>The social platform for young athletes, built for sports.</p>
        <div style={styles.buttonGroup}>
          <Link href="/login" style={styles.button}>Login</Link>
          <Link href="/register" style={styles.buttonOutline}>Register</Link>
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
  subtitle: { color: '#555555', fontSize: '1rem', marginBottom: '2rem' },
  buttonGroup: { display: 'flex', gap: '1rem', justifyContent: 'center' },
  button: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#FFFFFF',
    padding: '0.8rem 1.5rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
  buttonOutline: {
    border: '2px solid #27E3DA',
    color: '#27E3DA',
    padding: '0.8rem 1.5rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
};

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
    background: '#121212',
    fontFamily: 'Inter, sans-serif',
    padding: '1rem'
  },
  card: {
    textAlign: 'center',
    maxWidth: '500px',
    width: '100%',
    padding: '2rem',
    borderRadius: '16px',
    background: '#1E1E1E',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  logo: {
    width: '100px',
    marginBottom: '1rem',
  },
  title: {
    color: '#FFFFFF',
    fontSize: '2rem',
    marginBottom: '0.5rem',
  },
  subtitle: {
    color: '#AAAAAA',
    fontSize: '1rem',
    marginBottom: '2rem',
  },
  buttonGroup: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
  },
  button: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#121212',
    padding: '0.8rem 1.5rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
    transition: 'opacity 0.3s',
  },
  buttonOutline: {
    border: '2px solid #27E3DA',
    color: '#27E3DA',
    padding: '0.8rem 1.5rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
    transition: 'background 0.3s',
  },
};

import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import Link from 'next/link';

export default function Home() {
  const [confirmationStatus, setConfirmationStatus] = useState(null); // null | success | expired
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const checkConfirmation = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
      const type = hashParams.get('type');
      const errorCode = hashParams.get('error_code');
      const errorDescription = hashParams.get('error_description');

      // ✅ Caso conferma email (solo se arrivi dal link di conferma)
      if (type === 'signup') {
        setConfirmationStatus('success');
        setMessage('✅ Your email has been successfully confirmed!');
      }
      // ❌ Caso link scaduto
      else if (errorCode === 'otp_expired') {
        setConfirmationStatus('expired');
        setMessage(`❌ ${decodeURIComponent(errorDescription)}`);
      }

      // 🔄 Pulisce hash dopo analisi
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      // 🔑 Controlla sessione utente
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);
    };

    checkConfirmation();
  }, []);

  const resendConfirmation = async () => {
    const email = prompt('Enter your email to resend confirmation:');
    if (email) {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) setMessage('⚠️ Failed to resend confirmation email.');
      else setMessage('📧 A new confirmation email has been sent to your inbox.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <div style={styles.background}> {/* 👈 Sfondo applicato */}
      <div style={styles.overlay}> {/* 👈 Overlay semi-trasparente */}
        <div style={styles.container}>
          {/* 🔵 MENU UTENTE IN ALTO A DESTRA */}
          <div style={styles.userMenuContainer}>
            <div style={styles.menuIcon} onClick={() => setMenuOpen(!menuOpen)}>⋮</div>
            {menuOpen && (
              <div style={styles.dropdown}>
                {!user ? (
                  <>
                    <Link href="/login" style={styles.dropdownItem}>Login</Link>
                  </>
                ) : (
                  <>
                    <div style={styles.dropdownUser}>👤 {user.email}</div>
                    <button onClick={handleLogout} style={styles.dropdownButton}>Logout</button>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={styles.card}>
            {/* Logo TalentLix */}
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <h1 style={styles.title}>Welcome to TalentLix</h1>
            <p style={styles.subtitle}>The social platform for young athletes, built for sports.</p>

            {/* Messaggi conferma/scadenza */}
            {confirmationStatus && (
              <div style={styles.alert}>
                <p>{message}</p>
                {confirmationStatus === 'expired' && (
                  <button style={styles.button} onClick={resendConfirmation}>
                    Resend Confirmation Email
                  </button>
                )}
              </div>
            )}

            {/* Pulsanti di navigazione */}
            <div style={styles.buttonGroup}>
              <Link href="/login" style={styles.button}>Login</Link>
              <Link href="/register" style={styles.buttonOutline}>Register</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  background: {
    backgroundImage: "url('/BackG.png')", // 👈 Sfondo dal file in /public
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    width: '100%',
    height: '100vh',
    position: 'relative',
  },
  overlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)', // 👈 Schiarimento trasparente
    width: '100%',
    height: '100%',
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
  userMenuContainer: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    zIndex: 10,
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
  dropdownItem: {
    display: 'block',
    padding: '0.5rem',
    textDecoration: 'none',
    color: '#333',
    cursor: 'pointer',
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
    textAlign: 'center',
    maxWidth: '500px',
    width: '100%',
    padding: '2rem',
    borderRadius: '12px',
    background: '#F8F9FA',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    border: '1px solid #E0E0E0',
    zIndex: 2,
    position: 'relative',
  },
  logo: { width: '100px', marginBottom: '1rem' },
  title: { color: '#000000', fontSize: '2rem', marginBottom: '0.5rem' },
  subtitle: { color: '#555555', fontSize: '1rem', marginBottom: '1.5rem' },
  alert: {
    background: '#FFF8E1',
    padding: '1rem',
    borderRadius: '8px',
    marginBottom: '1.5rem',
    color: '#333',
    fontSize: '0.95rem',
  },
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

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { SECTIONS, DEFAULT_SECTION, isValidSection } from '../utils/dashboardSections';
import { supabase } from '../utils/supabaseClient';
import PersonalPanel from '../sections/personal/PersonalPanel';

const ATHLETE_TABLE = 'athlete'; // usa il nome reale della tabella

export default function Dashboard() {
  const router = useRouter();
  
  // ---- URL state: sezione attiva
  const current = useMemo(() => {
    const raw = Array.isArray(router.query.section) ? router.query.section[0] : router.query.section;
    return isValidSection(raw) ? raw : DEFAULT_SECTION;
  }, [router.query.section]);

  const setSection = (id) => {
    router.push({ pathname: '/dashboard', query: { ...router.query, section: id } }, undefined, { shallow: true });
  };

  // ---- Stato auth + atleta
  const [user, setUser] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingPublish, setSavingPublish] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  // Carica utente e profilo atleta
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        // 1) Controllo sessione locale (evita flicker)
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (mounted) setAuthReady(true);
          router.replace('/login');
          return;
        }
  
        // 2) Verifica utente lato server
        const { data: { user: u }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !u) {
          if (mounted) setAuthReady(true);
          router.replace('/login');
          return;
        }
        if (mounted) setUser(u);
  
        // 3) Carico profilo atleta
        const { data, error } = await supabase
          .from(ATHLETE_TABLE)
          .select('id, first_name, last_name, profile_picture_url, profile_published, completion_percentage, current_step')
          .eq('id', u.id)
          .single();
  
        // Se tabella vuota (prima volta) → Wizard
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
        if (!data) {
          if (mounted) setAuthReady(true);
          router.replace('/wizard');
          return;
        }
  
        // 4) Base profile incompleto → Wizard (allo step giusto se presente)
        const completionVal = Number(data?.completion_percentage ?? 0);
        if ((data?.current_step && data.current_step > 0) || completionVal < 40) {
          const step = (data?.current_step && data.current_step > 0) ? String(data.current_step) : null;
          if (mounted) setAuthReady(true);
          router.replace(step ? `/wizard?step=${step}` : '/wizard');
          return;
        }
  
        if (mounted) setAthlete(data || null);
      } catch (e) {
        console.error(e);
   } finally {
      if (mounted) {
        setLoading(false);   // <-- mancava!
        setAuthReady(true);
      }
    }

    })();
  
    // Reagisci ai cambi di auth (logout/login da altre pagine)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (!u) router.replace('/login');
    });
  
    return () => { mounted = false; sub.subscription?.unsubscribe?.(); };
  }, [router]);


  const fullName =
    [athlete?.first_name, athlete?.last_name].filter(Boolean).join(' ') || 'Full Name';

  const isPublished = !!athlete?.profile_published;
  const completion = Math.min(100, Math.max(0, Number(athlete?.completion_percentage ?? 40)));

  const togglePublish = async () => {
            if (!athlete) return;
        const completionVal = Number(athlete?.completion_percentage ?? 0);
        // Non permettere publish se il profilo base non è completo
        if (completionVal < 40 || (athlete?.current_step && athlete.current_step > 0)) {
          alert('Complete your base profile in the Wizard before publishing.');
          router.replace('/wizard');
          return;
        }
    try {
      setSavingPublish(true);
      const { data, error } = await supabase
        .from(ATHLETE_TABLE)
        .update({ profile_published: !isPublished })
        .eq('id', athlete.id)
        .select()
        .single();
      if (error) throw error;
      setAthlete(data);
    } catch (e) {
      console.error(e);
      alert('Error updating publish status');
    } finally {
      setSavingPublish(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (e) {
      console.error(e);
      alert('Logout error');
    }
  };

  const sectionObj = SECTIONS.find(s => s.id === current);
  // blocca il render finché non abbiamo verificato la sessione
    if (!authReady) {
      return <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Checking session…</div>;
    }
  return (
    <div style={styles.page}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <img src="/logo-talentlix.png" alt="TalentLix" style={styles.logo} />
          <div>
            <div style={styles.headerTitle}>Athlete Dashboard</div>
            <div style={styles.headerName}>{fullName}</div>
          </div>
        </div>

        {/* AUTH CONTROL a destra */}
        <AuthControl
          email={user?.email}
          avatarUrl={athlete?.profile_picture_url}
          onLogout={handleLogout}
        />
      </header>

      {/* SUB-HEADER: avatar + publish + completion */}
      <div style={styles.subHeader}>
        {athlete?.profile_picture_url
          ? <img src={athlete.profile_picture_url} alt="Avatar" style={{ ...styles.avatar, objectFit: 'cover' }} />
          : <div style={styles.avatar} />
        }

        <div style={styles.publishRow}>
          <div style={{ ...styles.publishDot, background: isPublished ? '#2ECC71' : '#D9534F' }} />
          <span style={styles.publishText}>
            Profile status: {isPublished ? 'Published' : 'Unpublished'}
          </span>
          <button
            onClick={togglePublish}
            disabled={!athlete || savingPublish}
            style={styles.publishBtn}
            title={isPublished ? 'Unpublish profile' : 'Publish profile'}
          >
            {savingPublish ? 'Saving…' : (isPublished ? 'Unpublish' : 'Publish')}
          </button>
        </div>

        <div style={styles.progressWrap}>
          <div style={styles.progressLabel}>Profile completion</div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${completion}%` }} />
          </div>
          <div style={styles.progressPct}>{completion}%</div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <main style={styles.main}>
        {/* LEFT NAV */}
        <nav style={styles.leftNav}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{ ...styles.navBtn, ...(current === s.id ? styles.navBtnActive : {}) }}
            >
              {s.title}
            </button>
          ))}
        </nav>

      {/* CONTENT PANEL */}
      <section style={styles.panel}>
        {loading ? (
          <div style={styles.skeleton}>Loading…</div>
        ) : (
          <>
            <h2 style={styles.panelTitle}>{sectionObj?.title}</h2>
            <div style={styles.panelBody}>
              {current === 'personal' ? (
                <PersonalPanel athlete={athlete} onSaved={setAthlete} />
              ) : (
                <p style={styles.placeholder}>
                  TODO — fields and Save for “{sectionObj?.title}” will render here.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      </main>
    </div>
  );
}

/** Piccolo componente riutilizzabile per login/logout in alto a destra */
function AuthControl({ email, avatarUrl, onLogout }) {
  return (
    <div style={styles.authWrap}>
      <a href="/index" style={styles.link}>Home</a>
      <span style={{ margin: '0 8px' }}>|</span>
      <div style={styles.authBox}>
        {avatarUrl
          ? <img src={avatarUrl} alt="Avatar" style={styles.authAvatar} />
          : <div style={styles.authAvatarPlaceholder} />
        }
        <span style={styles.authEmail}>{email || '—'}</span>
        <button onClick={onLogout} style={styles.logoutBtn} title="Logout">Logout</button>
      </div>
    </div>
  );
}

const styles = {
  page: { fontFamily: 'Inter, sans-serif', background: '#F8F9FA', minHeight: '100vh', color: '#000' },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px', borderBottom: '1px solid #E0E0E0', background: '#FFFFFF',
    position: 'sticky', top: 0, zIndex: 10 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { width: 40, height: 'auto' },
  headerTitle: { fontSize: 18, fontWeight: 700, lineHeight: 1.1 },
  headerName: { fontSize: 14, opacity: 0.7 },

  authWrap: { display: 'flex', alignItems: 'center', gap: 12 },
  authBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: 8, background: '#FFF' },
  authAvatar: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' },
  authAvatarPlaceholder: { width: 28, height: 28, borderRadius: '50%', background: '#EEE' },
  authEmail: { fontSize: 12, opacity: 0.8 },
  logoutBtn: { fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer' },

  link: { color: '#27E3DA', textDecoration: 'none' },

  subHeader: { display: 'flex', alignItems: 'center', gap: 24, padding: '12px 24px',
    borderBottom: '1px solid #E0E0E0', background: '#FFFFFF' },
  avatar: { width: 56, height: 56, borderRadius: '50%', background: '#EEE' },

  publishRow: { display: 'flex', alignItems: 'center', gap: 10 },
  publishDot: { width: 10, height: 10, borderRadius: '50%' },
  publishText: { fontSize: 12, opacity: 0.8 },
  publishBtn: { fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer' },

  progressWrap: { display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  progressLabel: { fontSize: 12, opacity: 0.7 },
  progressBar: { width: 180, height: 8, background: '#EEE', borderRadius: 999 },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #27E3DA 0%, #F7B84E 100%)', borderRadius: 999 },
  progressPct: { fontSize: 12, opacity: 0.8, minWidth: 32, textAlign: 'right' },

  main: { display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, padding: 24 },
  leftNav: { display: 'flex', flexDirection: 'column', gap: 8, position: 'sticky', top: 100, alignSelf: 'start' },
  navBtn: { textAlign: 'left', padding: '10px 12px', border: '1px solid #E0E0E0', background: '#FFFFFF', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  navBtnActive: { borderColor: '#27E3DA', boxShadow: '0 0 0 2px rgba(39,227,218,0.15)', background: 'linear-gradient(90deg, rgba(39,227,218,0.08), rgba(247,184,78,0.08))' },

  panel: { background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 12, padding: 16, minHeight: 360, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  panelTitle: { fontSize: 18, margin: '4px 0 12px 0' },
  panelBody: { padding: 8 },
  placeholder: { color: '#666' },

  skeleton: { padding: 16, color: '#666', fontStyle: 'italic' }
};

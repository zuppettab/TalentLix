// /pages/dashboard.js
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { SECTIONS, DEFAULT_SECTION, isValidSection } from '../utils/dashboardSections';
import { supabase } from '../utils/supabaseClient';
import PersonalPanel from '../sections/personal/PersonalPanel';

const ATHLETE_TABLE = 'athlete';

// --- Hook responsive (JS, niente CSS esterno)
function useIsMobile(breakpointPx = 480) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width:${breakpointPx}px)`);
    const onChange = (e) => setIsMobile(!!e.matches);
    onChange(mq);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [breakpointPx]);
  return isMobile;
}

export default function Dashboard() {
  const router = useRouter();
  const isMobile = useIsMobile(480);

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

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (mounted) setAuthReady(true);
          router.replace('/login');
          return;
        }

        const { data: { user: u }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !u) {
          if (mounted) setAuthReady(true);
          router.replace('/login');
          return;
        }
        if (mounted) setUser(u);

        const { data, error } = await supabase
          .from(ATHLETE_TABLE)
          .select('id, first_name, last_name, profile_picture_url, profile_published, completion_percentage, current_step')
          .eq('id', u.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error; // errore reale
        if (!data) {
          if (mounted) setAuthReady(true);
          router.replace('/wizard');
          return;
        }

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
          setAuthReady(true);
          setLoading(false);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (!u) router.replace('/login');
    });

    return () => { sub.subscription?.unsubscribe?.(); mounted = false; };
  }, [router]);

  const fullName = [athlete?.first_name, athlete?.last_name].filter(Boolean).join(' ') || 'Full Name';
  const isPublished = !!athlete?.profile_published;
  const completion = Math.min(100, Math.max(0, Number(athlete?.completion_percentage ?? 40)));

  const togglePublish = async () => {
    if (!athlete) return;
    const completionVal = Number(athlete?.completion_percentage ?? 0);
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

  if (!authReady) return null;

  // --- Stili dinamici derivati (mobile vs desktop)
  const headerStyle = { ...styles.header, ...(isMobile ? styles.headerMobile : null) };
  const headerLeftStyle = { ...styles.headerLeft, ...(isMobile ? styles.headerLeftMobile : null) };
  const authWrapStyle = { ...(isMobile ? styles.authWrapMobileSlot : {}) };

  const subHeaderStyle = { ...styles.subHeader, ...(isMobile ? styles.subHeaderMobile : null) };
  const progressBarStyle = { ...styles.progressBar, ...(isMobile ? { width: '100%' } : null) };
  const mainStyle = { ...styles.main, ...(isMobile ? styles.mainMobile : null) };

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <header style={headerStyle}>
        <div style={headerLeftStyle}>
          <img src="/logo-talentlix.png" alt="TalentLix" style={styles.logo} />
          <div>
            <div style={styles.headerTitle}>Athlete Dashboard</div>
            <div style={styles.headerName}>{fullName}</div>
          </div>
        </div>

        <div style={authWrapStyle}>
          <AuthControl
            email={user?.email}
            avatarUrl={athlete?.profile_picture_url}
            onLogout={handleLogout}
            compact={isMobile}
          />
        </div>
      </header>

      {/* SUB-HEADER più arioso su mobile */}
      <div style={subHeaderStyle}>
        {athlete?.profile_picture_url
          ? <img src={athlete.profile_picture_url} alt="Avatar" style={{ ...styles.avatar, objectFit: 'cover' }} />
          : <div style={styles.avatar} />
        }

        <div style={{ ...styles.publishRow, ...(isMobile ? styles.publishRowMobile : null) }}>
          <div style={{ ...styles.publishDot, background: isPublished ? '#2ECC71' : '#D9534F' }} />
          <span style={styles.publishText}>
            Profile status: {isPublished ? 'Published' : 'Unpublished'}
          </span>
          <button
            onClick={togglePublish}
            disabled={!athlete || savingPublish}
            style={{ ...styles.publishBtn, ...(isMobile ? styles.touchBtn : null) }}
            title={isPublished ? 'Unpublish profile' : 'Publish profile'}
          >
            {savingPublish ? 'Saving…' : (isPublished ? 'Unpublish' : 'Publish')}
          </button>
        </div>

        <div style={{ ...styles.progressWrap, ...(isMobile ? styles.progressWrapMobile : null) }}>
          <div style={styles.progressLabel}>Profile completion</div>
          <div style={progressBarStyle}>
            <div style={{ ...styles.progressFill, width: `${completion}%` }} />
          </div>
          <div style={styles.progressPct}>{completion}%</div>
        </div>
      </div>

      {/* NAV MOBILE (nastro con frecce + fade) */}
      {isMobile && (
        <MobileScrollableTabs
          sections={SECTIONS}
          current={current}
          onSelect={setSection}
        />
      )}

      {/* MAIN LAYOUT */}
      <main style={mainStyle}>
        {/* LEFT NAV (solo desktop/tablet) */}
        {!isMobile && (
          <nav style={styles.leftNav}>
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                style={{ ...styles.navBtn, ...(current === s.id ? styles.navBtnActive : {}) }}
                title={s.title}
              >
                {s.title}
              </button>
            ))}
          </nav>
        )}

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

/** Login/logout in alto a destra */
function AuthControl({ email, avatarUrl, onLogout, compact }) {
  return (
    <div style={{ ...styles.authWrap, ...(compact ? styles.authWrapMobile : null) }}>
      <a href="/index" style={styles.link}>Home</a>
      {!compact && <span style={{ margin: '0 8px' }}>|</span>}
      <div style={styles.authBox}>
        {avatarUrl
          ? <img src={avatarUrl} alt="Avatar" style={styles.authAvatar} />
          : <div style={styles.authAvatarPlaceholder} />
        }
        <span style={styles.authEmail}>{email || '—'}</span>
        <button onClick={onLogout} style={{ ...styles.logoutBtn, ...styles.touchBtn }} title="Logout">Logout</button>
      </div>
    </div>
  );
}

/** Nastro tabs mobile con frecce e fade laterali */
function MobileScrollableTabs({ sections, current, onSelect }) {
  const scrollerRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateShadows = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setAtStart(scrollLeft <= 0);
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 1);
  };

  useEffect(() => {
    updateShadows();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => updateShadows();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(updateShadows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []);

  const nudge = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 220, behavior: 'smooth' });
  };

  return (
    <div style={styles.mobileTabsWrap}>
      {/* frecce */}
      {!atStart && (
        <button aria-label="Scroll left" onClick={() => nudge(-1)} style={{ ...styles.nudgeBtn, left: 4 }}>
          ‹
        </button>
      )}
      {!atEnd && (
        <button aria-label="Scroll right" onClick={() => nudge(1)} style={{ ...styles.nudgeBtn, right: 4 }}>
          ›
        </button>
      )}

      {/* fade laterali per “frecciatina” visiva */}
      {!atStart && <div style={{ ...styles.edgeFade, left: 0, background: 'linear-gradient(90deg, rgba(255,255,255,1) 10%, rgba(255,255,255,0) 90%)' }} />}
      {!atEnd && <div style={{ ...styles.edgeFade, right: 0, background: 'linear-gradient(270deg, rgba(255,255,255,1) 10%, rgba(255,255,255,0) 90%)' }} />}

      <div ref={scrollerRef} style={styles.mobileTabsScroller}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{ ...styles.mobileTabBtn, ...(current === s.id ? styles.mobileTabBtnActive : null) }}
            title={s.title}
          >
            {s.title}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { fontFamily: 'Inter, sans-serif', background: '#F8F9FA', minHeight: '100vh', color: '#000' },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid #E0E0E0',
    background: '#FFFFFF',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    // per evitare tagli su device piccoli
    boxSizing: 'border-box'
  },
  headerMobile: {
    flexWrap: 'wrap',
    rowGap: 8
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  headerLeftMobile: { flex: '1 1 100%' }, // occupa la riga, auth va sotto
  logo: { width: 40, height: 'auto' },
  headerTitle: { fontSize: 18, fontWeight: 700, lineHeight: 1.1 },
  headerName: { fontSize: 14, opacity: 0.7, lineHeight: 1.1 },

  authWrapMobileSlot: { flex: '1 1 100%', display: 'flex', justifyContent: 'flex-end' },

  authWrap: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  authWrapMobile: { width: '100%', justifyContent: 'space-between' },
  authBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: 8, background: '#FFF' },
  authAvatar: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' },
  authAvatarPlaceholder: { width: 28, height: 28, borderRadius: '50%', background: '#EEE' },
  authEmail: { fontSize: 12, opacity: 0.8, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  logoutBtn: { fontSize: 12, padding: '8px 12px', borderRadius: 10, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer' },

  link: { color: '#27E3DA', textDecoration: 'none' },

  // --- Sub-header (più spazio su mobile)
  subHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    padding: '14px 24px',
    borderBottom: '1px solid #E0E0E0',
    background: '#FFFFFF',
    boxSizing: 'border-box'
  },
  subHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 14,
    padding: '16px 16px'
  },
  avatar: { width: 56, height: 56, borderRadius: '50%', background: '#EEE' },

  publishRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  publishRowMobile: { order: 2 },
  publishDot: { width: 10, height: 10, borderRadius: '50%' },
  publishText: { fontSize: 12, opacity: 0.85 },
  publishBtn: { fontSize: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer' },

  progressWrap: { display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  progressWrapMobile: { marginLeft: 0, order: 3, flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  progressLabel: { fontSize: 12, opacity: 0.7 },
  progressBar: { width: 180, height: 8, background: '#EEE', borderRadius: 999 },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #27E3DA 0%, #F7B84E 100%)', borderRadius: 999 },
  progressPct: { fontSize: 12, opacity: 0.8, minWidth: 32, textAlign: 'right' },

  // --- Nastro tabs mobile
  mobileTabsWrap: {
    position: 'relative',
    borderBottom: '1px solid #E0E0E0',
    background: '#FFFFFF',
    padding: '8px 8px',
    boxSizing: 'border-box'
  },
  mobileTabsScroller: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '4px 8px',
    scrollbarWidth: 'none'
  },
  mobileTabBtn: {
    flex: '0 0 auto',
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    background: '#FFFFFF',
    borderRadius: 999,
    fontSize: 14,
    cursor: 'pointer',
    minHeight: 40
  },
  mobileTabBtnActive: {
    borderColor: '#27E3DA',
    boxShadow: '0 0 0 2px rgba(39,227,218,0.15)',
    background: 'linear-gradient(90deg, rgba(39,227,218,0.08), rgba(247,184,78,0.08))'
  },
  nudgeBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2,
    border: '1px solid #E0E0E0',
    background: '#FFF',
    borderRadius: '999px',
    width: 28,
    height: 28,
    lineHeight: '26px',
    textAlign: 'center',
    fontSize: 18,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
  },
  edgeFade: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: '100%',
    zIndex: 1,
    pointerEvents: 'none'
  },

  // --- Main
  main: { display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, padding: 24, boxSizing: 'border-box' },
  mainMobile: { gridTemplateColumns: '1fr', gap: 12, padding: 12 },

  // left nav (desktop/tablet)
  leftNav: { display: 'flex', flexDirection: 'column', gap: 8, position: 'sticky', top: 100, alignSelf: 'start' },
  navBtn: { textAlign: 'left', padding: '12px 14px', border: '1px solid #E0E0E0', background: '#FFFFFF', borderRadius: 10, cursor: 'pointer', fontSize: 14, minHeight: 44 },
  navBtnActive: { borderColor: '#27E3DA', boxShadow: '0 0 0 2px rgba(39,227,218,0.15)', background: 'linear-gradient(90deg, rgba(39,227,218,0.08), rgba(247,184,78,0.08))' },

  // panel
  panel: { background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 12, padding: 16, minHeight: 360, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', boxSizing: 'border-box' },
  panelTitle: { fontSize: 18, margin: '4px 0 12px 0' },
  panelBody: { padding: 8 },
  placeholder: { color: '#666' },

  skeleton: { padding: 16, color: '#666', fontStyle: 'italic' },

  // touch-friendly
  touchBtn: { minHeight: 44 }
};

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useOperatorGuard } from '../hooks/useOperatorGuard';
import { supabase } from '../utils/supabaseClient';
import {
  OPERATOR_SECTIONS,
  DEFAULT_OPERATOR_SECTION,
  isValidOperatorSection,
  getOperatorSectionById,
} from '../utils/operatorDashboardSections';
import EntityDataPanel from '../sections/operator/EntityDataPanel';
import OperatorContactsPanel from '../sections/operator/OperatorContactsPanel';
import IdentityPanel from '../sections/operator/IdentityPanel';
import WalletPanel from '../sections/operator/WalletPanel';
import SearchPanel from '../sections/operator/SearchPanel';
import MessagesPanel from '../sections/operator/MessagesPanel';
import PrivacyConsentPanel from '../sections/operator/PrivacyConsentPanel';

const SECTION_COMPONENTS = {
  entity: EntityDataPanel,
  contacts: OperatorContactsPanel,
  identity: IdentityPanel,
  wallet: WalletPanel,
  search: SearchPanel,
  messages: MessagesPanel,
  privacy: PrivacyConsentPanel,
};

function useIsMobile(breakpointPx = 720) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width:${breakpointPx}px)`);
    const onChange = (event) => setIsMobile(event.matches);
    onChange(mq);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [breakpointPx]);

  return isMobile;
}

export default function OperatorDashboard() {
  const router = useRouter();
  const { loading, user } = useOperatorGuard({ redirectTo: '/login-operator', includeReason: false });
  const isMobile = useIsMobile(720);
  const [operatorData, setOperatorData] = useState({
    loading: true,
    error: null,
    account: null,
    profile: null,
    contact: null,
    type: null,
    privacy: null,
  });

  const pickLatestRecord = useCallback((records = [], dateFields = []) => {
    if (!Array.isArray(records) || records.length === 0) return null;
    const sortBy = (record) => {
      return dateFields.reduce((acc, field) => {
        const raw = record?.[field];
        if (!raw) return acc;
        const timestamp = new Date(raw).getTime();
        if (Number.isNaN(timestamp)) return acc;
        return Math.max(acc, timestamp);
      }, 0);
    };
    return [...records].sort((a, b) => sortBy(b) - sortBy(a))[0] || records[0];
  }, []);

  const fetchOperatorData = useCallback(async () => {
    if (!user?.id) {
      return {
        account: null,
        profile: null,
        contact: null,
        type: null,
        privacy: null,
      };
    }

    const { data, error } = await supabase
      .from('op_account')
      .select(`
        id, status, wizard_status, type_id,
        op_type:op_type(id, code, name),
        op_profile:op_profile(*),
        op_contact:op_contact(*),
        op_privacy_consent:op_privacy_consent(id, policy_version, accepted_at, revoked_at, revoked_reason, created_at, updated_at)
      `)
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return {
        account: null,
        profile: null,
        contact: null,
        type: null,
        privacy: null,
      };
    }

    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') return [value];
      return [];
    };

    const profileArr = toArray(data.op_profile);
    const contactArr = toArray(data.op_contact);
    const typeArr = toArray(data.op_type);
    const privacyArr = toArray(data.op_privacy_consent);

    const account = {
      id: data.id,
      status: data.status || '',
      wizard_status: data.wizard_status || '',
      type_id: data.type_id,
    };

    const profile = profileArr.length ? profileArr[0] : null;
    const contact = contactArr.length ? contactArr[0] : null;
    const type = typeArr.length ? typeArr[0] : null;
    const privacy = pickLatestRecord(privacyArr, ['accepted_at', 'updated_at', 'created_at']);

    return { account, profile, contact, type, privacy };
  }, [pickLatestRecord, user?.id]);

  const loadOperatorData = useCallback(async () => {
    try {
      setOperatorData((prev) => ({ ...prev, loading: true, error: null }));
      const result = await fetchOperatorData();
      setOperatorData({ loading: false, error: null, ...result });
    } catch (err) {
      console.error('Failed to load operator dashboard data', err);
      setOperatorData((prev) => ({ ...prev, loading: false, error: err }));
    }
  }, [fetchOperatorData]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login-operator');
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user?.id) {
      setOperatorData((prev) => ({ ...prev, loading: false }));
      return;
    }

    let active = true;
    setOperatorData((prev) => ({ ...prev, loading: true, error: null }));

    fetchOperatorData()
      .then((result) => {
        if (!active) return;
        setOperatorData({ loading: false, error: null, ...result });
      })
      .catch((err) => {
        console.error('Failed to load operator dashboard data', err);
        if (!active) return;
        setOperatorData((prev) => ({ ...prev, loading: false, error: err }));
      });

    return () => {
      active = false;
    };
  }, [fetchOperatorData, user?.id]);

  const current = useMemo(() => {
    const raw = Array.isArray(router.query.section) ? router.query.section[0] : router.query.section;
    return isValidOperatorSection(raw) ? raw : DEFAULT_OPERATOR_SECTION;
  }, [router.query.section]);

  const setSection = (id) => {
    router.push({ pathname: '/operator-dashboard', query: { ...router.query, section: id } }, undefined, { shallow: true });
  };

  const sectionObj = getOperatorSectionById(current);
  const SectionComponent = SECTION_COMPONENTS[current] || EntityDataPanel;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login-operator');
  };

  if (loading || !user) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loaderContainer} role="status" aria-live="polite">
          <div style={styles.spinner} aria-hidden="true" />
          <span style={styles.srOnly}>Loading operator dashboard…</span>
        </div>
        <style jsx>{`
          @keyframes operatorDashboardSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  const headerStyle = { ...styles.header, ...(isMobile ? styles.headerMobile : null) };
  const headerLeftStyle = { ...styles.headerLeft, ...(isMobile ? styles.headerLeftMobile : null) };
  const headerRightStyle = { ...styles.headerRight, ...(isMobile ? styles.headerRightMobile : null) };
  const mainStyle = { ...styles.main, ...(isMobile ? styles.mainMobile : null) };

  return (
    <div style={styles.page}>
      <header style={headerStyle}>
        <div style={headerLeftStyle}>
          <img src="/logo-talentlix.png" alt="TalentLix" style={styles.logo} />
          <div>
            <div style={styles.headerTitle}>Operator dashboard</div>
            <p style={styles.headerSubtitle}>Manage your organisation and talent activities.</p>
          </div>
        </div>
        <div style={headerRightStyle}>
          <span style={styles.userEmail}>{user?.email}</span>
          <button type="button" style={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      {isMobile && (
        <MobileOperatorTabs sections={OPERATOR_SECTIONS} current={current} onSelect={setSection} />
      )}

      <main style={mainStyle}>
        {!isMobile && (
          <nav style={styles.leftNav}>
            {OPERATOR_SECTIONS.map(section => (
              <button
                key={section.id}
                type="button"
                onClick={() => setSection(section.id)}
                style={{
                  ...styles.navBtn,
                  ...(current === section.id ? styles.navBtnActive : null),
                }}
              >
                {section.title}
              </button>
            ))}
          </nav>
        )}

        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>{sectionObj?.title}</h2>
          <div style={styles.panelBody}>
            <SectionComponent
              operatorData={operatorData}
              authUser={user}
              onRefresh={loadOperatorData}
              isMobile={isMobile}
            />
          </div>
        </section>
      </main>

      <style jsx>{`
        @keyframes operatorDashboardSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function MobileOperatorTabs({ sections, current, onSelect }) {
  const scrollerRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateBoundaries = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    setAtStart(scrollLeft <= 0);
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 1);
  };

  useEffect(() => {
    updateBoundaries();
    const el = scrollerRef.current;
    if (!el) return;
    const handleScroll = () => updateBoundaries();
    el.addEventListener('scroll', handleScroll, { passive: true });
    let resizeObserver = null;
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      resizeObserver = new window.ResizeObserver(updateBoundaries);
      resizeObserver.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
    };
  }, []);

  const nudge = (direction) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.9), behavior: 'smooth' });
  };

  return (
    <div style={styles.mobileTabsWrap}>
      {!atStart && (
        <button type="button" aria-label="Scroll left" onClick={() => nudge(-1)} style={{ ...styles.nudgeBtn, left: 6 }}>
          ‹
        </button>
      )}
      {!atEnd && (
        <button type="button" aria-label="Scroll right" onClick={() => nudge(1)} style={{ ...styles.nudgeBtn, right: 6 }}>
          ›
        </button>
      )}

      {!atStart && <div style={{ ...styles.edgeFade, left: 0, background: 'linear-gradient(90deg, rgba(255,255,255,1) 15%, rgba(255,255,255,0) 85%)' }} />}
      {!atEnd && <div style={{ ...styles.edgeFade, right: 0, background: 'linear-gradient(270deg, rgba(255,255,255,1) 15%, rgba(255,255,255,0) 85%)' }} />}

      <div ref={scrollerRef} style={styles.mobileTabsScroller}>
        {sections.map(section => (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            style={{
              ...styles.mobileTabBtn,
              ...(current === section.id ? styles.mobileTabBtnActive : null),
            }}
          >
            {section.title}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F6F7FB',
    fontFamily: 'Inter, sans-serif',
    color: '#0F172A',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    background: '#FFFFFF',
    borderBottom: '1px solid #E5E7EB',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerMobile: { flexWrap: 'wrap', rowGap: 12 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  headerLeftMobile: { flex: '1 1 100%' },
  logo: { width: 48, height: 48, objectFit: 'contain' },
  headerTitle: { fontSize: 18, fontWeight: 700, margin: 0, color: '#0F172A', lineHeight: 1.2 },
  headerSubtitle: { fontSize: 13, color: '#4B5563', margin: '4px 0 0 0', lineHeight: 1.3 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' },
  headerRightMobile: { flex: '1 1 100%', justifyContent: 'flex-end' },
  userEmail: { fontSize: 13, color: '#4B5563', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 },
  signOutBtn: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    border: 'none',
    color: '#fff',
    fontWeight: 600,
    padding: '10px 18px',
    borderRadius: 999,
    cursor: 'pointer',
  },
  main: {
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    gap: 24,
    padding: '32px',
    boxSizing: 'border-box',
    width: '100%',
  },
  mainMobile: { gridTemplateColumns: '1fr', padding: '16px', gap: 16 },
  leftNav: { display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 120, alignSelf: 'start' },
  navBtn: {
    textAlign: 'left',
    padding: '12px 16px',
    border: '1px solid #E5E7EB',
    background: '#FFFFFF',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 500,
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease',
  },
  navBtnActive: { borderColor: '#27E3DA', boxShadow: '0 0 0 2px rgba(39,227,218,0.25)', color: '#027373' },
  panel: {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 16,
    padding: '32px',
    minHeight: '60vh',
    boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
    boxSizing: 'border-box',
  },
  panelTitle: { fontSize: 20, fontWeight: 600, margin: '0 0 16px 0', color: '#0F172A' },
  panelBody: { minHeight: 200 },
  loadingWrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F6F7FB',
    fontFamily: 'Inter, sans-serif',
  },
  loaderContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 48, textAlign: 'center' },
  spinner: { width: 48, height: 48, borderRadius: '50%', border: '4px solid #27E3DA', borderTopColor: '#F7B84E', animation: 'operatorDashboardSpin 1s linear infinite' },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  mobileTabsWrap: {
    position: 'sticky',
    top: 72,
    zIndex: 9,
    background: '#FFFFFF',
    borderBottom: '1px solid #E5E7EB',
    padding: '8px 8px',
  },
  mobileTabsScroller: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    padding: '4px 8px',
  },
  mobileTabBtn: {
    flex: '0 0 33.33%',
    padding: '10px 12px',
    border: '1px solid #E5E7EB',
    borderRadius: 999,
    background: '#FFFFFF',
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    minHeight: 40,
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease',
  },
  mobileTabBtnActive: { borderColor: '#27E3DA', boxShadow: '0 0 0 2px rgba(39,227,218,0.2)', color: '#027373' },
  nudgeBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2,
    border: '1px solid #E5E7EB',
    background: '#FFFFFF',
    borderRadius: 999,
    width: 40,
    height: 40,
    lineHeight: '38px',
    textAlign: 'center',
    fontSize: 24,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.10)'
  },
  edgeFade: {
    position: 'absolute',
    top: 0,
    width: 36,
    height: '100%',
    zIndex: 1,
    pointerEvents: 'none'
  },
};

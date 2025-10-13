import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login-operator');
    }
  }, [loading, router, user]);

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

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <img src="/logo-talentlix.png" alt="TalentLix" style={styles.logo} />
          <div>
            <div style={styles.headerTitle}>Operator dashboard</div>
            <p style={styles.headerSubtitle}>Manage your organisation and talent activities.</p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userEmail}>{user?.email}</span>
          <button type="button" style={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      {isMobile && (
        <MobileOperatorTabs sections={OPERATOR_SECTIONS} current={current} onSelect={setSection} />
      )}

      <main style={{ ...styles.main, ...(isMobile ? styles.mainMobile : null) }}>
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
            <SectionComponent />
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
  return (
    <div style={styles.mobileTabsWrap}>
      <div style={styles.mobileTabsScroller}>
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
    padding: '24px 32px',
    background: '#FFFFFF',
    borderBottom: '1px solid #E5E7EB',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  logo: { width: 56, height: 56, objectFit: 'contain' },
  headerTitle: { fontSize: 24, fontWeight: 700, margin: 0, color: '#0F172A' },
  headerSubtitle: { fontSize: 14, color: '#4B5563', margin: '4px 0 0 0' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  userEmail: { fontSize: 14, color: '#4B5563' },
  signOutBtn: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    border: 'none',
    color: '#fff',
    fontWeight: 600,
    padding: '10px 20px',
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
    padding: '12px 16px',
  },
  mobileTabsScroller: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
  },
  mobileTabBtn: {
    flex: '0 0 auto',
    padding: '10px 16px',
    border: '1px solid #E5E7EB',
    borderRadius: 999,
    background: '#FFFFFF',
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease',
  },
  mobileTabBtnActive: { borderColor: '#27E3DA', boxShadow: '0 0 0 2px rgba(39,227,218,0.2)', color: '#027373' },
};

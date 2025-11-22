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
import UnlockedAthletesPanel from '../sections/operator/UnlockedAthletesPanel';
import PrivacyConsentPanel from '../sections/operator/PrivacyConsentPanel';

const SECTION_COMPONENTS = {
  entity: EntityDataPanel,
  contacts: OperatorContactsPanel,
  identity: IdentityPanel,
  wallet: WalletPanel,
  search: SearchPanel,
  unlocked: UnlockedAthletesPanel,
  messages: MessagesPanel,
  privacy: PrivacyConsentPanel,
};

const FUNCTIONAL_SECTIONS = new Set(['wallet', 'search', 'unlocked', 'messages']);

const normalizeIdentityValue = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    const normalized = normalizeIdentityValue(value);
    if (normalized) {
      return normalized;
    }
  }
  return '';
};

const formatCredits = (value) => {
  if (value == null) return '0.00';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return '0.00';
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
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
    verification: {
      request: null,
      documents: {},
      rules: [],
    },
    wallet: {
      id: null,
      balance_credits: null,
      updated_at: null,
      transactions: [],
      loading: true,
      error: null,
    },
    sectionStatus: {
      entity: { loading: true, error: null },
      contacts: { loading: true, error: null },
      identity: { loading: true, error: null },
      privacy: { loading: true, error: null },
    },
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
    const baseSectionStatus = {
      entity: { loading: false, error: null },
      contacts: { loading: false, error: null },
      identity: { loading: false, error: null },
      privacy: { loading: false, error: null },
    };

    const emptyWallet = {
      id: null,
      balance_credits: null,
      updated_at: null,
      transactions: [],
      loading: false,
      error: null,
    };

    const empty = {
      account: null,
      profile: null,
      contact: null,
      type: null,
      privacy: null,
      verification: {
        request: null,
        documents: {},
        rules: [],
      },
      wallet: emptyWallet,
      sectionStatus: baseSectionStatus,
    };

    if (!user?.id) {
      return empty;
    }

    if (!supabase) {
      console.warn('Supabase client is not available while loading operator dashboard data. Returning empty dataset.');
      return empty;
    }

    const localSectionStatus = {
      entity: { loading: true, error: null },
      contacts: { loading: true, error: null },
      identity: { loading: true, error: null },
      privacy: { loading: true, error: null },
    };

    const handleSectionError = (keys, err) => {
      keys.forEach((key) => {
        if (!localSectionStatus[key]) return;
        localSectionStatus[key] = {
          loading: false,
          error: err,
        };
      });
    };

    const finishSectionLoading = (keys) => {
      keys.forEach((key) => {
        if (!localSectionStatus[key]) return;
        localSectionStatus[key] = {
          ...(localSectionStatus[key] || {}),
          loading: false,
        };
      });
    };

    let account = null;
    let profile = null;
    let contact = null;
    let type = null;
    let privacy = null;
    let verification = {
      request: null,
      documents: {},
      rules: [],
    };
    let wallet = { ...emptyWallet, loading: true };

    const baseAccountQuery = () =>
      supabase
        .from('op_account')
        .select('id, status, wizard_status, type_id, created_at')
        .eq('auth_user_id', user.id);

    const { data: accountData, error: accountError } = await baseAccountQuery().maybeSingle();

    if (accountError) {
      if (accountError.code === 'PGRST116') {
        console.warn('Multiple operator accounts found for auth user. Falling back to the most recent one.');
        const { data: fallbackData, error: fallbackError } = await baseAccountQuery()
          .order('created_at', { ascending: false })
          .limit(1);
        if (fallbackError) {
          handleSectionError(['entity', 'contacts', 'privacy'], fallbackError);
          return {
            ...empty,
            sectionStatus: localSectionStatus,
          };
        }
        account = Array.isArray(fallbackData) ? fallbackData[0] : fallbackData || null;
      } else {
        handleSectionError(['entity', 'contacts', 'privacy'], accountError);
        return {
          ...empty,
          sectionStatus: localSectionStatus,
        };
      }
    } else {
      account = accountData;
    }

    if (!account) {
      finishSectionLoading(['entity', 'contacts', 'privacy']);
      return {
        ...empty,
        wallet: { ...emptyWallet, loading: false },
        sectionStatus: localSectionStatus,
      };
    }

    const normalizedAccount = {
      id: account.id,
      status: account.status || '',
      wizard_status: account.wizard_status || '',
      type_id: account.type_id,
    };

    try {
      if (account.type_id) {
        const { data: typeRow, error: typeError } = await supabase
          .from('op_type')
          .select('id, code, name')
          .eq('id', account.type_id)
          .maybeSingle();
        if (typeError) throw typeError;
        type = typeRow || null;
      }
    } catch (err) {
      handleSectionError(['entity'], err);
    }

    try {
      if (normalizedAccount.type_id) {
        const { data: ruleRows, error: rulesError } = await supabase
          .from('op_type_required_doc')
          .select('doc_type,is_required,conditions')
          .eq('type_id', normalizedAccount.type_id)
          .order('is_required', { ascending: false })
          .order('doc_type', { ascending: true });
        if (rulesError) throw rulesError;
        verification.rules = Array.isArray(ruleRows) ? ruleRows.filter(Boolean) : [];
      }
    } catch (err) {
      handleSectionError(['identity'], err);
    }

    try {
      const { data: profileRow, error: profileError } = await supabase
        .from('op_profile')
        .select('*')
        .eq('op_id', account.id)
        .maybeSingle();
      if (profileError) throw profileError;
      profile = profileRow || null;
    } catch (err) {
      handleSectionError(['entity', 'contacts'], err);
    }

    try {
      const { data: contactRow, error: contactError } = await supabase
        .from('op_contact')
        .select('*')
        .eq('op_id', account.id)
        .maybeSingle();
      if (contactError) throw contactError;
      contact = contactRow || null;
    } catch (err) {
      handleSectionError(['contacts'], err);
    }

    try {
      const { data: requestRows, error: requestError } = await supabase
        .from('op_verification_request')
        .select('id,state,reason,submitted_at,created_at,updated_at,op_verification_document:op_verification_document(*)')
        .eq('op_id', account.id)
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1);
      if (requestError) throw requestError;
      const requestRow = Array.isArray(requestRows) ? requestRows[0] : requestRows || null;
      if (requestRow) {
        const docsArray = Array.isArray(requestRow.op_verification_document)
          ? requestRow.op_verification_document
          : requestRow.op_verification_document
            ? [requestRow.op_verification_document]
            : [];
        const docMap = {};
        docsArray.forEach((doc) => {
          if (!doc || !doc.doc_type) return;
          docMap[doc.doc_type] = {
            doc_type: doc.doc_type,
            file_key: doc.file_key || '',
            file_hash: doc.file_hash || '',
            mime_type: doc.mime_type || '',
            file_size: doc.file_size ?? null,
            expires_at: doc.expires_at || null,
            created_at: doc.created_at || null,
            updated_at: doc.updated_at || null,
          };
        });
        verification = {
          ...verification,
          request: {
            id: requestRow.id,
            state: requestRow.state || '',
            reason: requestRow.reason || null,
            submitted_at: requestRow.submitted_at || null,
            created_at: requestRow.created_at || null,
            updated_at: requestRow.updated_at || null,
          },
          documents: docMap,
        };
      }
      localSectionStatus.identity = { loading: false, error: null };
    } catch (err) {
      handleSectionError(['identity'], err);
    }

    try {
      const { data: walletRow, error: walletError } = await supabase
        .from('op_wallet')
        .select('id:op_id, balance_credits, updated_at')
        .eq('op_id', account.id)
        .maybeSingle();
      if (walletError && walletError.code !== 'PGRST116') throw walletError;

      if (walletError && walletError.code === 'PGRST116') {
        console.warn('Multiple wallet rows found for operator. Using the most recent one.');
        const { data: walletRows, error: walletFallbackError } = await supabase
          .from('op_wallet')
          .select('id:op_id, balance_credits, updated_at')
          .eq('op_id', account.id)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .limit(1);
        if (walletFallbackError) throw walletFallbackError;
        const fallback = Array.isArray(walletRows) ? walletRows[0] : walletRows || null;
        if (fallback) {
          wallet = {
            ...wallet,
            id: fallback.id,
            balance_credits: fallback.balance_credits ?? 0,
            updated_at: fallback.updated_at || null,
          };
        } else {
          wallet = { ...wallet, loading: false };
        }
      } else if (walletRow) {
        wallet = {
          ...wallet,
          id: walletRow.id,
          balance_credits: walletRow.balance_credits ?? 0,
          updated_at: walletRow.updated_at || null,
        };
      } else {
        wallet = { ...wallet, balance_credits: 0, loading: false };
      }

      const { data: walletTxRows, error: walletTxError } = await supabase
        .from('op_wallet_tx')
        .select('id, tx_ref, status, kind, credits, amount_eur, provider, created_at, settled_at')
        .eq('op_id', account.id)
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(20);
      if (walletTxError) throw walletTxError;

      wallet = {
        ...wallet,
        transactions: Array.isArray(walletTxRows)
          ? walletTxRows.map((row) => ({
              id: row.id,
              tx_ref: row.tx_ref || '',
              status: row.status || '',
              kind: row.kind || '',
              credits: row.credits ?? null,
              amount_eur: row.amount_eur ?? null,
              provider: row.provider || '',
              created_at: row.created_at || null,
              settled_at: row.settled_at || null,
            }))
          : [],
        loading: false,
        error: null,
      };
    } catch (err) {
      console.error('Failed to load wallet data', err);
      wallet = {
        ...wallet,
        loading: false,
        error: {
          code: typeof err?.code === 'string' ? err.code : null,
          message: err?.message || 'Wallet data is currently unavailable.',
          status: typeof err?.status === 'number' ? err.status : null,
          details: err?.details ?? null,
          hint: err?.hint ?? null,
          kind:
            typeof err?.message === 'string' && /fetch failed|failed to fetch|network/i.test(err.message)
              ? 'network'
              : err?.code === 'FETCH_ERROR'
                ? 'network'
                : err?.name === 'TypeError'
                  ? 'network'
                  : 'unknown',
        },
      };
    }

    try {
      const { data: privacyRows, error: privacyError } = await supabase
        .from('op_privacy_consent')
        .select('*')
        .eq('op_id', account.id)
        .order('accepted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(10);
      if (privacyError) throw privacyError;
      const latestPrivacy = pickLatestRecord(privacyRows, ['accepted_at', 'updated_at', 'created_at']);
      privacy = latestPrivacy
        ? {
            id: latestPrivacy.id,
            policy_version: latestPrivacy.policy_version ?? null,
            accepted: typeof latestPrivacy.accepted === 'boolean' ? latestPrivacy.accepted : null,
            accepted_at: latestPrivacy.accepted_at ?? null,
            revoked_at: latestPrivacy.revoked_at ?? null,
            revoked_reason: latestPrivacy.revoked_reason ?? null,
            created_at: latestPrivacy.created_at ?? null,
            updated_at: latestPrivacy.updated_at ?? null,
          }
        : null;
      localSectionStatus.privacy = { loading: false, error: null };
    } catch (err) {
      handleSectionError(['privacy'], err);
    }

    finishSectionLoading(['entity', 'contacts', 'identity', 'privacy']);

    return {
      account: normalizedAccount,
      profile,
      contact,
      type,
      privacy,
      verification,
      wallet,
      sectionStatus: localSectionStatus,
    };
  }, [pickLatestRecord, user?.id]);

  const loadOperatorData = useCallback(
    async (options = {}) => {
      const { silent = false } = options || {};

      try {
        setOperatorData((prev) => {
          if (silent) {
            return {
              ...prev,
              error: null,
              wallet: {
                ...(prev.wallet || {}),
                loading: true,
                error: null,
              },
            };
          }

          return {
            ...prev,
            loading: true,
            error: null,
            sectionStatus: {
              entity: { loading: true, error: null },
              contacts: { loading: true, error: null },
              identity: { loading: true, error: null },
              privacy: { loading: true, error: null },
            },
            wallet: {
              ...(prev.wallet || {}),
              loading: true,
              error: null,
            },
          };
        });

        const result = await fetchOperatorData();
        setOperatorData({
          loading: false,
          error: null,
          ...result,
        });
      } catch (err) {
        console.error('Failed to load operator dashboard data', err);
        setOperatorData((prev) => {
          if (silent) {
            return {
              ...prev,
              loading: false,
              error: err,
              wallet: {
                ...(prev.wallet || {}),
                loading: false,
                error: err,
              },
            };
          }

          return {
            ...prev,
            loading: false,
            error: err,
            sectionStatus: {
              entity: { loading: false, error: err },
              contacts: { loading: false, error: err },
              identity: { loading: false, error: err },
              privacy: { loading: false, error: err },
            },
            wallet: {
              ...(prev.wallet || {}),
              loading: false,
              error: err,
            },
          };
        });
      }
    },
    [fetchOperatorData]
  );

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
    setOperatorData((prev) => ({
      ...prev,
      loading: true,
      error: null,
      sectionStatus: {
        entity: { loading: true, error: null },
        contacts: { loading: true, error: null },
        identity: { loading: true, error: null },
        privacy: { loading: true, error: null },
      },
      wallet: {
        ...(prev.wallet || {}),
        loading: true,
        error: null,
      },
    }));

    fetchOperatorData()
      .then((result) => {
        if (!active) return;
        setOperatorData({
          loading: false,
          error: null,
          ...result,
        });
      })
      .catch((err) => {
        console.error('Failed to load operator dashboard data', err);
        if (!active) return;
        setOperatorData((prev) => ({
          ...prev,
          loading: false,
          error: err,
          sectionStatus: {
            entity: { loading: false, error: err },
            contacts: { loading: false, error: err },
            identity: { loading: false, error: err },
            privacy: { loading: false, error: err },
          },
          wallet: {
            ...(prev.wallet || {}),
            loading: false,
            error: err,
          },
        }));
      });

    return () => {
      active = false;
    };
  }, [fetchOperatorData, user?.id]);

  const refreshWalletSilently = useCallback(() => {
    if (!user?.id) return;
    loadOperatorData({ silent: true });
  }, [loadOperatorData, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleFocus = () => {
      refreshWalletSilently();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshWalletSilently();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshWalletSilently]);

  const current = useMemo(() => {
    const raw = Array.isArray(router.query.section) ? router.query.section[0] : router.query.section;
    return isValidOperatorSection(raw) ? raw : DEFAULT_OPERATOR_SECTION;
  }, [router.query.section]);

  const setSection = (id) => {
    router.push({ pathname: '/operator-dashboard', query: { ...router.query, section: id } }, undefined, { shallow: true });
    refreshWalletSilently();
  };

  const sectionObj = getOperatorSectionById(current);
  const SectionComponent = SECTION_COMPONENTS[current] || EntityDataPanel;

  const sectionStatusMap = useMemo(() => {
    const baseStatus = {};
    OPERATOR_SECTIONS.forEach((section) => {
      baseStatus[section.id] = 'unknown';
    });

    if (!operatorData || operatorData.loading) {
      return baseStatus;
    }

    const hasInfo = (value) => {
      if (value == null) return false;
      if (typeof value === 'boolean') return true;
      if (typeof value === 'number') return true;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      if (value instanceof Date) return true;
      if (typeof value === 'object') {
        return Object.values(value).some((inner) => hasInfo(inner));
      }
      return false;
    };

    const nextStatus = { ...baseStatus };

    const hasEntityData = hasInfo(operatorData.profile) || hasInfo(operatorData.account) || hasInfo(operatorData.type);
    nextStatus.entity = hasEntityData ? 'complete' : 'incomplete';

    nextStatus.contacts = hasInfo(operatorData.contact) ? 'complete' : 'incomplete';

    const verification = operatorData.verification || {};
    const hasIdentityData = hasInfo(verification.request) || (verification.documents && Object.keys(verification.documents).length > 0);
    nextStatus.identity = hasIdentityData ? 'complete' : 'incomplete';

    nextStatus.privacy = hasInfo(operatorData.privacy) ? 'complete' : 'incomplete';

    return nextStatus;
  }, [operatorData]);

  const operatorIdentity = useMemo(() => {
    const profile = operatorData?.profile || {};
    const account = operatorData?.account || {};
    const contact = operatorData?.contact || {};
    const userMeta = user?.user_metadata || {};

    const name = pickFirstNonEmpty(
      profile.contact_name,
      profile.contact_person,
      profile.trade_name,
      profile.legal_name,
      account.display_name,
      userMeta.full_name,
      userMeta.name,
      user?.email
    );

    const email = pickFirstNonEmpty(
      user?.email,
      userMeta.email,
      account.email,
      contact.email_primary,
      contact.email_secondary,
      contact.email_billing
    );

    return {
      name: name || email || 'Operator',
      email: email || user?.email || '—',
    };
  }, [operatorData?.account, operatorData?.contact, operatorData?.profile, user]);

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
  const walletBalance = operatorData?.wallet?.balance_credits;
  const walletLoading = operatorData?.wallet?.loading;
  const walletDisplay = walletLoading
    ? '…'
    : formatCredits(walletBalance);

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
          <div style={styles.walletBadge}>
            <span style={styles.walletBadgeLabel}>Wallet credits</span>
            <span style={styles.walletBadgeValue} aria-live="polite">
              {walletDisplay}
            </span>
          </div>
          <div style={styles.userIdentity}>
            <span style={styles.userName}>{operatorIdentity.name}</span>
            <span style={styles.userEmail}>{operatorIdentity.email}</span>
          </div>
          <button type="button" style={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      {isMobile && (
        <MobileOperatorTabs
          sections={OPERATOR_SECTIONS}
          current={current}
          onSelect={setSection}
          statusMap={sectionStatusMap}
        />
      )}

      <main style={mainStyle}>
        {!isMobile && (
          <nav style={styles.leftNav}>
            {OPERATOR_SECTIONS.map((section) => {
              const status = sectionStatusMap[section.id] || 'unknown';
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setSection(section.id)}
                  style={{
                    ...styles.navBtn,
                    ...(status === 'complete' ? styles.navBtnComplete : null),
                    ...(status === 'incomplete' ? styles.navBtnIncomplete : null),
                    ...(FUNCTIONAL_SECTIONS.has(section.id) ? styles.navBtnFunctional : null),
                    ...(current === section.id ? styles.navBtnActive : null),
                  }}
                >
                  {section.title}
                </button>
              );
            })}
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
      <style jsx global>{`
        html, body, #__next {
          margin: 0;
          padding: 0;
          min-height: 100%;
        }

        html,
        body {
          background: #F6F7FB;
        }
      `}</style>
    </div>
  );
}

function MobileOperatorTabs({ sections, current, onSelect, statusMap }) {
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
        {sections.map((section) => {
          const status = statusMap?.[section.id] || 'unknown';
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              style={{
                ...styles.mobileTabBtn,
                ...(status === 'complete' ? styles.mobileTabBtnComplete : null),
                ...(status === 'incomplete' ? styles.mobileTabBtnIncomplete : null),
                ...(FUNCTIONAL_SECTIONS.has(section.id) ? styles.mobileTabBtnFunctional : null),
                ...(current === section.id ? styles.mobileTabBtnActive : null),
              }}
            >
              {section.title}
            </button>
          );
        })}
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
  headerRight: { display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' },
  headerRightMobile: { flex: '1 1 100%', justifyContent: 'flex-end' },
  walletBadge: {
    display: 'grid',
    gap: 4,
    padding: '8px 14px',
    borderRadius: 12,
    background: 'linear-gradient(120deg, rgba(39,227,218,0.16), rgba(247,184,78,0.18))',
    border: '1px solid rgba(39,227,218,0.25)',
    minWidth: 120,
    textAlign: 'right',
    boxShadow: '0 12px 30px -18px rgba(39,227,218,0.5)',
  },
  walletBadgeLabel: { fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0F172A' },
  walletBadgeValue: { fontSize: 18, fontWeight: 700, color: '#0F172A' },
  userIdentity: {
    display: 'grid',
    gap: 2,
    textAlign: 'right',
    minWidth: 0,
    maxWidth: 200,
  },
  userName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0F172A',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userEmail: {
    fontSize: 13,
    color: '#4B5563',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
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
  navBtnComplete: { borderColor: '#1E88E5', background: '#E3F2FD', color: '#0B3D91' },
  navBtnIncomplete: { borderColor: '#FB8C00', background: '#FFF4E5', color: '#7C3A00' },
  navBtnFunctional: { borderColor: '#27E3DA', background: '#E6FFFA', color: '#0F172A' },
  navBtnActive: { borderColor: '#27E3DA', boxShadow: '0 0 0 2px rgba(39,227,218,0.25)' },
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
  mobileTabBtnComplete: { borderColor: '#1E88E5', background: '#E3F2FD', color: '#0B3D91' },
  mobileTabBtnIncomplete: { borderColor: '#FB8C00', background: '#FFF4E5', color: '#7C3A00' },
  mobileTabBtnFunctional: { borderColor: '#27E3DA', background: '#E6FFFA', color: '#0F172A' },
  mobileTabBtnActive: { borderColor: '#27E3DA', boxShadow: '0 0 0 2px rgba(39,227,218,0.2)' },
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

import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase as sb } from '../../../utils/supabaseClient';
import { OPERATOR_DOCUMENTS_BUCKET, OPERATOR_LOGO_BUCKET } from '../../../utils/operatorStorageBuckets';
import { isAdminUser } from '../../../utils/authRoles';

const supabase = sb;

const formatDate = (value) => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString();
  } catch (error) {
    return String(value);
  }
};

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  } catch (error) {
    return String(value);
  }
};

const formatStatusLabel = (value) => {
  if (!value) return '—';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const CollapsibleSection = ({ title, description, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={styles.section}>
      <header style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>{title}</h2>
          {description ? <p style={styles.sectionDescription}>{description}</p> : null}
        </div>
        <button type="button" onClick={() => setOpen((prev) => !prev)} style={styles.toggleButton}>
          {open ? 'Collapse' : 'Expand'}
        </button>
      </header>
      {open ? <div>{children}</div> : null}
    </section>
  );
};

const KeyValueGrid = ({ items = [] }) => {
  if (!items.length) {
    return <div style={styles.emptyState}>No data available.</div>;
  }
  return (
    <dl style={styles.definitionList}>
      {items.map(({ label, value }) => (
        <div key={label} style={styles.definitionItem}>
          <dt style={styles.definitionTerm}>{label}</dt>
          <dd style={styles.definitionDescription}>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
};

const ActivityLog = ({ entries = [] }) => {
  if (!entries.length) {
    return <div style={styles.emptyState}>No activity logged yet.</div>;
  }
  return (
    <ol style={styles.activityList}>
      {entries.map((entry, index) => (
        <li key={`${entry.timestamp}-${index}`} style={styles.activityItem}>
          <div style={styles.activityTimestamp}>{formatDateTime(entry.timestamp)}</div>
          <div>
            <div style={styles.activityTitle}>{entry.title}</div>
            {entry.description ? (
              <div style={styles.activityDescription}>{formatStatusLabel(entry.description)}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
};

const STORAGE_URL_MATCH = /^https?:\/\/[^/]+\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/i;
const STORAGE_PATH_MATCH = /^\/?storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/i;

const sanitizeBucketName = (value) => (value ? value.replace(/^\/+|\/+$/g, '') : '');

const extractStorageReference = (value, fallbackBucket) => {
  const normalizedFallbackBucket = sanitizeBucketName(fallbackBucket);
  if (!value) {
    return { bucket: normalizedFallbackBucket, path: '' };
  }

  let raw = String(value).trim();
  if (!raw) {
    return { bucket: normalizedFallbackBucket, path: '' };
  }

  const urlMatch = raw.match(STORAGE_URL_MATCH);
  if (urlMatch) {
    return { bucket: sanitizeBucketName(urlMatch[2]), path: (urlMatch[3] || '').replace(/^\/+/, '') };
  }

  const pathMatch = raw.match(STORAGE_PATH_MATCH);
  if (pathMatch) {
    return { bucket: sanitizeBucketName(pathMatch[2]), path: (pathMatch[3] || '').replace(/^\/+/, '') };
  }

  raw = raw.replace(/^public\//i, '');

  const fallbackPrefix = normalizedFallbackBucket ? `${normalizedFallbackBucket}/` : '';
  if (fallbackPrefix && raw.startsWith(fallbackPrefix)) {
    return { bucket: normalizedFallbackBucket, path: raw.slice(fallbackPrefix.length).replace(/^\/+/, '') };
  }

  if (!normalizedFallbackBucket) {
    const dynamicMatch = raw.match(/^([^/]+)\/(.+)$/);
    if (dynamicMatch) {
      return { bucket: sanitizeBucketName(dynamicMatch[1]), path: (dynamicMatch[2] || '').replace(/^\/+/, '') };
    }
  }

  return { bucket: normalizedFallbackBucket, path: raw.replace(/^\/+/, '') };
};

const normalizeStoragePath = (value, bucket) => extractStorageReference(value, bucket).path;

const createSignedUrl = async (path, bucket) => {
  if (!path || !supabase) return '';
  const raw = String(path).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const { bucket: targetBucket, path: objectPath } = extractStorageReference(raw, bucket);
  if (!targetBucket || !objectPath) return '';

  const { data, error } = await supabase.storage.from(targetBucket).createSignedUrl(objectPath, 600);
  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }

  const { data: publicData } = supabase.storage.from(targetBucket).getPublicUrl(objectPath);
  if (publicData?.publicUrl) {
    return publicData.publicUrl;
  }

  return '';
};

const renderList = (items, renderItem, emptyLabel = 'No data available.') => {
  if (!Array.isArray(items) || items.length === 0) {
    return <div style={styles.emptyState}>{emptyLabel}</div>;
  }
  return <div style={styles.listStack}>{items.map(renderItem)}</div>;
};

const deriveInitials = (value) => {
  if (!value) return 'OP';
  const normalized = String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase());
  if (!normalized.length) return 'OP';
  return normalized.slice(0, 2).join('');
};

export default function OperatorDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');

  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [detail, setDetail] = useState(null);
  const [logoUrl, setLogoUrl] = useState('');

  const operatorId = useMemo(() => (Array.isArray(id) ? id[0] : id) || '', [id]);

  const initializeSession = useCallback(async () => {
    if (!supabase) {
      setAuthChecked(true);
      setAuthError('Supabase configuration missing.');
      return;
    }

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser && !isAdminUser(currentUser)) {
        await supabase.auth.signOut();
        setUser(null);
        setAuthError('Account not authorized for admin access.');
      } else {
        setUser(currentUser || null);
        setAuthError('');
      }
    } catch (error) {
      console.error('Failed to verify admin session', error);
      setAuthError('Unable to verify current session.');
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    initializeSession();

    if (!supabase) {
      return () => { active = false; };
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const sessionUser = session?.user || null;
      if (sessionUser && !isAdminUser(sessionUser)) {
        supabase.auth.signOut();
        if (!active) return;
        setUser(null);
        setAuthError('Account not authorized for admin access.');
        setAuthChecked(true);
        return;
      }
      setUser(sessionUser);
      if (sessionUser) {
        setAuthError('');
      }
      setAuthChecked(true);
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, [initializeSession]);

  const getFreshAccessToken = useCallback(async () => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      let session = data?.session || null;
      let accessToken = session?.access_token || null;
      if (!accessToken) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          throw new Error(refreshError.message || 'Session expired. Please sign in again.');
        }
        session = refreshed?.session || null;
        accessToken = session?.access_token || null;
      }
      return accessToken;
    } catch (error) {
      console.error('Failed to refresh admin token', error);
      return null;
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!operatorId) return;
    setLoading(true);
    setDataError('');
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        throw new Error('Unable to determine current session. Please sign in again.');
      }
      const response = await fetch(`/api/internal-enabler/operator/${operatorId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        const message = typeof payload?.error === 'string' && payload.error
          ? payload.error
          : `Request failed with status ${response.status}`;
        throw new Error(message);
      }
      setDetail(payload);
    } catch (error) {
      console.error('Failed to load operator detail', error);
      setDetail(null);
      setDataError(error?.message || 'Unable to load operator detail.');
    } finally {
      setLoading(false);
    }
  }, [operatorId, getFreshAccessToken]);

  useEffect(() => {
    if (!user || !operatorId) return;
    loadDetail();
  }, [user, operatorId, loadDetail]);

  const operatorName = useMemo(() => {
    const account = detail?.account || {};
    const profile = detail?.profile || {};
    return profile.legal_name || profile.trade_name || account.display_name || `Operator ${account.id || ''}`;
  }, [detail]);

  const summaryItems = useMemo(() => {
    const account = detail?.account || {};
    const type = detail?.type || {};
    return [
      { label: 'Operator ID', value: account.id || '—' },
      { label: 'Type', value: type.name || type.code || '—' },
      { label: 'Account status', value: formatStatusLabel(account.status) },
      { label: 'Wizard status', value: formatStatusLabel(account.wizard_status) },
      { label: 'Display name', value: account.display_name || '—' },
      { label: 'Auth user ID', value: account.auth_user_id || '—' },
      { label: 'Created at', value: formatDateTime(account.created_at) },
      { label: 'Updated at', value: formatDateTime(account.updated_at) },
    ];
  }, [detail]);

  const accountItems = useMemo(() => {
    const account = detail?.account || {};
    const profile = detail?.profile || {};
    const contact = detail?.contact || {};
    return [
      { label: 'Account email', value: account.email || contact.email_primary || '—' },
      { label: 'Legal entity', value: profile.legal_name || account.legal_name || '—' },
      { label: 'Trade name', value: profile.trade_name || account.trade_name || '—' },
      { label: 'VAT number', value: profile.vat_number || account.vat_number || '—' },
      { label: 'Country', value: profile.country || account.country || '—' },
      { label: 'Last login', value: formatDateTime(account.last_login_at) },
      { label: 'Last activity', value: formatDateTime(account.last_activity_at) },
      { label: 'Type ID', value: account.type_id || '—' },
      { label: 'Onboarding completed at', value: formatDateTime(account.onboarded_at) },
    ];
  }, [detail]);

  const profileItems = useMemo(() => {
    const profile = detail?.profile || {};
    if (!Object.keys(profile).length) return [];
    return [
      { label: 'Legal name', value: profile.legal_name || '—' },
      { label: 'Trade name', value: profile.trade_name || '—' },
      { label: 'Website', value: profile.website || '—' },
      { label: 'Registration number', value: profile.registration_number || '—' },
      { label: 'Country of registration', value: profile.country || '—' },
      { label: 'Headquarters city', value: profile.city || '—' },
      { label: 'Address line 1', value: profile.address1 || '—' },
      { label: 'Address line 2', value: profile.address2 || '—' },
      { label: 'State / Region', value: profile.state_region || '—' },
      { label: 'Postal code', value: profile.postal_code || '—' },
      { label: 'Description', value: profile.description || '—' },
      { label: 'Profile created at', value: formatDateTime(profile.created_at) },
      { label: 'Profile updated at', value: formatDateTime(profile.updated_at) },
    ];
  }, [detail]);

  const contactItems = useMemo(() => {
    const contact = detail?.contact || {};
    return [
      { label: 'Primary email', value: contact.email_primary || '—' },
      { label: 'Billing email', value: contact.email_billing || '—' },
      { label: 'Secondary email', value: contact.email_secondary || '—' },
      { label: 'Phone', value: contact.phone_e164 || contact.phone || '—' },
      { label: 'Phone (national)', value: contact.phone_national || '—' },
      { label: 'Phone verified at', value: formatDateTime(contact.phone_verified_at) },
      { label: 'Contact created at', value: formatDateTime(contact.created_at) },
      { label: 'Updated at', value: formatDateTime(contact.updated_at) },
    ];
  }, [detail]);

  const verificationRequests = useMemo(() => detail?.verificationRequests || [], [detail]);
  const socialProfiles = useMemo(() => detail?.socialProfiles || [], [detail]);
  const documents = useMemo(() => detail?.documents || [], [detail]);
  const activityEntries = useMemo(() => detail?.activity || [], [detail]);

  const rawLogoReference = useMemo(() => {
    const profileLogo = detail?.profile?.logo_url;
    if (profileLogo) return profileLogo;
    const accountLogo = detail?.account?.logo_url;
    if (accountLogo) return accountLogo;
    return '';
  }, [detail]);

  useEffect(() => {
    let active = true;
    const resolveLogoUrl = async () => {
      const raw = (rawLogoReference || '').trim();
      if (!raw) {
        if (active) setLogoUrl('');
        return;
      }
      if (/^https?:\/\//i.test(raw)) {
        if (active) setLogoUrl(raw);
        return;
      }
      const signed = await createSignedUrl(raw, OPERATOR_LOGO_BUCKET);
      if (!active) return;
      setLogoUrl(signed || raw || '');
    };
    resolveLogoUrl();
    return () => {
      active = false;
    };
  }, [rawLogoReference]);

  const operatorInitials = useMemo(() => deriveInitials(operatorName), [operatorName]);

  const brandingItems = useMemo(() => {
    const account = detail?.account || {};
    const profile = detail?.profile || {};
    const items = [];
    const logoReference = profile.logo_url || account.logo_url || '';
    const website = profile.website || account.website || '';
    items.push({ label: 'Logo reference', value: logoReference || '—' });
    items.push({
      label: 'Website',
      value: website
        ? (
          <a href={website} target="_blank" rel="noopener noreferrer" style={styles.link}>
            {website}
          </a>
        )
        : '—',
    });
    if (account.display_name) {
      items.push({ label: 'Display name', value: account.display_name });
    }
    if (account.email) {
      items.push({ label: 'Account email', value: account.email });
    }
    if (profile.logo_updated_at || profile.updated_at) {
      items.push({ label: 'Logo updated at', value: formatDateTime(profile.logo_updated_at || profile.updated_at) });
    }
    return items;
  }, [detail]);

  const handleOpenLogo = useCallback(() => {
    if (!logoUrl) return;
    if (typeof window !== 'undefined') {
      window.open(logoUrl, '_blank', 'noopener,noreferrer');
    }
  }, [logoUrl]);

  const openDocument = useCallback(async (path) => {
    const url = await createSignedUrl(path, OPERATOR_DOCUMENTS_BUCKET);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  if (!authChecked) {
    return (
      <div style={styles.fullPage}>Checking permissions…</div>
    );
  }

  if (!user) {
    return (
      <div style={styles.fullPage}>
        <div style={styles.accessCard}>
          <h1 style={styles.cardTitle}>Admin access required</h1>
          <p style={styles.cardDescription}>
            Please sign in from the <a href="/internal-enabler" style={styles.link}>Internal enabler overview</a> to view operator details.
          </p>
          {authError ? <div style={styles.cardError}>{authError}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.pageHeader}>
        <div style={styles.headerContent}>
          <a href="/internal-enabler" style={styles.backLink}>← Back to overview</a>
          <div style={styles.identityRow}>
            <div style={styles.identityLogo}>
              {logoUrl ? (
                <img src={logoUrl} alt={`${operatorName} logo`} style={styles.identityLogoImage} />
              ) : (
                <div style={styles.identityLogoFallback}>{operatorInitials}</div>
              )}
            </div>
            <div>
              <h1 style={styles.pageTitle}>{operatorName}</h1>
              <p style={styles.pageSubtitle}>Detailed operator dossier with collapsible sections.</p>
              {rawLogoReference ? (
                <div style={styles.logoMetaRow}>
                  <span style={styles.logoMetaLabel}>Logo source:</span>
                  <span style={styles.logoMetaValue}>{rawLogoReference}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div style={styles.headerActions}>
          <button type="button" onClick={loadDetail} style={styles.secondaryButton} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh data'}
          </button>
          {logoUrl ? (
            <button type="button" onClick={handleOpenLogo} style={styles.ghostButton}>
              Open logo
            </button>
          ) : null}
        </div>
      </header>

      {dataError ? <div style={styles.errorBanner}>{dataError}</div> : null}
      {loading && !detail ? (
        <div style={styles.loadingState}>Loading operator details…</div>
      ) : null}

      {detail ? (
        <>
          <CollapsibleSection title="Summary" description="Primary account status at a glance.">
            <KeyValueGrid items={summaryItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Account information" description="Core account metadata.">
            <KeyValueGrid items={accountItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Organisation profile">
            <KeyValueGrid items={profileItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Contacts">
            <KeyValueGrid items={contactItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Brand assets" description="Operator logo and related metadata." defaultOpen={!!logoUrl}>
            <div style={styles.brandLayout}>
              <div style={styles.brandPreview}>
                <div style={styles.brandPreviewBox}>
                  {logoUrl ? (
                    <img src={logoUrl} alt={`${operatorName} logo`} style={styles.brandLogoImage} />
                  ) : (
                    <div style={styles.brandLogoFallback}>{operatorInitials}</div>
                  )}
                </div>
                <div style={styles.brandActions}>
                  {logoUrl ? (
                    <button type="button" onClick={handleOpenLogo} style={styles.documentButton}>
                      Open logo
                    </button>
                  ) : (
                    <span style={styles.brandEmpty}>Logo not available</span>
                  )}
                </div>
              </div>
              <div style={styles.brandMeta}>
                <KeyValueGrid items={brandingItems} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Verification timeline" description="History of submitted verification requests.">
            {renderList(verificationRequests, (request) => (
              <article key={request.id} style={styles.card}>
                <header style={styles.cardHeader}>
                  <div style={styles.cardTitleRow}>
                    <span style={styles.cardTitleText}>Request #{request.id}</span>
                    <span style={styles.cardMeta}>{formatStatusLabel(request.state)}</span>
                  </div>
                  <div style={styles.cardMeta}>Submitted: {formatDateTime(request.submitted_at)}</div>
                </header>
                <div style={styles.cardContent}>
                  <div style={styles.cardDetail}><strong>Reason:</strong> {request.reason || '—'}</div>
                  <div style={styles.cardDetail}><strong>Created:</strong> {formatDateTime(request.created_at)}</div>
                  <div style={styles.cardDetail}><strong>Updated:</strong> {formatDateTime(request.updated_at)}</div>
                </div>
              </article>
            ), 'No verification requests recorded.')}
          </CollapsibleSection>

          <CollapsibleSection title="Verification documents" description="Latest uploaded compliance files." defaultOpen={false}>
            {renderList(documents, (doc) => (
              <div key={`${doc.id}-${doc.file_key}`} style={styles.documentRow}>
                <div>
                  <div style={styles.documentTitle}>{formatStatusLabel(doc.doc_type) || 'Document'}</div>
                  <div style={styles.documentMeta}>{doc.file_key}</div>
                </div>
                <button
                  type="button"
                  style={styles.documentButton}
                  onClick={() => openDocument(doc.file_key)}
                  disabled={!doc.file_key}
                >
                  Open
                </button>
              </div>
            ), 'No documents available yet.')}
          </CollapsibleSection>

          <CollapsibleSection title="Social presence">
            {renderList(socialProfiles, (row) => (
              <div key={row.id} style={styles.socialRow}>
                <span style={styles.socialPlatform}>{formatStatusLabel(row.platform || '')}</span>
                {row.url ? (
                  <a href={row.url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                    {row.url || row.handle || 'View profile'}
                  </a>
                ) : (
                  <span style={styles.socialPlaceholder}>{row.handle || '—'}</span>
                )}
              </div>
            ), 'No social profiles provided.')}
          </CollapsibleSection>

          <CollapsibleSection title="Activity log" description="Last updates, logins and verification milestones." defaultOpen={false}>
            <ActivityLog entries={activityEntries} />
          </CollapsibleSection>
        </>
      ) : null}
    </div>
  );
}

const styles = {
  fullPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    background: '#F8FAFC',
    color: '#0F172A',
    padding: 24,
  },
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '32px 24px 80px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#0F172A',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  headerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
  },
  backLink: {
    display: 'inline-block',
    marginBottom: 12,
    color: '#2563EB',
    textDecoration: 'none',
    fontWeight: 600,
  },
  identityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  identityLogo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: '#E2E8F0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  identityLogoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    background: '#FFFFFF',
  },
  identityLogoFallback: {
    fontSize: 20,
    fontWeight: 700,
    color: '#0F172A',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 800,
    margin: 0,
  },
  pageSubtitle: {
    marginTop: 4,
    color: '#475569',
    maxWidth: 520,
  },
  logoMetaRow: {
    marginTop: 8,
    fontSize: 13,
    color: '#475569',
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  logoMetaLabel: {
    fontWeight: 600,
  },
  logoMetaValue: {
    wordBreak: 'break-all',
  },
  secondaryButton: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #CBD5E1',
    background: '#FFFFFF',
    cursor: 'pointer',
    fontWeight: 600,
    minWidth: 140,
  },
  ghostButton: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.6)',
    background: '#F8FAFC',
    cursor: 'pointer',
    fontWeight: 600,
  },
  section: {
    background: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    boxShadow: '0 16px 30px rgba(15, 23, 42, 0.06)',
    border: '1px solid rgba(15,23,42,0.05)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
  },
  sectionDescription: {
    marginTop: 6,
    color: '#64748B',
    fontSize: 14,
  },
  toggleButton: {
    border: '1px solid #CBD5E1',
    borderRadius: 8,
    padding: '6px 12px',
    background: '#F8FAFC',
    cursor: 'pointer',
    fontWeight: 600,
  },
  definitionList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    margin: 0,
  },
  definitionItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 12,
    background: '#F8FAFC',
    borderRadius: 12,
    border: '1px solid rgba(15,23,42,0.04)',
  },
  definitionTerm: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#64748B',
  },
  definitionDescription: {
    fontSize: 15,
    color: '#0F172A',
    wordBreak: 'break-word',
  },
  emptyState: {
    padding: 16,
    borderRadius: 12,
    background: '#F1F5F9',
    color: '#475569',
    textAlign: 'center',
  },
  listStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  card: {
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 14,
    padding: 16,
    background: '#FFFFFF',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitleRow: {
    display: 'flex',
    flexDirection: 'column',
  },
  cardTitleText: {
    fontSize: 16,
    fontWeight: 700,
  },
  cardMeta: {
    fontSize: 13,
    color: '#64748B',
  },
  cardContent: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  cardDetail: {
    fontSize: 14,
    color: '#1E293B',
  },
  documentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    border: '1px solid rgba(15,23,42,0.08)',
    background: '#FFFFFF',
  },
  documentTitle: {
    fontWeight: 600,
  },
  documentMeta: {
    fontSize: 13,
    color: '#64748B',
  },
  documentButton: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #CBD5E1',
    background: '#F8FAFC',
    cursor: 'pointer',
    fontWeight: 600,
  },
  brandLayout: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 24,
  },
  brandPreview: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
    minWidth: 200,
  },
  brandPreviewBox: {
    width: 180,
    height: 180,
    borderRadius: 24,
    border: '1px solid rgba(15,23,42,0.1)',
    background: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  brandLogoFallback: {
    fontSize: 40,
    fontWeight: 800,
    color: '#0F172A',
  },
  brandActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  brandEmpty: {
    color: '#64748B',
    fontSize: 14,
  },
  brandMeta: {
    flex: 1,
    minWidth: 240,
  },
  socialRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    border: '1px solid rgba(15,23,42,0.08)',
    background: '#FFFFFF',
  },
  socialPlatform: {
    fontWeight: 600,
    color: '#1E293B',
  },
  socialPlaceholder: {
    color: '#64748B',
    fontSize: 14,
  },
  activityList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  activityItem: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
  },
  activityTimestamp: {
    width: 200,
    fontSize: 13,
    color: '#64748B',
  },
  activityTitle: {
    fontWeight: 600,
    fontSize: 15,
  },
  activityDescription: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  errorBanner: {
    marginBottom: 24,
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid rgba(220, 38, 38, 0.2)',
    background: 'rgba(254, 226, 226, 0.7)',
    color: '#B91C1C',
  },
  loadingState: {
    marginBottom: 24,
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid rgba(37, 99, 235, 0.2)',
    background: 'rgba(219, 234, 254, 0.7)',
    color: '#1D4ED8',
  },
  accessCard: {
    maxWidth: 420,
    width: '100%',
    background: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    boxShadow: '0 20px 45px rgba(15, 23, 42, 0.08)',
    border: '1px solid rgba(15,23,42,0.05)',
    textAlign: 'center',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 8,
  },
  cardDescription: {
    color: '#475569',
    fontSize: 14,
  },
  cardError: {
    marginTop: 16,
    padding: '10px 12px',
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#B91C1C',
    borderRadius: 10,
    fontSize: 13,
  },
  link: {
    color: '#2563EB',
    textDecoration: 'none',
    fontWeight: 600,
  },
};

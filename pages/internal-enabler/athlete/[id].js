import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase as sb } from '../../../utils/supabaseClient';
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
              <div style={styles.activityDescription}>{entry.description}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
};

const createSignedUrl = async (path, bucket = 'documents') => {
  if (!path || !supabase) return '';
  const normalized = String(path).trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(normalized, 60);
  if (error) return '';
  return data?.signedUrl || '';
};

const renderList = (items, renderItem, emptyLabel = 'No data available.') => {
  if (!Array.isArray(items) || items.length === 0) {
    return <div style={styles.emptyState}>{emptyLabel}</div>;
  }
  return <div style={styles.listStack}>{items.map(renderItem)}</div>;
};

export default function AthleteDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');

  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [detail, setDetail] = useState(null);

  const athleteId = useMemo(() => (Array.isArray(id) ? id[0] : id) || '', [id]);

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
    if (!athleteId) return;
    setLoading(true);
    setDataError('');
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        throw new Error('Unable to determine current session. Please sign in again.');
      }
      const response = await fetch(`/api/internal-enabler/athlete/${athleteId}`, {
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
      console.error('Failed to load athlete detail', error);
      setDetail(null);
      setDataError(error?.message || 'Unable to load athlete detail.');
    } finally {
      setLoading(false);
    }
  }, [athleteId, getFreshAccessToken]);

  useEffect(() => {
    if (!user || !athleteId) return;
    loadDetail();
  }, [user, athleteId, loadDetail]);

  const fullName = useMemo(() => {
    if (!detail?.athlete) return '—';
    const { first_name, last_name } = detail.athlete;
    const composed = `${last_name || ''} ${first_name || ''}`.trim();
    return composed || '—';
  }, [detail]);

  const summaryItems = useMemo(() => {
    const athlete = detail?.athlete || {};
    const contacts = detail?.contacts || {};
    return [
      { label: 'Athlete ID', value: athlete.id || '—' },
      { label: 'Status', value: formatStatusLabel(contacts.review_status || athlete.review_status) },
      { label: 'Residence', value: [contacts.residence_city, contacts.residence_country].filter(Boolean).join(', ') || '—' },
      { label: 'Phone', value: athlete.phone || contacts.phone || '—' },
      { label: 'Created at', value: formatDateTime(athlete.created_at) },
      { label: 'Updated at', value: formatDateTime(athlete.updated_at) },
    ];
  }, [detail]);

  const personalItems = useMemo(() => {
    const athlete = detail?.athlete || {};
    const contacts = detail?.contacts || {};
    return [
      { label: 'First name', value: athlete.first_name || '—' },
      { label: 'Last name', value: athlete.last_name || '—' },
      { label: 'Date of birth', value: formatDate(athlete.date_of_birth) },
      { label: 'Nationality', value: athlete.nationality || '—' },
      { label: 'Gender', value: athlete.gender || '—' },
      { label: 'Preferred foot', value: athlete.preferred_foot || '—' },
      { label: 'ID verification', value: contacts.id_verified ? 'Verified' : 'Not verified' },
      { label: 'Verification status', value: formatStatusLabel(contacts.review_status) },
      { label: 'Verification notes', value: contacts.rejected_reason || '—' },
      { label: 'Document type', value: contacts.id_document_type || '—' },
      { label: 'Submission date', value: formatDateTime(contacts.submitted_at) },
      { label: 'Verification updated', value: formatDateTime(contacts.verification_status_changed_at) },
    ];
  }, [detail]);

  const sportsItems = useMemo(() => {
    const current = detail?.sports?.[0] || null;
    if (!current) return [];
    return [
      { label: 'Sport', value: current.sport || '—' },
      { label: 'Role', value: current.role || '—' },
      { label: 'Secondary role', value: current.secondary_role || '—' },
      { label: 'Team', value: current.team || '—' },
      { label: 'Category', value: current.category || '—' },
      { label: 'Playing style', value: current.playing_style || '—' },
      { label: 'Contract status', value: formatStatusLabel(current.contract_status) },
      { label: 'Contract end date', value: formatDate(current.contract_end_date) },
      { label: 'Seeking team', value: current.seeking_team ? 'Yes' : 'No' },
      { label: 'Preferred regions', value: Array.isArray(current.preferred_regions) ? current.preferred_regions.join(', ') : current.preferred_regions || '—' },
      { label: 'Trial window', value: current.trial_window || '—' },
      { label: 'Agent name', value: current.agent_name || '—' },
      { label: 'Agency name', value: current.agency_name || '—' },
    ];
  }, [detail]);

  const physicalItems = useMemo(() => {
    const physical = detail?.physical || {};
    if (!Object.keys(physical).length) return [];
    return [
      { label: 'Height (cm)', value: physical.height_cm ?? '—' },
      { label: 'Weight (kg)', value: physical.weight_kg ?? '—' },
      { label: 'Wingspan (cm)', value: physical.wingspan_cm ?? '—' },
      { label: 'Dominant hand', value: physical.dominant_hand || '—' },
      { label: 'Updated at', value: formatDateTime(physical.updated_at) },
    ];
  }, [detail]);

  const socialItems = useMemo(() => {
    const socials = detail?.social || [];
    return socials.map((row) => ({
      label: row.platform || row.handle || row.url || `Social ${row.id}`,
      value: row.url || row.handle || '—',
    }));
  }, [detail]);

  const awardCards = useMemo(() => detail?.awards || [], [detail]);

  const careerCards = useMemo(() => detail?.career || [], [detail]);

  const mediaGroups = useMemo(() => {
    const grouped = detail?.media?.grouped || {};
    const entries = Object.entries(grouped).map(([key, items]) => ({ key, items }));
    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }, [detail]);

  const activityEntries = useMemo(() => detail?.activity || [], [detail]);

  const openDocument = useCallback(async (path) => {
    const url = await createSignedUrl(path);
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
            Please sign in from the <a href="/internal-enabler" style={styles.link}>Internal enabler overview</a> to view athlete details.
          </p>
          {authError ? <div style={styles.cardError}>{authError}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.pageHeader}>
        <div>
          <a href="/internal-enabler" style={styles.backLink}>← Back to overview</a>
          <h1 style={styles.pageTitle}>{fullName}</h1>
          <p style={styles.pageSubtitle}>Comprehensive identity overview with collapsible sections.</p>
        </div>
        <div>
          <button type="button" onClick={loadDetail} style={styles.secondaryButton} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
      </header>

      {dataError ? <div style={styles.errorBanner}>{dataError}</div> : null}

      {loading && !detail ? (
        <div style={styles.loadingState}>Loading athlete details…</div>
      ) : null}

      {detail ? (
        <>
          <CollapsibleSection title="Summary" description="Key information at a glance.">
            <KeyValueGrid items={summaryItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Personal information">
            <KeyValueGrid items={personalItems} />
            <div style={styles.docActions}>
              <button
                type="button"
                style={styles.documentButton}
                disabled={!detail?.contacts?.id_document_url}
                onClick={() => openDocument(detail?.contacts?.id_document_url)}
              >
                View ID document
              </button>
              <button
                type="button"
                style={styles.documentButton}
                disabled={!detail?.contacts?.id_selfie_url}
                onClick={() => openDocument(detail?.contacts?.id_selfie_url)}
              >
                View face photo
              </button>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Current sport focus" description="Latest sports experience submitted.">
            <KeyValueGrid items={sportsItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Career history" description="Complete list of previous clubs and seasons.">
            {renderList(careerCards, (row) => (
              <article key={row.id} style={styles.card}>
                <header style={styles.cardHeader}>
                  <div style={styles.cardTitleRow}>
                    <span style={styles.cardTitleText}>{row.team || 'Unknown team'}</span>
                    <span style={styles.cardMeta}>{row.country || row.league || ''}</span>
                  </div>
                  <div style={styles.cardMeta}>{row.season_start || ''}{row.season_end ? ` / ${row.season_end}` : ''}</div>
                </header>
                <div style={styles.cardContent}>
                  <div style={styles.cardDetail}><strong>Role:</strong> {row.role || '—'}</div>
                  <div style={styles.cardDetail}><strong>Appearances:</strong> {row.matches_played ?? '—'}</div>
                  <div style={styles.cardDetail}><strong>Goals:</strong> {row.goals ?? '—'}</div>
                  <div style={styles.cardDetail}><strong>Assists:</strong> {row.assists ?? '—'}</div>
                  <div style={styles.cardDetail}><strong>Notes:</strong> {row.notes || '—'}</div>
                </div>
              </article>
            ), 'No career entries recorded.')}
          </CollapsibleSection>

          <CollapsibleSection title="Physical data" description="Latest measurements provided.">
            <KeyValueGrid items={physicalItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Social presence" description="Links to athlete social profiles.">
            <KeyValueGrid items={socialItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Awards & recognitions">
            {renderList(awardCards, (row) => (
              <article key={row.id} style={styles.card}>
                <header style={styles.cardHeader}>
                  <div style={styles.cardTitleRow}>
                    <span style={styles.cardTitleText}>{row.title || row.competition || 'Award'}</span>
                    <span style={styles.cardMeta}>{formatDate(row.date_awarded) }</span>
                  </div>
                </header>
                <div style={styles.cardContent}>
                  <div style={styles.cardDetail}><strong>Competition:</strong> {row.competition || '—'}</div>
                  <div style={styles.cardDetail}><strong>Result:</strong> {row.result || '—'}</div>
                  <div style={styles.cardDetail}><strong>Description:</strong> {row.description || '—'}</div>
                </div>
              </article>
            ), 'No awards recorded yet.')}
          </CollapsibleSection>

          <CollapsibleSection title="Media library" description="Signed assets grouped by category.">
            {mediaGroups.length === 0 ? (
              <div style={styles.emptyState}>No media uploaded.</div>
            ) : (
              <div style={styles.mediaGrid}>
                {mediaGroups.map(({ key, items }) => (
                  <div key={key} style={styles.mediaColumn}>
                    <h3 style={styles.mediaTitle}>{formatStatusLabel(key)}</h3>
                    <ul style={styles.mediaList}>
                      {items.map((item) => (
                        <li key={item.id} style={styles.mediaItem}>
                          <div style={styles.mediaItemTitle}>{item.title || item.caption || `Media #${item.id}`}</div>
                          <div style={styles.mediaItemMeta}>Uploaded: {formatDateTime(item.created_at)}</div>
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" style={styles.link}>Open</a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Activity log" description="Latest status changes, logins and submissions." defaultOpen={false}>
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
  backLink: {
    display: 'inline-block',
    marginBottom: 12,
    color: '#2563EB',
    textDecoration: 'none',
    fontWeight: 600,
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
  secondaryButton: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #CBD5E1',
    background: '#FFFFFF',
    cursor: 'pointer',
    fontWeight: 600,
    minWidth: 140,
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
  mediaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 20,
  },
  mediaColumn: {
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 14,
    padding: 16,
    background: '#F8FAFC',
  },
  mediaTitle: {
    margin: '0 0 12px',
    fontSize: 16,
    fontWeight: 700,
  },
  mediaList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  mediaItem: {
    borderRadius: 12,
    padding: 12,
    background: '#FFFFFF',
    border: '1px solid rgba(15,23,42,0.05)',
  },
  mediaItemTitle: {
    fontWeight: 600,
    marginBottom: 4,
  },
  mediaItemMeta: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 6,
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
  docActions: {
    marginTop: 16,
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  documentButton: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #CBD5E1',
    background: '#F8FAFC',
    cursor: 'pointer',
    fontWeight: 600,
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

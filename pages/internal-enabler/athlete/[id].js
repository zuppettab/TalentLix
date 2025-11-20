import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase as sb } from '../../../utils/supabaseClient';
import { isAdminUser } from '../../../utils/authRoles';
import { buildEmailPayload, sendEmailWithSupabase } from '../../../utils/emailClient';

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

const formatPercentage = (value) => {
  const percentage = Number(value);
  if (!Number.isFinite(percentage)) return '—';
  return `${Math.round(percentage)}%`;
};

const formatYesNo = (value) => {
  if (value === null || value === undefined) return '—';
  return value ? 'Yes' : 'No';
};

const formatSeason = (start, end) => {
  const normalizedStart = start ? String(start) : '';
  const normalizedEnd = end ? String(end) : '';
  if (normalizedStart && normalizedEnd) {
    const endSuffix = normalizedEnd.length === 4 ? normalizedEnd.slice(2) : normalizedEnd;
    return `${normalizedStart}/${endSuffix}`;
  }
  return normalizedStart || normalizedEnd || '—';
};

const contractStatusText = (value) => {
  switch (value) {
    case 'free_agent':
      return 'Free agent';
    case 'under_contract':
      return 'Under contract';
    case 'on_loan':
      return 'On loan';
    default:
      return '—';
  }
};

const MEDIA_CATEGORY_MAP = {
  featured_headshot: 'featured_photos',
  featured_game1: 'full_games',
  featured_game2: 'full_games',
  game: 'full_games',
  intro: 'intro',
  highlight: 'highlights',
  gallery: 'gallery',
};

const MEDIA_LABELS = {
  featured_photos: 'Featured photos',
  intro: 'Intro',
  highlights: 'Highlights',
  full_games: 'Full games',
  gallery: 'Gallery',
};

const MEDIA_ORDER = ['featured_photos', 'intro', 'highlights', 'full_games', 'gallery'];

const mapMediaCategoryKey = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return 'uncategorized';
  return MEDIA_CATEGORY_MAP[normalized] || normalized;
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
      {items.map(({ label, value, key }, index) => {
        const entryKey = key || `${label || 'item'}-${index}`;
        return (
          <div key={entryKey} style={styles.definitionItem}>
            <dt style={styles.definitionTerm}>{label}</dt>
            <dd style={styles.definitionDescription}>{value ?? '—'}</dd>
          </div>
        );
      })}
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
  const [actionBusy, setActionBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [athleteEmail, setAthleteEmail] = useState('');
  const [athleteFullName, setAthleteFullName] = useState('TalentLix athlete');

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
    setActionError('');
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

  useEffect(() => {
    if (!detail) return;

    const athlete = detail?.athlete || {};
    const contacts = detail?.contacts || {};

    const firstName = athlete.first_name || contacts.first_name || '';
    const lastName = athlete.last_name || contacts.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    const emailFromContacts = contacts.athlete_email || '';
    const emailFromAthlete = athlete.email || '';
    const resolvedEmail = (emailFromContacts || emailFromAthlete || '').trim().toLowerCase();

    setAthleteFullName(fullName || 'TalentLix athlete');
    setAthleteEmail(resolvedEmail);
  }, [detail]);

  const openDocument = useCallback(async (path) => {
    const url = await createSignedUrl(path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const sendOutcomeNotificationFromPage = useCallback(async (outcome, reasonRaw) => {
    const to = (athleteEmail || '').trim();
    if (!to) {
      console.warn('[AthleteDetail] Missing athlete email, skipping outcome notification');
      return;
    }

    const fullName = athleteFullName || 'TalentLix athlete';
    const outcomeKey = outcome === 'approved' ? 'approved' : 'rejected';

    let subject;
    let text;
    let html;

    if (outcomeKey === 'approved') {
      subject = 'Your identity verification has been approved';
      const body =
        'The documentation for your verified identification has been approved successfully. This increases the completion percentage of your profile and the trust that operators and clubs place in you. Good luck!';

      text = `Dear ${fullName},\n\n${body}\n\nTalentLix Team`;
      html = `<p>Dear ${fullName},</p><p>${body}</p><p>TalentLix Team</p>`;
    } else {
      subject = 'Your identity verification was not approved';

      const reason = (reasonRaw || '').toString().trim();
      const reasonText = reason
        ? `Reasons provided by our internal team: ${reason}`
        : 'Reasons provided by our internal team: not specified.';

      const safeReason = reason.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      text = `Dear ${fullName},\n\nThe documentation you submitted has been reviewed and unfortunately your verified identity was not approved. ${reasonText}\n\nDo not worry, you can submit a new request right away with the necessary corrections.\n\nTalentLix Team`;

      const htmlReason = reason
        ? `<p><strong>Reasons provided:</strong> ${safeReason}</p>`
        : '<p><strong>Reasons provided:</strong> Not specified.</p>';

      html = `<p>Dear ${fullName},</p><p>The documentation you submitted has been reviewed and unfortunately your verified identity was not approved.</p>${htmlReason}<p>Do not worry, you can submit a new request right away with the necessary corrections.</p><p>TalentLix Team</p>`;
    }

    try {
      const payload = buildEmailPayload({ to, subject, text, html });
      await sendEmailWithSupabase(supabase, payload);
    } catch (err) {
      console.error('[AthleteDetail] Outcome email failed', err);
    }
  }, [athleteEmail, athleteFullName]);

  const performAthleteAction = useCallback(async (action, reason) => {
    if (!athleteId) return;
    setActionError('');
    setActionBusy(action);
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        throw new Error('Unable to determine current session. Please sign in again.');
      }

      const response = await fetch('/api/internal-enabler/athletes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, athleteId, reason }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload?.error === 'string' && payload.error
          ? payload.error
          : `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      if (action === 'approve') {
        await sendOutcomeNotificationFromPage('approved');
      } else if (action === 'reject') {
        await sendOutcomeNotificationFromPage('rejected', reason);
      }

      await loadDetail();
    } catch (error) {
      console.error('Failed to perform athlete action', error);
      setActionError(error?.message || 'Unable to update athlete verification.');
    } finally {
      setActionBusy('');
    }
  }, [athleteId, getFreshAccessToken, loadDetail, sendOutcomeNotificationFromPage]);

  const fullName = useMemo(() => {
    if (!detail?.athlete) return '—';
    const { first_name, last_name } = detail.athlete;
    const composed = `${first_name || ''} ${last_name || ''}`.trim();
    return composed || '—';
  }, [detail]);

  const summaryItems = useMemo(() => {
    const athlete = detail?.athlete || {};
    const contacts = detail?.contacts || {};
    const phone = athlete.phone || contacts.phone_number || contacts.phone || '';
    const residenceParts = [contacts.residence_city, contacts.residence_country].filter(Boolean);
    return [
      { label: 'Full name', value: fullName },
      { label: 'Email', value: contacts.athlete_email || '—' },
      { label: 'Phone', value: phone || '—' },
      { label: 'Residence', value: residenceParts.join(', ') || '—' },
      { label: 'Profile completion', value: formatPercentage(athlete.completion_percentage) },
      { label: 'Review status (admin)', value: formatStatusLabel(contacts.review_status) },
      { label: 'Athlete ID', value: athlete.id || '—' },
      { label: 'Created at', value: formatDateTime(athlete.created_at) },
      { label: 'Updated at', value: formatDateTime(athlete.updated_at) },
    ];
  }, [detail, fullName]);

  const personalItems = useMemo(() => {
    const athlete = detail?.athlete || {};
    return [
      { label: 'Date of birth', value: formatDate(athlete.date_of_birth) },
      { label: 'Nationality', value: athlete.nationality || '—' },
      { label: 'Birth city', value: athlete.birth_city || '—' },
      { label: 'Native language', value: athlete.native_language || '—' },
      { label: 'Additional language', value: athlete.additional_language || '—' },
      { label: 'Gender', value: athlete.gender || '—' },
      { label: 'Preferred foot', value: athlete.preferred_foot || '—' },
    ];
  }, [detail]);

  const contactsAdminItems = useMemo(() => {
    const contacts = detail?.contacts || {};
    const reviewLabel = formatStatusLabel(contacts.review_status);
    const reviewValue = contacts.rejected_reason
      ? (
        <div>
          <div>{reviewLabel}</div>
          <div style={styles.mutedText}>{contacts.rejected_reason}</div>
        </div>
      )
      : reviewLabel;

    return [
      { label: 'Phone verified', value: formatYesNo(contacts.phone_verified) },
      { label: 'ID verified', value: formatYesNo(contacts.id_verified) },
      { label: 'Document type', value: contacts.id_document_type || '—' },
      { label: 'Submission date', value: formatDateTime(contacts.submitted_at) },
      { label: 'Verification updated', value: formatDateTime(contacts.verification_status_changed_at) },
      { label: 'Review status / notes', value: reviewValue },
      {
        label: 'ID document',
        value: contacts.id_document_url
          ? (
            <button
              type="button"
              style={styles.inlineActionButton}
              onClick={() => openDocument(contacts.id_document_url)}
            >
              Open document
            </button>
          )
          : '—',
      },
      {
        label: 'Selfie',
        value: contacts.id_selfie_url
          ? (
            <button
              type="button"
              style={styles.inlineActionButton}
              onClick={() => openDocument(contacts.id_selfie_url)}
            >
              Open selfie
            </button>
          )
          : '—',
      },
    ];
  }, [detail, openDocument]);

  const sportsItems = useMemo(() => {
    const current = detail?.sports?.[0] || null;
    if (!current) return [];
    const agentAgency = [current.agent_name, current.agency_name].filter(Boolean).join(' · ');
    const preferredRegions = Array.isArray(current.preferred_regions)
      ? current.preferred_regions.filter(Boolean).join(', ') || '—'
      : current.preferred_regions || '—';
    return [
      { label: 'Sport', value: current.sport || '—' },
      { label: 'Role', value: current.role || '—' },
      { label: 'Secondary role', value: current.secondary_role || '—' },
      { label: 'Team', value: current.team || '—' },
      { label: 'Category', value: current.category || '—' },
      { label: 'Playing style', value: current.playing_style || '—' },
      { label: 'Seeking team', value: formatYesNo(current.seeking_team) },
      { label: 'Contract', value: contractStatusText(current.contract_status) },
      { label: 'Contract end', value: formatDate(current.contract_end_date) },
      { label: 'Preferred regions', value: preferredRegions },
      { label: 'Trial window', value: current.trial_window || '—' },
      { label: 'Agent / Agency', value: agentAgency || '—' },
    ];
  }, [detail]);

  const physicalSections = useMemo(() => {
    const physical = detail?.physical || {};
    if (!Object.keys(physical).length) {
      return { primary: [], extended: [], timing: [] };
    }

    const primary = [
      { label: 'Height (cm)', value: physical.height_cm ?? '—' },
      { label: 'Weight (kg)', value: physical.weight_kg ?? '—' },
      { label: 'Wingspan (cm)', value: physical.wingspan_cm ?? '—' },
      { label: 'Dominant hand', value: physical.dominant_hand || '—' },
      { label: 'Dominant foot', value: physical.dominant_foot || '—' },
      { label: 'Dominant eye', value: physical.dominant_eye || '—' },
    ];

    const extended = [
      { label: 'Standing reach (cm)', value: physical.standing_reach_cm ?? '—' },
      { label: 'Body fat (%)', value: physical.body_fat_percent ?? '—' },
      { label: 'Sprint 10m (s)', value: physical.sprint_10m_s ?? '—' },
      { label: 'Sprint 20m (s)', value: physical.sprint_20m_s ?? '—' },
      { label: 'Pro agility 5-10-5 (s)', value: physical.pro_agility_5_10_5_s ?? '—' },
      { label: 'Vertical jump CMJ (cm)', value: physical.vertical_jump_cmj_cm ?? '—' },
      { label: 'Standing long jump (cm)', value: physical.standing_long_jump_cm ?? '—' },
      { label: 'Grip strength left (kg)', value: physical.grip_strength_left_kg ?? '—' },
      { label: 'Grip strength right (kg)', value: physical.grip_strength_right_kg ?? '—' },
      { label: 'Sit and reach (cm)', value: physical.sit_and_reach_cm ?? '—' },
      { label: 'Plank hold (s)', value: physical.plank_hold_s ?? '—' },
      { label: 'Cooper 12 min (m)', value: physical.cooper_12min_m ?? '—' },
    ];

    const timing = [
      { label: 'Physical measured at', value: formatDateTime(physical.physical_measured_at) },
      { label: 'Performance measured at', value: formatDateTime(physical.performance_measured_at) },
      { label: 'Updated at', value: formatDateTime(physical.updated_at) },
    ];

    return { primary, extended, timing };
  }, [detail]);

  const socialItems = useMemo(() => {
    const socials = detail?.social || [];
    return socials.map((row, index) => {
      const profileUrl = row.profile_url || row.url || '';
      const value = profileUrl
        ? (
          <div>
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>{profileUrl}</a>
            {row.handle ? <div style={styles.mutedText}>{row.handle}</div> : null}
          </div>
        )
        : row.handle || '—';

      return {
        key: `social-${row.id || index}`,
        label: row.platform || `Social ${index + 1}`,
        value,
      };
    });
  }, [detail]);

  const awardCards = useMemo(() => detail?.awards || [], [detail]);

  const careerCards = useMemo(() => detail?.career || [], [detail]);

  const mediaGroups = useMemo(() => {
    const grouped = detail?.media?.grouped || {};
    const accumulator = new Map();

    Object.entries(grouped).forEach(([rawKey, items]) => {
      const normalizedKey = mapMediaCategoryKey(rawKey);
      const existing = accumulator.get(normalizedKey) || [];
      accumulator.set(normalizedKey, existing.concat(items));
    });

    const groups = Array.from(accumulator.entries()).map(([key, items]) => ({
      key,
      label: MEDIA_LABELS[key] || formatStatusLabel(key),
      items,
    }));

    return groups.sort((a, b) => {
      const indexA = MEDIA_ORDER.indexOf(a.key);
      const indexB = MEDIA_ORDER.indexOf(b.key);
      if (indexA === -1 && indexB === -1) return a.label.localeCompare(b.label);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [detail]);

  const activityEntries = useMemo(() => detail?.activity || [], [detail]);

  const handleApprove = useCallback(async () => {
    await performAthleteAction('approve');
  }, [performAthleteAction]);

  const handleReject = useCallback(async () => {
    const reason = window.prompt('Reason for rejection (optional):', '');
    if (reason === null) return;
    await performAthleteAction('reject', (reason || '').trim() || null);
  }, [performAthleteAction]);

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
        <div style={styles.actionsRow}>
          <button
            type="button"
            onClick={loadDetail}
            style={styles.secondaryButton}
            disabled={loading || actionBusy}
          >
            {loading ? 'Refreshing…' : 'Refresh data'}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            style={styles.primaryButton}
            disabled={loading || actionBusy}
          >
            {actionBusy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={handleReject}
            style={styles.dangerButton}
            disabled={loading || actionBusy}
          >
            {actionBusy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </header>

      {actionError ? <div style={styles.errorBanner}>{actionError}</div> : null}
      {dataError ? <div style={styles.errorBanner}>{dataError}</div> : null}

      {loading && !detail ? (
        <div style={styles.loadingState}>Loading athlete details…</div>
      ) : null}

      {detail ? (
        <>
          <CollapsibleSection title="Summary" description="Key information at a glance.">
            <KeyValueGrid items={summaryItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Profile" description="Personal details and languages.">
            <KeyValueGrid items={personalItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Contacts & verification (admin)" description="Verification status and uploaded documents.">
            <KeyValueGrid items={contactsAdminItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Sport" description="Latest sports experience submitted.">
            <KeyValueGrid items={sportsItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Career" description="Season-by-season club history.">
            {renderList(careerCards, (row, index) => (
              <article key={row.id || index} style={styles.card}>
                <header style={styles.cardHeader}>
                  <div style={styles.cardTitleRow}>
                    <span style={styles.cardTitleText}>{row.team_name || row.team || '—'}</span>
                    <span style={styles.cardMeta}>{row.league || ''}</span>
                  </div>
                  <div style={styles.cardMeta}>{formatSeason(row.season_start, row.season_end)}</div>
                </header>
                <div style={styles.cardContent}>
                  <div style={styles.cardDetail}><strong>Sport:</strong> {row.sport || '—'}</div>
                  <div style={styles.cardDetail}><strong>Role:</strong> {row.role || '—'}</div>
                  <div style={styles.cardDetail}><strong>Category:</strong> {row.category || '—'}</div>
                  <div style={styles.cardDetail}><strong>Current:</strong> {formatYesNo(row.is_current)}</div>
                  <div style={styles.cardDetail}><strong>League:</strong> {row.league || '—'}</div>
                  {row.notes ? (
                    <div style={styles.cardDetail}><strong>Notes:</strong> {row.notes}</div>
                  ) : null}
                </div>
              </article>
            ), 'No career entries recorded.')}
          </CollapsibleSection>

          <CollapsibleSection title="Physical data" description="Latest measurements and performance metrics.">
            <KeyValueGrid items={physicalSections.primary} />
            {physicalSections.extended.length ? (
              <>
                <h3 style={styles.subSectionTitle}>Performance metrics</h3>
                <KeyValueGrid items={physicalSections.extended} />
              </>
            ) : null}
            {physicalSections.timing.length ? (
              <>
                <h3 style={styles.subSectionTitle}>Measurement dates</h3>
                <KeyValueGrid items={physicalSections.timing} />
              </>
            ) : null}
          </CollapsibleSection>

          <CollapsibleSection title="Social" description="Links to athlete social profiles.">
            <KeyValueGrid items={socialItems} />
          </CollapsibleSection>

          <CollapsibleSection title="Awards" description="Recognitions, trophies and supporting evidence.">
            {renderList(awardCards, (row, index) => (
              <article key={row.id || index} style={styles.card}>
                <header style={styles.cardHeader}>
                  <div style={styles.cardTitleRow}>
                    <span style={styles.cardTitleText}>{row.title || row.competition || 'Award'}</span>
                    <span style={styles.cardMeta}>{formatSeason(row.season_start, row.season_end)}</span>
                  </div>
                  <div style={styles.cardMeta}>{formatDate(row.date_awarded)}</div>
                </header>
                <div style={styles.cardContent}>
                  <div style={styles.cardDetail}><strong>Awarding entity:</strong> {row.awarding_entity || '—'}</div>
                  <div style={styles.cardDetail}><strong>Competition:</strong> {row.competition || '—'}</div>
                  <div style={styles.cardDetail}><strong>Result:</strong> {row.result || '—'}</div>
                  <div style={styles.cardDetail}><strong>Description:</strong> {row.description || '—'}</div>
                  {row.evidence_external_url ? (
                    <div style={styles.cardDetail}>
                      <a href={row.evidence_external_url} target="_blank" rel="noopener noreferrer" style={styles.link}>Open evidence link</a>
                    </div>
                  ) : null}
                  {row.evidence_file_path ? (
                    <div style={styles.cardDetail}>
                      <button
                        type="button"
                        style={styles.inlineActionButton}
                        onClick={() => openDocument(row.evidence_file_path)}
                      >
                        Open evidence document
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ), 'No awards recorded yet.')}
          </CollapsibleSection>

          <CollapsibleSection title="Media" description="Signed assets grouped by category.">
            {mediaGroups.length === 0 ? (
              <div style={styles.emptyState}>No media uploaded.</div>
            ) : (
              <div style={styles.mediaGrid}>
                {mediaGroups.map(({ key, label, items }) => (
                  <div key={key} style={styles.mediaColumn}>
                    <h3 style={styles.mediaTitle}>{label}</h3>
                    <ul style={styles.mediaList}>
                      {items.map((item, index) => (
                        <li key={item.id || `${key}-${index}`} style={styles.mediaItem}>
                          <div style={styles.mediaItemTitle}>{item.title || item.caption || `Media #${item.id || index + 1}`}</div>
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
  actionsRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
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
  primaryButton: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #2563EB',
    background: '#2563EB',
    color: '#FFFFFF',
    cursor: 'pointer',
    fontWeight: 700,
    minWidth: 140,
  },
  dangerButton: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #EF4444',
    background: '#EF4444',
    color: '#FFFFFF',
    cursor: 'pointer',
    fontWeight: 700,
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
  subSectionTitle: {
    margin: '24px 0 12px',
    fontSize: 16,
    fontWeight: 600,
    color: '#0F172A',
  },
  mutedText: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 13,
  },
  inlineActionButton: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #CBD5E1',
    background: '#F8FAFC',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
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

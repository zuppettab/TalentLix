'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCcw } from 'lucide-react';
import sports from '../../utils/sports';
import { supabase } from '../../utils/supabaseClient';

function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width:${breakpointPx}px)`);
    const onChange = (event) => setIsMobile(event.matches);
    onChange(mq);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [breakpointPx]);

  return isMobile;
}

const CONTRACT_STATUS = [
  { value: 'free_agent', label: 'Free agent' },
  { value: 'under_contract', label: 'Under contract' },
  { value: 'on_loan', label: 'On loan' },
];

const styles = {
  page: {
    minHeight: '100vh',
    padding: 'clamp(2rem, 5vw, 4rem) clamp(1.5rem, 5vw, 4rem)',
    background:
      'radial-gradient(circle at top left, rgba(39, 227, 218, 0.35), transparent 55%), radial-gradient(circle at bottom right, rgba(247, 184, 78, 0.35), transparent 52%), radial-gradient(circle at 20% 80%, rgba(249, 115, 22, 0.22), transparent 62%), #f8fafc',
    color: '#0f172a',
  },
  topRow: {
    display: 'flex',
    gap: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    margin: '0 auto clamp(1.2rem, 2.4vw, 1.8rem)',
    maxWidth: 1180,
  },
  helper: { margin: 0, color: '#475569', fontWeight: 600 },
  actions: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: 12,
    border: 'none',
    background: 'linear-gradient(100deg, #1dd6cb 0%, #f97316 48%, #facc15 100%)',
    color: '#0f172a',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 12px 30px -18px rgba(249,115,22,0.55)',
  },
  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid #CBD5E1',
    background: '#fff',
    color: '#0f172a',
    fontWeight: 700,
    cursor: 'pointer',
  },
  results: { display: 'grid', gap: 16, minWidth: 0 },
  grid: {
    display: 'grid',
    columnGap: 'clamp(1.25rem, 2.5vw, 2.25rem)',
    rowGap: 'clamp(2.5rem, 5vw, 3.75rem)',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))',
    justifyItems: 'stretch',
  },
  card: {
    position: 'relative',
    borderRadius: 22,
    padding: 0,
    border: '1px solid rgba(15,23,42,0.06)',
    background: '#fff',
    boxShadow: '0 22px 45px -28px rgba(15,23,42,0.32)',
    width: '100%',
    maxWidth: 360,
  },
  cardInner: {
    background: '#fff',
    borderRadius: 22,
    padding: '1.5rem',
    display: 'grid',
    gap: 16,
    minHeight: '100%',
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 16 },
  avatarWrap: {
    position: 'relative',
    width: 56,
    height: 56,
    borderRadius: '50%',
    overflow: 'hidden',
    boxShadow: '0 12px 24px -18px rgba(15,23,42,0.6)',
    background: 'linear-gradient(135deg, rgba(39,227,218,0.25), rgba(15,23,42,0.08))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitials: { fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' },
  nameWrap: { display: 'grid', gap: 4, flex: 1, minWidth: 0 },
  nameRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  name: { margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' },
  verifiedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    borderRadius: 999,
    background: 'linear-gradient(120deg, rgba(34,197,94,0.2), rgba(22,163,74,0.32))',
    color: '#166534',
    fontSize: '.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.08em',
  },
  categoryBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    background: 'rgba(134, 239, 172, 0.45)',
    color: '#166534',
    borderRadius: 999,
    padding: '5px 12px',
    fontSize: '.75rem',
    fontWeight: 700,
    letterSpacing: '.03em',
    alignSelf: 'flex-start',
  },
  small: { margin: 0, color: '#475569', fontSize: '.9rem' },
  metaGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  },
  metaItem: {
    background: 'linear-gradient(135deg, rgba(254,215,170,0.7), rgba(253,186,116,0.65))',
    borderRadius: 14,
    padding: '12px 14px',
    fontSize: '.9rem',
    color: '#0f172a',
    display: 'grid',
    gap: 6,
    boxShadow: '0 18px 32px -28px rgba(249,115,22,0.4)',
  },
  metaLabel: {
    fontSize: '.72rem',
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: '#0f172a',
    fontWeight: 700,
    opacity: 0.7,
  },
  tagsAndAction: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    minWidth: 0,
  },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 8, flexShrink: 0 },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    borderRadius: 999,
    fontSize: '.75rem',
    fontWeight: 700,
    letterSpacing: '.02em',
    lineHeight: 1,
    background: 'linear-gradient(120deg, rgba(39,227,218,0.25), rgba(247,184,78,0.25))',
    color: '#0f172a',
  },
  tagSeeking: { background: 'linear-gradient(120deg, rgba(39,227,218,0.35), rgba(56,189,248,0.35))' },
  tagAgent: { background: 'linear-gradient(120deg, rgba(109,40,217,0.25), rgba(14,165,233,0.25))', color: '#1e293b' },
  section: { display: 'grid', gap: 8 },
  profileBtnRow: { display: 'flex', justifyContent: 'flex-start', flex: 1, gap: 8 },
  profileBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: '#fff',
    color: '#0f172a',
    fontSize: '.78rem',
    fontWeight: 600,
    textDecoration: 'none',
    boxShadow: '0 10px 24px -20px rgba(15,23,42,0.55)',
    transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
  },
  unlockBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 999,
    background: 'linear-gradient(120deg, rgba(134,239,172,0.45), rgba(22,163,74,0.35))',
    color: '#166534',
    fontWeight: 700,
    fontSize: '.78rem',
  },
  warn: {
    color: '#b45309',
    background: 'rgba(250,204,21,0.15)',
    border: '1px solid rgba(250,204,21,0.35)',
    padding: 10,
    borderRadius: 10,
  },
  emptyState: {
    background: '#fff',
    borderRadius: 18,
    border: '1px solid #e5e7eb',
    padding: '1.25rem',
    boxShadow: '0 18px 32px -28px rgba(15,23,42,0.25)',
    maxWidth: 760,
    margin: '0 auto',
    textAlign: 'center',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    border: 0,
  },
};

const SELECT_FIELDS = `
  id, first_name, last_name, gender, nationality, date_of_birth, profile_picture_url, profile_published,
  contacts_verification!left(id_verified, residence_city, residence_country),
  exp:sports_experiences!inner(
    sport, role, team, category, seeking_team, is_represented, contract_status, preferred_regions
  )
`;

const ensureArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const normalizeUnlockedAthletes = (rows) => {
  const byAthlete = new Map();
  ensureArray(rows)
    .map((row) => {
      if (!row?.athlete_id) return null;
      return {
        athlete_id: row.athlete_id,
        unlocked_at: row?.unlocked_at ?? null,
        expires_at: row?.expires_at ?? null,
        athlete: row.athlete || null,
      };
    })
    .filter((row) => row && row.athlete_id)
    .forEach((row) => {
      const existing = byAthlete.get(row.athlete_id);
      if (!existing) {
        byAthlete.set(row.athlete_id, row);
        return;
      }
      const existingTs = existing.unlocked_at ? new Date(existing.unlocked_at).getTime() : -Infinity;
      const candidateTs = row.unlocked_at ? new Date(row.unlocked_at).getTime() : -Infinity;
      if (candidateTs > existingTs) {
        byAthlete.set(row.athlete_id, row);
      }
    });

  const normalized = Array.from(byAthlete.values());
  normalized.sort((a, b) => {
    const expiresA = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
    const expiresB = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
    if (expiresA !== expiresB) return expiresA - expiresB;
    const unlockA = a.unlocked_at ? new Date(a.unlocked_at).getTime() : 0;
    const unlockB = b.unlocked_at ? new Date(b.unlocked_at).getTime() : 0;
    return unlockB - unlockA;
  });

  return normalized;
};

const fetchUnlockedAthletes = async (accessToken) => {
  const response = await fetch('/api/operator/unlocked-athletes', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Unable to load unlocked athletes.');
    error.code = payload?.code || null;
    throw error;
  }
  return normalizeUnlockedAthletes(payload?.items);
};

const computeAge = (dob) => {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const m = now.getMonth() - parsed.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < parsed.getDate())) age--;
  return age;
};

const formatGender = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'm' || normalized === 'male') return 'Male';
  if (normalized === 'f' || normalized === 'female') return 'Female';
  return null;
};

const resolveInitials = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 'PR';
  return trimmed
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

export default function UnlockedAthletesPanel({ authUser }) {
  const isMobile = useIsMobile(720);
  const [unlockRows, setUnlockRows] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');

  const activeUnlocks = useMemo(() => {
    const now = Date.now();
    return unlockRows.filter((row) => {
      if (!row?.athlete_id) return false;
      if (!row.expires_at) return true;
      const ts = new Date(row.expires_at).getTime();
      return !Number.isNaN(ts) && ts > now;
    });
  }, [unlockRows]);

  const activeIds = useMemo(() => activeUnlocks.map((row) => row.athlete_id), [activeUnlocks]);

  const unlockMap = useMemo(() => {
    const map = new Map();
    activeUnlocks.forEach((row) => map.set(row.athlete_id, row));
    return map;
  }, [activeUnlocks]);

  const loadUnlocks = useCallback(async () => {
    if (!authUser?.id || !supabase) return;
    setLoading(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }
      const rowsResult = await fetchUnlockedAthletes(token);
      setUnlockRows(rowsResult);
    } catch (err) {
      setError(err.message || 'Unable to load unlocked athletes.');
      setUnlockRows([]);
    } finally {
      setLoading(false);
    }
  }, [authUser?.id]);

  const loadProfiles = useCallback(async () => {
    if (!supabase || activeIds.length === 0) {
      setRows([]);
      setLoadingProfiles(false);
      return;
    }
    setLoadingProfiles(true);
    setProfileError('');
    try {
      const { data, error: queryError } = await supabase
        .from('athlete')
        .select(SELECT_FIELDS)
        .in('id', activeIds)
        .order('last_name', { ascending: true });
      if (queryError) throw queryError;
      setRows(data || []);
    } catch (err) {
      setProfileError(err.message || 'Unable to load unlocked athlete profiles.');
      setRows([]);
    } finally {
      setLoadingProfiles(false);
    }
  }, [activeIds]);

  useEffect(() => {
    loadUnlocks();
  }, [loadUnlocks]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const total = rows.length;

  if (!supabase) {
    return (
      <div style={styles.emptyState}>
        <p>Unlocked athletes are unavailable because Supabase is not configured.</p>
      </div>
    );
  }

  const gridStyle = useMemo(() => ({
    ...styles.grid,
    ...(isMobile
      ? {
          gridTemplateColumns: 'minmax(0, 1fr)',
          rowGap: 'clamp(3rem, 7vw, 4rem)',
        }
      : null),
  }), [isMobile]);

  const cardStyle = useMemo(() => ({
    ...styles.card,
    ...(isMobile ? { maxWidth: '100%' } : null),
  }), [isMobile]);

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div style={{ display: 'grid', gap: 6 }}>
          <h2 style={{ margin: 0 }}>Unlocked athletes</h2>
          <p style={styles.helper}>Browse all athletes you have unlocked and are still active.</p>
          <span style={styles.srOnly} aria-live="polite">
            {loading ? 'Loading unlocked athletes…' : `${total} unlocked athletes available`}
          </span>
        </div>
        <div style={styles.actions}>
          <button type="button" style={styles.secondaryBtn} onClick={loadUnlocks} disabled={loading}>
            <RefreshCcw size={16} />
            Refresh list
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.warn} role="alert">
          {error}
        </div>
      )}

      {profileError && (
        <div style={styles.warn} role="alert">
          {profileError}
        </div>
      )}

      {!loading && activeIds.length === 0 && (
        <div style={styles.emptyState} aria-live="polite">
          <p style={{ margin: 0, fontWeight: 700 }}>No active unlocked athletes.</p>
          <p style={{ margin: '8px 0 0' }}>
            Unlock an athlete to see them here with the full profile shortcut.
          </p>
        </div>
      )}

      <section style={styles.results} aria-live="polite">
        <div style={gridStyle}>
          {rows.map((ath) => {
            const exp = Array.isArray(ath.exp) ? ath.exp[0] : null;
            const contactsRecord = Array.isArray(ath.contacts_verification)
              ? ath.contacts_verification[0] || null
              : ath.contacts_verification || null;
            const residenceCity = (contactsRecord?.residence_city || '').trim();
            const residenceCountry = (contactsRecord?.residence_country || '').trim();
            const age = computeAge(ath.date_of_birth);
            const residenceParts = [residenceCity, residenceCountry].filter(Boolean);
            const residence = residenceParts.length > 0 ? residenceParts.join(', ') : '—';
            const contractLabel = exp?.contract_status
              ? CONTRACT_STATUS.find((x) => x.value === exp.contract_status)?.label || exp.contract_status
              : '—';
            const genderLabel = formatGender(ath.gender);
            const sportFromExp = sports.find((sport) => sport.value === exp?.sport) || null;
            const sportLabel = sportFromExp ? sportFromExp.label : exp?.sport || 'Sport —';
            const metaItems = [
              { label: 'Nationality', value: ath.nationality || '—' },
              { label: 'Current team', value: exp?.team || '—' },
              { label: 'Current residence', value: residence },
              { label: 'Contract status', value: contractLabel },
            ];
            const regions = Array.isArray(exp?.preferred_regions) ? exp.preferred_regions.filter(Boolean) : [];
            const formattedRegions = regions.slice(0, 3).join(', ');
            const subtitleParts = [
              exp?.role ? exp.role : 'Role —',
              sportLabel,
              genderLabel,
              typeof age === 'number' ? `${age} y` : null,
            ];
            const subtitleText = subtitleParts.filter(Boolean).join(' • ');
            const showTags = exp?.seeking_team || exp?.is_represented;
            const unlockInfo = unlockMap.get(ath.id);
            const expiresLabel = unlockInfo?.expires_at
              ? (() => {
                  const parsed = new Date(unlockInfo.expires_at);
                  if (Number.isNaN(parsed.getTime())) return null;
                  return parsed.toLocaleDateString();
                })()
              : null;

            return (
              <article key={ath.id} style={cardStyle}>
                <div style={styles.cardInner}>
                  <header style={styles.cardHeader}>
                    <div style={styles.avatarWrap} aria-hidden>
                      {ath.profile_picture_url ? (
                        <img src={ath.profile_picture_url} alt="" style={styles.avatarImg} />
                      ) : (
                        <span style={styles.avatarInitials}>{resolveInitials(`${ath.first_name || ''} ${ath.last_name || ''}`)}</span>
                      )}
                    </div>
                    <div style={styles.nameWrap}>
                      <div style={styles.nameRow}>
                        <h3 style={styles.name}>{`${ath.first_name || ''} ${ath.last_name || ''}`.trim() || 'Unnamed athlete'}</h3>
                        {contactsRecord?.id_verified && <span style={styles.verifiedBadge}>Verified</span>}
                      </div>
                      {exp?.category && <span style={styles.categoryBadge}>{exp.category}</span>}
                      <p style={styles.small}>{subtitleText}</p>
                    </div>
                  </header>

                  <div style={styles.metaGrid}>
                    {metaItems.map((item) => (
                      <div key={item.label} style={styles.metaItem}>
                        <span style={styles.metaLabel}>{item.label}</span>
                        <span>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div style={styles.section}>
                    <span style={styles.metaLabel}>
                      Preferred regions:{' '}
                      <span style={{ fontWeight: 700, letterSpacing: 'normal', textTransform: 'none' }}>
                        {regions.length > 0 ? formattedRegions : '—'}
                      </span>
                    </span>

                    <div
                      style={{
                        ...styles.tagsAndAction,
                        justifyContent: showTags ? 'space-between' : 'flex-end',
                        alignItems: 'center',
                      }}
                    >
                      {showTags && (
                        <div style={styles.tagRow}>
                          {exp?.seeking_team && <span style={{ ...styles.tag, ...styles.tagSeeking }}>Seeking team</span>}
                          {exp?.is_represented && <span style={{ ...styles.tag, ...styles.tagAgent }}>Agent</span>}
                        </div>
                      )}

                      <div style={styles.profileBtnRow}>
                        <div style={styles.unlockBadge}>
                          {expiresLabel ? `Unlocked until ${expiresLabel}` : 'Unlocked'}
                        </div>
                        <a
                          href={`/profile/full?id=${ath.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={styles.profileBtn}
                        >
                          <span>Full profile</span>
                          <ExternalLink size={14} strokeWidth={2} />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {(loading || loadingProfiles) && (
          <div style={{ ...styles.emptyState, marginTop: 24 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>Loading unlocked profiles…</p>
          </div>
        )}
      </section>
    </div>
  );
}

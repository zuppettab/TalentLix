import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

const COLORS = {
  impressions: '#27E3DA',
  views: '#F7B84E',
  unlocks: '#6C63FF',
};

const DEFAULT_STATS = {
  search_impressions: 0,
  profile_views: 0,
  contact_unlocks: 0,
  first_seen_at: null,
  last_seen_at: null,
};

const EVENT_TYPE_MAP = {
  search_impressions: 'search_impression',
  profile_views: 'profile_view',
  contact_unlocks: 'contact_unlock',
};

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

const formatDateLabel = (value) => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date?.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function AthleteStatsPanel({ athlete, isMobile }) {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeMetric, setActiveMetric] = useState('search_impressions');
  const [activity, setActivity] = useState({ rows: [], loading: false, error: null });

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      if (!athlete?.id) {
        setStats(DEFAULT_STATS);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('athlete_search_stats')
          .select('athlete_id, search_impressions, profile_views, contact_unlocks, first_seen_at, last_seen_at')
          .eq('athlete_id', athlete.id)
          .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') {
          throw fetchError;
        }

        if (!isMounted) return;

        setStats({
          ...DEFAULT_STATS,
          ...(data || {}),
          first_seen_at: (data?.first_seen_at || athlete?.created_at || null),
        });
      } catch (err) {
        if (!isMounted) return;
        console.error(err);
        setError('Unable to load your visibility stats right now.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();

    return () => {
      isMounted = false;
    };
  }, [athlete]);

  const statCards = useMemo(() => ([
    {
      key: 'search_impressions',
      label: 'Search impressions',
      description: 'Appearances in operator searches',
      value: stats.search_impressions,
      color: COLORS.impressions,
    },
    {
      key: 'profile_views',
      label: 'Full profile views',
      description: 'Operators opening your full profile',
      value: stats.profile_views,
      color: COLORS.views,
    },
    {
      key: 'contact_unlocks',
      label: 'Contact unlocks',
      description: 'Operators who unlocked your contacts',
      value: stats.contact_unlocks,
      color: COLORS.unlocks,
    },
  ]), [stats]);

  useEffect(() => {
    if (!athlete?.id) return undefined;

    let active = true;
    const loadActivity = async () => {
      if (!EVENT_TYPE_MAP[activeMetric]) return;
      setActivity((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token || null;
        const params = new URLSearchParams({
          athleteId: athlete.id,
          type: EVENT_TYPE_MAP[activeMetric],
        });

        const response = await fetch(`/api/athlete-visibility-events?${params.toString()}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        });

        const payload = await response.json();
        if (!response.ok) {
          const errorMessage = payload?.error || 'Unable to load activity right now.';
          throw new Error(errorMessage);
        }

        if (!active) return;
        setActivity({ rows: payload?.events || [], loading: false, error: null });
      } catch (err) {
        if (!active) return;
        setActivity({ rows: [], loading: false, error: err?.message || 'Unable to load activity right now.' });
      }
    };

    loadActivity();

    return () => {
      active = false;
    };
  }, [activeMetric, athlete]);

  if (!athlete) {
    return <p style={panelStyles.placeholder}>Log in to view your visibility stats.</p>;
  }

  return (
    <div style={{ ...panelStyles.wrapper, ...(isMobile ? panelStyles.wrapperMobile : null) }}>
      <header style={panelStyles.header}>
        <div>
          <div style={panelStyles.title}>Visibility stats</div>
          <div style={panelStyles.subtitle}>See how operators discover and interact with your profile.</div>
        </div>
      </header>

      {error && <div style={panelStyles.errorBox}>{error}</div>}

      <div style={panelStyles.cardsRow}>
        {statCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setActiveMetric(card.key)}
            style={{
              ...panelStyles.card,
              borderColor: card.color,
              ...(activeMetric === card.key ? panelStyles.cardActive : null),
            }}
          >
            <div style={{ ...panelStyles.cardPill, background: card.color }} />
            <div style={panelStyles.cardLabel}>{card.label}</div>
            <div style={panelStyles.cardValue}>{formatNumber(card.value)}</div>
            <div style={panelStyles.cardDesc}>{card.description}</div>
          </button>
        ))}
      </div>

      <div style={panelStyles.listBox}>
        <div style={panelStyles.listHeader}>
          <div style={panelStyles.chartTitle}>{statCards.find((c) => c.key === activeMetric)?.label || 'Activity'}</div>
          <div style={panelStyles.chartMeta}>
            First seen: {formatDateLabel(stats.first_seen_at)} · Last activity: {formatDateLabel(stats.last_seen_at)}
          </div>
          {loading && <span style={panelStyles.chartMeta}>Updating…</span>}
        </div>

        <div style={panelStyles.tableHead}>
          <span style={{ ...panelStyles.cell, ...panelStyles.cellTitle }}>Operator</span>
          <span style={{ ...panelStyles.cell, ...panelStyles.cellTitle }}>Nationality</span>
          <span style={{ ...panelStyles.cell, ...panelStyles.cellTitle }}>Club type</span>
          <span style={{ ...panelStyles.cell, ...panelStyles.cellTitle }}>Agent/role</span>
          <span style={{ ...panelStyles.cell, ...panelStyles.cellTitle }}>City</span>
          <span style={{ ...panelStyles.cell, ...panelStyles.cellTitle }}>Date</span>
        </div>

        <div style={panelStyles.tableBody}>
          {activity.loading && (
            <div style={panelStyles.listStatus}>Loading activity…</div>
          )}

          {!activity.loading && activity.error && (
            <div style={{ ...panelStyles.listStatus, color: '#7C3A00', background: '#FFF4E5', borderColor: '#FBD38D' }}>
              {activity.error}
            </div>
          )}

          {!activity.loading && !activity.error && !activity.rows.length && (
            <div style={panelStyles.listStatus}>No activity to show for now.</div>
          )}

          {!activity.loading && !activity.error && activity.rows.map((row, idx) => (
            <div key={row.id || row.event_id || idx} style={panelStyles.tableRow}>
              <span style={panelStyles.cell}>{renderOperatorName(row)}</span>
              <span style={panelStyles.cell}>{renderNationality(row)}</span>
              <span style={panelStyles.cell}>{renderClubType(row)}</span>
              <span style={panelStyles.cell}>{renderAgent(row)}</span>
              <span style={panelStyles.cell}>{renderCity(row)}</span>
              <span style={panelStyles.cell}>{formatDateLabel(extractEventDate(row))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const extractEventDate = (row) => row?.occurred_at || row?.created_at || row?.inserted_at || row?.event_at || row?.timestamp;

const renderOperatorName = (row) => row?.operator_name || row?.operator || row?.legal_name || row?.name || '—';

const renderNationality = (row) => row?.nationality || row?.operator_nationality || row?.country || '—';

const renderClubType = (row) => row?.club_type || row?.operator_type || row?.organisation_type || '—';

const renderAgent = (row) => row?.agent || row?.agent_name || row?.role || row?.title || '—';

const renderCity = (row) => row?.city || row?.location_city || row?.operator_city || '—';

const panelStyles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  wrapperMobile: {
    gap: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: 700 },
  subtitle: { fontSize: 14, color: '#555' },
  cardsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  card: {
    border: '1px solid #E0E0E0',
    borderRadius: 14,
    padding: '12px 14px',
    background: '#FFFFFF',
    boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
    position: 'relative',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'box-shadow 120ms ease, transform 120ms ease',
  },
  cardActive: {
    boxShadow: '0 12px 32px rgba(0,0,0,0.08)',
    transform: 'translateY(-2px)',
  },
  cardPill: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    position: 'absolute',
    top: 12,
    right: 12,
  },
  cardLabel: { fontSize: 13, color: '#555', marginBottom: 4 },
  cardValue: { fontSize: 28, fontWeight: 700, lineHeight: 1.2 },
  cardDesc: { fontSize: 12, color: '#777', marginTop: 4 },
  listBox: {
    border: '1px solid #E0E0E0',
    borderRadius: 14,
    padding: '14px 16px',
    background: '#FFFFFF',
    boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chartTitle: { fontSize: 16, fontWeight: 700 },
  chartMeta: { fontSize: 12, color: '#555' },
  tableHead: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(120px, 1fr))',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 10,
    background: '#F7F7F7',
    color: '#444',
    fontWeight: 700,
    fontSize: 13,
  },
  tableBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 8,
    maxHeight: 260,
    overflowY: 'auto',
    paddingRight: 4,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, minmax(120px, 1fr))',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #EFEFEF',
    background: '#FFFFFF',
    alignItems: 'center',
  },
  cell: { fontSize: 13, color: '#333' },
  cellTitle: { fontWeight: 700 },
  listStatus: {
    padding: '12px 14px',
    border: '1px dashed #E0E0E0',
    borderRadius: 10,
    textAlign: 'center',
    color: '#555',
    fontSize: 13,
    background: '#FAFAFA',
  },
  errorBox: {
    background: '#FFF4E5',
    color: '#7C3A00',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #FBD38D',
    fontSize: 13,
  },
  placeholder: { fontSize: 14, color: '#555' },
};


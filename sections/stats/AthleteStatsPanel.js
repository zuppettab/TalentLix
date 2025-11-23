
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

const COLORS = {
  impressions: '#27E3DA',
  views: '#F7B84E',
  unlocks: '#6C63FF',
  messages: '#FF7B7B',
  recency: '#2D9CDB',
};

const DEFAULT_STATS = {
  search_impressions: 0,
  profile_views: 0,
  contact_unlocks: 0,
  messaging_operators: 0,
  profile_views_last_month: 0,
  first_seen_at: null,
  last_seen_at: null,
};

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

const fetchDistinctMessagingOperators = async (athleteId) => {
  if (!athleteId) return 0;
  try {
    const { data, error } = await supabase
      .from('chat_message')
      .select('sender_op_id, thread:chat_thread!inner(op_id, athlete_id)')
      .eq('sender_kind', 'OP')
      .eq('thread.athlete_id', athleteId);

    if (error) {
      throw error;
    }

    const unique = new Set();
    (data || []).forEach((row) => {
      const sender = row?.sender_op_id;
      const threadOperator = row?.thread?.op_id;
      if (sender) unique.add(String(sender));
      if (threadOperator) unique.add(String(threadOperator));
    });

    return unique.size;
  } catch (err) {
    console.warn('Unable to load messaging operator count', err);
    return 0;
  }
};

const fetchRecentProfileViews = async (athleteId) => {
  if (!athleteId) return 0;
  const since = new Date();
  since.setMonth(since.getMonth() - 1);

  try {
    const { count, error } = await supabase
      .from('athlete_search_event')
      .select('id', { head: true, count: 'exact' })
      .eq('athlete_id', athleteId)
      .eq('event_type', 'profile_view')
      .gte('created_at', since.toISOString());

    if (error) {
      throw error;
    }

    return Number.isFinite(count) ? count : 0;
  } catch (err) {
    console.warn('Unable to load recent profile views', err);
    return 0;
  }
};

export default function AthleteStatsPanel({ athlete, isMobile }) {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      if (!athlete?.id) {
        setStats(DEFAULT_STATS);
        return;
      }

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

        const [distinctMessagingOperators, recentProfileViews] = await Promise.all([
          fetchDistinctMessagingOperators(athlete.id),
          fetchRecentProfileViews(athlete.id),
        ]);

        const nextStats = {
          ...DEFAULT_STATS,
          ...(data || {}),
          first_seen_at: (data?.first_seen_at || athlete?.created_at || null),
          messaging_operators: distinctMessagingOperators,
          profile_views_last_month: recentProfileViews,
        };

        setStats(nextStats);
      } catch (err) {
        if (!isMounted) return;
        console.error(err);
        setError('Unable to load your profile insights right now.');
      }
    };

    loadStats();

    return () => {
      isMounted = false;
    };
  }, [athlete]);

  const statCards = [
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
    {
      key: 'messaging_operators',
      label: 'Operator conversations',
      description: 'Unique operators who messaged you',
      value: stats.messaging_operators,
      color: COLORS.messages,
    },
    {
      key: 'profile_views_last_month',
      label: 'Profile visits (30 days)',
      description: 'Full profile opens in the last month',
      value: stats.profile_views_last_month,
      color: COLORS.recency,
    },
  ];

  if (!athlete) {
    return <p style={panelStyles.placeholder}>Log in to view your profile insights.</p>;
  }

  return (
    <div style={{ ...panelStyles.wrapper, ...(isMobile ? panelStyles.wrapperMobile : null) }}>
      <header style={panelStyles.header}>
        <div>
          <div style={panelStyles.title}>Profile insights</div>
          <div style={panelStyles.subtitle}>See how operators discover, view, and engage with your profile.</div>
        </div>
      </header>

      {error && <div style={panelStyles.errorBox}>{error}</div>}

      <div style={panelStyles.cardsRow}>
        {statCards.map((card) => (
          <div key={card.key} style={{ ...panelStyles.card, borderColor: card.color }}>
            <div style={{ ...panelStyles.cardPill, background: card.color }} />
            <div style={panelStyles.cardLabel}>{card.label}</div>
            <div style={panelStyles.cardValue}>{formatNumber(card.value)}</div>
            <div style={panelStyles.cardDesc}>{card.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

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

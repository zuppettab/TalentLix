
import { useEffect, useMemo, useState } from 'react';
import { computeAthleteScoreSegments, buildStarFills, STAR_COUNT, SEGMENTS_PER_STAR } from '../../utils/athleteScore';
import { supabase } from '../../utils/supabaseClient';

const COLORS = {
  impressions: '#27E3DA',
  views: '#F7B84E',
  unlocks: '#6C63FF',
  messages: '#FF7B7B',
};

const DEFAULT_STATS = {
  search_impressions: 0,
  profile_views: 0,
  contact_unlocks: 0,
  messaging_operators: 0,
  first_seen_at: null,
  last_seen_at: null,
};

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

const STAR_PATH = 'M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.516 8.279L12 18.896l-7.452 4.517 1.516-8.279L0 9.306l8.332-1.151z';

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

export default function AthleteStatsPanel({ athlete, isMobile, contactsVerification }) {
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

        const [distinctMessagingOperators] = await Promise.all([
          fetchDistinctMessagingOperators(athlete.id),
        ]);

        const nextStats = {
          ...DEFAULT_STATS,
          ...(data || {}),
          first_seen_at: (data?.first_seen_at || athlete?.created_at || null),
          messaging_operators: distinctMessagingOperators,
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

  const performanceSegments = useMemo(
    () => computeAthleteScoreSegments({ athlete, stats, contactsVerification }),
    [athlete, stats, contactsVerification],
  );

  const starFills = useMemo(() => buildStarFills(performanceSegments), [performanceSegments]);

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

      <div style={panelStyles.scoreRow}>
        <div style={panelStyles.scoreTextWrap}>
          <div style={panelStyles.scoreLabel}>Talent score</div>
          <div style={panelStyles.scoreHint}>Earn up to five stars by completing your setup and engaging with operators.</div>
        </div>
        <div style={panelStyles.starsWrap}>
          {starFills.map((fill, idx) => {
            const gradientId = `athlete-star-grad-${idx}`;
            return (
              <svg
                key={gradientId}
                width="32"
                height="32"
                viewBox="0 0 24 24"
                aria-label={`${Math.round(fill * 3)} of 3 segments filled`}
                style={panelStyles.starSvg}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F7B84E" />
                    <stop offset={`${fill * 100}%`} stopColor="#F7B84E" />
                    <stop offset={`${fill * 100}%`} stopColor="transparent" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path d={STAR_PATH} fill="#F1F1F1" stroke="#E0E0E0" strokeWidth="0.6" />
                <path d={STAR_PATH} fill={`url(#${gradientId})`} />
              </svg>
            );
          })}
          <div style={panelStyles.scoreValue}>
            {(performanceSegments / SEGMENTS_PER_STAR).toFixed(1)} / {STAR_COUNT}
          </div>
        </div>
      </div>

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
  scoreRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    border: '1px solid #E0E0E0',
    borderRadius: 14,
    background: '#FCFCFC',
  },
  scoreTextWrap: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 180 },
  scoreLabel: { fontSize: 14, fontWeight: 700 },
  scoreHint: { fontSize: 12, color: '#555', lineHeight: 1.4 },
  starsWrap: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  starSvg: { width: 28, height: 28 },
  scoreValue: { fontSize: 13, fontWeight: 600, color: '#555', marginLeft: 4 },
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

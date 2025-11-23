import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

const RANGE_RECENT = 'recent';
const RANGE_ALL = 'all';

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

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

const formatDateLabel = (value) => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date?.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const monthsBetween = (start, end) => {
  if (!start || !end) return 0;
  const years = end.getFullYear() - start.getFullYear();
  const months = end.getMonth() - start.getMonth();
  return years * 12 + months + 1;
};

const distributeCounts = (total, buckets) => {
  const count = Math.max(1, buckets);
  const series = [];
  let allocated = 0;
  for (let i = 0; i < count; i += 1) {
    const target = Math.round(((i + 1) / count) * total);
    const value = Math.max(0, target - allocated);
    series.push(value);
    allocated += value;
  }
  return series;
};

const buildChartData = (rawStats, rangeMode) => {
  const stats = rawStats || DEFAULT_STATS;
  const now = new Date();
  const firstSeen = stats.first_seen_at ? new Date(stats.first_seen_at) : null;
  const lastSeen = stats.last_seen_at ? new Date(stats.last_seen_at) : now;
  const safeFirst = firstSeen && !Number.isNaN(firstSeen.getTime()) ? firstSeen : null;
  const safeLast = lastSeen && !Number.isNaN(lastSeen.getTime()) ? lastSeen : now;

  const recentStart = new Date(now);
  recentStart.setMonth(now.getMonth() - 3);
  const baseStart = rangeMode === RANGE_RECENT ? recentStart : safeFirst || recentStart;
  const effectiveStart = safeFirst ? (baseStart > safeFirst ? baseStart : safeFirst) : baseStart;

  const totalDurationDays = Math.max(1, Math.round((safeLast - (safeFirst || safeLast)) / (1000 * 60 * 60 * 24)));
  const rangeDurationDays = Math.max(1, Math.round((safeLast - effectiveStart) / (1000 * 60 * 60 * 24)));
  const ratio = safeFirst ? clamp(rangeDurationDays / totalDurationDays, 0, 1) : 1;

  const impressions = Math.round(Number(stats.search_impressions || 0) * ratio);
  const views = Math.round(Number(stats.profile_views || 0) * ratio);
  const unlocks = Math.round(Number(stats.contact_unlocks || 0) * ratio);

  const bucketCount = rangeMode === RANGE_RECENT
    ? 3
    : clamp(monthsBetween(effectiveStart, safeLast), 3, 6);

  const bucketLabels = [];
  const cursor = new Date(effectiveStart);
  cursor.setDate(1);
  for (let i = 0; i < bucketCount; i += 1) {
    const label = cursor.toLocaleDateString(undefined, { month: 'short' });
    bucketLabels.push(label);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const series = {
    impressions: distributeCounts(impressions, bucketCount),
    views: distributeCounts(views, bucketCount),
    unlocks: distributeCounts(unlocks, bucketCount),
  };

  const maxValue = Math.max(
    1,
    ...series.impressions,
    ...series.views,
    ...series.unlocks,
  );

  return {
    labels: bucketLabels,
    series,
    maxValue,
    rangeText: rangeMode === RANGE_RECENT ? 'Last 3 months' : 'Since first tracking',
    firstSeen: safeFirst,
    lastSeen: safeLast,
  };
};

export default function AthleteStatsPanel({ athlete, isMobile }) {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rangeMode, setRangeMode] = useState(RANGE_RECENT);

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

  const chartData = useMemo(() => buildChartData(stats, rangeMode), [stats, rangeMode]);

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
  ];

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
        <div style={panelStyles.rangeSwitch}>
          <button
            type="button"
            onClick={() => setRangeMode(RANGE_RECENT)}
            style={{
              ...panelStyles.rangeBtn,
              ...(rangeMode === RANGE_RECENT ? panelStyles.rangeBtnActive : null),
            }}
          >
            Last 3 months
          </button>
          <button
            type="button"
            onClick={() => setRangeMode(RANGE_ALL)}
            style={{
              ...panelStyles.rangeBtn,
              ...(rangeMode === RANGE_ALL ? panelStyles.rangeBtnActive : null),
            }}
          >
            Since the beginning
          </button>
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

      <div style={panelStyles.chartBox}>
        <div style={panelStyles.chartHeader}>
          <div>
            <div style={panelStyles.chartTitle}>{chartData.rangeText}</div>
            <div style={panelStyles.chartMeta}>
              First seen: {formatDateLabel(chartData.firstSeen)} · Last activity: {formatDateLabel(chartData.lastSeen)}
            </div>
          </div>
          {loading && <span style={panelStyles.chartMeta}>Updating…</span>}
        </div>

        <div style={panelStyles.chartLegend}>
          <LegendDot color={COLORS.impressions} label="Search impressions" />
          <LegendDot color={COLORS.views} label="Full profile views" />
          <LegendDot color={COLORS.unlocks} label="Contact unlocks" />
        </div>

        <BarChart labels={chartData.labels} series={chartData.series} maxValue={chartData.maxValue} />
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div style={panelStyles.legendItem}>
      <span style={{ ...panelStyles.legendDot, background: color }} />
      <span style={panelStyles.legendLabel}>{label}</span>
    </div>
  );
}

function BarChart({ labels, series, maxValue }) {
  const height = 140;
  const barWidth = 18;
  const barGap = 4;
  const groupGap = 16;
  const barsPerGroup = 3;
  const groupWidth = barsPerGroup * barWidth + (barsPerGroup - 1) * barGap;
  const width = labels.length > 0
    ? labels.length * groupWidth + Math.max(0, labels.length - 1) * groupGap
    : groupWidth;

  const buildBar = (value, groupIdx, barIdx, color) => {
    const normalizedValue = Math.max(0, Number(value || 0));
    const barHeight = (normalizedValue / maxValue) * height;
    const x = groupIdx * (groupWidth + groupGap) + barIdx * (barWidth + barGap);
    const y = height - barHeight;

    return (
      <rect
        key={`${groupIdx}-${barIdx}`}
        x={x}
        y={y}
        width={barWidth}
        height={barHeight}
        rx={4}
        ry={4}
        fill={color}
      />
    );
  };

  return (
    <div style={panelStyles.chartArea}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={panelStyles.chartSvg}>
        {labels.map((_, idx) => (
          <g key={`group-${idx}`}>
            {buildBar(series.impressions?.[idx], idx, 0, COLORS.impressions)}
            {buildBar(series.views?.[idx], idx, 1, COLORS.views)}
            {buildBar(series.unlocks?.[idx], idx, 2, COLORS.unlocks)}
          </g>
        ))}
      </svg>
      <div
        style={{
          ...panelStyles.chartLabels,
          gridTemplateColumns: `repeat(${Math.max(1, labels.length)}, 1fr)`,
        }}
      >
        {labels.map((label, idx) => (
          <span key={`${label}-${idx}`} style={panelStyles.chartLabel}>{label}</span>
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
  rangeSwitch: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  rangeBtn: {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #E0E0E0',
    background: '#FFF',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  },
  rangeBtnActive: {
    borderColor: '#27E3DA',
    background: '#E8FFFB',
    color: '#027373',
    boxShadow: '0 0 0 2px rgba(39, 227, 218, 0.18)',
  },
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
  chartBox: {
    border: '1px solid #E0E0E0',
    borderRadius: 14,
    padding: '14px 16px',
    background: '#FFFFFF',
    boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
  },
  chartHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chartTitle: { fontSize: 16, fontWeight: 700 },
  chartMeta: { fontSize: 12, color: '#555' },
  chartLegend: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: '50%' },
  legendLabel: { fontSize: 12, color: '#444' },
  chartArea: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  chartSvg: { width: '100%', height: 180 },
  chartLabels: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 4,
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
  },
  chartLabel: { fontSize: 12, color: '#555' },
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


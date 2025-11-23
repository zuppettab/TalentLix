import { normalizeSupabaseError } from './internalEnablerApi';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const normalizeUuid = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!UUID_REGEX.test(trimmed)) return null;
  return trimmed;
};

const EVENT_COLUMN_MAP = {
  search_impression: 'search_impressions',
  profile_view: 'profile_views',
  contact_unlock: 'contact_unlocks',
};

const coerceCount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const incrementAthleteSearchStats = async (client, athleteIds, eventType) => {
  if (!client) {
    throw new Error('A Supabase client is required to update athlete search stats.');
  }

  const column = EVENT_COLUMN_MAP[eventType];
  if (!column) {
    throw new Error(`Unsupported event type: ${eventType}`);
  }

  const normalizedIds = Array.from(new Set((athleteIds || [])
    .map((id) => normalizeUuid(id))
    .filter(Boolean)));

  if (!normalizedIds.length) {
    return { updated: [] };
  }

  const nowIso = new Date().toISOString();

  const { data: existingRows, error: lookupError } = await client
    .from('athlete_search_stats')
    .select('athlete_id, search_impressions, profile_views, contact_unlocks, first_seen_at')
    .in('athlete_id', normalizedIds);

  if (lookupError) {
    throw normalizeSupabaseError('Athlete search stats lookup', lookupError);
  }

  const existingMap = new Map();
  (existingRows || []).forEach((row) => {
    existingMap.set(row?.athlete_id, row || {});
  });

  const payloads = normalizedIds.map((athleteId) => {
    const existing = existingMap.get(athleteId) || {};
    const searchImpressions = coerceCount(existing.search_impressions);
    const profileViews = coerceCount(existing.profile_views);
    const contactUnlocks = coerceCount(existing.contact_unlocks);

    const nextCounts = {
      search_impressions: column === 'search_impressions' ? searchImpressions + 1 : searchImpressions,
      profile_views: column === 'profile_views' ? profileViews + 1 : profileViews,
      contact_unlocks: column === 'contact_unlocks' ? contactUnlocks + 1 : contactUnlocks,
    };

    return {
      athlete_id: athleteId,
      ...nextCounts,
      first_seen_at: existing.first_seen_at || nowIso,
      last_seen_at: nowIso,
    };
  });

  const { error: upsertError } = await client
    .from('athlete_search_stats')
    .upsert(payloads, { onConflict: 'athlete_id' });

  if (upsertError) {
    throw normalizeSupabaseError('Athlete search stats upsert', upsertError);
  }

  return { updated: normalizedIds, eventType };
};

export const EVENT_TYPES = Object.freeze(Object.keys(EVENT_COLUMN_MAP));

import {
  createHttpError,
  extractBearerToken,
} from '../../utils/internalEnablerApi';
import resolveAuthenticatedRequestContext from '../../utils/authenticatedApi';

const EVENT_TYPES = ['search_impression', 'profile_view', 'contact_unlock'];

const SOURCE_CANDIDATES = [
  { table: 'athlete_visibility_events', athleteKey: 'athlete_id', typeKey: 'event_type', dateKey: 'occurred_at' },
  { table: 'athlete_search_events', athleteKey: 'athlete_id', typeKey: 'event_type', dateKey: 'created_at' },
  { table: 'athlete_search_event', athleteKey: 'athlete_id', typeKey: 'event_type', dateKey: 'created_at' },
];

const normalizeEventType = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return EVENT_TYPES.includes(normalized) ? normalized : null;
};

const respondWithError = (res, error, fallbackMessage) => {
  const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
  const message = typeof error?.message === 'string' && error.message
    ? error.message
    : fallbackMessage;

  const body = { error: message };
  if (error?.code) body.code = error.code;
  if (error?.details) body.details = error.details;
  if (error?.hint) body.hint = error.hint;

  console.error('Athlete visibility events failed', error);
  return res.status(statusCode).json(body);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      throw createHttpError(401, 'Missing access token.');
    }

    const { client } = await resolveAuthenticatedRequestContext(accessToken);

    const {
      athleteId,
      athlete_id: athleteIdAlt,
      type,
      eventType,
      event_type: eventTypeAlt,
    } = req.query || {};

    const resolvedAthleteId = athleteId || athleteIdAlt;
    if (!resolvedAthleteId) {
      throw createHttpError(400, 'An athleteId is required.');
    }

    const resolvedType = normalizeEventType(type || eventType || eventTypeAlt);

    let lastError = null;

    for (const source of SOURCE_CANDIDATES) {
      try {
        let query = client
          .from(source.table)
          .select('*')
          .eq(source.athleteKey, resolvedAthleteId)
          .limit(200);

        if (resolvedType) {
          query = query.eq(source.typeKey, resolvedType);
        }

        if (source.dateKey) {
          query = query.order(source.dateKey, { ascending: false });
        }

        const { data, error } = await query;
        if (error) {
          // Skip missing tables/views or columns but surface other errors.
          if (error?.code === '42P01' || error?.code === '42703') {
            lastError = error;
            continue;
          }
          throw error;
        }

        return res.status(200).json({ events: data || [], source: source.table });
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return res.status(200).json({ events: [] });
  } catch (error) {
    return respondWithError(res, error, 'Unable to load visibility activity.');
  }
}

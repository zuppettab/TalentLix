import {
  createHttpError,
  extractBearerToken,
} from '../../utils/internalEnablerApi';
import { resolveOperatorRequestContext } from '../../utils/operatorApi';
import {
  EVENT_TYPES,
  incrementAthleteSearchStats,
  normalizeUuid,
} from '../../utils/athleteSearchStats';

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

  console.error('Athlete search stats update failed', error);
  return res.status(statusCode).json(body);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      throw createHttpError(401, 'Missing access token.');
    }

    const { client } = await resolveOperatorRequestContext(accessToken, { requireServiceRole: true });

    const {
      athleteIds,
      athlete_ids: athleteIdsAlt,
      athleteId,
      athlete_id: athleteIdAlt,
      eventType,
      event_type: eventTypeAlt,
    } = req.body || {};

    const ids = [
      ...(Array.isArray(athleteIds) ? athleteIds : []),
      ...(Array.isArray(athleteIdsAlt) ? athleteIdsAlt : []),
    ];

    if (athleteId) ids.push(athleteId);
    if (athleteIdAlt) ids.push(athleteIdAlt);

    const normalizedIds = Array.from(new Set(ids.map((id) => normalizeUuid(id)).filter(Boolean)));
    if (!normalizedIds.length) {
      throw createHttpError(400, 'At least one valid athleteId is required.');
    }

    const resolvedEvent = normalizeEventType(eventType) || normalizeEventType(eventTypeAlt);
    if (!resolvedEvent) {
      throw createHttpError(400, 'Unsupported or missing eventType.');
    }

    await incrementAthleteSearchStats(client, normalizedIds, resolvedEvent);

    return res.status(200).json({ success: true, athleteIds: normalizedIds, eventType: resolvedEvent });
  } catch (error) {
    return respondWithError(res, error, 'Unable to update athlete statistics.');
  }
}

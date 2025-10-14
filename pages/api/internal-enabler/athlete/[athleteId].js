import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
  resolveAdminRequestContext,
} from '../../../../utils/internalEnablerApi';

const pushEvent = (target, timestamp, title, description = '') => {
  if (!timestamp) return;
  const date = new Date(timestamp);
  const sortKey = Number.isNaN(date.getTime()) ? null : date.getTime();
  target.push({
    timestamp,
    sortKey,
    title,
    description,
  });
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

    const { client } = await resolveAdminRequestContext(accessToken, { requireServiceRole: true });

    const { athleteId } = req.query || {};
    const rawId = Array.isArray(athleteId) ? athleteId[0] : athleteId;
    if (!rawId) {
      throw createHttpError(400, 'A valid athlete id must be provided.');
    }

    const athletePromise = client.from('athlete').select('*').eq('id', rawId).maybeSingle();
    const contactsPromise = client
      .from('contacts_verification')
      .select('*')
      .eq('athlete_id', rawId)
      .order('verification_status_changed_at', { ascending: false })
      .order('submitted_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
    const sportsPromise = client
      .from('sports_experiences')
      .select('*')
      .eq('athlete_id', rawId)
      .order('id', { ascending: false });
    const careerPromise = client
      .from('athlete_career')
      .select('*')
      .eq('athlete_id', rawId)
      .order('season_start', { ascending: false })
      .order('id', { ascending: false });
    const physicalPromise = client
      .from('physical_data')
      .select('*')
      .eq('athlete_id', rawId)
      .order('created_at', { ascending: false })
      .limit(1);
    const socialPromise = client
      .from('social_profiles')
      .select('*')
      .eq('athlete_id', rawId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    const awardsPromise = client
      .from('awards_recognitions')
      .select('*')
      .eq('athlete_id', rawId)
      .order('season_start', { ascending: false })
      .order('date_awarded', { ascending: false });
    const mediaPromise = client
      .from('media_item')
      .select('*')
      .eq('athlete_id', rawId);

    const [
      athleteResult,
      contactsResult,
      sportsResult,
      careerResult,
      physicalResult,
      socialResult,
      awardsResult,
      mediaResult,
    ] = await Promise.all([
      athletePromise,
      contactsPromise,
      sportsPromise,
      careerPromise,
      physicalPromise,
      socialPromise,
      awardsPromise,
      mediaPromise,
    ]);

    if (athleteResult.error) throw normalizeSupabaseError('Athlete record', athleteResult.error);
    if (contactsResult.error) throw normalizeSupabaseError('Contacts verification', contactsResult.error);
    if (sportsResult.error) throw normalizeSupabaseError('Sports experiences', sportsResult.error);
    if (careerResult.error) throw normalizeSupabaseError('Athlete career', careerResult.error);
    if (physicalResult.error) throw normalizeSupabaseError('Physical data', physicalResult.error);
    if (socialResult.error) throw normalizeSupabaseError('Social profiles', socialResult.error);
    if (awardsResult.error) throw normalizeSupabaseError('Awards recognitions', awardsResult.error);
    if (mediaResult.error) throw normalizeSupabaseError('Media items', mediaResult.error);

    const athlete = athleteResult.data || null;
    if (!athlete) {
      throw createHttpError(404, 'Athlete not found.');
    }

    const contacts = (contactsResult.data || [])[0] || null;
    const sports = sportsResult.data || [];
    const career = careerResult.data || [];
    const physical = (physicalResult.data || [])[0] || null;
    const social = socialResult.data || [];
    const awards = awardsResult.data || [];
    const mediaItems = mediaResult.data || [];

    let gamesMeta = [];
    const gameIds = mediaItems
      .filter((item) => (item?.category || '').toLowerCase() === 'game')
      .map((item) => item.id)
      .filter(Boolean);

    if (gameIds.length) {
      const metaResult = await client
        .from('media_game_meta')
        .select('*')
        .in('media_item_id', gameIds);
      if (metaResult.error) {
        throw normalizeSupabaseError('Media game metadata', metaResult.error);
      }
      gamesMeta = metaResult.data || [];
    }

    const groupedMedia = mediaItems.reduce((acc, item) => {
      const category = (item?.category || 'uncategorized').toLowerCase();
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {});

    Object.values(groupedMedia).forEach((list) => {
      list.sort((a, b) => {
        const sortA = Number(a?.sort_order ?? 0);
        const sortB = Number(b?.sort_order ?? 0);
        if (sortA !== sortB) return sortA - sortB;
        return String(b?.created_at || '').localeCompare(String(a?.created_at || ''));
      });
    });

    const activity = [];
    pushEvent(activity, athlete.created_at, 'Profile created');
    pushEvent(activity, athlete.updated_at, 'Profile updated');
    if (contacts) {
      pushEvent(activity, contacts.created_at, 'Verification record created');
      pushEvent(activity, contacts.submitted_at, 'Identity submitted');
      pushEvent(activity, contacts.verification_status_changed_at, 'Verification status updated', contacts.review_status);
      pushEvent(activity, contacts.verified_at, 'Identity verified');
      pushEvent(activity, contacts.updated_at, 'Verification record updated');
    }
    sports.forEach((row) => {
      pushEvent(activity, row.created_at, 'Sport experience added', row.sport || row.role || '');
    });
    career.forEach((row) => {
      pushEvent(activity, row.created_at, 'Career entry added', `${row.team || ''} ${row.season_start || ''}`.trim());
    });
    awards.forEach((row) => {
      pushEvent(activity, row.date_awarded || row.created_at, 'Award recorded', row.title || row.competition || '');
    });

    const sortedActivity = activity
      .sort((a, b) => (b.sortKey ?? 0) - (a.sortKey ?? 0))
      .slice(0, 25);

    return res.status(200).json({
      athlete,
      contacts,
      sports,
      career,
      physical,
      social,
      awards,
      media: {
        grouped: groupedMedia,
        raw: mediaItems,
        gamesMeta,
      },
      activity: sortedActivity,
    });
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to load athlete details.';
    const code = typeof error?.code === 'string' && error.code ? error.code : undefined;
    const details = typeof error?.details === 'string' && error.details ? error.details : undefined;
    const hint = typeof error?.hint === 'string' && error.hint ? error.hint : undefined;

    console.error('Internal enabler athlete detail failed', error);

    const body = { error: message };
    if (code) body.code = code;
    if (details) body.details = details;
    if (hint) body.hint = hint;

    return res.status(statusCode).json(body);
  }
}

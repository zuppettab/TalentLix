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
      .order('id', { ascending: false })
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

    let athleteEmail = typeof athlete?.email === 'string' ? athlete.email : null;
    if (!athleteEmail && athlete?.id && client?.auth?.admin?.getUserById) {
      try {
        const { data, error } = await client.auth.admin.getUserById(athlete.id);
        if (error) {
          console.error('Failed to load athlete auth user', error);
        } else {
          athleteEmail = data?.user?.email || null;
        }
      } catch (userError) {
        console.error('Failed to load athlete auth user', userError);
      }
    }

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

    const MEDIA_BUCKET = 'media';

    const resolveSignedUrl = async (path) => {
      if (!path) return '';
      if (/^https?:\/\//i.test(String(path))) return path;
      if (!client?.storage || typeof client.storage.from !== 'function') {
        return '';
      }
      try {
        const { data, error } = await client.storage.from(MEDIA_BUCKET).createSignedUrl(path, 300);
        if (error) return '';
        return data?.signedUrl || '';
      } catch (signError) {
        console.error('Failed to sign media asset', signError);
        return '';
      }
    };

    const mediaWithUrls = await Promise.all(
      mediaItems.map(async (item) => {
        const [url, thumbnail_url] = await Promise.all([
          resolveSignedUrl(item.external_url ? item.external_url : item.storage_path),
          resolveSignedUrl(item.thumbnail_path || ''),
        ]);

        return {
          ...item,
          url,
          thumbnail_url,
        };
      })
    );

    const gamesMetaMap = new Map((gamesMeta || []).map((meta) => [meta.media_item_id, meta]));

    const mediaWithMeta = mediaWithUrls.map((item) => ({
      ...item,
      meta: gamesMetaMap.get(item.id) || null,
    }));

    const groupedMedia = mediaWithMeta.reduce((acc, item) => {
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
    const normalizedContacts = contacts
      ? {
          ...contacts,
          phone: contacts.phone ?? contacts.phone_number ?? null,
          phone_number: contacts.phone_number ?? contacts.phone ?? null,
          residence_city: contacts.residence_city ?? contacts.city ?? contacts.city_name ?? contacts.town ?? null,
          residence_country: contacts.residence_country ?? contacts.country ?? contacts.country_name ?? null,
          id_verified:
            typeof contacts.id_verified === 'boolean'
              ? contacts.id_verified
              : Boolean(contacts.verified_at),
          phone_verified:
            typeof contacts.phone_verified === 'boolean'
              ? contacts.phone_verified
              : Boolean(contacts.phone_verified_at),
        }
      : {};

    if (athleteEmail) {
      normalizedContacts.athlete_email = athleteEmail;
    } else if (typeof normalizedContacts.athlete_email !== 'string') {
      delete normalizedContacts.athlete_email;
    }

    const hasContactRecord = Boolean(contacts);
    if (hasContactRecord) {
      const createdAt = normalizedContacts.created_at
        || normalizedContacts.inserted_at
        || normalizedContacts.created
        || null;
      pushEvent(activity, createdAt, 'Verification record created');
      pushEvent(activity, normalizedContacts.submitted_at, 'Identity submitted');
      pushEvent(
        activity,
        normalizedContacts.verification_status_changed_at,
        'Verification status updated',
        normalizedContacts.review_status,
      );
      pushEvent(activity, normalizedContacts.verified_at, 'Identity verified');
      pushEvent(activity, normalizedContacts.updated_at, 'Verification record updated');
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

    const normalizedSocial = social.map((row) => ({
      ...row,
      url: row.profile_url || row.url || '',
      profile_url: row.profile_url || row.url || '',
    }));

    return res.status(200).json({
      athlete,
      contacts: Object.keys(normalizedContacts).length ? normalizedContacts : null,
      sports,
      career,
      physical,
      social: normalizedSocial,
      awards,
      media: {
        grouped: groupedMedia,
        raw: mediaWithMeta,
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

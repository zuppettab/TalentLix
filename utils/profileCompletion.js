const BASE_COMPLETION = 40;
const SECTION_WEIGHT = 10;

const MEDIA_CATEGORIES = {
  FEATURED_HEAD: 'featured_headshot',
  FEATURED_G1: 'featured_game1',
  FEATURED_G2: 'featured_game2',
  GALLERY: 'gallery',
  INTRO: 'intro',
  HIGHLIGHT: 'highlight',
  GAME: 'game',
};

const REQUIRED_GAME_META_KEYS = ['match_date', 'opponent', 'competition', 'season', 'team_level'];

function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'boolean') return value === true;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Date) return true;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

function countFilled(values) {
  const total = values.length;
  if (total === 0) return { filled: 0, total: 0, ratio: 0 };
  let filled = 0;
  for (const v of values) {
    if (isFilled(v)) filled += 1;
  }
  return { filled, total, ratio: filled / total };
}

function evaluateContacts(athlete, contactsVerification) {
  const cv = contactsVerification || {};
  const fields = [
    athlete?.phone,
    cv.id_document_type,
    cv.id_document_url,
    cv.id_selfie_url,
    cv.residence_region || cv.state_region,
    cv.residence_postal_code || cv.postal_code,
    cv.residence_address || cv.address,
    cv.residence_city,
    cv.residence_country,
  ];
  if ((cv.id_document_type || '').toLowerCase() === 'other') {
    fields.push(cv.id_document_type_other);
  }
  const stats = countFilled(fields);
  const reviewStatus = (cv.review_status || '').toLowerCase();
  const contributes = stats.total > 0 && stats.ratio === 1 && reviewStatus === 'approved';
  return { ...stats, contributes, reviewStatus };
}

function evaluateSports(experience) {
  if (!experience) return { filled: 0, total: 0, ratio: 0, contributes: false };
  const groups = [
    experience.sport,
    experience.role,
    experience.category,
    experience.team,
    experience.previous_team,
    experience.years_experience,
    experience.seeking_team === true || experience.seeking_team === false ? true : null,
    experience.secondary_role,
    experience.playing_style,
    (experience.contract_status || experience.contract_end_date || experience.contract_notes) ? true : null,
    Array.isArray(experience.preferred_regions) && experience.preferred_regions.length ? experience.preferred_regions : null,
    experience.trial_window,
    (experience.is_represented || experience.agent_name || experience.agency_name) ? true : null,
  ];
  const stats = countFilled(groups);
  return { ...stats, contributes: stats.ratio >= 0.6 };
}

function evaluatePhysical(physicalRow) {
  if (!physicalRow) return { filled: 0, total: 0, ratio: 0, contributes: false };
  const groups = [
    physicalRow.physical_measured_at,
    physicalRow.height_cm,
    physicalRow.weight_kg,
    physicalRow.wingspan_cm,
    physicalRow.standing_reach_cm,
    physicalRow.body_fat_percent,
    physicalRow.dominant_hand,
    physicalRow.dominant_foot,
    physicalRow.dominant_eye,
    physicalRow.physical_notes,
    physicalRow.performance_measured_at,
    (physicalRow.grip_strength_left_kg || physicalRow.grip_strength_right_kg) ? true : null,
    physicalRow.vertical_jump_cmj_cm,
    physicalRow.standing_long_jump_cm,
    (physicalRow.sprint_10m_s || physicalRow.sprint_20m_s || physicalRow.pro_agility_5_10_5_s) ? true : null,
    physicalRow.sit_and_reach_cm,
    physicalRow.plank_hold_s,
    physicalRow.cooper_12min_m,
    physicalRow.performance_notes,
  ];
  const stats = countFilled(groups);
  return { ...stats, contributes: stats.ratio >= 0.6 };
}

function evaluateAwards(awards) {
  const rows = Array.isArray(awards) ? awards : [];
  let filled = 0;
  let total = 0;
  for (const row of rows) {
    const parts = [
      row.title,
      row.awarding_entity,
      row.date_awarded || row.season_start || row.season_end,
      row.description,
      row.evidence_file_path || row.evidence_external_url,
    ];
    const stats = countFilled(parts);
    filled += stats.filled;
    total += stats.total;
  }
  const ratio = total ? filled / total : 0;
  return { filled, total, ratio, contributes: ratio >= 0.6 };
}

function evaluateMedia(mediaItems, mediaGameMeta) {
  const items = Array.isArray(mediaItems) ? mediaItems : [];
  const metaMap = new Map();
  if (Array.isArray(mediaGameMeta)) {
    for (const row of mediaGameMeta) {
      if (row && row.media_item_id != null) metaMap.set(row.media_item_id, row);
    }
  }
  const byCategory = (cat) => items.filter((it) => (it?.category || '') === cat);
  const oneByCategory = (cat) => items.find((it) => (it?.category || '') === cat) || null;

  const featuredHead = oneByCategory(MEDIA_CATEGORIES.FEATURED_HEAD);
  const featuredG1 = oneByCategory(MEDIA_CATEGORIES.FEATURED_G1);
  const featuredG2 = oneByCategory(MEDIA_CATEGORIES.FEATURED_G2);
  const intro = oneByCategory(MEDIA_CATEGORIES.INTRO);

  const gallery = byCategory(MEDIA_CATEGORIES.GALLERY);
  const highlights = byCategory(MEDIA_CATEGORIES.HIGHLIGHT);
  const gamesRaw = byCategory(MEDIA_CATEGORIES.GAME);
  const games = gamesRaw.filter((item) => {
    const meta = metaMap.get(item?.id) || {};
    return REQUIRED_GAME_META_KEYS.every((key) => isFilled(meta[key]));
  });

  const slots = [
    featuredHead,
    featuredG1,
    featuredG2,
    intro,
    gallery.length >= 1,
    gallery.length >= 2,
    gallery.length >= 3,
    highlights.length >= 1,
    highlights.length >= 2,
    games.length >= 1,
    games.length >= 2,
  ];
  const stats = countFilled(slots);
  return { ...stats, contributes: stats.ratio >= 0.6 };
}

function evaluateSocial(socialProfiles) {
  const rows = Array.isArray(socialProfiles) ? socialProfiles : [];
  let filled = 0;
  let total = 0;
  for (const row of rows) {
    const stats = countFilled([
      row?.platform,
      row?.profile_url,
      row?.handle,
    ]);
    filled += stats.filled;
    total += stats.total;
  }
  const ratio = total ? filled / total : 0;
  return { filled, total, ratio, contributes: ratio >= 0.6 };
}

export function computeProfileCompletion({
  athlete,
  contactsVerification,
  sportsExperience,
  physical,
  awards,
  mediaItems,
  mediaGameMeta,
  socialProfiles,
} = {}) {
  const breakdown = {
    contacts: evaluateContacts(athlete, contactsVerification),
    sports: evaluateSports(sportsExperience),
    physical: evaluatePhysical(physical),
    awards: evaluateAwards(awards),
    media: evaluateMedia(mediaItems, mediaGameMeta),
    social: evaluateSocial(socialProfiles),
  };

  let completion = BASE_COMPLETION;
  for (const key of Object.keys(breakdown)) {
    if (breakdown[key].contributes) completion += SECTION_WEIGHT;
  }
  if (completion > 100) completion = 100;
  return { completion, breakdown };
}

export { MEDIA_CATEGORIES };

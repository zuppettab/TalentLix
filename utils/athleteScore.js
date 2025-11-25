// Utility helpers for computing the "Talent score" for an athlete profile.
//
// Usage:
//   import { computeAthleteScoreSegments, buildStarFills, STAR_COUNT, SEGMENTS_PER_STAR } from '../utils/athleteScore';
//
//   const segments = computeAthleteScoreSegments({ athlete, stats, contactsVerification });
//   const starFillFractions = buildStarFills(segments); // optional: to render partial stars
//
// - `athlete`: athlete object, must include `completion_percentage`, `current_step`, optional `created_at`.
// - `stats`: object with numeric fields `profile_views`, `contact_unlocks`, `messaging_operators`.
// - `contactsVerification`: object with `review_status` to verify contacts approval.
//
// The function returns the number of performance segments earned (0..MAX_SEGMENTS).
// Each star is divided into three segments, so divide by `SEGMENTS_PER_STAR` to get the star count.
// If you only need the raw numeric score (e.g., "4.3 / 5"), call
// `(segments / SEGMENTS_PER_STAR).toFixed(1)`.

const STAR_COUNT = 5;
const SEGMENTS_PER_STAR = 3;
const MAX_SEGMENTS = STAR_COUNT * SEGMENTS_PER_STAR;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const computeAthleteScoreSegments = ({ athlete, stats = {}, contactsVerification }) => {
  if (!athlete) return 0;

  let segments = 0;
  const completion = Number(athlete?.completion_percentage ?? 0);
  const hasCompletedWizard = athlete?.current_step == null && completion >= 40;
  const hasVerifiedContacts = (contactsVerification?.review_status || '').trim().toLowerCase() === 'approved';

  if (hasCompletedWizard) segments += SEGMENTS_PER_STAR;
  if (hasVerifiedContacts) segments += SEGMENTS_PER_STAR;

  if (completion >= 100) segments += 1;

  const profileViews = Math.floor(Number(stats.profile_views || 0) / 20);
  const contactUnlocks = Math.floor(Number(stats.contact_unlocks || 0) / 5);
  const messagingOperators = Math.floor(Number(stats.messaging_operators || 0) / 3);

  segments += profileViews + contactUnlocks + messagingOperators;

  return clamp(segments, 0, MAX_SEGMENTS);
};

const buildStarFills = (segments) => {
  const fills = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const remaining = clamp(segments - (i * SEGMENTS_PER_STAR), 0, SEGMENTS_PER_STAR);
    fills.push(remaining / SEGMENTS_PER_STAR);
  }
  return fills;
};

export { STAR_COUNT, SEGMENTS_PER_STAR, computeAthleteScoreSegments, buildStarFills };

// @ts-check

/** Official list of Operator Dashboard sections (UI copy in EN only). */
export const OPERATOR_SECTIONS = [
  { id: 'entity', title: 'Entity data' },
  { id: 'contacts', title: 'Contacts' },
  { id: 'identity', title: 'Identity' },
  { id: 'wallet', title: 'Wallet' },
  { id: 'search', title: 'Search' },
  { id: 'unlocked', title: 'Unlocked athletes' },
  { id: 'messages', title: 'Messages' },
  { id: 'privacy', title: 'Privacy & Security' },
];

/** @type {'entity'|'contacts'|'identity'|'wallet'|'search'|'unlocked'|'messages'|'privacy'} */
export const DEFAULT_OPERATOR_SECTION = 'entity';

/** Validate a section id coming from the URL (e.g. ?section=...). */
export function isValidOperatorSection(id) {
  return OPERATOR_SECTIONS.some(section => section.id === id);
}

/** Find a section by id, or null if not found. */
export function getOperatorSectionById(id) {
  return OPERATOR_SECTIONS.find(section => section.id === id) || null;
}

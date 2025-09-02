// @ts-check

/** Official list of Athlete Dashboard sections (UI copy in EN only). */
export const SECTIONS = [
  { id: 'personal',  title: 'Personal data' },
  { id: 'contacts',  title: 'Contacts and Identity' },
  { id: 'sports',    title: 'Sport info' },
  { id: 'physical',  title: 'Physical data' },
  { id: 'media',     title: 'Media' },
  { id: 'social',    title: 'Social' },
  { id: 'awards',    title: 'Awards' },
  { id: 'privacy',   title: 'Privacy & consent' },
];

/** @type {'personal'|'contacts'|'sports'|'physical'|'media'|'social'|'awards'|'privacy'} */
export const DEFAULT_SECTION = 'personal';

/** Validate a section id coming from the URL (e.g. ?section=...). */
export function isValidSection(id) {
  return SECTIONS.some(s => s.id === id);
}

/** Find a section by id, or null if not found. */
export function getSectionById(id) {
  return SECTIONS.find(s => s.id === id) || null;
}

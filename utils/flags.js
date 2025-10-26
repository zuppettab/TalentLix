const FALLBACK_MAP = {
  italy: 'IT',
  italia: 'IT',
  france: 'FR',
  spain: 'ES',
  germany: 'DE',
  usa: 'US',
  'united states': 'US',
  uk: 'GB',
  'united kingdom': 'GB',
  england: 'GB',
  romania: 'RO',
  portugal: 'PT',
  poland: 'PL',
  greece: 'GR',
  brazil: 'BR',
  argentina: 'AR',
  canada: 'CA',
  mexico: 'MX',
  belgium: 'BE',
  netherlands: 'NL',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  finland: 'FI',
  switzerland: 'CH',
  croatia: 'HR',
  slovenia: 'SI',
  serbia: 'RS',
  'czech republic': 'CZ',
  slovakia: 'SK',
  austria: 'AT',
  polska: 'PL',
  espana: 'ES',
  francia: 'FR',
  deutschland: 'DE',
  sverige: 'SE',
  norge: 'NO',
  suomi: 'FI',
  schweiz: 'CH',
  brasil: 'BR',
};

const A = 0x1f1e6;
const BASE = 'A'.charCodeAt(0);

export const flagFromCountry = (name = '') => {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return '';

  const alpha2 = /^[a-z]{2}$/i.test(normalized)
    ? normalized.toUpperCase()
    : (FALLBACK_MAP[normalized] || '');

  if (!alpha2) return '';

  return [...alpha2]
    .map((char) => String.fromCodePoint(A + (char.charCodeAt(0) - BASE)))
    .join('');
};

export default flagFromCountry;

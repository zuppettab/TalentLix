export const DEFAULT_UNLOCK_ID_COLUMNS = [
  'op_id',
  'operator_id',
  'op_account_id',
  'operator_account_id',
];

export const DEFAULT_UNLOCK_EXPIRY_COLUMNS = [
  'expires_at',
  'expires_on',
  'valid_until',
  'valid_to',
  'visibility_expires_at',
  'access_expires_at',
];

export const OPERATOR_UNLOCK_SOURCE_CATALOG = [
  { name: 'op_contact_unlock', kind: 'table' },
  { name: 'op_contact_unlocks', kind: 'table' },
  { name: 'op_unlock', kind: 'table' },
  { name: 'op_unlocks', kind: 'table' },
  { name: 'operator_contact_unlock', kind: 'table' },
  { name: 'operator_contact_unlocks', kind: 'table' },
  { name: 'op_athlete_unlock', kind: 'table' },
  { name: 'op_athlete_unlocks', kind: 'table' },
  { name: 'op_contact_unlock_history', kind: 'table' },
  { name: 'operator_unlock', kind: 'table' },
  { name: 'operator_unlocks', kind: 'table' },
  { name: 'v_op_unlocks_active', kind: 'view', optional: true, expiryColumns: ['expires_at'] },
  { name: 'v_op_unlocks', kind: 'view', optional: true, expiryColumns: ['expires_at'] },
];

export const OPERATOR_UNLOCK_VIEW_SOURCES = OPERATOR_UNLOCK_SOURCE_CATALOG.filter(
  (source) => source.kind === 'view',
);

export const OPERATOR_UNLOCK_TABLE_SOURCES = OPERATOR_UNLOCK_SOURCE_CATALOG.filter(
  (source) => source.kind !== 'view',
);

export default {
  DEFAULT_UNLOCK_ID_COLUMNS,
  DEFAULT_UNLOCK_EXPIRY_COLUMNS,
  OPERATOR_UNLOCK_SOURCE_CATALOG,
  OPERATOR_UNLOCK_VIEW_SOURCES,
  OPERATOR_UNLOCK_TABLE_SOURCES,
};

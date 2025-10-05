import { OPERATOR_ROLE } from './authRoles';

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const extractRoleFromRecord = (record) => {
  if (!record || typeof record !== 'object') return null;

  const directRole = record.role || record.user_role || record.account_role;
  if (typeof directRole === 'string') return directRole.toLowerCase();

  const metadataRole = record?.metadata?.role || record?.user_metadata?.role || record?.app_metadata?.role;
  if (typeof metadataRole === 'string') return metadataRole.toLowerCase();

  return null;
};

const candidateTables = ['operator_profiles', 'profiles', 'operators'];

const queryOperatorTable = async (supabaseClient, table, email) =>
  supabaseClient
    .from(table)
    .select('id, email, role, user_role, account_role, metadata, user_metadata, app_metadata')
    .ilike('email', email)
    .maybeSingle();

export const fetchOperatorByEmail = async (supabaseClient, rawEmail) => {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { data: null, error: new Error('Email is missing.') };
  }

  if (!supabaseClient) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  for (const table of candidateTables) {
    try {
      const { data, error } = await queryOperatorTable(supabaseClient, table, email);

      if (error) {
        if (error.code === '42P01') {
          // Table does not exist; try next candidate.
          continue;
        }

        if (error.code === 'PGRST116') {
          // No rows returned for this table; try next candidate.
          continue;
        }

        return { data: null, error };
      }

      if (data) {
        return { data, error: null };
      }
    } catch (err) {
      return { data: null, error: err };
    }
  }

  return { data: null, error: null };
};

export const isOperatorRecord = (record) => extractRoleFromRecord(record) === OPERATOR_ROLE;

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const normalizeStatus = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const ACTIVE_ACCOUNT_STATUSES = new Set(['active', 'approved']);
const COMPLETED_WIZARD_STATUSES = new Set(['complete', 'completed']);

const mapOperatorRow = (row) => {
  if (!row || typeof row !== 'object') return null;

  const { op_account: account, ...contact } = row;

  return {
    contact,
    account: account ?? null,
  };
};

export const fetchOperatorByEmail = async (supabaseClient, rawEmail) => {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { data: null, error: new Error('Email is missing.') };
  }

  if (!supabaseClient) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  try {
    const { data, error } = await supabaseClient
      .from('op_contact')
      .select(
        `
          id,
          email_primary,
          op_account!inner (
            id,
            status,
            wizard_status,
            operator_type,
            operator_type_id
          )
        `
      )
      .ilike('email_primary', email)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found for the provided email.
        return { data: null, error: null };
      }

      return { data: null, error };
    }

    return { data: mapOperatorRow(data), error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const isOperatorRecord = (record) => {
  if (!record || typeof record !== 'object') return false;

  const contactEmail = normalizeEmail(record?.contact?.email_primary);
  if (!contactEmail) return false;

  const account = record.account;
  if (!account || typeof account !== 'object') return false;

  const status = normalizeStatus(account.status);
  const wizardStatus = normalizeStatus(account.wizard_status);

  if (ACTIVE_ACCOUNT_STATUSES.has(status)) return true;

  if (COMPLETED_WIZARD_STATUSES.has(wizardStatus)) return true;

  const operatorType = account.operator_type ?? account.operator_type_id;
  if (typeof operatorType === 'string') {
    return operatorType.trim() !== '';
  }

  if (typeof operatorType === 'number') {
    return true;
  }

  return false;
};

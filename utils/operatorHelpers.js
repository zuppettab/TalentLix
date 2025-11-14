const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const normalizeStatus = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const ACTIVE_ACCOUNT_STATUSES = new Set(['active']);
const COMPLETED_WIZARD_STATUSES = new Set(['complete', 'completed', 'submitted']);

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
          op_id,
          email_primary,
          op_account!inner (
            id,
            status,
            wizard_status,
            type_id
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

  const contact = record.contact;
  const opId = contact?.op_id;
  if (typeof opId !== 'string' || opId.trim() === '') return false;

  const account = record.account;
  if (!account || typeof account !== 'object') return false;

  const accountId = account.id;
  if (typeof accountId !== 'string' || accountId.trim() === '') return false;

  const status = normalizeStatus(account.status);
  const wizardStatus = normalizeStatus(account.wizard_status);

  if (!ACTIVE_ACCOUNT_STATUSES.has(status)) return false;

  if (!COMPLETED_WIZARD_STATUSES.has(wizardStatus)) return false;

  const typeId = account.type_id;
  if (typeof typeId === 'string') {
    return typeId.trim() !== '';
  }

  if (typeof typeId === 'number') {
    return Number.isFinite(typeId);
  }

  return false;
};

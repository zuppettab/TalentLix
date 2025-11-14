const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const normalizeStatus = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const ACTIVE_ACCOUNT_STATUSES = new Set(['active']);
const COMPLETED_WIZARD_STATUSES = new Set(['complete', 'completed', 'submitted']);

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
};

const mapOperatorRow = (row) => {
  if (!row || typeof row !== 'object') return null;

  const { op_account: accountRaw, ...contact } = row;
  const account = toArray(accountRaw)[0] ?? null;

  return {
    contact,
    account,
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
    const selection = `
      op_id,
      email_primary,
      op_account!inner (
        id,
        status,
        wizard_status,
        type_id
      )
    `;

    const { data: exactRow, error: exactError } = await supabaseClient
      .from('op_contact')
      .select(selection)
      .eq('email_primary', email)
      .maybeSingle();

    if (exactError && exactError.code !== 'PGRST116') {
      return { data: null, error: exactError };
    }

    let candidate = exactRow || null;

    if (!candidate) {
      const { data: fuzzyRows, error: fuzzyError } = await supabaseClient
        .from('op_contact')
        .select(selection)
        .ilike('email_primary', `%${email}%`)
        .limit(5);

      if (fuzzyError) {
        return { data: null, error: fuzzyError };
      }

      const match = toArray(fuzzyRows).find(
        (row) => normalizeEmail(row?.email_primary) === email
      );

      candidate = match ?? null;
    }

    if (!candidate) {
      return { data: null, error: null };
    }

    return { data: mapOperatorRow(candidate), error: null };
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

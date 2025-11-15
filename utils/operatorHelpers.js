const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

const normalizeStatus = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const ACTIVE_ACCOUNT_STATUSES = new Set(['active']);
const COMPLETED_WIZARD_STATUSES = new Set(['complete', 'completed', 'submitted']);

const isEligibleAccount = (account) => {
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

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const mapOperatorRow = (row) => {
  if (!row || typeof row !== 'object') return null;

  const { op_account: rawAccount, ...contact } = row;
  const eligibleAccounts = toArray(rawAccount).filter(isEligibleAccount);

  if (eligibleAccounts.length > 1) {
    console.warn('Multiple eligible operator accounts found during mapping.', {
      opId: row?.op_id,
      email: row?.email_primary,
      accountIds: eligibleAccounts.map((account) => account.id),
    });
  }

  const account = eligibleAccounts[0] ?? null;

  if (!account) {
    console.warn('No eligible operator account found during mapping.', {
      opId: row?.op_id,
      email: row?.email_primary,
    });
  }

  return {
    contact,
    account,
  };
};

const runEmailLookup = async (supabaseClient, comparator, value) => {
  let query = supabaseClient
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
    );

  if (comparator === 'eq') {
    query = query.eq('email_primary', value);
  } else if (comparator === 'ilike') {
    query = query.ilike('email_primary', value);
  } else {
    throw new Error(`Unsupported comparator: ${comparator}`);
  }

  const { data, error } = await query;

  if (error) {
    return { data: [], error };
  }

  if (!data) {
    return { data: [], error: null };
  }

  return { data: Array.isArray(data) ? data : [data], error: null };
};

const normalizeLookupResults = (rows) =>
  rows
    .map(mapOperatorRow)
    .filter(Boolean);

export const fetchOperatorByEmail = async (supabaseClient, rawEmail) => {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { data: null, error: new Error('Email is missing.') };
  }

  if (!supabaseClient) {
    return { data: null, error: new Error('Supabase client is not configured.') };
  }

  const lookups = [
    { comparator: 'eq', value: email },
    { comparator: 'ilike', value: `%${email.replace(/\s+/g, '%')}%` },
  ];

  try {
    for (const lookup of lookups) {
      const { data: rows, error } = await runEmailLookup(
        supabaseClient,
        lookup.comparator,
        lookup.value
      );

      if (error) {
        if (error.code === 'PGRST116') {
          continue;
        }

        console.error('Operator lookup failed.', {
          comparator: lookup.comparator,
          value: lookup.value,
          error,
        });
        return { data: null, error };
      }

      const records = normalizeLookupResults(rows);
      const eligibleRecords = records.filter(isOperatorRecord);

      if (eligibleRecords.length > 1) {
        console.warn('Multiple eligible operator accounts found for email lookup.', {
          email,
          comparator: lookup.comparator,
          accountIds: eligibleRecords.map((record) => record.account?.id).filter(Boolean),
        });
        return { data: eligibleRecords[0], error: null };
      }

      if (eligibleRecords.length === 1) {
        return { data: eligibleRecords[0], error: null };
      }

      if (records.length === 1) {
        return { data: records[0], error: null };
      }

      if (records.length > 1) {
        console.warn('Multiple operator records found for email lookup with no eligible accounts.', {
          email,
          comparator: lookup.comparator,
          opIds: records.map((record) => record.contact?.op_id).filter(Boolean),
        });
        return { data: records[0], error: null };
      }
    }

    console.warn('No eligible operator account found for email lookup.', { email });
    return { data: null, error: null };
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
  if (!isEligibleAccount(account)) return false;

  return true;
};

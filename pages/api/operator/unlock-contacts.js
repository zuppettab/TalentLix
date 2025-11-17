import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
} from '../../../utils/internalEnablerApi';
import { resolveOperatorRequestContext } from '../../../utils/operatorApi';
import { loadOperatorContactBundle } from './athlete-contacts';
import { sendEmail } from '../../../utils/emailService';

const CONTACT_UNLOCK_TABLE_CANDIDATES = [
  'op_contact_unlocks',
  'op_contact_unlock',
  'op_unlocks',
  'op_unlock',
  'operator_contact_unlocks',
  'operator_contact_unlock',
  'op_athlete_unlocks',
  'op_athlete_unlock',
  'op_contact_unlock_history',
  'operator_unlocks',
  'operator_unlock',
];

const OPERATOR_COLUMN_CANDIDATES = ['op_id', 'operator_id', 'op_account_id', 'operator_account_id'];
const ATHLETE_COLUMN_CANDIDATES = ['athlete_id', 'athlete', 'talent_id', 'player_id', 'athlete_uuid'];
const UNLOCKED_AT_COLUMN_CANDIDATES = ['unlocked_at', 'granted_at', 'created_at', 'access_granted_at'];
const EXPIRES_AT_COLUMN_CANDIDATES = [
  'expires_at',
  'expires_on',
  'valid_until',
  'valid_to',
  'visibility_expires_at',
  'access_expires_at',
];

const ERROR_TABLE_MISSING = new Set(['42P01', 'PGRST205']);
const ERROR_COLUMN_MISSING = new Set(['42703', 'PGRST204']);
const ERROR_VIEW_READONLY = new Set(['0A000', '42809']);
const ERROR_CONFLICT = new Set(['23505']);
const ERROR_NOT_NULL = new Set(['23502']);

const extractConstraintColumn = (error) => {
  if (!error) return null;

  if (typeof error.column === 'string' && error.column.trim()) {
    return error.column.trim();
  }

  const fields = [error.message, error.details, error.hint];
  for (const field of fields) {
    if (typeof field !== 'string') continue;
    const columnMatch = field.match(/column\s+"([^"]+)"/i);
    if (columnMatch && columnMatch[1]) {
      return columnMatch[1].trim();
    }
    const keyMatch = field.match(/\(([^)]+)\)=\(null\)/i);
    if (keyMatch && keyMatch[1]) {
      return keyMatch[1].trim();
    }
  }

  return null;
};

const markColumnStatus = (cache, column, result) => {
  if (!column) return result;
  cache.set(column, result);
  return result;
};

const checkColumnAvailability = async (client, tableName, column, cache) => {
  if (!column) return { ok: true };
  if (cache.has(column)) {
    return cache.get(column);
  }

  const { error } = await client.from(tableName).select(column).limit(1);

  if (!error) {
    return markColumnStatus(cache, column, { ok: true });
  }

  const code = typeof error?.code === 'string' ? error.code.trim() : '';

  if (code && ERROR_COLUMN_MISSING.has(code)) {
    return markColumnStatus(cache, column, { ok: false, reason: 'missing_column' });
  }

  if (code && ERROR_TABLE_MISSING.has(code)) {
    return markColumnStatus(cache, column, { ok: false, reason: 'missing_table' });
  }

  throw normalizeSupabaseError(`Operator contact unlock column check (${tableName}.${column})`, error);
};

const recordContactUnlock = async (client, operatorId, athleteId, unlockedAt, expiresAt) => {
  const expiresCandidates = [null, ...EXPIRES_AT_COLUMN_CANDIDATES];
  const unlockedCandidates = [null, ...UNLOCKED_AT_COLUMN_CANDIDATES];

  const isCandidateMatch = (column, candidates) =>
    typeof column === 'string' && candidates.includes(column);

  for (const tableName of CONTACT_UNLOCK_TABLE_CANDIDATES) {
    const columnCache = new Map();
    let tableUnavailable = false;
    let tableReadOnly = false;

    tableLoop:
    for (const opColumn of OPERATOR_COLUMN_CANDIDATES) {
      const opStatus = await checkColumnAvailability(client, tableName, opColumn, columnCache);
      if (opStatus.reason === 'missing_table') {
        tableUnavailable = true;
        break tableLoop;
      }
      if (!opStatus.ok) {
        continue;
      }

      for (const athleteColumn of ATHLETE_COLUMN_CANDIDATES) {
        const athleteStatus = await checkColumnAvailability(client, tableName, athleteColumn, columnCache);
        if (athleteStatus.reason === 'missing_table') {
          tableUnavailable = true;
          break tableLoop;
        }
        if (!athleteStatus.ok) {
          continue;
        }

        for (const unlockedColumn of unlockedCandidates) {
          if (unlockedColumn) {
            const unlockedStatus = await checkColumnAvailability(client, tableName, unlockedColumn, columnCache);
            if (unlockedStatus.reason === 'missing_table') {
              tableUnavailable = true;
              break tableLoop;
            }
            if (!unlockedStatus.ok) {
              continue;
            }
          }

          for (const expiresColumn of expiresCandidates) {
            if (expiresColumn) {
              const expiresStatus = await checkColumnAvailability(client, tableName, expiresColumn, columnCache);
              if (expiresStatus.reason === 'missing_table') {
                tableUnavailable = true;
                break tableLoop;
              }
              if (!expiresStatus.ok) {
                continue;
              }
            }

            const payload = {
              [opColumn]: operatorId,
              [athleteColumn]: athleteId,
            };

            if (unlockedColumn) {
              payload[unlockedColumn] = unlockedAt;
            }

            if (expiresColumn) {
              payload[expiresColumn] = expiresAt ?? null;
            }

            const { error } = await client
              .from(tableName)
              .insert(payload, { returning: 'minimal' });

            if (!error) {
              return { table: tableName, mode: 'insert' };
            }

            const code = typeof error?.code === 'string' ? error.code.trim() : '';

            if (code && ERROR_NOT_NULL.has(code)) {
              const missingColumn = extractConstraintColumn(error);

              if (
                (!unlockedColumn && (!missingColumn || isCandidateMatch(missingColumn, UNLOCKED_AT_COLUMN_CANDIDATES))) ||
                (!expiresColumn && (!missingColumn || isCandidateMatch(missingColumn, EXPIRES_AT_COLUMN_CANDIDATES))) ||
                (expiresColumn && expiresAt == null && (!missingColumn || missingColumn === expiresColumn))
              ) {
                continue;
              }
            }

            if (code && ERROR_TABLE_MISSING.has(code)) {
              tableUnavailable = true;
              break tableLoop;
            }

            if (code && ERROR_VIEW_READONLY.has(code)) {
              tableReadOnly = true;
              break tableLoop;
            }

            if (code && ERROR_COLUMN_MISSING.has(code)) {
              // Refresh cache so subsequent attempts skip missing columns.
              for (const columnName of [opColumn, athleteColumn, unlockedColumn, expiresColumn].filter(Boolean)) {
                await checkColumnAvailability(client, tableName, columnName, columnCache);
              }
              continue;
            }

            if (code && ERROR_CONFLICT.has(code)) {
              const updatePayload = {};
              if (unlockedColumn) {
                updatePayload[unlockedColumn] = unlockedAt;
              }
              if (expiresColumn) {
                updatePayload[expiresColumn] = expiresAt ?? null;
              }

              if (Object.keys(updatePayload).length === 0) {
                return { table: tableName, mode: 'noop' };
              }

              const { error: updateError } = await client
                .from(tableName)
                .update(updatePayload, { returning: 'minimal' })
                .eq(opColumn, operatorId)
                .eq(athleteColumn, athleteId);

              if (!updateError) {
                return { table: tableName, mode: 'update' };
              }

              const updateCode = typeof updateError?.code === 'string' ? updateError.code.trim() : '';

              if (updateCode && ERROR_NOT_NULL.has(updateCode)) {
                const missingColumn = extractConstraintColumn(updateError);

                if (
                  (!expiresColumn && (!missingColumn || isCandidateMatch(missingColumn, EXPIRES_AT_COLUMN_CANDIDATES))) ||
                  (expiresColumn && expiresAt == null && (!missingColumn || missingColumn === expiresColumn))
                ) {
                  continue;
                }
              }

              if (updateCode && ERROR_TABLE_MISSING.has(updateCode)) {
                tableUnavailable = true;
                break tableLoop;
              }

              if (updateCode && ERROR_VIEW_READONLY.has(updateCode)) {
                tableReadOnly = true;
                break tableLoop;
              }

              if (updateCode && ERROR_COLUMN_MISSING.has(updateCode)) {
                for (const columnName of [opColumn, athleteColumn, unlockedColumn, expiresColumn].filter(Boolean)) {
                  await checkColumnAvailability(client, tableName, columnName, columnCache);
                }
                continue;
              }

              throw normalizeSupabaseError(`Operator contact unlock update (${tableName})`, updateError);
            }

            throw normalizeSupabaseError(`Operator contact unlock insert (${tableName})`, error);
          }
          if (tableUnavailable || tableReadOnly) {
            break;
          }
        }
        if (tableUnavailable || tableReadOnly) {
          break;
        }
      }
      if (tableUnavailable || tableReadOnly) {
        break;
      }
    }

    if (tableReadOnly) {
      console.warn('Contact unlock table is read-only; skipping to next candidate.', { tableName });
      continue;
    }

    if (!tableUnavailable) {
      // Table exists but no compatible columns were found.
      continue;
    }
  }

  // Nessuna tabella dedicata: lo sblocco è derivato da op_wallet_tx via view.
  return { table: null, mode: 'wallet_tx_only' };
};

const PRODUCT_CODE = 'UNLOCK_CONTACTS';
const TX_KIND = 'DEBIT_CONTACT_UNLOCK';
const TX_REF_PREFIX = 'unlock:athlete:';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeUuid = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!UUID_REGEX.test(trimmed)) return null;
  return trimmed;
};

const normalizeString = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed || '';
};

const normalizeNamePart = (value) => {
  const normalized = normalizeString(value);
  return normalized || null;
};

const normalizeEmail = (value) => normalizeString(value);

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const pickFirst = (value) => {
  const arr = toArray(value);
  return arr.length ? arr[0] : null;
};

const formatFullName = (firstName, lastName, fallback = '') => {
  const parts = [normalizeNamePart(firstName), normalizeNamePart(lastName)].filter(Boolean);
  if (parts.length) {
    return parts.join(' ');
  }
  return fallback;
};

const formatUnlockExpiryLabel = (isoString) => {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toUTCString().replace('GMT', 'UTC');
};

const buildAthleteNotificationPayload = ({
  athleteEmail,
  athleteFirstName,
  operatorDisplayName,
  operatorTypeLabel,
}) => {
  const to = normalizeEmail(athleteEmail);
  if (!to) return null;

  const greeting = athleteFirstName ? `Hi ${athleteFirstName},` : 'Hello,';
  const resolvedOperatorName = operatorDisplayName || 'a TalentLix operator';
  const operatorTypeSuffix = operatorTypeLabel ? ` (${operatorTypeLabel})` : '';
  const operatorDescriptor = `${resolvedOperatorName}${operatorTypeSuffix}`;

  const subject = 'A TalentLix operator viewed your profile';
  const text = `${greeting}

Congratulations! ${operatorDescriptor} has unlocked and viewed your full TalentLix profile.

Keep your information up to date to make the most of this opportunity.

TalentLix Team`;
  const html = `<p>${greeting}</p>
<p>Congratulations! <strong>${resolvedOperatorName}</strong>${operatorTypeSuffix} has unlocked and viewed your full TalentLix profile.</p>
<p>Keep your information up to date to make the most of this opportunity.</p>
<p>TalentLix Team</p>`;

  return { to, subject, text, html };
};

const formatCreditsLabel = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const normalized = Math.round(number * 100) / 100;
  return Number.isInteger(normalized) ? `${normalized}` : normalized.toFixed(2);
};

const buildOperatorNotificationPayload = ({
  operatorEmail,
  athleteFullName,
  expiryLabel,
  creditsSpent,
  walletBalance,
}) => {
  const to = normalizeEmail(operatorEmail);
  if (!to) return null;

  const resolvedAthleteName = athleteFullName || 'this athlete';
  const subject = 'Athlete contact unlock confirmed';
  const greeting = 'Hello,';
  const availabilityLine = expiryLabel
    ? `Full contact details will remain available until ${expiryLabel}.`
    : 'Full contact details will remain available while this unlock stays active.';
  const htmlAvailabilityLine = expiryLabel
    ? `Full contact details will remain available until <strong>${expiryLabel}</strong>.`
    : 'Full contact details will remain available while this unlock stays active.';

  const creditsSpentLabel = formatCreditsLabel(creditsSpent);
  const walletBalanceLabel = formatCreditsLabel(walletBalance);
  const spendLine = creditsSpentLabel
    ? `Credits spent on this unlock: ${creditsSpentLabel}.`
    : null;
  const balanceLine = walletBalanceLabel
    ? `Wallet balance after this unlock: ${walletBalanceLabel}.`
    : null;
  const htmlSpendLine = creditsSpentLabel
    ? `Credits spent on this unlock: <strong>${creditsSpentLabel}</strong>.`
    : null;
  const htmlBalanceLine = walletBalanceLabel
    ? `Wallet balance after this unlock: <strong>${walletBalanceLabel}</strong>.`
    : null;

  const text = `${greeting}

You just unlocked the athlete ${resolvedAthleteName}.
${availabilityLine}

${spendLine ? spendLine : ''}
${balanceLine ? balanceLine : ''}

TalentLix Team`;
  const htmlLines = [
    `<p>${greeting}</p>`,
    `<p>You just unlocked the athlete <strong>${resolvedAthleteName}</strong>.</p>`,
    `<p>${htmlAvailabilityLine}</p>`,
  ];

  if (htmlSpendLine) {
    htmlLines.push(`<p>${htmlSpendLine}</p>`);
  }

  if (htmlBalanceLine) {
    htmlLines.push(`<p>${htmlBalanceLine}</p>`);
  }

  htmlLines.push('<p>TalentLix Team</p>');

  const html = htmlLines.join('');

  return { to, subject, text, html };
};

const sendUnlockNotificationEmails = async ({ athletePayload, operatorPayload }) => {
  const tasks = [];

  if (athletePayload) {
    tasks.push(
      sendEmail(athletePayload).catch((error) => {
        console.error('Failed to send athlete unlock notification email', error);
      })
    );
  }

  if (operatorPayload) {
    tasks.push(
      sendEmail(operatorPayload).catch((error) => {
        console.error('Failed to send operator unlock confirmation email', error);
      })
    );
  }

  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
};

const fetchAthleteIdentityForNotifications = async (client, athleteId) => {
  try {
    const { data, error } = await client
      .from('athlete')
      .select('first_name, last_name, email')
      .eq('id', athleteId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    let email = normalizeEmail(data?.email);

    if (!email && client?.auth?.admin?.getUserById) {
      try {
        const { data: authData, error: authError } = await client.auth.admin.getUserById(athleteId);
        if (authError) throw authError;
        email = normalizeEmail(authData?.user?.email);
      } catch (authLookupError) {
        console.error('Unlock notification fallback auth lookup failed', authLookupError);
      }
    }

    if (!data && !email) {
      return null;
    }

    return {
      first_name: normalizeNamePart(data?.first_name),
      last_name: normalizeNamePart(data?.last_name),
      email,
    };
  } catch (identityError) {
    console.error('Unable to load athlete identity for unlock notifications', identityError);
    return null;
  }
};

const respondWithError = (res, error, fallbackMessage) => {
  const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
  const message = typeof error?.message === 'string' && error.message
    ? error.message
    : fallbackMessage;

  const body = { error: message };
  if (error?.code) body.code = error.code;
  if (error?.details) body.details = error.details;
  if (error?.hint) body.hint = error.hint;

  console.error('Operator unlock request failed', error);
  return res.status(statusCode).json(body);
};

const parsePricingRow = (row) => {
  if (!row || typeof row !== 'object') {
    throw createHttpError(400, 'Unlock pricing is not configured.');
  }

  const creditsCost = Number(row.credits_cost ?? 0);
  if (!Number.isFinite(creditsCost) || creditsCost <= 0) {
    throw createHttpError(400, 'Unlock pricing is invalid.');
  }

  const validityDays = Number.isFinite(Number(row.validity_days))
    ? Number(row.validity_days)
    : null;

  return {
    creditsCost: Math.round(creditsCost * 100) / 100,
    validityDays,
  };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      throw createHttpError(401, 'Missing access token.');
    }

    const { client, user } = await resolveOperatorRequestContext(accessToken, { requireServiceRole: true });

    const { athleteId, athlete_id: athleteIdAlt, id: idParam } = req.body || {};
    const resolvedId = normalizeUuid(athleteId || athleteIdAlt || idParam);

    if (!resolvedId) {
      throw createHttpError(400, 'A valid athleteId must be provided.');
    }

    const operatorEmail = normalizeEmail(user?.email);

    const { data: accountRow, error: accountError } = await client
      .from('op_account')
      .select(`
        id,
        op_profile:op_profile(legal_name, trade_name, website, logo_url, city, state_region, country),
        op_type:op_type(code, name)
      `)
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (accountError) {
      throw normalizeSupabaseError('Operator account lookup', accountError);
    }

    const operatorId = accountRow?.id;
    if (!operatorId) {
      throw createHttpError(403, 'Operator account not found for the current user.');
    }

    const operatorProfile = pickFirst(accountRow?.op_profile);
    const operatorType = pickFirst(accountRow?.op_type);
    const operatorNameCandidates = [
      operatorProfile?.trade_name,
      operatorProfile?.legal_name,
      user?.user_metadata?.full_name,
      user?.user_metadata?.name,
      user?.email,
    ];
    const resolvedOperatorName = operatorNameCandidates
      .map((value) => normalizeNamePart(value))
      .find(Boolean);

    if (!resolvedOperatorName) {
      console.warn('Operator display name fallback used during contact unlock', {
        operatorId,
        candidateSources: operatorNameCandidates,
      });
    }

    const operatorDisplayName = resolvedOperatorName || 'a TalentLix operator';
    const operatorTypeLabel =
      normalizeString(operatorType?.name) || normalizeString(operatorType?.code) || '';

    const { data: activeUnlock, error: activeUnlockError } = await client
      .from('v_op_unlocks_active')
      .select('unlocked_at, expires_at')
      .eq('op_id', operatorId)
      .eq('athlete_id', resolvedId)
      .maybeSingle();

    if (activeUnlockError && activeUnlockError.code !== 'PGRST116') {
      throw normalizeSupabaseError('Active unlock lookup', activeUnlockError);
    }

    if (activeUnlock) {
      return res.status(200).json({
        success: true,
        alreadyUnlocked: true,
        unlock: {
          unlocked_at: activeUnlock.unlocked_at || null,
          expires_at: activeUnlock.expires_at || null,
        },
      });
    }

    const nowIso = new Date().toISOString();

    const { data: pricingRows, error: pricingError } = await client
      .from('pricing')
      .select('id, credits_cost, validity_days, effective_from, effective_to')
      .eq('code', PRODUCT_CODE)
      .lte('effective_from', nowIso)
      .or(`effective_to.is.null,effective_to.gte.${nowIso}`)
      .order('effective_from', { ascending: false, nullsFirst: false })
      .limit(1);

    if (pricingError) {
      throw normalizeSupabaseError('Unlock pricing lookup', pricingError);
    }

    const pricingRow = Array.isArray(pricingRows) ? pricingRows[0] : pricingRows;
    const { creditsCost, validityDays } = parsePricingRow(pricingRow);

    const { data: walletRow, error: walletError } = await client
      .from('op_wallet')
      .select('op_id, balance_credits')
      .eq('op_id', operatorId)
      .maybeSingle();

    if (walletError) {
      throw normalizeSupabaseError('Operator wallet lookup', walletError);
    }

    const currentBalance = Number(walletRow?.balance_credits ?? 0);

    if (!walletRow) {
      const insufficient = createHttpError(400, 'Insufficient credits to unlock contacts.');
      insufficient.code = 'insufficient_credits';
      throw insufficient;
    }

    const nextBalanceRaw = Math.round((currentBalance - creditsCost) * 100) / 100;

    if (nextBalanceRaw < -0.005) {
      const insufficient = createHttpError(400, 'Insufficient credits to unlock contacts.');
      insufficient.code = 'insufficient_credits';
      throw insufficient;
    }

    // Wallet transactions enforce a non-negative credit value. The
    // transaction direction is inferred via the kind, therefore we log the
    // absolute credit amount here and update the balance separately.
    const txPayload = {
      op_id: operatorId,
      kind: TX_KIND,
      status: 'SETTLED',
      credits: creditsCost,
      amount_eur: null,
      provider: 'TalentLix',
      package_code: PRODUCT_CODE,
      tx_ref: `${TX_REF_PREFIX}${resolvedId}`,
      settled_at: nowIso,
    };

    const { data: insertedRows, error: insertError } = await client
      .from('op_wallet_tx')
      .insert(txPayload)
      .select('id')
      .maybeSingle();

    if (insertError) {
      throw normalizeSupabaseError('Wallet transaction creation', insertError);
    }

    const txId = insertedRows?.id || null;

    const { error: updateError } = await client
      .from('op_wallet')
      .update({ balance_credits: nextBalanceRaw })
      .eq('op_id', operatorId)
      .select('op_id')
      .maybeSingle();

    if (updateError) {
      if (txId) {
        await client.from('op_wallet_tx').delete().eq('id', txId);
      }
      throw normalizeSupabaseError('Wallet balance update', updateError);
    }

    const unlockedAt = nowIso;
    const expiresAt = Number.isFinite(validityDays) && validityDays > 0
      ? new Date(new Date(nowIso).getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    try {
      await recordContactUnlock(client, operatorId, resolvedId, unlockedAt, expiresAt);
    } catch (recordError) {
      if (txId) {
        try {
          await client.from('op_wallet_tx').delete().eq('id', txId);
        } catch (cleanupTxError) {
          console.error('Failed to rollback wallet transaction after unlock error', cleanupTxError);
        }
      }

      try {
        await client
          .from('op_wallet')
          .update({ balance_credits: currentBalance })
          .eq('op_id', operatorId);
      } catch (rollbackError) {
        console.error('Failed to rollback wallet balance after unlock error', rollbackError);
      }

      throw recordError;
    }

    const { data: unlockRow, error: unlockError } = await client
      .from('v_op_unlocks_active')
      .select('unlocked_at, expires_at')
      .eq('op_id', operatorId)
      .eq('athlete_id', resolvedId)
      .maybeSingle();

    if (unlockError && unlockError.code !== 'PGRST116') {
      throw normalizeSupabaseError('Unlock verification', unlockError);
    }

    let contacts = null;
    try {
      contacts = await loadOperatorContactBundle(client, operatorId, resolvedId);
    } catch (bundleError) {
      console.error('Unable to refresh operator contact bundle after unlock', bundleError);
    }

    const contactFirstName = normalizeNamePart(contacts?.first_name);
    const contactLastName = normalizeNamePart(contacts?.last_name);
    const contactEmail = normalizeEmail(contacts?.email);
    const needsIdentityFallback = !contactEmail || (!contactFirstName && !contactLastName);
    const fallbackIdentity = needsIdentityFallback
      ? await fetchAthleteIdentityForNotifications(client, resolvedId)
      : null;

    const athleteFirstName = contactFirstName || fallbackIdentity?.first_name || null;
    const athleteLastName = contactLastName || fallbackIdentity?.last_name || null;
    const athleteEmail = contactEmail || fallbackIdentity?.email || '';
    const athleteFullName = formatFullName(athleteFirstName, athleteLastName, 'this athlete');
    const unlockExpiresAt = contacts?.expires_at || unlockRow?.expires_at || expiresAt || null;
    const expiryLabel = formatUnlockExpiryLabel(unlockExpiresAt);

    await sendUnlockNotificationEmails({
      athletePayload: buildAthleteNotificationPayload({
        athleteEmail,
        athleteFirstName,
        operatorDisplayName,
        operatorTypeLabel,
      }),
      operatorPayload: buildOperatorNotificationPayload({
        operatorEmail,
        athleteFullName,
        expiryLabel,
        creditsSpent: creditsCost,
        walletBalance: nextBalanceRaw,
      }),
    });

    return res.status(200).json({
      success: true,
      unlock: {
        unlocked_at: contacts?.unlocked_at || unlockRow?.unlocked_at || nowIso,
        expires_at: contacts?.expires_at || unlockRow?.expires_at || null,
      },
      balance: nextBalanceRaw,
      contacts,
    });
  } catch (error) {
    return respondWithError(res, error, 'Unable to unlock athlete contacts.');
  }
}


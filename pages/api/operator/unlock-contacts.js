import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
} from '../../../utils/internalEnablerApi';
import { resolveOperatorRequestContext } from '../../../utils/operatorApi';

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

    const { data: accountRow, error: accountError } = await client
      .from('op_account')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (accountError) {
      throw normalizeSupabaseError('Operator account lookup', accountError);
    }

    const operatorId = accountRow?.id;
    if (!operatorId) {
      throw createHttpError(403, 'Operator account not found for the current user.');
    }

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
    const { creditsCost } = parsePricingRow(pricingRow);

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

    const txPayload = {
      op_id: operatorId,
      kind: TX_KIND,
      status: 'SETTLED',
      credits: -creditsCost,
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

    const { data: unlockRow, error: unlockError } = await client
      .from('v_op_unlocks_active')
      .select('unlocked_at, expires_at')
      .eq('op_id', operatorId)
      .eq('athlete_id', resolvedId)
      .maybeSingle();

    if (unlockError && unlockError.code !== 'PGRST116') {
      throw normalizeSupabaseError('Unlock verification', unlockError);
    }

    return res.status(200).json({
      success: true,
      unlock: {
        unlocked_at: unlockRow?.unlocked_at || nowIso,
        expires_at: unlockRow?.expires_at || null,
      },
      balance: nextBalanceRaw,
    });
  } catch (error) {
    return respondWithError(res, error, 'Unable to unlock athlete contacts.');
  }
}


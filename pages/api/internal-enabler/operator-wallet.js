import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
  resolveAdminRequestContext,
} from '../../../utils/internalEnablerApi';

const parseAmount = (value) => {
  if (value == null) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;
  const normalized = String(value).replace(',', '.');
  const numeric = Number(normalized);
  if (Number.isNaN(numeric)) return NaN;
  return Math.round(numeric * 100) / 100;
};

const buildTxReference = () => {
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `TLX-ADMIN-${Date.now()}-${random}`;
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

    const { client } = await resolveAdminRequestContext(accessToken, { requireServiceRole: true });

    const { operatorId, amount, direction } = req.body || {};

    const rawId =
      typeof operatorId === 'string'
        ? operatorId.trim()
        : typeof operatorId === 'number'
          ? operatorId
          : null;

    if (!rawId) {
      throw createHttpError(400, 'A valid operatorId must be provided.');
    }

    const parsedAmount = parseAmount(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw createHttpError(400, 'A positive amount is required to update the wallet.');
    }

    const normalizedDirection = direction === 'debit' ? 'debit' : 'credit';

    const { data: walletRow, error: walletError } = await client
      .from('op_wallet')
      .select('op_id, balance_credits')
      .eq('op_id', rawId)
      .maybeSingle();

    if (walletError) {
      throw normalizeSupabaseError('Operator wallet lookup', walletError);
    }

    const currentBalance = Number(walletRow?.balance_credits ?? 0) || 0;
    const signedDelta = normalizedDirection === 'credit' ? parsedAmount : -parsedAmount;
    const nextBalanceRaw = currentBalance + signedDelta;

    if (normalizedDirection === 'debit' && nextBalanceRaw < -0.005) {
      throw createHttpError(400, 'Unable to deduct more credits than the available balance.');
    }

    if (!walletRow && normalizedDirection === 'debit') {
      throw createHttpError(400, 'No wallet found for the operator. Please add credits first.');
    }

    const nextBalance = Math.round(Math.max(nextBalanceRaw, 0) * 100) / 100;

    if (walletRow) {
      const { data: updatedRows, error: updateError } = await client
        .from('op_wallet')
        .update({ balance_credits: nextBalance })
        .eq('op_id', rawId)
        .select('op_id');

      if (updateError) {
        throw normalizeSupabaseError('Operator wallet update', updateError);
      }

      if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
        throw createHttpError(404, 'Wallet record not found for the requested operator.');
      }
    } else {
      const { data: insertedRows, error: insertError } = await client
        .from('op_wallet')
        .insert({ op_id: rawId, balance_credits: nextBalance })
        .select('op_id');

      if (insertError) {
        throw normalizeSupabaseError('Operator wallet creation', insertError);
      }

      if (!Array.isArray(insertedRows) || insertedRows.length === 0) {
        throw createHttpError(500, 'Unable to create a wallet for the operator.');
      }
    }

    const txRef = buildTxReference();
    // The transaction log enforces a non-negative credit amount; direction is inferred via the kind.
    const txCredits = parsedAmount;

    const baseTxPayload = {
      op_id: rawId,
      status: 'SETTLED',
      credits: txCredits,
      amount_eur: txCredits,
      package_code: 'ADMIN',
      provider: 'Internal Enabler',
      tx_ref: txRef,
      settled_at: new Date().toISOString(),
    };

    const preferredKinds =
      normalizedDirection === 'credit'
        ? ['ADMIN_TOPUP', 'TOPUP', 'MANUAL_TOPUP', 'CREDIT', 'MANUAL_CREDIT']
        : ['ADMIN_ADJUST', 'ADJUSTMENT', 'MANUAL_ADJUST', 'ADJUST', 'DEBIT', 'MANUAL_DEBIT'];

    let lastTxError = null;
    let selectedKind = null;

    for (const kind of preferredKinds) {
      const { error: txError } = await client
        .from('op_wallet_tx')
        .insert({
          ...baseTxPayload,
          kind,
        });

      if (!txError) {
        selectedKind = kind;
        if (kind !== preferredKinds[0]) {
          console.warn(
            `Falling back to wallet transaction kind "${kind}" due to enum mismatch for operator ${rawId}.`
          );
        }
        break;
      }

      lastTxError = txError;

      if (txError?.code !== '22P02') {
        throw normalizeSupabaseError('Operator wallet transaction logging', txError);
      }
    }

    if (!selectedKind) {
      throw normalizeSupabaseError('Operator wallet transaction logging', lastTxError);
    }

    return res.status(200).json({ success: true, balance: nextBalance });
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to update the operator wallet.';
    const code = typeof error?.code === 'string' && error.code ? error.code : undefined;
    const details = typeof error?.details === 'string' && error.details ? error.details : undefined;
    const hint = typeof error?.hint === 'string' && error.hint ? error.hint : undefined;

    console.error('Internal enabler wallet update failed', error);

    const body = { error: message };
    if (code) body.code = code;
    if (details) body.details = details;
    if (hint) body.hint = hint;

    return res.status(statusCode).json(body);
  }
}


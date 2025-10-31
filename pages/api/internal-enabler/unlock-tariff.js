import {
  createHttpError,
  extractBearerToken,
  normalizeSupabaseError,
  resolveAdminRequestContext,
} from '../../../utils/internalEnablerApi';
import {
  fetchActiveTariffWithFallback,
  normalizeTariffRow,
  UNLOCK_CONTACTS_PRODUCT_CODE,
} from '../../../utils/pricingAdmin';

const PRODUCT_CODE = UNLOCK_CONTACTS_PRODUCT_CODE;

const parseCredits = (value) => {
  if (value == null) return NaN;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : NaN;
  }
  const normalized = String(value).replace(',', '.');
  if (!normalized.trim()) return NaN;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return NaN;
  return Math.round(numeric * 100) / 100;
};

const parseValidityDays = (value) => {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return NaN;
  return Math.round(numeric);
};

const loadActiveTariff = async (client, nowIso = new Date().toISOString()) => {
  const { data, error } = await fetchActiveTariffWithFallback(client, {
    productCode: PRODUCT_CODE,
    nowIso,
  });

  if (error) {
    throw normalizeSupabaseError('Unlock tariff lookup', error);
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
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

    const { creditsCost, validityDays } = req.body || {};

    const parsedCredits = parseCredits(creditsCost);
    if (!Number.isFinite(parsedCredits) || parsedCredits < 0) {
      throw createHttpError(400, 'Enter a valid non-negative credit cost.');
    }

    const parsedValidity = parseValidityDays(validityDays);
    if (Number.isNaN(parsedValidity)) {
      throw createHttpError(400, 'Enter a valid non-negative number of days or leave empty.');
    }

    const nowIso = new Date().toISOString();
    const activeTariff = await loadActiveTariff(client, nowIso);

    if (activeTariff?.id) {
      const { error } = await client
        .from('pricing')
        .update({ credits_cost: parsedCredits, validity_days: parsedValidity })
        .eq('id', activeTariff.id);

      if (error) {
        throw normalizeSupabaseError('Unlock tariff update', error);
      }
    } else {
      const insertPayload = {
        code: PRODUCT_CODE,
        credits_cost: parsedCredits,
        validity_days: parsedValidity,
        effective_from: nowIso,
        effective_to: null,
      };

      const { error } = await client
        .from('pricing')
        .insert(insertPayload);

      if (error) {
        throw normalizeSupabaseError('Unlock tariff creation', error);
      }
    }

    const refreshedTariff = await loadActiveTariff(client, nowIso);

    return res.status(200).json({ success: true, tariff: normalizeTariffRow(refreshedTariff) });
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : 'Unable to update unlock tariff.';
    const body = { error: message };
    if (error?.code) body.code = error.code;
    if (error?.details) body.details = error.details;
    if (error?.hint) body.hint = error.hint;

    console.error('Internal enabler unlock tariff update failed', error);

    return res.status(statusCode).json(body);
  }
}

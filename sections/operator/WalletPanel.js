'use client';

import { useCallback, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../utils/supabaseClient';

const QUICK_PACKAGES = [
  { amount: 25, code: 'PKG_25', label: '25€' },
  { amount: 50, code: 'PKG_50', label: '50€' },
  { amount: 100, code: 'PKG_100', label: '100€' },
  { amount: 250, code: 'PKG_250', label: '250€' },
];

const PROVIDERS = [
  { id: 'stripe', label: 'Stripe', accent: '#2563EB' },
  { id: 'paypal', label: 'PayPal', accent: '#0EA5E9' },
  { id: 'satispay', label: 'Satispay', accent: '#EF4444' },
  { id: 'apple-pay', label: 'Apple Pay', accent: '#111827' },
  { id: 'google-pay', label: 'Google Pay', accent: '#22C55E' },
  { id: 'visa', label: 'Visa', accent: '#1D4ED8' },
  { id: 'mastercard', label: 'Mastercard', accent: '#F97316' },
];

const STATUS_TONES = {
  success: {
    background: 'rgba(34,197,94,0.18)',
    borderColor: 'rgba(22,163,74,0.45)',
    color: '#166534',
  },
  error: {
    background: 'rgba(248,113,113,0.18)',
    borderColor: 'rgba(239,68,68,0.45)',
    color: '#991B1B',
  },
  info: {
    background: 'rgba(37, 227, 218, 0.16)',
    borderColor: 'rgba(37, 227, 218, 0.35)',
    color: '#0F172A',
  },
};

const STATUS_BADGES = {
  SETTLED: {
    label: 'Settled',
    tone: 'success',
  },
  PENDING: {
    label: 'Pending',
    tone: 'info',
  },
  FAILED: {
    label: 'Failed',
    tone: 'error',
  },
};

const formatCredits = (value) => {
  if (value == null) return '0.00';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return '0.00';
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
};

const parseAmount = (value) => {
  if (value == null) return NaN;
  const normalized = String(value).replace(',', '.');
  const numeric = Number(normalized);
  if (Number.isNaN(numeric)) return NaN;
  return Math.round(numeric * 100) / 100;
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const styles = {
  wrapper: { display: 'grid', gap: 'clamp(20px, 4vw, 28px)' },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)',
    gap: 'clamp(16px, 3vw, 28px)',
    alignItems: 'stretch',
  },
  summaryGridMobile: { gridTemplateColumns: '1fr' },
  balanceCard: {
    background: 'linear-gradient(140deg, rgba(39,227,218,0.18), rgba(56,189,248,0.22), rgba(249,115,22,0.18))',
    borderRadius: 24,
    padding: 'clamp(18px, 3vw, 26px)',
    border: '1px solid rgba(39,227,218,0.28)',
    boxShadow: '0 28px 60px -48px rgba(14,116,144,0.55)',
    display: 'grid',
    gap: 12,
    color: '#0F172A',
  },
  balanceLabel: { fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 },
  balanceValue: { fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em' },
  balanceHint: { fontSize: 13, color: '#0F172A', opacity: 0.75 },
  topupCard: {
    background: '#FFFFFF',
    borderRadius: 24,
    padding: 'clamp(18px, 3vw, 26px)',
    border: '1px solid rgba(15,23,42,0.08)',
    boxShadow: '0 24px 54px -42px rgba(15,23,42,0.45)',
    display: 'grid',
    gap: 18,
  },
  topupTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' },
  amountRow: { display: 'grid', gap: 12 },
  amountLabel: { fontSize: 13, fontWeight: 600, color: '#475569' },
  amountInputWrap: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  amountInput: {
    flex: '0 0 auto',
    width: 140,
    height: 44,
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.45)',
    padding: '0 16px',
    fontSize: 16,
    fontWeight: 600,
    color: '#0F172A',
    background: '#FFFFFF',
    boxShadow: '0 12px 26px -20px rgba(15,23,42,0.45)',
  },
  quickRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  quickBtn: {
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.45)',
    background: '#FFFFFF',
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#0F172A',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  quickBtnActive: {
    borderColor: 'rgba(249,115,22,0.65)',
    background: 'linear-gradient(120deg, rgba(249,115,22,0.18), rgba(250,204,21,0.26))',
    color: '#7C2D12',
    boxShadow: '0 16px 30px -24px rgba(249,115,22,0.6)',
  },
  providersWrap: { display: 'grid', gap: 12 },
  providersGrid: { display: 'flex', flexWrap: 'wrap', gap: 12 },
  providerBtn: {
    borderRadius: 16,
    padding: '12px 18px',
    border: '1px solid rgba(148,163,184,0.4)',
    background: '#F8FAFC',
    fontWeight: 700,
    color: '#0F172A',
    cursor: 'pointer',
    minWidth: 120,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  providerBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  providerAccent: (color) => ({
    background: `linear-gradient(120deg, ${color}33, rgba(15,23,42,0.04))`,
    borderColor: `${color}55`,
    boxShadow: `0 18px 36px -28px ${color}88`,
  }),
  messageBox: {
    borderRadius: 16,
    padding: '14px 16px',
    fontSize: 14,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  infoGrid: {
    display: 'grid',
    gap: 10,
    fontSize: 13,
    color: '#475569',
  },
  hintRow: { display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 13 },
  historyCard: {
    background: '#FFFFFF',
    borderRadius: 20,
    border: '1px solid rgba(15,23,42,0.08)',
    boxShadow: '0 22px 48px -38px rgba(15,23,42,0.45)',
    padding: 'clamp(18px, 3vw, 26px)',
    display: 'grid',
    gap: 18,
  },
  historyTitleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  historyTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' },
  historyList: { display: 'grid', gap: 12 },
  historyItem: {
    display: 'grid',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.25)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(39,227,218,0.08))',
  },
  historyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  providerLabel: { fontWeight: 700, fontSize: 15, color: '#0F172A' },
  badge: {
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '.04em',
    textTransform: 'uppercase',
  },
  historyMeta: { display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13, color: '#475569' },
  emptyHistory: {
    borderRadius: 16,
    padding: '18px 16px',
    background: 'rgba(148,163,184,0.12)',
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
  },
  errorBox: {
    borderRadius: 16,
    padding: '14px 16px',
    background: 'rgba(248,113,113,0.18)',
    border: '1px solid rgba(239,68,68,0.35)',
    color: '#991B1B',
    fontWeight: 600,
    display: 'grid',
    gap: 12,
  },
  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
    color: '#475569',
    fontWeight: 600,
  },
  infoState: {
    borderRadius: 16,
    padding: '18px 20px',
    background: 'rgba(37,99,235,0.1)',
    border: '1px solid rgba(37,99,235,0.28)',
    color: '#1E3A8A',
    display: 'grid',
    gap: 10,
  },
  infoTitle: { margin: 0, fontSize: 17, fontWeight: 700 },
  infoDescription: { margin: 0, fontSize: 14, fontWeight: 500 },
  errorActions: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  retryButton: {
    border: '1px solid rgba(15,23,42,0.22)',
    background: '#FFFFFF',
    color: '#0F172A',
    borderRadius: 999,
    padding: '8px 18px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s ease, color 0.2s ease',
  },
  retryButtonHover: {
    background: 'rgba(15,23,42,0.08)',
  },
};

export default function WalletPanel({ operatorData = {}, onRefresh, isMobile = false }) {
  const walletData = operatorData?.wallet || {};
  const accountId = operatorData?.account?.id || null;
  const balance = walletData?.balance_credits ?? 0;
  const updatedAt = walletData?.updated_at || null;
  const transactions = Array.isArray(walletData?.transactions) ? walletData.transactions : [];
  const walletLoading = operatorData?.loading || walletData?.loading;
  const walletError = walletData?.error;

  const [amountInput, setAmountInput] = useState('50');
  const [selectedPackage, setSelectedPackage] = useState('PKG_50');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageTone, setMessageTone] = useState('info');
  const [retryHover, setRetryHover] = useState(false);

  const layoutStyle = { ...styles.summaryGrid, ...(isMobile ? styles.summaryGridMobile : null) };
  const supabaseReady = Boolean(supabase) && Boolean(isSupabaseConfigured);

  const walletUnavailable = useMemo(() => {
    if (!walletError) return false;
    if (typeof walletError === 'object' && walletError !== null) {
      if (walletError.kind === 'network') return true;
      if (walletError.code === 'NETWORK_ERROR') return true;
      if (walletError.status === 0) return true;
      const details =
        walletError.message || walletError.hint || walletError.details || walletError.code || walletError.status;
      if (typeof details === 'string' && /failed to fetch|fetch failed|network/i.test(details)) {
        return true;
      }
    }
    if (typeof walletError === 'string' && /failed to fetch|fetch failed|network/i.test(walletError)) {
      return true;
    }
    return false;
  }, [walletError]);

  const parsedAmount = useMemo(() => {
    const parsed = parseAmount(amountInput);
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return parsed;
  }, [amountInput]);

  const selectedPackageLabel = useMemo(() => {
    if (!selectedPackage) return null;
    const pkg = QUICK_PACKAGES.find((item) => item.code === selectedPackage);
    return pkg ? pkg.label : null;
  }, [selectedPackage]);

  const handleAmountChange = useCallback((event) => {
    const { value } = event.target;
    setAmountInput(value);
    const parsed = parseAmount(value);
    const matched = QUICK_PACKAGES.find((pkg) => Math.abs(pkg.amount - parsed) < 0.01);
    setSelectedPackage(matched ? matched.code : null);
  }, []);

  const handleSelectPackage = useCallback((pkg) => {
    setAmountInput(String(pkg.amount));
    setSelectedPackage(pkg.code);
  }, []);

  const resetMessage = () => {
    setMessage(null);
    setMessageTone('info');
  };

  const handleTopUp = useCallback(
    async (providerId) => {
      if (!accountId) {
        setMessageTone('error');
        setMessage('We could not identify your operator account.');
        return;
      }

      if (!supabaseReady) {
        setMessageTone('error');
        setMessage('The top-up service is currently unavailable.');
        return;
      }

      const normalizedAmount = parseAmount(amountInput);
      if (Number.isNaN(normalizedAmount) || normalizedAmount <= 0) {
        setMessageTone('error');
        setMessage('Enter a valid amount before continuing with the top-up.');
        return;
      }

      const provider = PROVIDERS.find((item) => item.id === providerId) || null;
      const packageMeta = QUICK_PACKAGES.find((pkg) => Math.abs(pkg.amount - normalizedAmount) < 0.01);
      const packageCode = packageMeta?.code || 'CUSTOM';
      const creditsToAdd = Math.round(normalizedAmount * 100) / 100;
      const txRef = `TLX-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

      setIsProcessing(true);
      setMessageTone('info');
      setMessage(`Processing your top-up with ${provider?.label || 'the selected provider'}…`);

      let pendingTxId = null;

      try {
        const { data: pendingTx, error: pendingError } = await supabase
          .from('op_wallet_tx')
          .insert({
            op_id: accountId,
            kind: 'TOPUP',
            status: 'PENDING',
            credits: creditsToAdd,
            amount_eur: creditsToAdd,
            package_code: packageCode,
            provider: provider?.label || providerId,
            tx_ref: txRef,
          })
          .select('id')
          .single();

        if (pendingError) throw pendingError;

        pendingTxId = pendingTx?.id || null;

        let walletResult = null;

        if (walletData?.id) {
          const { data: updatedWallet, error: updateError } = await supabase
            .from('op_wallet')
            .update({
              balance_credits: Number((Number(balance || 0) + creditsToAdd).toFixed(2)),
            })
            .eq('id', walletData.id)
            .select('id')
            .single();

          if (updateError) throw updateError;
          walletResult = updatedWallet;
        } else {
          const { data: insertedWallet, error: insertWalletError } = await supabase
            .from('op_wallet')
            .insert({
              op_id: accountId,
              balance_credits: creditsToAdd,
            })
            .select('id')
            .single();

          if (insertWalletError) throw insertWalletError;
          walletResult = insertedWallet;
        }

        if (!walletResult) {
          throw new Error('Wallet update failed');
        }

        const { error: settleError } = await supabase
          .from('op_wallet_tx')
          .update({ status: 'SETTLED', settled_at: new Date().toISOString() })
          .eq('id', pendingTxId)
          .select('id')
          .single();

        if (settleError) throw settleError;

        setMessageTone('success');
        setMessage(`Top-up completed! +${formatCredits(creditsToAdd)} credits available.`);
        if (packageCode !== 'CUSTOM') {
          setSelectedPackage(packageCode);
        } else {
          setSelectedPackage(null);
        }

        await onRefresh?.({ silent: true });
      } catch (err) {
        console.error('Failed to settle wallet top-up', err);
        setMessageTone('error');
        setMessage('Unable to complete the top-up. Please try again later.');

        if (pendingTxId) {
          try {
            await supabase
              .from('op_wallet_tx')
              .update({ status: 'FAILED' })
              .eq('id', pendingTxId);
          } catch (updateErr) {
            console.error('Failed to mark wallet transaction as failed', updateErr);
          }
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [accountId, amountInput, balance, onRefresh, supabaseReady, walletData?.id]
  );

  const handleRetry = useCallback(() => {
    setMessage(null);
    setMessageTone('info');
    onRefresh?.({ silent: true });
  }, [onRefresh]);

  if (!supabaseReady || walletUnavailable) {
    const description = !supabaseReady
      ? 'Wallet data requires a valid Supabase configuration. Update the environment variables and refresh the dashboard to enable this section.'
      : 'We could not reach the wallet service. Check your Supabase configuration or network connection, then refresh the dashboard.';
    const actionLabel = !supabaseReady ? 'Check again' : 'Try again';
    return (
      <div style={styles.infoState} role="status">
        <h3 style={styles.infoTitle}>Wallet temporarily unavailable</h3>
        <p style={styles.infoDescription}>{description}</p>
        {typeof onRefresh === 'function' && (
          <button
            type="button"
            onMouseEnter={() => setRetryHover(true)}
            onMouseLeave={() => setRetryHover(false)}
            onClick={handleRetry}
            style={{
              ...styles.retryButton,
              ...(retryHover ? styles.retryButtonHover : null),
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    );
  }

  if (walletLoading && !transactions.length) {
    return <div style={styles.loadingState}>Loading wallet information…</div>;
  }

  if (walletError) {
    return (
      <div style={styles.errorBox} role="alert">
        <div>Error loading the wallet. Refresh the page and try again.</div>
        {typeof onRefresh === 'function' && (
          <div style={styles.errorActions}>
            <button
              type="button"
              onMouseEnter={() => setRetryHover(true)}
              onMouseLeave={() => setRetryHover(false)}
              onClick={handleRetry}
              style={{
                ...styles.retryButton,
                ...(retryHover ? styles.retryButtonHover : null),
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={layoutStyle}>
        <div style={styles.balanceCard}>
          <div style={styles.balanceLabel}>Available balance</div>
          <div style={styles.balanceValue}>{formatCredits(balance)} credits</div>
          <div style={styles.balanceHint}>
            {updatedAt ? `Updated ${formatDateTime(updatedAt)}` : 'No top-ups recorded yet.'}
          </div>
          <div style={styles.infoGrid}>
            <div>Each euro you add converts into one credit you can spend immediately on the platform.</div>
            {selectedPackageLabel && (
              <div style={styles.hintRow}>
                Selected package: <strong>{selectedPackageLabel}</strong>
              </div>
            )}
          </div>
        </div>

        <div style={styles.topupCard}>
          <h3 style={styles.topupTitle}>Top up your wallet</h3>

          {message && (
            <div
              style={{
                ...styles.messageBox,
                ...(STATUS_TONES[messageTone] || STATUS_TONES.info),
              }}
            >
              {message}
            </div>
          )}

          <div style={styles.amountRow}>
            <label htmlFor="wallet-amount" style={styles.amountLabel}>
              Top-up amount (EUR)
            </label>
            <div style={styles.amountInputWrap}>
              <input
                id="wallet-amount"
                type="number"
                min="1"
                step="1"
                value={amountInput}
                onChange={(event) => {
                  resetMessage();
                  handleAmountChange(event);
                }}
                style={styles.amountInput}
                disabled={isProcessing}
              />
              <span>= {formatCredits(parsedAmount)} credits</span>
            </div>
            <div style={styles.quickRow}>
              {QUICK_PACKAGES.map((pkg) => (
                <button
                  key={pkg.code}
                  type="button"
                  onClick={() => {
                    resetMessage();
                    handleSelectPackage(pkg);
                  }}
                  style={{
                    ...styles.quickBtn,
                    ...(selectedPackage === pkg.code ? styles.quickBtnActive : null),
                  }}
                  disabled={isProcessing}
                >
                  {pkg.label}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.providersWrap}>
            <div style={styles.amountLabel}>Choose a payment provider</div>
            <div style={styles.providersGrid}>
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => handleTopUp(provider.id)}
                  style={{
                    ...styles.providerBtn,
                    ...styles.providerAccent(provider.accent),
                    ...(isProcessing || parsedAmount <= 0 || !supabaseReady ? styles.providerBtnDisabled : null),
                  }}
                  disabled={isProcessing || parsedAmount <= 0 || !supabaseReady}
                >
                  {provider.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={styles.historyCard}>
        <div style={styles.historyTitleRow}>
          <h3 style={styles.historyTitle}>Transaction history</h3>
          <span style={{ fontSize: 13, color: '#475569' }}>
            Showing the latest {transactions.length} recorded transactions
          </span>
        </div>

        {transactions.length === 0 ? (
          <div style={styles.emptyHistory}>No transactions recorded yet. Make your first top-up!</div>
        ) : (
          <div style={styles.historyList}>
            {transactions.map((tx) => {
              const statusMeta = STATUS_BADGES[String(tx.status || '').toUpperCase()] || {
                label: tx.status || 'Unknown',
                tone: 'info',
              };

              return (
                <div key={tx.id || tx.tx_ref} style={styles.historyItem}>
                  <div style={styles.historyHeader}>
                    <span style={styles.providerLabel}>{tx.provider || 'Unknown provider'}</span>
                    <span
                      style={{
                        ...styles.badge,
                        ...(STATUS_TONES[statusMeta.tone] || STATUS_TONES.info),
                      }}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                  <div style={styles.historyMeta}>
                    <span>+{formatCredits(tx.credits)} credits</span>
                    <span>Amount: € {formatCredits(tx.amount_eur ?? tx.credits)}</span>
                    <span>Ref: {tx.tx_ref || '—'}</span>
                    <span>
                      Created: {formatDateTime(tx.created_at) || '—'}
                      {tx.settled_at ? ` · Settled: ${formatDateTime(tx.settled_at)}` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

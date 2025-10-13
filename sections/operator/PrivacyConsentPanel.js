import { useEffect, useMemo, useState } from 'react';

const DEFAULT_POLICY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_POLICY_VERSION || '2024-01-01';

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map((part) => parseInt(part, 10));
    const date = new Date(year, (month || 1) - 1, day || 1);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
};

const formatTimestamp = (value) => {
  const date = parseDateValue(value);
  if (!date) return '';
  return date.toLocaleString();
};

const renderValue = (value, styles) => {
  if (value == null) {
    return <span style={styles.muted}>Not provided</span>;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return <span style={styles.muted}>Not provided</span>;
    }
    return trimmed;
  }
  return value;
};

const sanitizePolicyHtml = (html) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    if (!doc) return html;
    const root = doc.querySelector('main') || doc.body;
    if (!root) return html;
    root.querySelectorAll('style').forEach((node) => node.remove());
    return root.innerHTML;
  } catch (err) {
    console.warn('Failed to sanitise GDPR policy for operator dashboard', err);
    return html;
  }
};

const StateMessage = ({ tone = 'default', children }) => {
  const baseStyle = { ...styles.stateBox };
  if (tone === 'error') Object.assign(baseStyle, styles.stateBoxError);
  return <div style={baseStyle}>{children}</div>;
};

const InfoRow = ({ label, value }) => (
  <div style={styles.infoRow}>
    <span style={styles.infoLabel}>{label}</span>
    <div style={styles.infoValue}>{renderValue(value, styles)}</div>
  </div>
);

const Chip = ({ label, tone = 'neutral' }) => {
  const base = { ...styles.chip };
  if (tone === 'success') Object.assign(base, styles.chipSuccess);
  if (tone === 'warning') Object.assign(base, styles.chipWarning);
  if (tone === 'danger') Object.assign(base, styles.chipDanger);
  return <span style={base}>{label}</span>;
};

export default function PrivacyConsentPanel({ operatorData = {}, authUser }) {
  const { privacy, contact } = operatorData || {};
  const sectionState = operatorData?.sectionStatus?.privacy || {};
  const loading = sectionState.loading ?? operatorData.loading;
  const error = sectionState.error ?? operatorData.error;

  const [policyHtml, setPolicyHtml] = useState('');
  const [policyStatus, setPolicyStatus] = useState('loading');

  useEffect(() => {
    let active = true;
    setPolicyStatus('loading');

    fetch('/gdpr_policy_en.html')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((html) => {
        if (!active) return;
        setPolicyHtml(sanitizePolicyHtml(html));
        setPolicyStatus('ready');
      })
      .catch((err) => {
        console.error('Failed to load GDPR policy for operator dashboard', err);
        if (!active) return;
        setPolicyStatus('error');
      });

    return () => {
      active = false;
    };
  }, []);

  const acceptanceStatus = useMemo(() => {
    if (!privacy) {
      return {
        label: 'Pending acceptance',
        tone: 'warning',
        meta: 'The GDPR policy has not been accepted yet.',
      };
    }

    if (privacy.revoked_at) {
      return {
        label: 'Consent revoked',
        tone: 'danger',
        meta: privacy.revoked_at ? `Revoked on ${formatTimestamp(privacy.revoked_at)}` : 'Revoked',
      };
    }

    if (privacy.accepted_at) {
      return {
        label: 'Consent accepted',
        tone: 'success',
        meta: `Accepted on ${formatTimestamp(privacy.accepted_at)}`,
      };
    }

    return {
      label: 'Pending acceptance',
      tone: 'warning',
      meta: 'The GDPR policy has not been accepted yet.',
    };
  }, [privacy]);

  const policyVersion = privacy?.policy_version || DEFAULT_POLICY_VERSION;
  const acceptedAt = privacy?.accepted_at ? formatTimestamp(privacy.accepted_at) : '';
  const revokedAt = privacy?.revoked_at ? formatTimestamp(privacy.revoked_at) : '';

  if (loading) {
    return <StateMessage>Loading privacy preferences…</StateMessage>;
  }

  if (error) {
    return <StateMessage tone="error">Unable to load privacy preferences. Please try again later.</StateMessage>;
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.grid}>
        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Consent summary</h4>
          <p style={styles.cardDescription}>Status of the GDPR acceptance and related contact references.</p>
          <div style={styles.cardBody}>
            <div style={styles.statusRow}>
              <Chip label={acceptanceStatus.label} tone={acceptanceStatus.tone} />
              <span style={styles.statusMeta}>{acceptanceStatus.meta}</span>
            </div>
            <InfoRow label="Policy version" value={policyVersion} />
            <InfoRow label="Accepted on" value={acceptedAt} />
            <InfoRow label="Revoked on" value={revokedAt} />
            <InfoRow label="Primary contact" value={contact?.email_primary || authUser?.email} />
          </div>
        </div>

        <div style={{ ...styles.card, minHeight: 320 }}>
          <h4 style={styles.cardTitle}>GDPR policy</h4>
          <p style={styles.cardDescription}>Read-only copy of the privacy policy shared during the onboarding wizard.</p>
          <div style={styles.policyBox} role="region" aria-live="polite">
            {policyStatus === 'ready' && (
              <div dangerouslySetInnerHTML={{ __html: policyHtml }} />
            )}
            {policyStatus === 'loading' && <span style={styles.placeholder}>Loading policy…</span>}
            {policyStatus === 'error' && (
              <span style={styles.placeholder}>The policy could not be loaded. Please contact support if the issue persists.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20,
  },
  card: {
    background: '#FFFFFF',
    borderRadius: 18,
    border: '1px solid #E2E8F0',
    boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  cardTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 600,
    color: '#0F172A',
  },
  cardDescription: {
    margin: 0,
    fontSize: 14,
    color: '#475569',
  },
  cardBody: {
    display: 'grid',
    gap: 12,
  },
  infoRow: {
    display: 'grid',
    gap: 6,
  },
  infoLabel: {
    fontSize: 12,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#64748B',
    fontWeight: 600,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: 600,
    color: '#0F172A',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  },
  muted: {
    color: '#94A3B8',
    fontWeight: 500,
  },
  statusRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  statusMeta: {
    fontSize: 13,
    color: '#475569',
    fontWeight: 500,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #CBD5F5',
    background: '#F1F5F9',
    fontSize: 13,
    fontWeight: 600,
    color: '#0F172A',
  },
  chipSuccess: {
    background: '#DCFCE7',
    borderColor: '#86EFAC',
    color: '#166534',
  },
  chipWarning: {
    background: '#FEF3C7',
    borderColor: '#FCD34D',
    color: '#92400E',
  },
  chipDanger: {
    background: '#FEE2E2',
    borderColor: '#FCA5A5',
    color: '#B91C1C',
  },
  policyBox: {
    border: '1px solid #E2E8F0',
    borderRadius: 16,
    padding: 16,
    maxHeight: 360,
    overflowY: 'auto',
    background: '#F8FAFC',
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 1.5,
  },
  placeholder: {
    color: '#64748B',
    fontSize: 14,
  },
  stateBox: {
    borderRadius: 16,
    border: '1px dashed #CBD5F5',
    background: '#F8FAFC',
    padding: 28,
    textAlign: 'center',
    fontSize: 15,
    color: '#475569',
    fontWeight: 500,
  },
  stateBoxError: {
    borderColor: '#FCA5A5',
    background: '#FEF2F2',
    color: '#B91C1C',
  },
};

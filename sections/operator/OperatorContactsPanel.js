import { useMemo } from 'react';

const formatTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
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

const buildMailto = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return `mailto:${trimmed}`;
};

const buildTel = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const numeric = trimmed.replace(/[^0-9+]/g, '');
  return `tel:${numeric}`;
};

const buildWebsiteLink = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return { href: url.toString(), label: trimmed };
  } catch (err) {
    return { href: withProtocol, label: trimmed };
  }
};

const StateMessage = ({ tone = 'default', children }) => {
  const base = { ...styles.stateBox };
  if (tone === 'error') Object.assign(base, styles.stateBoxError);
  return <div style={base}>{children}</div>;
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

export default function OperatorContactsPanel({ operatorData = {}, authUser }) {
  const { loading, error, contact, profile } = operatorData || {};

  const phoneVerifiedAt = contact?.phone_verified_at ? formatTimestamp(contact.phone_verified_at) : '';
  const phoneVerification = useMemo(() => {
    if (!contact?.phone_e164) {
      return {
        status: 'Phone number missing',
        tone: 'warning',
        meta: 'Add a phone number via the onboarding wizard.',
      };
    }
    if (contact.phone_verified_at) {
      return {
        status: 'Phone verified',
        tone: 'success',
        meta: phoneVerifiedAt ? `Verified on ${phoneVerifiedAt}` : 'Verification completed',
      };
    }
    return {
      status: 'Verification pending',
      tone: 'warning',
      meta: 'Complete the SMS verification step to activate notifications.',
    };
  }, [contact?.phone_e164, contact?.phone_verified_at, phoneVerifiedAt]);

  if (loading) {
    return <StateMessage>Loading contact details…</StateMessage>;
  }

  if (error) {
    return <StateMessage tone="error">Unable to load contact information. Please try again later.</StateMessage>;
  }

  const hasContact = Boolean(contact);
  if (!hasContact) {
    return (
      <StateMessage>
        Contact information has not been configured yet. Complete step 2 of the onboarding wizard to populate this section.
      </StateMessage>
    );
  }

  const primaryEmailLink = buildMailto(contact.email_primary);
  const billingEmailLink = buildMailto(contact.email_billing);
  const phoneLink = buildTel(contact.phone_e164);
  const websiteLink = buildWebsiteLink(profile?.website);
  const authEmail = authUser?.email || '';

  return (
    <div style={styles.wrap}>
      <div style={styles.grid}>
        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Primary contact</h4>
          <p style={styles.cardDescription}>
            Reference details shared with athletes, clubs and the TalentLix support team.
          </p>
          <div style={styles.cardBody}>
            <InfoRow
              label="Primary email"
              value={primaryEmailLink ? (
                <a href={primaryEmailLink} style={styles.link}>
                  {contact.email_primary}
                </a>
              ) : contact?.email_primary}
            />
            <InfoRow
              label="Phone number"
              value={phoneLink ? (
                <a href={phoneLink} style={styles.link}>
                  {contact.phone_e164}
                </a>
              ) : contact?.phone_e164}
            />
            <InfoRow
              label="Verification"
              value={(
                <div style={styles.statusRow}>
                  <Chip label={phoneVerification.status} tone={phoneVerification.tone} />
                  <span style={styles.statusMeta}>{phoneVerification.meta}</span>
                </div>
              )}
            />
          </div>
        </div>

        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Billing & notifications</h4>
          <p style={styles.cardDescription}>
            Secondary channels used for invoices, receipts and operational alerts.
          </p>
          <div style={styles.cardBody}>
            <InfoRow
              label="Billing email"
              value={billingEmailLink ? (
                <a href={billingEmailLink} style={styles.link}>
                  {contact.email_billing}
                </a>
              ) : contact?.email_billing}
            />
            <InfoRow
              label="Account email"
              value={authEmail ? (
                <a href={buildMailto(authEmail)} style={styles.link}>
                  {authEmail}
                </a>
              ) : null}
            />
            <InfoRow
              label="Website"
              value={websiteLink ? (
                <a href={websiteLink.href} style={styles.link} target="_blank" rel="noreferrer">
                  {websiteLink.label}
                </a>
              ) : profile?.website}
            />
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
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
  muted: {
    color: '#94A3B8',
    fontWeight: 500,
  },
  link: {
    color: '#2563EB',
    textDecoration: 'underline',
    fontWeight: 600,
    wordBreak: 'break-word',
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

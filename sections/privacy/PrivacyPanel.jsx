import { useEffect, useMemo, useState } from 'react';

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map((n) => parseInt(n, 10));
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
};

const formatDateOnly = (value) => {
  const dt = parseDateValue(value);
  return dt ? dt.toLocaleDateString() : null;
};

const formatTimestamp = (value) => {
  const dt = parseDateValue(value);
  return dt ? dt.toLocaleString() : null;
};

const calculateAge = (value) => {
  const birth = parseDateValue(value);
  if (!birth) return null;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) years -= 1;
  if (years < 0 || years > 120) return null;
  return years;
};

export default function PrivacyPanel({ athlete }) {
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
        let sanitizedHtml = html;

        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          if (doc) {
            const root = doc.querySelector('main') || doc.body;
            if (root) {
              root.querySelectorAll('style').forEach((el) => el.remove());
              sanitizedHtml = root.innerHTML;
            }
          }
        } catch (parseError) {
          console.warn('Failed to sanitize GDPR policy HTML', parseError);
        }

        setPolicyHtml(sanitizedHtml);
        setPolicyStatus('ready');
      })
      .catch((err) => {
        console.error('Failed to load GDPR policy', err);
        if (!active) return;
        setPolicyStatus('error');
      });

    return () => { active = false; };
  }, []);

  const age = useMemo(() => calculateAge(athlete?.date_of_birth), [athlete?.date_of_birth]);
  const needsAuthFlag = Boolean(athlete?.needs_parental_authorization);
  const needsGuardian = useMemo(() => {
    if (!athlete) return false;
    if (needsAuthFlag) return true;
    return age != null && age < 14;
  }, [athlete, age, needsAuthFlag]);

  const guardianReasonParts = [];
  if (age != null && age < 14) guardianReasonParts.push('age under 14');
  if (needsAuthFlag) guardianReasonParts.push('authorization requested');

  const gdprAccepted = Boolean(athlete?.gdpr_accepted);
  const gdprAcceptedAt = formatTimestamp(athlete?.gdpr_accepted_at);
  const dobDisplay = formatDateOnly(athlete?.date_of_birth);

  const guardianFullName = [athlete?.guardian_first_name, athlete?.guardian_last_name]
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .join(' ');

  const parentalConsentProvided = Boolean(athlete?.parental_consent);
  const parentalConsentAt = formatTimestamp(athlete?.parental_consent_at);

  const summaryItems = [
    {
      key: 'gdpr',
      label: 'GDPR acceptance',
      value: gdprAccepted ? 'Accepted' : 'Pending',
      meta: gdprAccepted
        ? (gdprAcceptedAt || 'Timestamp not provided')
        : 'Awaiting confirmation',
      muted: !gdprAccepted,
    },
    {
      key: 'dob',
      label: 'Date of birth',
      value: dobDisplay || 'Not provided',
      muted: !dobDisplay,
    },
    {
      key: 'age',
      label: 'Age',
      value: age != null ? `${age}` : 'Not provided',
      muted: age == null,
    },
    {
      key: 'guardian',
      label: 'Guardian required',
      value: needsGuardian ? 'Yes' : 'No',
      meta: needsGuardian
        ? (guardianReasonParts.length ? guardianReasonParts.join(' · ') : 'Required')
        : 'No guardian needed',
      muted: !needsGuardian,
    },
    {
      key: 'flag',
      label: 'Parental authorization flag',
      value: needsAuthFlag ? 'Enabled' : 'Disabled',
      meta: needsAuthFlag ? 'Set during onboarding' : 'Flag not requested',
      muted: !needsAuthFlag,
    },
  ];

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h3 style={styles.title}>Consent summary</h3>
        <p style={styles.description}>Overview of the privacy information stored in your TalentLix profile.</p>
        <div style={styles.infoList}>
          {summaryItems.map((item) => (
            <div key={item.key} style={styles.infoItem}>
              <span style={styles.label}>{item.label}</span>
              <span style={item.muted ? styles.mutedValue : styles.value}>{item.value}</span>
              {item.meta && <span style={styles.meta}>{item.meta}</span>}
            </div>
          ))}
        </div>
      </div>

      {needsGuardian && (
        <div style={styles.card}>
          <h3 style={styles.title}>Guardian & parental consent</h3>
          <p style={styles.description}>Required when the athlete is under 14 or a guardian authorization has been requested.</p>
          <div style={styles.infoList}>
            <div style={styles.infoItem}>
              <span style={styles.label}>Guardian name</span>
              <span style={guardianFullName ? styles.value : styles.mutedValue}>
                {guardianFullName || 'Not provided'}
              </span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.label}>Parental consent</span>
              <span style={parentalConsentProvided ? styles.value : styles.mutedValue}>
                {parentalConsentProvided ? 'Provided' : 'Pending'}
              </span>
              <span style={styles.meta}>
                {parentalConsentProvided
                  ? (parentalConsentAt || 'Timestamp not provided')
                  : 'Waiting for confirmation'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={styles.card}>
        <h3 style={styles.title}>GDPR policy</h3>
        <p style={styles.description}>Read-only copy of the privacy policy currently in effect.</p>
        <div style={styles.policyBox}>
          {policyStatus === 'ready' && (
            <div dangerouslySetInnerHTML={{ __html: policyHtml }} />
          )}
          {policyStatus === 'loading' && (
            <span style={styles.placeholder}>Loading policy…</span>
          )}
          {policyStatus === 'error' && (
            <span style={styles.placeholder}>Policy unavailable.</span>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 20 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    border: '1px solid #E0E0E0',
    borderRadius: 12,
    background: '#FAFAFA',
    padding: 16,
  },
  title: { fontSize: 16, fontWeight: 700, margin: 0 },
  description: { fontSize: 13, color: '#666', margin: 0 },
  infoList: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' },
  infoItem: {
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    background: '#FFFFFF',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minHeight: 68,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    color: '#666',
  },
  value: { fontSize: 14, fontWeight: 600, color: '#111', lineHeight: 1.4 },
  mutedValue: { fontSize: 14, fontWeight: 500, color: '#777', lineHeight: 1.4 },
  meta: { fontSize: 12, color: '#777' },
  policyBox: {
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    background: '#FFFFFF',
    padding: 12,
    maxHeight: 320,
    overflowY: 'auto',
    fontSize: 14,
    lineHeight: 1.6,
    color: '#333',
    wordBreak: 'break-word',
  },
  placeholder: { fontSize: 13, color: '#777', fontStyle: 'italic' },
};

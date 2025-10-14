import { useCallback, useMemo } from 'react';
import { OPERATOR_DOCUMENTS_BUCKET } from '../../utils/operatorStorageBuckets';
import { useSignedUrlCache } from '../../utils/useSignedUrlCache';

const VERIFICATION_STATE_META = {
  NOT_STARTED: {
    label: 'Not started',
    tone: 'neutral',
    description: 'Begin the verification wizard to submit your identity documents.',
  },
  IN_REVIEW: {
    label: 'In review',
    tone: 'warning',
    description: 'Our team is reviewing your submission. We will notify you by email once completed.',
  },
  VERIFIED: {
    label: 'Verified',
    tone: 'success',
    description: 'Identity verification has been completed successfully.',
  },
  REJECTED: {
    label: 'Rejected',
    tone: 'danger',
    description: 'We could not verify your identity. Review the notes and upload new documents.',
  },
  NEEDS_MORE_INFO: {
    label: 'More information required',
    tone: 'warning',
    description: 'Provide the requested information and re-submit your documents in the wizard.',
  },
};

const DOC_LABEL_DEFAULT = {
  ID: 'Identity document',
  LICENSE: 'Professional license or authorization',
  REGISTRATION: 'Business/club registration document',
  AFFILIATION: 'Federation affiliation proof',
  TAX: 'Tax/VAT identification',
  REFERENCE: 'Reference letter',
  PROOF_OF_ADDRESS: 'Proof of address',
};

const DOC_LABEL_BY_TYPE = {
  club: {
    REGISTRATION: 'Registration document (company/association register, or equivalent)',
    AFFILIATION: 'Official federation affiliation proof (certificate or public registry extract)',
    ID: 'Government ID of an authorized club representative',
    TAX: 'Tax/VAT code (optional; format as used in your country)',
  },
  agent: {
    LICENSE: 'Agent license/authorization issued by the competent sports body',
    ID: 'Government ID of the agent or the agency’s legal representative',
    TAX: 'Tax/VAT code (optional; format as used in your country)',
  },
};

const getDocLabel = (docType, operatorType) => {
  const typeKey = operatorType || '';
  return DOC_LABEL_BY_TYPE[typeKey]?.[docType] || DOC_LABEL_DEFAULT[docType] || docType;
};

const matchesConditions = (rule, profile) => {
  const cond = rule?.conditions || null;
  if (!cond) return true;
  const country = profile?.country || null;
  if (Array.isArray(cond.country)) {
    if (!country) return false;
    return cond.country.map((value) => String(value).toUpperCase()).includes(String(country).toUpperCase());
  }
  return true;
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

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
};

const formatFileSize = (bytes) => {
  const numeric = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (typeof numeric !== 'number' || Number.isNaN(numeric) || numeric <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = numeric;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const extractFilename = (path) => {
  if (!path) return '';
  const parts = String(path).split('/');
  return parts[parts.length - 1] || path;
};

const StateMessage = ({ tone = 'default', children }) => {
  const base = { ...styles.stateBox };
  if (tone === 'error') Object.assign(base, styles.stateBoxError);
  if (tone === 'info') Object.assign(base, styles.stateBoxInfo);
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
  if (tone === 'accent') Object.assign(base, styles.chipAccent);
  return <span style={base}>{label}</span>;
};

export default function IdentityPanel({ operatorData = {}, isMobile = false, onRefresh }) {
  const { verification = {}, profile, type } = operatorData || {};
  const sectionState = operatorData?.sectionStatus?.identity || {};
  const loading = sectionState.loading ?? operatorData.loading;
  const error = sectionState.error ?? operatorData.error;

  const request = verification?.request || null;
  const documents = verification?.documents || {};
  const docRules = Array.isArray(verification?.rules) ? verification.rules : [];
  const operatorTypeCode = useMemo(() => {
    const raw = type?.code || type?.name;
    if (!raw) return '';
    return String(raw).trim().toLowerCase();
  }, [type?.code, type?.name]);

  const activeRules = useMemo(
    () => docRules.filter((rule) => matchesConditions(rule, profile)).sort((a, b) => {
      const aReq = a?.is_required ? 0 : 1;
      const bReq = b?.is_required ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      return String(a?.doc_type || '').localeCompare(String(b?.doc_type || ''));
    }),
    [docRules, profile]
  );

  const unmatchedDocuments = useMemo(() => {
    const activeKeys = new Set(activeRules.map((rule) => rule?.doc_type).filter(Boolean));
    return Object.entries(documents)
      .filter(([docType]) => !activeKeys.has(docType))
      .map(([, doc]) => doc);
  }, [activeRules, documents]);

  const statusMeta = useMemo(() => {
    if (!request || !request.state) {
      return {
        label: 'Not started',
        tone: 'neutral',
        description: 'Complete step 3 of the onboarding wizard to start the verification process.',
      };
    }
    const normalized = String(request.state).trim().toUpperCase();
    return VERIFICATION_STATE_META[normalized] || {
      label: normalized || 'Unknown',
      tone: 'neutral',
      description: 'Current verification status is unavailable. Contact support if the issue persists.',
    };
  }, [request]);

  const lastSubmitted = formatDateTime(request?.submitted_at || request?.updated_at || request?.created_at);

  const getSignedUrl = useSignedUrlCache(OPERATOR_DOCUMENTS_BUCKET);

  const handleViewDocument = useCallback(
    async (fileKey) => {
      if (!fileKey) return;
      try {
        const url = await getSignedUrl(fileKey);
        if (url) {
          if (typeof window !== 'undefined') {
            window.open(url, '_blank', 'noreferrer');
          }
        } else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          // eslint-disable-next-line no-alert
          window.alert('Unable to generate a download link for this document.');
        }
      } catch (err) {
        console.error('Failed to open operator document', err);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          // eslint-disable-next-line no-alert
          window.alert('Unable to open the selected document. Please try again later.');
        }
      }
    },
    [getSignedUrl]
  );

  if (loading) {
    return <StateMessage>Loading identity verification details…</StateMessage>;
  }

  if (error) {
    return (
      <StateMessage tone="error">
        Unable to load identity information at the moment. Please refresh the page or try again later.
      </StateMessage>
    );
  }

  const showVerificationSetupMessage = !request && activeRules.length === 0;

  return (
    <div style={styles.wrap}>
      {showVerificationSetupMessage ? (
        <StateMessage tone="info">
          Identity verification has not been configured yet. Complete step 3 of the onboarding wizard to upload your
          documents.
        </StateMessage>
      ) : null}
      <div style={styles.grid}>
        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Verification status</h4>
          <p style={styles.cardDescription}>
            Progress of your organisation’s identity checks and any actions required to move forward.
          </p>
          <div style={styles.cardBody}>
            <InfoRow
              label="Current status"
              value={(
                <div style={styles.statusRow}>
                  <Chip label={statusMeta.label} tone={statusMeta.tone} />
                  <span style={styles.statusMeta}>{statusMeta.description}</span>
                </div>
              )}
            />
            <InfoRow label="Last update" value={lastSubmitted || 'Not yet submitted'} />
            {request?.reason ? (
              <div style={styles.noteBox}>
                <strong style={styles.noteTitle}>Notes from TalentLix</strong>
                <p style={styles.noteText}>{request.reason}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Document checklist</h4>
          <p style={styles.cardDescription}>
            Upload the required documents in the onboarding wizard. Optional uploads can be provided to accelerate the
            review.
          </p>
          <div style={styles.cardBody}>
            {activeRules.length === 0 ? (
              <StateMessage tone="info">No documents are required for the selected operator type.</StateMessage>
            ) : (
              <div style={styles.docList}>
                {activeRules.map((rule) => {
                  const docType = rule?.doc_type || '';
                  const doc = documents[docType];
                  const required = !!rule?.is_required;
                  const label = getDocLabel(docType, operatorTypeCode);
                  const expires = formatDate(doc?.expires_at);
                  const fileSize = formatFileSize(doc?.file_size);
                  let tone = 'warning';
                  let statusLabel = required ? 'Missing' : 'Optional';
                  if (doc) {
                    tone = 'success';
                    statusLabel = 'Uploaded';
                  } else if (!required) {
                    tone = 'accent';
                    statusLabel = 'Optional';
                  } else {
                    tone = 'danger';
                    statusLabel = 'Missing';
                  }

                  return (
                    <div key={docType || label} style={styles.docRow}>
                      <div style={styles.docInfo}>
                        <div style={styles.docLabel}>{label}</div>
                        <div style={styles.docMeta}>
                          {required ? 'Required' : 'Optional'}
                          {fileSize ? ` · ${fileSize}` : ''}
                          {expires ? ` · Expires ${expires}` : ''}
                        </div>
                        {doc?.file_key ? (
                          <div style={styles.docFileName}>{extractFilename(doc.file_key)}</div>
                        ) : null}
                      </div>
                      <div style={styles.docActions}>
                        <Chip label={statusLabel} tone={tone} />
                        {doc?.file_key ? (
                          <button
                            type="button"
                            style={styles.viewBtn}
                            onClick={() => handleViewDocument(doc.file_key)}
                          >
                            View file
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {unmatchedDocuments.length > 0 ? (
        <div style={{ ...styles.card, marginTop: 24 }}>
          <h4 style={styles.cardTitle}>Additional uploads</h4>
          <p style={styles.cardDescription}>
            These files are stored with your verification request but are not part of the standard checklist.
          </p>
          <div style={styles.cardBody}>
            <div style={styles.docList}>
              {unmatchedDocuments.map((doc) => {
                const expires = formatDate(doc?.expires_at);
                const fileSize = formatFileSize(doc?.file_size);
                return (
                  <div key={doc?.file_key || doc?.doc_type} style={styles.docRow}>
                    <div style={styles.docInfo}>
                      <div style={styles.docLabel}>{doc?.doc_type || 'Uploaded document'}</div>
                      <div style={styles.docMeta}>
                        {fileSize ? `${fileSize}` : 'Stored file'}
                        {expires ? ` · Expires ${expires}` : ''}
                      </div>
                      {doc?.file_key ? (
                        <div style={styles.docFileName}>{extractFilename(doc.file_key)}</div>
                      ) : null}
                    </div>
                    <div style={styles.docActions}>
                      <Chip label="Uploaded" tone="success" />
                      {doc?.file_key ? (
                        <button
                          type="button"
                          style={styles.viewBtn}
                          onClick={() => handleViewDocument(doc.file_key)}
                        >
                          View file
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

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
    gap: 24,
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  },
  card: {
    border: '1px solid #E5E7EB',
    borderRadius: 16,
    padding: 24,
    background: '#FFFFFF',
    boxShadow: '0 6px 20px rgba(15,23,42,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: 600, color: '#0F172A', margin: 0 },
  cardDescription: { fontSize: 14, color: '#4B5563', margin: 0 },
  cardBody: { display: 'flex', flexDirection: 'column', gap: 16 },
  infoRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  infoLabel: { fontSize: 13, fontWeight: 600, color: '#1F2937' },
  infoValue: { fontSize: 15, color: '#111827' },
  statusRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  statusMeta: { fontSize: 13, color: '#4B5563', flex: '1 1 auto', minWidth: 160 },
  noteBox: {
    borderRadius: 12,
    padding: 16,
    background: '#F8FAFC',
    border: '1px solid #DBEAFE',
  },
  noteTitle: { display: 'block', fontSize: 14, fontWeight: 600, color: '#1E3A8A', marginBottom: 6 },
  noteText: { margin: 0, fontSize: 14, color: '#1F2937', lineHeight: 1.5 },
  docList: { display: 'flex', flexDirection: 'column', gap: 16 },
  docRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    background: '#F9FAFB',
  },
  docInfo: { display: 'flex', flexDirection: 'column', gap: 6 },
  docLabel: { fontSize: 15, fontWeight: 600, color: '#111827' },
  docMeta: { fontSize: 13, color: '#4B5563' },
  docFileName: { fontSize: 12, color: '#6B7280', wordBreak: 'break-all' },
  docActions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  viewBtn: {
    border: '1px solid #0EA5E9',
    background: '#0EA5E9',
    color: '#FFFFFF',
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 13,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: '#E5E7EB',
    color: '#1F2937',
  },
  chipSuccess: { background: '#D1FAE5', color: '#047857' },
  chipWarning: { background: '#FEF3C7', color: '#B45309' },
  chipDanger: { background: '#FEE2E2', color: '#B91C1C' },
  chipAccent: { background: '#DBEAFE', color: '#1D4ED8' },
  muted: { color: '#6B7280' },
  stateBox: {
    borderRadius: 12,
    padding: 20,
    background: '#F9FAFB',
    border: '1px solid #E5E7EB',
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 1.5,
  },
  stateBoxError: {
    background: '#FEF2F2',
    borderColor: '#FECACA',
    color: '#B91C1C',
  },
  stateBoxInfo: {
    background: '#EFF6FF',
    borderColor: '#BFDBFE',
    color: '#1E3A8A',
  },
};

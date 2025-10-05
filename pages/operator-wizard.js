import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import Select from 'react-select';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

import countries from '../utils/countries';
import { supabase } from '../utils/supabaseClient';
import { useOperatorGuard } from '../hooks/useOperatorGuard';

const REQUIRED_DOCS = [
  { docType: 'business_registration', label: 'Business registration document', optional: false },
  { docType: 'legal_representative_id', label: 'Legal representative ID', optional: false },
  { docType: 'address_proof', label: 'Proof of headquarters address (optional)', optional: true },
];

const PRIVACY_POLICY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_POLICY_VERSION || '2024-01-01';

const INITIAL_FORM = {
  // Step 1 · Profile
  legal_name: '',
  trade_name: '',
  website: '',
  address1: '',
  address2: '',
  city: '',
  state_region: '',
  postal_code: '',
  country: '',

  // Step 2 · Contact
  email_primary: '',
  email_billing: '',
  phone_e164: '',
  phone_verified_at: null,

  // Step 3 · Documents
  documents: REQUIRED_DOCS.reduce((acc, { docType }) => ({
    ...acc,
    [docType]: null,
  }), {}),
  document_notes: '',

  // Step 4 · Privacy
  privacy_consent: false,
  privacy_consent_at: null,
  policy_version: PRIVACY_POLICY_VERSION,
  marketing_optin: false,
};

const STEP_STATUSES = {
  1: 'profile',
  2: 'contact',
  3: 'documents',
  4: 'privacy',
  complete: 'complete',
  submitted: 'submitted',
};

const WIZARD_STATUS_NORMALIZATION = {
  draft: 'profile',
  profile: 'profile',
  'profile_incomplete': 'profile',
  contact: 'contact',
  'contact_incomplete': 'contact',
  documents: 'documents',
  'documents_incomplete': 'documents',
  consent: 'privacy',
  privacy: 'privacy',
  'privacy_incomplete': 'privacy',
  submitted: 'submitted',
  'in_review': 'submitted',
  complete: 'complete',
  completed: 'complete',
  approved: 'complete',
};

const normalizeWizardStatus = (value) => {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (key in WIZARD_STATUS_NORMALIZATION) {
    return WIZARD_STATUS_NORMALIZATION[key];
  }
  return 'profile';
};

const statusToStep = (status) => {
  const normalized = normalizeWizardStatus(status);
  switch (normalized) {
    case 'profile':
      return 1;
    case 'contact':
      return 2;
    case 'documents':
      return 3;
    case 'privacy':
      return 4;
    case 'submitted':
    case 'complete':
      return null;
    default:
      return 1;
  }
};

const toNullableString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeCountryName = (value) => {
  const label = toNullableString(value);
  if (!label) return null;
  const lower = label.toLowerCase();
  const match = countries.find(
    (option) =>
      option.value.toLowerCase() === lower || option.label.toLowerCase() === lower
  );
  return match ? match.label : label;
};

export default function OperatorWizard() {
  const router = useRouter();
  const { loading: checkingGuard, user, error: guardError } = useOperatorGuard({ includeReason: false });
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [account, setAccount] = useState(null);
  const [verificationRequest, setVerificationRequest] = useState(null);

  const operatorAuthId = user?.id || null;
  const accountId = account?.id || null;
  const opId = account?.id || null;
  const email = user?.email || '';

  const toggleMenu = () => setMenuOpen((open) => !open);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login-operator');
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!operatorAuthId) return;
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from('op_account')
          .select(`
            id,
            wizard_status,
            wizard_started_at,
            wizard_updated_at,
            wizard_completed_at,
            op_profile (
              legal_name,
              trade_name,
              website,
              address1,
              address2,
              city,
              state_region,
              postal_code,
              country
            ),
            op_contact (
              email_primary,
              email_billing,
              phone_e164,
              phone_verified_at
            ),
            op_verification_request (
              id,
              state,
              reason,
              submitted_at,
              op_verification_document (
                id,
                verification_id,
                doc_type,
                file_key,
                file_hash,
                mime_type,
                file_size,
                expires_at
              )
            ),
            op_privacy_consent (
              policy_version,
              accepted_at,
              marketing_optin
            )
          `)
          .eq('auth_user_id', operatorAuthId)
          .maybeSingle();

        if (!active) return;

        if (error && error.code !== 'PGRST116') throw error;

        const nextForm = { ...INITIAL_FORM };

        if (data) {
          const normalizedStatus = normalizeWizardStatus(data.wizard_status);
          setAccount({ ...data, wizard_status: normalizedStatus });

          const profileRaw = data.op_profile;
          const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
          if (profile) {
            nextForm.legal_name = profile.legal_name || '';
            nextForm.trade_name = profile.trade_name || '';
            nextForm.website = profile.website || '';
            nextForm.address1 = profile.address1 || '';
            nextForm.address2 = profile.address2 || '';
            nextForm.city = profile.city || '';
            nextForm.state_region = profile.state_region || '';
            nextForm.postal_code = profile.postal_code || '';
            nextForm.country = normalizeCountryName(profile.country) || '';
          }

          const contactRaw = data.op_contact;
          const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw;
          if (contact) {
            nextForm.email_primary = contact.email_primary || email || '';
            nextForm.email_billing = contact.email_billing || '';
            nextForm.phone_e164 = contact.phone_e164 || '';
            nextForm.phone_verified_at = contact.phone_verified_at || null;
          } else {
            nextForm.email_primary = email || '';
          }

          const requestRaw = data.op_verification_request;
          const request = Array.isArray(requestRaw) ? requestRaw[0] : requestRaw;
          const documentsRaw = request
            ? Array.isArray(request.op_verification_document)
              ? request.op_verification_document
              : request.op_verification_document
              ? [request.op_verification_document]
              : []
            : [];

          nextForm.documents = REQUIRED_DOCS.reduce((acc, { docType }) => {
            const doc = documentsRaw.find((item) => item.doc_type === docType);
            return {
              ...acc,
              [docType]: doc
                ? {
                    doc_type: doc.doc_type,
                    verification_id: doc.verification_id || request?.id || null,
                    file_key: doc.file_key,
                    file_hash: doc.file_hash,
                    mime_type: doc.mime_type || doc.file_mime || '',
                    file_size: doc.file_size,
                    expires_at: doc.expires_at || null,
                  }
                : null,
            };
          }, nextForm.documents);

          if (request) {
            setVerificationRequest({
              id: request.id,
              state: request.state || 'draft',
              reason: request.reason || null,
              submitted_at: request.submitted_at || null,
            });
            nextForm.document_notes = request.reason || '';
          } else {
            setVerificationRequest(null);
          }

          const consentRaw = data.op_privacy_consent;
          const consent = Array.isArray(consentRaw) ? consentRaw[0] : consentRaw;
          if (consent) {
            nextForm.privacy_consent = true;
            nextForm.privacy_consent_at = consent.accepted_at || null;
            nextForm.policy_version = consent.policy_version || PRIVACY_POLICY_VERSION;
            nextForm.marketing_optin = !!consent.marketing_optin;
          }

          const resolvedStep = statusToStep(normalizedStatus);
          setStep(resolvedStep);

          if (resolvedStep === null && router.pathname !== '/operator-in-review') {
            router.replace('/operator-in-review');
            return;
          }
        } else {
          nextForm.email_primary = email || '';
          setVerificationRequest(null);
        }

        setFormData(nextForm);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load operator profile', err);
        if (active) {
          setErrorMessage(err.message || 'Unable to load profile.');
          setLoading(false);
        }
      }
    };

    if (!checkingGuard && !guardError && operatorAuthId) {
      load();
    }

    return () => {
      active = false;
    };
  }, [checkingGuard, guardError, operatorAuthId, email, router]);

  const updateAccountWizard = async (nextStep) => {
    if (!accountId) return;
    const now = new Date().toISOString();
    const wizardStatus = STEP_STATUSES[nextStep] || STEP_STATUSES.complete;
    const payload = {
      wizard_status: wizardStatus,
      wizard_updated_at: now,
    };
    if (!account?.wizard_started_at) {
      payload.wizard_started_at = now;
    }
    const { error } = await supabase.from('op_account').update(payload).eq('id', accountId);
    if (error) throw error;
    const normalizedStatus = normalizeWizardStatus(wizardStatus);
    setAccount((prev) => (prev ? { ...prev, ...payload, wizard_status: normalizedStatus } : prev));
  };

  const upsertVerificationRequest = async (overrides = {}) => {
    if (!opId) throw new Error('Missing operator identifier.');

    const baseReason =
      overrides.reason !== undefined
        ? overrides.reason
        : verificationRequest?.reason ?? toNullableString(formData.document_notes);

    const payload = {
      op_id: opId,
      state: verificationRequest?.state || 'draft',
      reason: baseReason,
      ...overrides,
    };

    if (!('submitted_at' in payload) && verificationRequest?.submitted_at) {
      payload.submitted_at = verificationRequest.submitted_at;
    }

    const { data, error } = await supabase
      .from('op_verification_request')
      .upsert([payload], { onConflict: 'op_id' })
      .select('id, state, reason, submitted_at')
      .single();

    if (error) throw error;

    setVerificationRequest(data);
    return data;
  };

  const saveStep = async (nextStep) => {
    if (!accountId) return;
    setErrorMessage('');

    try {
      if (step === 1) {
        if (!opId) throw new Error('Missing operator identifier.');
        const { error } = await supabase.from('op_profile').upsert([
          {
            op_id: opId,
            legal_name: formData.legal_name,
            trade_name: formData.trade_name,
            website: toNullableString(formData.website),
            address1: formData.address1,
            address2: toNullableString(formData.address2),
            city: formData.city,
            state_region: toNullableString(formData.state_region),
            postal_code: formData.postal_code,
            country: normalizeCountryName(formData.country),
          },
        ], { onConflict: 'op_id' });
        if (error) throw error;
      } else if (step === 2) {
        if (!opId) throw new Error('Missing operator identifier.');
        const { error } = await supabase.from('op_contact').upsert([
          {
            op_id: opId,
            email_primary: formData.email_primary || email,
            email_billing: toNullableString(formData.email_billing),
            phone_e164: formData.phone_e164 || null,
            phone_verified_at: formData.phone_verified_at || null,
          },
        ], { onConflict: 'op_id' });
        if (error) throw error;
      } else if (step === 3) {
        await upsertVerificationRequest({ reason: toNullableString(formData.document_notes) });
      }

      await updateAccountWizard(nextStep);
      setStep(nextStep);
    } catch (err) {
      console.error('Failed to save step', err);
      setErrorMessage(err.message || 'Unable to save step.');
    }
  };

  const finalize = async () => {
    if (!accountId || !opId) return;
    setSubmitting(true);
    setErrorMessage('');

    try {
      const submittedAt = new Date().toISOString();

      const consentPayload = {
        op_id: opId,
        policy_version: formData.policy_version || PRIVACY_POLICY_VERSION,
        accepted_at: formData.privacy_consent_at || submittedAt,
        marketing_optin: formData.marketing_optin,
      };
      const { error: consentError } = await supabase
        .from('op_privacy_consent')
        .upsert([consentPayload], { onConflict: 'op_id' });
      if (consentError) throw consentError;

      await upsertVerificationRequest({
        state: 'submitted',
        reason: toNullableString(formData.document_notes),
        submitted_at: submittedAt,
      });

      const accountUpdatePayload = {
        wizard_status: STEP_STATUSES.submitted,
        wizard_updated_at: submittedAt,
        wizard_completed_at: submittedAt,
      };
      const { error: accountError } = await supabase
        .from('op_account')
        .update(accountUpdatePayload)
        .eq('id', accountId);
      if (accountError) throw accountError;

      setAccount((prev) =>
        prev
          ? {
              ...prev,
              ...accountUpdatePayload,
              wizard_status: normalizeWizardStatus(accountUpdatePayload.wizard_status),
            }
          : prev
      );
      router.replace('/operator-in-review');
    } catch (err) {
      console.error('Failed to finalize operator onboarding', err);
      setErrorMessage(err.message || 'Unable to complete onboarding.');
      setSubmitting(false);
    }
  };

  const normalizedPhone = (formData.phone_e164 || '').replace(/\s+/g, '');
  const parsedPhone = useMemo(() => parsePhoneNumberFromString(normalizedPhone), [normalizedPhone]);
  const progressWidth = step ? `${(step / 4) * 100}%` : '100%';

  if (checkingGuard || loading) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <div style={styles.userMenuContainer}>
              <div style={styles.menuIcon}>⋮</div>
            </div>
            <div style={styles.loaderContainer} role="status" aria-live="polite">
              <div style={styles.spinner} aria-hidden="true" />
              <span style={styles.srOnly}>Loading operator wizard…</span>
            </div>
            <style jsx>{`
              @keyframes profilePreviewSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  if (guardError) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <div style={styles.card}>
              <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
              <h2>Unable to verify operator session.</h2>
              <p>Please sign in again.</p>
              <button style={styles.button} onClick={() => router.replace('/login-operator')}>
                Back to login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!operatorAuthId) {
    return null;
  }

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.userMenuContainer}>
            <div
              style={styles.menuIcon}
              onClick={toggleMenu}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleMenu();
                }
              }}
              role="button"
              tabIndex={0}
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              ⋮
            </div>
            {menuOpen && (
              <div style={styles.dropdown}>
                <div style={styles.dropdownUser}>👤 {email}</div>
                <button type="button" onClick={handleLogout} style={styles.dropdownButton}>
                  Logout
                </button>
              </div>
            )}
          </div>

          <div style={{ ...styles.card, maxWidth: step === 4 ? '960px' : '520px' }}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: progressWidth }} />
            </div>
            <div style={styles.steps}>
              {[1, 2, 3, 4].map((s) => (
                <div key={s} style={{ ...styles.stepCircle, background: step === s ? '#27E3DA' : '#E0E0E0' }}>
                  {s}
                </div>
              ))}
            </div>

            {errorMessage && <p style={styles.error}>{errorMessage}</p>}

            <AnimatePresence mode="wait">
              <motion.div
                key={step || 'complete'}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.4 }}
              >
                {step === 1 && (
                  <Step1
                    formData={formData}
                    setFormData={setFormData}
                    saveStep={() => saveStep(2)}
                  />
                )}
                {step === 2 && (
                  <Step2
                    user={user}
                    opId={opId}
                    formData={formData}
                    setFormData={setFormData}
                    parsedPhone={parsedPhone}
                    saveStep={() => saveStep(3)}
                  />
                )}
                {step === 3 && (
                  <Step3
                    user={user}
                    formData={formData}
                    setFormData={setFormData}
                    ensureVerificationRequest={upsertVerificationRequest}
                    saveStep={() => saveStep(4)}
                  />
                )}
                {step === 4 && (
                  <Step4
                    formData={formData}
                    setFormData={setFormData}
                    submitting={submitting}
                    finalize={finalize}
                  />
                )}
                {step === null && (
                  <CompletionCard onContinue={() => router.replace('/operator-in-review')} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

const Step1 = ({ formData, setFormData, saveStep }) => {
  const isValid =
    !!formData.legal_name &&
    !!formData.trade_name &&
    !!formData.address1 &&
    !!formData.city &&
    !!formData.postal_code &&
    !!formData.country;

  return (
    <>
      <h2 style={styles.title}>Step 1 · Entity details</h2>
      <div style={styles.formGroup}>
        <input
          style={styles.input}
          name="legal_name"
          placeholder="Legal entity name"
          value={formData.legal_name}
          onChange={(event) => setFormData((prev) => ({ ...prev, legal_name: event.target.value }))}
        />
        <input
          style={styles.input}
          name="trade_name"
          placeholder="Trading name"
          value={formData.trade_name}
          onChange={(event) => setFormData((prev) => ({ ...prev, trade_name: event.target.value }))}
        />
        <input
          style={styles.input}
          name="website"
          placeholder="Website (optional)"
          value={formData.website}
          onChange={(event) => setFormData((prev) => ({ ...prev, website: event.target.value }))}
        />
        <input
          style={styles.input}
          name="address1"
          placeholder="Address line 1"
          value={formData.address1}
          onChange={(event) => setFormData((prev) => ({ ...prev, address1: event.target.value }))}
        />
        <input
          style={styles.input}
          name="address2"
          placeholder="Address line 2 (optional)"
          value={formData.address2}
          onChange={(event) => setFormData((prev) => ({ ...prev, address2: event.target.value }))}
        />
        <div style={twoCols}>
          <input
            style={styles.input}
            name="city"
            placeholder="City"
            value={formData.city}
            onChange={(event) => setFormData((prev) => ({ ...prev, city: event.target.value }))}
          />
          <input
            style={styles.input}
            name="state_region"
            placeholder="State / Province (optional)"
            value={formData.state_region}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, state_region: event.target.value }))
            }
          />
        </div>
        <div style={twoCols}>
          <input
            style={styles.input}
            name="postal_code"
            placeholder="Postal / ZIP code"
            value={formData.postal_code}
            onChange={(event) => setFormData((prev) => ({ ...prev, postal_code: event.target.value }))}
          />
          <div style={{ width: '100%' }}>
            <Select
              placeholder="Start typing country"
              options={countries}
              value={countries.find((opt) => opt.value === formData.country) || null}
              onChange={(selected) => setFormData((prev) => ({ ...prev, country: selected?.value || '' }))}
              filterOption={(option, inputValue) =>
                inputValue.length >= 2 && option.label.toLowerCase().includes(inputValue.toLowerCase())
              }
              styles={selectStyles}
            />
          </div>
        </div>
        <button
          style={isValid ? styles.button : styles.buttonDisabled}
          disabled={!isValid}
          onClick={saveStep}
        >
          Next ➡️
        </button>
        {!isValid && (
          <ul style={validationList}>
            {!formData.legal_name && <li>Legal name missing</li>}
            {!formData.trade_name && <li>Trading name missing</li>}
            {!formData.address1 && <li>Address line 1 missing</li>}
            {!formData.city && <li>City missing</li>}
            {!formData.postal_code && <li>Postal code missing</li>}
            {!formData.country && <li>Country missing</li>}
          </ul>
        )}
      </div>
    </>
  );
};

const Step2 = ({ user, opId, formData, setFormData, parsedPhone, saveStep }) => {
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(!!formData.phone_verified_at);
  const [otpMessage, setOtpMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);

  const COOLDOWN_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_RESEND_COOLDOWN || 60);
  const OTP_TTL_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_OTP_TTL || 600);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown((prev) => (prev > 0 ? prev - 1 : 0)), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [cooldown]);

  useEffect(() => {
    let timer;
    if (otpSent && expiresIn > 0) {
      timer = setInterval(() => setExpiresIn((prev) => (prev > 0 ? prev - 1 : 0)), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [otpSent, expiresIn]);

  useEffect(() => {
    setPhoneVerified(!!formData.phone_verified_at);
  }, [formData.phone_verified_at]);

  const ensureSession = async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session) {
      setOtpMessage('Session expired. Please sign in again.');
      return false;
    }
    return true;
  };

  const sendCode = async () => {
    try {
      if (cooldown > 0) {
        setOtpMessage(`Please wait ${cooldown}s before requesting a new code.`);
        return;
      }
      if (!(await ensureSession())) return;
      if (!formData.phone_e164) {
        setOtpMessage('Enter a valid phone number before requesting a code.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ phone: formData.phone_e164 });
      if (error) {
        setOtpMessage(`Failed to request OTP: ${error.message}`);
        return;
      }
      setOtpSent(true);
      setCooldown(COOLDOWN_SECONDS);
      setExpiresIn(OTP_TTL_SECONDS);
      setOtpMessage('OTP requested. Check your SMS.');
    } catch (err) {
      setOtpMessage(`Send error: ${err?.message || String(err)}`);
    }
  };

  const confirmCode = async () => {
    try {
      if (expiresIn <= 0) {
        setOtpMessage('The code has expired. Please request a new one.');
        return;
      }

      if (!otpCode) {
        setOtpMessage('Enter the verification code.');
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        phone: formData.phone_e164,
        token: otpCode,
        type: 'phone_change',
      });

      if (error) {
        setOtpMessage(`Verification failed${error.status ? ` [${error.status}]` : ''}: ${error.message}`);
        return;
      }

      const verifiedAt = new Date().toISOString();
      setPhoneVerified(true);
      setOtpMessage('Phone verified ✔');
      setOtpCode('');
      setFormData((prev) => ({ ...prev, phone_verified_at: verifiedAt }));

      if (opId) {
        await supabase
          .from('op_contact')
          .upsert(
            [
              {
                op_id: opId,
                email_primary:
                  toNullableString(formData.email_primary) || toNullableString(user?.email),
                email_billing: toNullableString(formData.email_billing),
                phone_e164: formData.phone_e164 || null,
                phone_verified_at: verifiedAt,
              },
            ],
            { onConflict: 'op_id' }
          );
      } else {
        console.warn('Missing operator identifier while persisting phone verification.');
      }
    } catch (err) {
      setOtpMessage(`Verification error: ${err?.message || String(err)}`);
    }
  };

  const fmtSecs = (secs) => {
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const nationalLength = parsedPhone?.nationalNumber ? String(parsedPhone.nationalNumber).length : 0;
  const isValidPhone = !!parsedPhone && parsedPhone.isValid() && nationalLength >= 10;

  const isValid =
    !!formData.email_primary &&
    isValidPhone &&
    phoneVerified;

  return (
    <>
      <h2 style={styles.title}>Step 2 · Contact & phone verification</h2>
      <div style={styles.formGroup}>
        <input
          style={styles.input}
          name="email_primary"
          type="email"
          placeholder="Primary contact email"
          value={formData.email_primary}
          onChange={(event) => setFormData((prev) => ({ ...prev, email_primary: event.target.value }))}
        />
        <input
          style={styles.input}
          name="email_billing"
          type="email"
          placeholder="Billing email (optional)"
          value={formData.email_billing}
          onChange={(event) => setFormData((prev) => ({ ...prev, email_billing: event.target.value }))}
        />
        <div>
          <PhoneInput
            country={parsedPhone?.country?.toLowerCase() || 'it'}
            value={formData.phone_e164}
            onChange={(value) => {
              const formatted = value.startsWith('+') ? value : `+${value}`;
              setFormData((prev) => ({
                ...prev,
                phone_e164: formatted,
                phone_verified_at: null,
              }));
              setPhoneVerified(false);
              }}
            inputStyle={{ width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" style={styles.secondaryButton} onClick={sendCode}>
              {cooldown > 0 ? `Resend code (${fmtSecs(cooldown)})` : 'Send verification code'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...styles.input, width: '140px' }}
                placeholder="OTP"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
              />
              <button type="button" style={styles.secondaryButton} onClick={confirmCode}>
                Verify code
              </button>
            </div>
          </div>
          {otpMessage && (
            <p
              style={{
                fontSize: 12,
                textAlign: 'left',
                color: otpMessage.includes('✔') ? '#2E7D32' : '#B00020',
              }}
            >
              {otpMessage}
            </p>
          )}
        </div>
        <button
          style={isValid ? styles.button : styles.buttonDisabled}
          disabled={!isValid}
          onClick={saveStep}
        >
          Next ➡️
        </button>
        {!isValid && (
          <ul style={validationList}>
            {!formData.email_primary && <li>Primary email missing</li>}
            {!isValidPhone && <li>Invalid phone number</li>}
            {!phoneVerified && <li>Phone not verified</li>}
          </ul>
        )}
      </div>
    </>
  );
};

const Step3 = ({ user, formData, setFormData, ensureVerificationRequest, saveStep }) => {
  const [uploadingKey, setUploadingKey] = useState(null);
  const [uploadMessage, setUploadMessage] = useState('');

  const handleUpload = async (event, docType) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;
    setUploadMessage('');

    try {
      setUploadingKey(docType);
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const timestamp = Date.now();
      const fileKey = `${user.id}/op-${docType}-${timestamp}.${ext}`;

      const subtle = typeof window !== 'undefined' && window.crypto ? window.crypto.subtle : null;
      if (!subtle) {
        throw new Error('Secure hashing is not available in this browser.');
      }

      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      const mimeType = file.type || 'application/octet-stream';

      const request = await ensureVerificationRequest();
      const verificationId = request?.id;
      if (!verificationId) {
        throw new Error('Unable to create verification request.');
      }

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileKey, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const documentPayload = {
        verification_id: verificationId,
        doc_type: docType,
        file_key: fileKey,
        file_hash: fileHash,
        mime_type: mimeType,
        file_size: file.size,
        expires_at: null,
      };

      const { data: storedDoc, error: documentError } = await supabase
        .from('op_verification_document')
        .upsert([documentPayload], { onConflict: 'verification_id,doc_type' })
        .select('verification_id, doc_type, file_key, file_hash, mime_type, file_size, expires_at')
        .single();
      if (documentError) throw documentError;

      setFormData((prev) => ({
        ...prev,
        documents: {
          ...prev.documents,
          [docType]: {
            doc_type: storedDoc?.doc_type || docType,
            verification_id: storedDoc?.verification_id || verificationId,
            file_key: storedDoc?.file_key || fileKey,
            file_hash: storedDoc?.file_hash || fileHash,
            mime_type: storedDoc?.mime_type || mimeType,
            file_size: storedDoc?.file_size ?? file.size,
            expires_at: storedDoc?.expires_at || null,
          },
        },
      }));
      setUploadMessage('Document uploaded successfully.');
    } catch (err) {
      console.error('Upload error', err);
      setUploadMessage(err.message || 'Upload failed.');
    } finally {
      setUploadingKey(null);
      event.target.value = '';
    }
  };

  const handleRemove = async (docType) => {
    const currentDoc = formData.documents[docType];
    if (!currentDoc) return;
    setUploadMessage('');
    try {
      setUploadingKey(docType);
      const verificationId =
        currentDoc.verification_id || (await ensureVerificationRequest())?.id || null;
      if (!verificationId) {
        throw new Error('Verification request not found.');
      }
      const { error: deleteError } = await supabase
        .from('op_verification_document')
        .delete()
        .match({ verification_id: verificationId, doc_type: docType });
      if (deleteError) throw deleteError;

      if (currentDoc.file_key) {
        await supabase.storage.from('documents').remove([currentDoc.file_key]);
      }

      setFormData((prev) => ({
        ...prev,
        documents: {
          ...prev.documents,
          [docType]: null,
        },
      }));
      setUploadMessage('Document removed.');
    } catch (err) {
      console.error('Remove error', err);
      setUploadMessage(err.message || 'Failed to remove document.');
    } finally {
      setUploadingKey(null);
    }
  };

  const isValid = REQUIRED_DOCS.every(({ docType, optional }) => optional || formData.documents[docType]);

  return (
    <>
      <h2 style={styles.title}>Step 3 · Verification documents</h2>
      <div style={styles.formGroup}>
        {REQUIRED_DOCS.map(({ docType, label, optional }) => (
          <FileField
            key={docType}
            label={label}
            optional={optional}
            document={formData.documents[docType]}
            uploading={uploadingKey === docType}
            onUpload={(event) => handleUpload(event, docType)}
            onRemove={() => handleRemove(docType)}
          />
        ))}
        <textarea
          style={{ ...styles.input, minHeight: 120 }}
          placeholder="Additional notes for the review team (optional)"
          value={formData.document_notes}
          onChange={(event) => setFormData((prev) => ({ ...prev, document_notes: event.target.value }))}
        />
        {uploadMessage && (
          <p
            style={{
              fontSize: 12,
              color: uploadMessage.includes('successfully') || uploadMessage.includes('removed') ? '#2E7D32' : '#B00020',
              textAlign: 'left',
            }}
          >
            {uploadMessage}
          </p>
        )}
        <button
          style={isValid ? styles.button : styles.buttonDisabled}
          disabled={!isValid}
          onClick={saveStep}
        >
          Next ➡️
        </button>
        {!isValid && (
          <ul style={validationList}>
            {REQUIRED_DOCS.filter(({ docType, optional }) => !optional && !formData.documents[docType]).map(({ docType, label }) => (
              <li key={docType}>{label} missing</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

const Step4 = ({ formData, setFormData, submitting, finalize }) => {
  const [gdprHtml, setGdprHtml] = useState('');
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    fetch('/gdpr_policy_en.html')
      .then((response) => response.text())
      .then((html) => setGdprHtml(html))
      .catch((err) => console.error('Failed to load GDPR policy', err));
  }, []);

  const gdprAccepted = !!formData.privacy_consent;

  return (
    <>
      <h2 style={styles.title}>Step 4 · Privacy & submission</h2>
      <div style={{ ...styles.formGroup, textAlign: 'left' }}>
        <div
          className="gdpr-box"
          onScroll={(event) => {
            const target = event.target;
            if (target.scrollTop + target.clientHeight >= target.scrollHeight - 5) {
              setHasScrolled(true);
            }
          }}
          dangerouslySetInnerHTML={{ __html: gdprHtml }}
          style={gdprBox}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={gdprAccepted}
            disabled={!hasScrolled}
            onChange={(event) => {
              const checked = event.target.checked;
              setFormData((prev) => ({
                ...prev,
                privacy_consent: checked,
                privacy_consent_at: checked ? (prev.privacy_consent_at || new Date().toISOString()) : null,
                policy_version: checked ? (prev.policy_version || PRIVACY_POLICY_VERSION) : prev.policy_version,
              }));
            }}
          />
          I have read and accept the GDPR policy
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={!!formData.marketing_optin}
            onChange={(event) => setFormData((prev) => ({ ...prev, marketing_optin: event.target.checked }))}
          />
          I agree to receive TalentLix updates and communications
        </label>
        <button
          style={gdprAccepted ? { ...styles.button, marginTop: 12 } : { ...styles.buttonDisabled, marginTop: 12 }}
          disabled={!gdprAccepted || submitting}
          onClick={finalize}
        >
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>
    </>
  );
};

const CompletionCard = ({ onContinue }) => (
  <div>
    <h2 style={styles.title}>Submission received</h2>
    <p>Your operator profile has been submitted and is currently in review.</p>
    <button style={styles.button} onClick={onContinue}>
      View review status
    </button>
  </div>
);

const FileField = ({ label, optional, document, uploading, onUpload, onRemove }) => (
  <div style={{ textAlign: 'left' }}>
    <p style={{ fontWeight: 600, marginBottom: 8 }}>
      {label}
      {optional ? ' · Optional' : ''}
    </p>
    {document ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#555', wordBreak: 'break-all' }}>
          <div><strong>Storage key:</strong> {document.file_key}</div>
          <div><strong>Hash:</strong> {document.file_hash}</div>
          <div><strong>MIME:</strong> {document.mime_type || document.file_mime || ''}</div>
          <div>
            <strong>Size:</strong>{' '}
            {document.file_size ? (document.file_size / 1024).toFixed(1) : '0.0'} KB
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" style={styles.secondaryButton} onClick={onRemove} disabled={uploading}>
            Remove
          </button>
        </div>
      </div>
    ) : (
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={onUpload}
        disabled={uploading}
      />
    )}
  </div>
);

const selectStyles = {
  control: (base) => ({
    ...base,
    padding: '2px',
    borderRadius: '8px',
    borderColor: '#ccc',
  }),
};

const validationList = {
  margin: 0,
  paddingLeft: '20px',
  color: '#B00020',
  textAlign: 'left',
  fontSize: '0.9rem',
};

const gdprBox = {
  maxHeight: '260px',
  overflowY: 'auto',
  padding: '1rem',
  border: '1px solid #ccc',
  borderRadius: '8px',
  background: '#fff',
};

const twoCols = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '1rem',
  width: '100%',
};

const styles = {
  background: {
    background: 'url(/operator-bg.jpg) center/cover no-repeat fixed',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    background: 'rgba(0,0,0,0.55)',
    width: '100%',
    minHeight: '100%',
    position: 'static',
    zIndex: 1,
  },
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
  },
  card: {
    width: '100%',
    maxWidth: '520px',
    background: 'rgba(248, 249, 250, 0.95)',
    padding: '2rem',
    borderRadius: '16px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
    textAlign: 'center',
    zIndex: 2,
  },
  logo: { width: '80px', marginBottom: '1rem' },
  progressBar: { background: '#E0E0E0', height: '8px', borderRadius: '8px', marginBottom: '1rem' },
  progressFill: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', height: '100%', borderRadius: '8px' },
  steps: { display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' },
  stepCircle: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
  },
  title: { fontSize: '1.5rem', marginBottom: '1rem' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' },
  input: {
    width: '100%',
    padding: '0.8rem',
    borderRadius: '8px',
    border: '1px solid #ccc',
    boxSizing: 'border-box',
  },
  button: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    border: 'none',
    padding: '0.8rem',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    fontWeight: 'bold',
  },
  buttonDisabled: {
    background: '#ccc',
    color: '#fff',
    border: 'none',
    padding: '0.8rem',
    borderRadius: '8px',
    width: '100%',
    cursor: 'not-allowed',
  },
  link: { color: '#0A66C2', fontWeight: 600, textDecoration: 'none' },
  error: { color: 'red', fontSize: '0.9rem', marginBottom: '1rem' },
  loaderContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 16,
    padding: 48,
    textAlign: 'center',
    minHeight: 'calc(100vh - 32px)',
    width: '100%',
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '4px solid #27E3DA',
    borderTopColor: '#F7B84E',
    animation: 'profilePreviewSpin 1s linear infinite',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  userMenuContainer: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    zIndex: 20,
  },
  menuIcon: {
    background: '#27E3DA',
    color: '#fff',
    width: '35px',
    height: '35px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  },
  dropdown: {
    position: 'absolute',
    top: '45px',
    right: '0',
    background: '#FFF',
    border: '1px solid #E0E0E0',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    minWidth: '200px',
    zIndex: 100,
    padding: '0.5rem',
  },
  dropdownUser: {
    padding: '0.5rem',
    fontSize: '0.9rem',
    color: '#555',
    borderBottom: '1px solid #eee',
    marginBottom: '0.5rem',
  },
  dropdownButton: {
    background: '#DD5555',
    color: '#FFF',
    border: 'none',
    padding: '0.5rem',
    width: '100%',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  secondaryButton: {
    background: '#fff',
    border: '1px solid #27E3DA',
    color: '#027373',
    padding: '0.6rem 1rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
  },
};

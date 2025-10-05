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

const ENTITY_OPTIONS = [
  { value: 'club', label: 'Club / Team' },
  { value: 'academy', label: 'Academy' },
  { value: 'agency', label: 'Agency' },
  { value: 'scout', label: 'Scout / Individual Operator' },
  { value: 'tournament', label: 'Tournament / Event Organizer' },
  { value: 'other', label: 'Other' },
];

const INITIAL_FORM = {
  // Step 1
  entity_type: '',
  organization_name: '',
  registration_number: '',
  website: '',
  headquarters_city: '',
  headquarters_country: '',

  // Step 2
  contact_first_name: '',
  contact_last_name: '',
  contact_email: '',
  phone: '',
  phone_verified: false,

  // Step 3
  document_business_license_url: '',
  document_identity_url: '',
  document_proof_address_url: '',
  document_additional_notes: '',

  // Step 4
  privacy_gdpr: false,
  privacy_gdpr_at: null,
  privacy_marketing: false,
};

const calcCompletion = (step) => {
  switch (step) {
    case 2: return 25;
    case 3: return 50;
    case 4: return 75;
    default: return 100;
  }
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

  const operatorId = user?.id || null;
  const email = user?.email || '';

  const toggleMenu = () => setMenuOpen((open) => !open);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login-operator');
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!operatorId) return;
      setLoading(true);

      try {
        const [{ data: profile, error: profileError }, { data: verification, error: verificationError }] = await Promise.all([
          supabase
            .from('operator_profiles')
            .select('*')
            .eq('id', operatorId)
            .maybeSingle(),
          supabase
            .from('operator_verification')
            .select('*')
            .eq('operator_id', operatorId)
            .maybeSingle(),
        ]);

        if (!active) return;

        if (profileError && profileError.code !== 'PGRST116') throw profileError;
        if (verificationError && verificationError.code !== 'PGRST116') throw verificationError;

        const nextForm = { ...INITIAL_FORM };

        if (profile) {
          nextForm.entity_type = profile.entity_type || '';
          nextForm.organization_name = profile.organization_name || '';
          nextForm.registration_number = profile.registration_number || '';
          nextForm.website = profile.website || '';
          nextForm.headquarters_city = profile.headquarters_city || '';
          nextForm.headquarters_country = profile.headquarters_country || '';
          nextForm.contact_first_name = profile.contact_first_name || '';
          nextForm.contact_last_name = profile.contact_last_name || '';
          nextForm.contact_email = profile.contact_email || email || '';
          nextForm.phone = profile.phone || '';
          nextForm.phone_verified = profile.phone_verified || false;
          nextForm.privacy_gdpr = !!profile.privacy_gdpr;
          nextForm.privacy_gdpr_at = profile.privacy_gdpr_at || null;
          nextForm.privacy_marketing = !!profile.privacy_marketing;

          if (typeof profile.current_step === 'number' && profile.current_step >= 1 && profile.current_step <= 4) {
            setStep(profile.current_step);
          } else if (profile.review_status && profile.review_status !== 'draft') {
            setStep(null);
          }

          if (profile.review_status && profile.review_status !== 'draft' && router.pathname !== '/operator-in-review') {
            router.replace('/operator-in-review');
            return;
          }
        } else {
          nextForm.contact_email = email || '';
        }

        if (verification) {
          nextForm.document_business_license_url = verification.document_business_license_url || '';
          nextForm.document_identity_url = verification.document_identity_url || '';
          nextForm.document_proof_address_url = verification.document_proof_address_url || '';
          nextForm.document_additional_notes = verification.document_additional_notes || '';
          if (!nextForm.phone) nextForm.phone = verification.phone_number || '';
          if (!nextForm.phone_verified) nextForm.phone_verified = !!verification.phone_verified;
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

    if (!checkingGuard && !guardError && operatorId) {
      load();
    }

    return () => {
      active = false;
    };
  }, [checkingGuard, guardError, operatorId, email, router]);

  const saveStep = async (nextStep) => {
    if (!operatorId) return;
    setErrorMessage('');

    try {
      if (step === 1) {
        const { error } = await supabase.from('operator_profiles').upsert([
          {
            id: operatorId,
            entity_type: formData.entity_type,
            organization_name: formData.organization_name,
            registration_number: formData.registration_number,
            website: formData.website,
            headquarters_city: formData.headquarters_city,
            headquarters_country: formData.headquarters_country,
            current_step: nextStep,
            completion_percentage: calcCompletion(nextStep),
            review_status: 'draft',
          },
        ], { onConflict: 'id' });
        if (error) throw error;
      } else if (step === 2) {
        const { error } = await supabase.from('operator_profiles').update({
          contact_first_name: formData.contact_first_name,
          contact_last_name: formData.contact_last_name,
          contact_email: formData.contact_email || email,
          phone: formData.phone,
          phone_verified: formData.phone_verified,
          current_step: nextStep,
          completion_percentage: calcCompletion(nextStep),
        }).eq('id', operatorId);
        if (error) throw error;

        const { error: verificationError } = await supabase.from('operator_verification').upsert({
          operator_id: operatorId,
          phone_number: formData.phone,
          phone_verified: formData.phone_verified,
        }, { onConflict: 'operator_id' });
        if (verificationError) throw verificationError;
      } else if (step === 3) {
        const { error } = await supabase.from('operator_verification').upsert({
          operator_id: operatorId,
          document_business_license_url: formData.document_business_license_url || null,
          document_identity_url: formData.document_identity_url || null,
          document_proof_address_url: formData.document_proof_address_url || null,
          document_additional_notes: formData.document_additional_notes || null,
          phone_number: formData.phone,
          phone_verified: formData.phone_verified,
        }, { onConflict: 'operator_id' });
        if (error) throw error;

        const { error: profileUpdateError } = await supabase.from('operator_profiles').update({
          current_step: nextStep,
          completion_percentage: calcCompletion(nextStep),
        }).eq('id', operatorId);
        if (profileUpdateError) throw profileUpdateError;
      }

      setStep(nextStep);
    } catch (err) {
      console.error('Failed to save step', err);
      setErrorMessage(err.message || 'Unable to save step.');
    }
  };

  const finalize = async () => {
    if (!operatorId) return;
    setSubmitting(true);
    setErrorMessage('');

    try {
      const submittedAt = new Date().toISOString();

      const { error: profileError } = await supabase.from('operator_profiles').update({
        privacy_gdpr: formData.privacy_gdpr,
        privacy_gdpr_at: formData.privacy_gdpr ? (formData.privacy_gdpr_at || submittedAt) : null,
        privacy_marketing: formData.privacy_marketing,
        review_status: 'submitted',
        submitted_at: submittedAt,
        current_step: null,
        completion_percentage: 100,
      }).eq('id', operatorId);
      if (profileError) throw profileError;

      const { error: verificationError } = await supabase.from('operator_verification').upsert({
        operator_id: operatorId,
        review_status: 'submitted',
        submitted_at: submittedAt,
        phone_number: formData.phone,
        phone_verified: formData.phone_verified,
        document_business_license_url: formData.document_business_license_url || null,
        document_identity_url: formData.document_identity_url || null,
        document_proof_address_url: formData.document_proof_address_url || null,
        document_additional_notes: formData.document_additional_notes || null,
      }, { onConflict: 'operator_id' });
      if (verificationError) throw verificationError;

      router.replace('/operator-in-review');
    } catch (err) {
      console.error('Failed to finalize operator onboarding', err);
      setErrorMessage(err.message || 'Unable to complete onboarding.');
      setSubmitting(false);
    }
  };

  const normalizedPhone = (formData.phone || '').replace(/\s+/g, '');
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

  if (!operatorId) {
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
    !!formData.entity_type &&
    !!formData.organization_name &&
    !!formData.headquarters_city &&
    !!formData.headquarters_country;

  return (
    <>
      <h2 style={styles.title}>Step 1 · Entity details</h2>
      <div style={styles.formGroup}>
        <div style={{ width: '100%' }}>
          <Select
            placeholder="Select entity type"
            options={ENTITY_OPTIONS}
            value={ENTITY_OPTIONS.find((opt) => opt.value === formData.entity_type) || null}
            onChange={(selected) => setFormData((prev) => ({ ...prev, entity_type: selected?.value || '' }))}
            styles={selectStyles}
          />
        </div>
        <input
          style={styles.input}
          name="organization_name"
          placeholder="Legal entity name"
          value={formData.organization_name}
          onChange={(event) => setFormData((prev) => ({ ...prev, organization_name: event.target.value }))}
        />
        <input
          style={styles.input}
          name="registration_number"
          placeholder="Registration / VAT number (optional)"
          value={formData.registration_number}
          onChange={(event) => setFormData((prev) => ({ ...prev, registration_number: event.target.value }))}
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
          name="headquarters_city"
          placeholder="Headquarters city"
          value={formData.headquarters_city}
          onChange={(event) => setFormData((prev) => ({ ...prev, headquarters_city: event.target.value }))}
        />
        <div style={{ width: '100%' }}>
          <Select
            placeholder="Start typing headquarters country"
            options={countries}
            value={countries.find((opt) => opt.value === formData.headquarters_country) || null}
            onChange={(selected) => setFormData((prev) => ({ ...prev, headquarters_country: selected?.value || '' }))}
            filterOption={(option, inputValue) =>
              inputValue.length >= 2 && option.label.toLowerCase().includes(inputValue.toLowerCase())
            }
            styles={selectStyles}
          />
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
            {!formData.entity_type && <li>Entity type missing</li>}
            {!formData.organization_name && <li>Entity name missing</li>}
            {!formData.headquarters_city && <li>Headquarters city missing</li>}
            {!formData.headquarters_country && <li>Headquarters country missing</li>}
          </ul>
        )}
      </div>
    </>
  );
};

const Step2 = ({ user, formData, setFormData, parsedPhone, saveStep }) => {
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(!!formData.phone_verified);
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
    if (expiresIn > 0) {
      timer = setInterval(() => setExpiresIn((prev) => (prev > 0 ? prev - 1 : 0)), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [expiresIn]);

  useEffect(() => {
    const syncVerifiedState = async () => {
      if (!user?.id) return;

      const { data: { user: authUser } } = await supabase.auth.getUser();
      const authPhone = authUser?.phone ? `+${String(authUser.phone).replace(/^\+?/, '')}` : '';
      const digits = (value) => (value ? String(value).replace(/\D/g, '') : '');
      const sameNumber = digits(authPhone) && digits(formData.phone) && digits(authPhone) === digits(formData.phone);
      const confirmed = !!authUser?.phone_confirmed_at;

      const { data: verificationRows } = await supabase
        .from('operator_verification')
        .select('phone_number, phone_verified')
        .eq('operator_id', user.id)
        .limit(1);

      const verification = Array.isArray(verificationRows) ? verificationRows[0] : null;
      const alreadyVerified = verification?.phone_verified === true &&
        digits(verification?.phone_number) === digits(formData.phone);

      if ((sameNumber && confirmed) || alreadyVerified) {
        if (!phoneVerified) setPhoneVerified(true);
        if (!formData.phone_verified) setFormData((prev) => ({ ...prev, phone_verified: true }));
        setOtpSent(false);
        setOtpMessage('Phone already verified ✔');
      }
    };

    syncVerifiedState();
  }, [formData.phone, formData.phone_verified, phoneVerified, setFormData, user?.id]);

  useEffect(() => {
    if (formData.phone_verified !== phoneVerified) {
      setFormData((prev) => ({ ...prev, phone_verified: phoneVerified }));
    }
  }, [formData.phone_verified, phoneVerified, setFormData]);

  const ensureSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
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
      const { error } = await supabase.auth.updateUser({ phone: formData.phone });
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

      const { error } = await supabase.auth.verifyOtp({
        phone: formData.phone,
        token: otpCode,
        type: 'phone_change',
      });

      if (error) {
        setOtpMessage(`Verification failed${error.status ? ` [${error.status}]` : ''}: ${error.message}`);
        return;
      }

      setPhoneVerified(true);
      setOtpMessage('Phone verified ✔');
      setFormData((prev) => ({ ...prev, phone_verified: true }));

      await supabase
        .from('operator_profiles')
        .update({ phone: formData.phone, phone_verified: true })
        .eq('id', user.id);

      await supabase
        .from('operator_verification')
        .upsert({
          operator_id: user.id,
          phone_number: formData.phone,
          phone_verified: true,
        }, { onConflict: 'operator_id' });
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
    !!formData.contact_first_name &&
    !!formData.contact_last_name &&
    !!formData.contact_email &&
    !!formData.headquarters_city &&
    !!formData.headquarters_country &&
    isValidPhone &&
    phoneVerified;

  return (
    <>
      <h2 style={styles.title}>Step 2 · Contact & phone verification</h2>
      <div style={styles.formGroup}>
        <div style={twoCols}>
          <input
            style={styles.input}
            name="contact_first_name"
            placeholder="Contact first name"
            value={formData.contact_first_name}
            onChange={(event) => setFormData((prev) => ({ ...prev, contact_first_name: event.target.value }))}
          />
          <input
            style={styles.input}
            name="contact_last_name"
            placeholder="Contact last name"
            value={formData.contact_last_name}
            onChange={(event) => setFormData((prev) => ({ ...prev, contact_last_name: event.target.value }))}
          />
        </div>
        <input
          style={styles.input}
          name="contact_email"
          type="email"
          placeholder="Contact email"
          value={formData.contact_email}
          onChange={(event) => setFormData((prev) => ({ ...prev, contact_email: event.target.value }))}
        />
        <div>
          <PhoneInput
            country={parsedPhone?.country?.toLowerCase() || 'it'}
            value={formData.phone}
            onChange={(value) => {
              setFormData((prev) => ({ ...prev, phone: `+${value}` }));
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
          {otpMessage && <p style={{ fontSize: 12, textAlign: 'left', color: otpMessage.includes('✔') ? '#2E7D32' : '#B00020' }}>{otpMessage}</p>}
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
            {!formData.contact_first_name && <li>Contact first name missing</li>}
            {!formData.contact_last_name && <li>Contact last name missing</li>}
            {!formData.contact_email && <li>Contact email missing</li>}
            {!isValidPhone && <li>Invalid phone number</li>}
            {!phoneVerified && <li>Phone not verified</li>}
          </ul>
        )}
      </div>
    </>
  );
};

const Step3 = ({ user, formData, setFormData, saveStep }) => {
  const [uploadingKey, setUploadingKey] = useState(null);
  const [uploadMessage, setUploadMessage] = useState('');

  const handleUpload = async (event, key) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;
    setUploadMessage('');

    try {
      setUploadingKey(key);
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const timestamp = Date.now();
      const path = `${user.id}/operator-${key}-${timestamp}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('documents').getPublicUrl(path);
      const publicUrl = data?.publicUrl || '';
      setFormData((prev) => ({ ...prev, [key]: publicUrl }));
      setUploadMessage('Document uploaded successfully.');
    } catch (err) {
      console.error('Upload error', err);
      setUploadMessage(err.message || 'Upload failed.');
    } finally {
      setUploadingKey(null);
      event.target.value = '';
    }
  };

  const isValid = !!formData.document_business_license_url && !!formData.document_identity_url;

  return (
    <>
      <h2 style={styles.title}>Step 3 · Verification documents</h2>
      <div style={styles.formGroup}>
        <FileField
          label="Business registration document"
          value={formData.document_business_license_url}
          uploading={uploadingKey === 'document_business_license_url'}
          onUpload={(event) => handleUpload(event, 'document_business_license_url')}
          onRemove={() => setFormData((prev) => ({ ...prev, document_business_license_url: '' }))}
        />
        <FileField
          label="Legal representative ID"
          value={formData.document_identity_url}
          uploading={uploadingKey === 'document_identity_url'}
          onUpload={(event) => handleUpload(event, 'document_identity_url')}
          onRemove={() => setFormData((prev) => ({ ...prev, document_identity_url: '' }))}
        />
        <FileField
          label="Proof of headquarters address (optional)"
          value={formData.document_proof_address_url}
          uploading={uploadingKey === 'document_proof_address_url'}
          onUpload={(event) => handleUpload(event, 'document_proof_address_url')}
          onRemove={() => setFormData((prev) => ({ ...prev, document_proof_address_url: '' }))}
        />
        <textarea
          style={{ ...styles.input, minHeight: 120 }}
          placeholder="Additional notes for the review team (optional)"
          value={formData.document_additional_notes}
          onChange={(event) => setFormData((prev) => ({ ...prev, document_additional_notes: event.target.value }))}
        />
        {uploadMessage && <p style={{ fontSize: 12, color: uploadMessage.includes('successfully') ? '#2E7D32' : '#B00020', textAlign: 'left' }}>{uploadMessage}</p>}
        <button
          style={isValid ? styles.button : styles.buttonDisabled}
          disabled={!isValid}
          onClick={saveStep}
        >
          Next ➡️
        </button>
        {!isValid && (
          <ul style={validationList}>
            {!formData.document_business_license_url && <li>Business registration document missing</li>}
            {!formData.document_identity_url && <li>Representative ID document missing</li>}
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
      .then(setGdprHtml)
      .catch((err) => console.error('Failed to load GDPR policy', err));
  }, []);

  const gdprAccepted = !!formData.privacy_gdpr;

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
                privacy_gdpr: checked,
                privacy_gdpr_at: checked ? (prev.privacy_gdpr_at || new Date().toISOString()) : null,
              }));
            }}
          />
          I have read and accept the GDPR policy
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={!!formData.privacy_marketing}
            onChange={(event) => setFormData((prev) => ({ ...prev, privacy_marketing: event.target.checked }))}
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

const FileField = ({ label, value, uploading, onUpload, onRemove }) => (
  <div style={{ textAlign: 'left' }}>
    <p style={{ fontWeight: 600, marginBottom: 8 }}>{label}</p>
    {value ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href={value} target="_blank" rel="noreferrer" style={{ ...styles.link, wordBreak: 'break-word' }}>
          View uploaded document
        </a>
        <button type="button" style={styles.secondaryButton} onClick={onRemove}>
          Remove
        </button>
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
  color: '#b00',
  fontSize: '12px',
  textAlign: 'left',
  marginTop: '6px',
  paddingLeft: '18px',
};

const twoCols = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
};

const gdprBox = {
  maxHeight: '220px',
  overflowY: 'auto',
  padding: '12px',
  border: '1px solid #E0E0E0',
  borderRadius: '8px',
  background: '#FFF',
  fontSize: '14px',
  lineHeight: 1.6,
};

const styles = {
  background: {
    backgroundImage: "url('/BackG.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    width: '100%',
    minHeight: '100vh',
    position: 'relative',
  },
  overlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
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
  stepCircle: { width: '30px', height: '30px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  title: { fontSize: '1.5rem', marginBottom: '1rem' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' },
  input: { width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' },
  button: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', border: 'none', padding: '0.8rem', borderRadius: '8px', cursor: 'pointer', width: '100%', fontWeight: 'bold' },
  buttonDisabled: { background: '#ccc', color: '#fff', border: 'none', padding: '0.8rem', borderRadius: '8px', width: '100%', cursor: 'not-allowed' },
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

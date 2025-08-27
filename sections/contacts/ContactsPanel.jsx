// sections/contacts/ContactsPanel.jsx
// UI/UX coerente con Wizard/Dashboard. Prefisso telefono bloccato, upload su bucket 'documents/<userId>/...'

/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase as sb } from '../../utils/supabaseClient';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import Select from 'react-select';
import countries from '../../utils/countries';

const supabase = sb;

const ATHLETE_TABLE = 'athlete';
const CV_TABLE = 'contacts_verification';

// OTP policy (richiesto 60s, non 30s)
const COOLDOWN_SECONDS = 60;
const OTP_TTL_SECONDS = 600; // 10 min
const MAX_ATTEMPTS = 5;

// Scelte documento ID
const DOC_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'id_card', label: 'ID Card' },
  { value: 'driver_license', label: 'Driver’s License' },
  { value: 'other', label: 'Other (specify)' },
];

// Stili rapidi (coerenti col brand)
const styles = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' },
  fullRow: { gridColumn: '1 / -1' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, opacity: 0.85 },
  input: {
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 8,
    fontSize: 14,
    background: '#FFF',
    height: 40,
  },
  error: { fontSize: 11, color: '#b00', marginTop: 2 },
  hint: { fontSize: 12, opacity: 0.8 },

  primaryBtn: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },
  secondaryBtn: {
    background: '#f2f2f2',
    color: '#333',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  tinyBtn: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },
  dangerBtn: {
    background: '#c0392b',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },

  fileBox: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  fileName: { fontSize: 12, opacity: 0.85, fontStyle: 'italic' },

  otpRow: { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' },
  otpMsg: { fontSize: 12, minHeight: 16 },
  countdown: { fontSize: 12, opacity: 0.8 },

  saveBar: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    justifyContent: 'flex-end',
  },
};

export default function ContactsPanel({ athlete, onSaved }) {
  const router = useRouter();
  const athleteId = athlete?.id;

  // ----- Form state
  const [form, setForm] = useState({
    residence_city: '',
    residence_country: '', // salviamo la label del paese, coerente con Wizard
    native_language: athlete?.native_language || 'English',
    additional_language: athlete?.additional_language || '',
    phone: '',
  });

  // Doc state (contacts_verification)
  const [docType, setDocType] = useState(null);
  const [docTypeOther, setDocTypeOther] = useState('');
  const [idDocPath, setIdDocPath] = useState('');     // path già salvato (se esiste)
  const [selfiePath, setSelfiePath] = useState('');   // path già salvato (se esiste)

  // Selezioni correnti (non salvate)
  const [idDocFile, setIdDocFile] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);

  // ----- Phone verification
  const [phoneVerified, setPhoneVerified] = useState(false);
  const initialPhoneRef = useRef('');                  // telefono “di partenza” (DB / CV / Auth)
  const [leftPhoneField, setLeftPhoneField] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpMsg, setOtpMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [attempts, setAttempts] = useState(0);

  // ----- Dirty guard (uscita senza salvare)
  const [dirty, setDirty] = useState(false);

  // ----- Prefill (athlete + CV + Auth phone)
  useEffect(() => {
    if (!athleteId) return;
    (async () => {
      // Prefill athlete
      const resCity = athlete?.residence_city || '';
      const resCountry = athlete?.residence_country || '';
      const phoneFromAthlete = athlete?.phone || '';

      // Prefill contacts_verification (doc + phone_verified)
      const { data: cvRows, error: cvErr } = await supabase
        .from(CV_TABLE)
        .select(
          'phone_number, phone_verified, id_document_url, id_selfie_url, id_document_type, id_document_type_other'
        )
        .eq('athlete_id', athleteId)
        .limit(1);

      if (cvErr) {
        // non bloccare UI
        // console.warn('CV fetch error', cvErr);
      }
      const cv = Array.isArray(cvRows) && cvRows[0];

      // Prefill form
      setForm((p) => ({
        ...p,
        residence_city: resCity,
        residence_country: resCountry,
        phone: phoneFromAthlete || cv?.phone_number || '',
      }));

      // Doc prefill
      setIdDocPath(cv?.id_document_url || '');
      setSelfiePath(cv?.id_selfie_url || '');
      setDocType(cv?.id_document_type ? DOC_TYPES.find((d) => d.value === cv.id_document_type) : null);
      setDocTypeOther(cv?.id_document_type_other || '');

      // Phone verification heuristic: se DB/Auth/CV dicono verified e combacia con il value corrente → verified
      const digits = (v) => (v ? String(v).replace(/\D/g, '') : '');
      let verified = false;

      // 1) App-level CV
      if (cv?.phone_verified === true && digits(cv.phone_number) && digits(phoneFromAthlete)) {
        if (digits(cv.phone_number) === digits(phoneFromAthlete)) verified = true;
      }

      // 2) Auth user (phone_confirmed_at + numero combaciante)
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      const authPhone = authUser?.phone ? `+${String(authUser.phone).replace(/^\+?/, '')}` : '';
      if (digits(authPhone) === digits(phoneFromAthlete) && !!authUser?.phone_confirmed_at) {
        verified = true;
      }

      // Imposta ref e stato iniziale
      initialPhoneRef.current = phoneFromAthlete || authPhone || cv?.phone_number || '';
      setPhoneVerified(Boolean(verified));
      setDirty(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  // ----- Countdown timers
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const t = setInterval(() => setExpiresIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [expiresIn]);

  // ----- Validazioni
  const digits = (v) => (v ? String(v).replace(/\D/g, '') : '');
  const isValidPhone = useMemo(() => {
    if (!form.phone) return false;
    try {
      const p = parsePhoneNumberFromString(form.phone);
      return Boolean(p && p.isValid());
    } catch {
      return false;
    }
  }, [form.phone]);

  const phoneChanged = useMemo(() => {
    return digits(form.phone) !== digits(initialPhoneRef.current);
  }, [form.phone]);

  const canSendCode = !phoneVerified && isValidPhone && leftPhoneField && phoneChanged && cooldown === 0;

  // ----- Dirty guard (“come Personal data card”)
  useEffect(() => {
    const beforeUnload = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const handleRouteChangeStart = (url) => {
      if (!dirty) return;
      if (!confirm('You have unsaved changes. Leave this page?')) {
        // blocca la navigazione
        router.events.emit('routeChangeError');
        // eslint-disable-next-line no-throw-literal
        throw 'Route change aborted.';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    router.events.on('routeChangeStart', handleRouteChangeStart);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      router.events.off('routeChangeStart', handleRouteChangeStart);
    };
  }, [dirty, router.events]);

  // ----- Handlers base
  const setField = (name, value) => {
    setForm((p) => ({ ...p, [name]: value }));
    setDirty(true);
  };

  const onCountryChange = (opt) => {
    setField('residence_country', opt ? opt.label : '');
  };

  // File selection
  const onPickIdDoc = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setIdDocFile(f);
    setDirty(true);
  };
  const onPickSelfie = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSelfieFile(f);
    setDirty(true);
  };

  // Upload helper → bucket 'documents', path '<userId>/<kind>-<ts>.<ext>'
  const uploadPrivateDoc = async (kind, file) => {
    const ext = (file.name.split('.').pop() || 'dat').toLowerCase();
    const path = `${athleteId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true });
    if (error) throw error;
    return path; // su 'documents' (bucket privato)
  };

  // ----- OTP: invio codice (phone_change)
  const sendCode = async () => {
    try {
      setOtpMsg('');
      if (!canSendCode) return;

      // Richiede PHONE CHANGE: invia OTP via provider SMS (Twilio configurato in Supabase)
      const { error } = await supabase.auth.updateUser({ phone: form.phone });
      if (error) throw error;

      setOtpSent(true);
      setCooldown(COOLDOWN_SECONDS);
      setExpiresIn(OTP_TTL_SECONDS);
      setAttempts(0);
      setOtpMsg('OTP requested. Check your SMS.');
    } catch (e) {
      setOtpMsg(`Send error: ${e?.message || String(e)}`);
    }
  };

  // ----- OTP: conferma codice
  const confirmCode = async () => {
    try {
      if (!otpCode || otpCode.length !== 6) return;
      if (expiresIn <= 0) {
        setOtpMsg('The code has expired. Please request a new one.');
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        setOtpMsg('Too many attempts. Please request a new code later.');
        return;
      }
      setAttempts((n) => n + 1);

      const { error } = await supabase.auth.verifyOtp({
        phone: form.phone,
        token: otpCode,
        type: 'phone_change',
      });
      if (error) {
        setOtpMsg(`Verification failed${error.status ? ` [${error.status}]` : ''}: ${error.message}`);
        return;
      }

      // Verifica OK → allinea athlete.phone + upsert contacts_verification
      const { error: uErr } = await supabase
        .from(ATHLETE_TABLE)
        .update({ phone: form.phone })
        .eq('id', athleteId);
      if (uErr) throw uErr;

      const upsertPayload = {
        athlete_id: athleteId,
        phone_number: form.phone,
        phone_verified: true,
        verified_at: new Date().toISOString(),
      };
      const { error: cvErr } = await supabase.from(CV_TABLE).upsert(upsertPayload, { onConflict: 'athlete_id' });
      if (cvErr) throw cvErr;

      initialPhoneRef.current = form.phone;
      setPhoneVerified(true);
      setOtpMsg('Phone verified ✔');
      setOtpSent(false);
      setCooldown(0);
      setExpiresIn(0);
      setOtpCode('');
      setDirty(false); // il numero è stato effettivamente commitato
    } catch (e) {
      setOtpMsg(`Verification error: ${e?.message || String(e)}`);
    }
  };

  // ----- Save (residenza + lingue + documenti)
  const onSave = async () => {
    try {
      // Validazioni minime
      // (NB: i campi diventano modificabili; niente asterischi nelle label)
      if (!form.residence_city?.trim() || !form.residence_country?.trim()) {
        alert('Please fill City of Residence and Country of Residence.');
        return;
      }

      // 1) Aggiorna ATHLETE (residenza/lingue)
      const athletePayload = {
        residence_city: form.residence_city || null,
        residence_country: form.residence_country || null,
        native_language: form.native_language || null,
        additional_language: form.additional_language || null,
      };
      const { error: aErr, data: updated } = await supabase
        .from(ATHLETE_TABLE)
        .update(athletePayload)
        .eq('id', athleteId)
        .select()
        .single();
      if (aErr) throw aErr;

      // 2) Upload documenti se selezionati (bucket 'documents/<userId>/...')
      let newIdDocPath = idDocPath;
      let newSelfiePath = selfiePath;
      if (idDocFile) {
        newIdDocPath = await uploadPrivateDoc('id_document', idDocFile);
        setIdDocPath(newIdDocPath);
      }
      if (selfieFile) {
        newSelfiePath = await uploadPrivateDoc('id_selfie', selfieFile);
        setSelfiePath(newSelfiePath);
      }

      // 3) Upsert su contacts_verification (tipo + path)
      const cvPayload = {
        athlete_id: athleteId,
        id_document_type: docType?.value || null,
        id_document_type_other: docType?.value === 'other' ? (docTypeOther || null) : null,
        id_document_url: newIdDocPath || null,
        id_selfie_url: newSelfiePath || null,
      };
      const { error: cvErr } = await supabase.from(CV_TABLE).upsert(cvPayload, { onConflict: 'athlete_id' });
      if (cvErr) throw cvErr;

      setDirty(false);
      onSaved?.(updated || null);
      alert('Saved ✓');
    } catch (e) {
      alert(`Save failed. ${e?.message || String(e)}`);
    }
  };

  // ----- Helpers filename (mostra nome file selezionato o già salvato)
  const fileNameOrPathTail = (file, path) => {
    if (file?.name) return file.name;
    if (path) return String(path).split('/').pop();
    return 'No file selected';
  };

  return (
    <div style={styles.grid}>

      {/* City of Residence (EDITABILE) */}
      <div style={styles.field}>
        <label style={styles.label}>City of Residence</label>
        <input
          style={styles.input}
          type="text"
          name="residence_city"
          value={form.residence_city}
          onChange={(e) => setField('residence_city', e.target.value)}
          placeholder="e.g., Milan"
          aria-invalid={false}
        />
      </div>

      {/* Country of Residence (select come nel Wizard) */}
      <div style={styles.field}>
        <label style={styles.label}>Country of Residence</label>
        <Select
          inputId="residence_country"
          options={countries}
          isClearable
          placeholder="Select country..."
          onChange={onCountryChange}
          value={form.residence_country ? { label: form.residence_country, value: form.residence_country } : null}
          styles={{
            control: (base) => ({
              ...base,
              minHeight: 40,
              borderRadius: 8,
              borderColor: '#E0E0E0',
              boxShadow: 'none',
            }),
            valueContainer: (b) => ({ ...b, padding: '0 8px' }),
            dropdownIndicator: (b) => ({ ...b, paddingRight: 8 }),
          }}
        />
      </div>

      {/* Native language */}
      <div style={styles.field}>
        <label style={styles.label}>Native Language</label>
        <input
          style={styles.input}
          type="text"
          name="native_language"
          value={form.native_language}
          onChange={(e) => setField('native_language', e.target.value)}
          placeholder="e.g., Italian"
        />
      </div>

      {/* Additional language */}
      <div style={styles.field}>
        <label style={styles.label}>Additional Language</label>
        <input
          style={styles.input}
          type="text"
          name="additional_language"
          value={form.additional_language}
          onChange={(e) => setField('additional_language', e.target.value)}
          placeholder="e.g., English"
        />
      </div>

      {/* Phone (prefisso bloccato come Wizard) */}
      <div style={styles.fullRow}>
        <label style={styles.label}>Phone Number</label>
        <div style={{ width: '100%' }}>
          <PhoneInput
            countryCodeEditable={false}
            country={undefined}
            value={form.phone ? form.phone.replace(/^\+/, '') : ''}
            onChange={(value) => {
              const d = (value || '').replace(/\D/g, '');
              const e164 = d ? `+${d}` : '';
              setField('phone', e164);
            }}
            onBlur={() => setLeftPhoneField(true)}
            enableSearch={true}
            placeholder="Mobile phone number"
            inputStyle={{
              width: '100%',
              height: '48px',
              fontSize: '16px',
              borderRadius: '8px',
              paddingLeft: '48px',
              border: '1px solid #ccc',
              boxSizing: 'border-box',
            }}
            buttonStyle={{ border: 'none', background: 'none' }}
            containerStyle={{ width: '100%' }}
            dropdownStyle={{ borderRadius: '8px', zIndex: 1000 }}
          />
        </div>

        {!phoneVerified && (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <div style={styles.otpRow}>
              <button
                type="button"
                onClick={sendCode}
                disabled={!canSendCode}
                style={canSendCode ? styles.tinyBtn : { ...styles.tinyBtn, background: '#ccc', cursor: 'not-allowed' }}
                title={canSendCode ? 'Send code' : 'Enter a valid, changed number and leave the input first'}
              >
                Send code
              </button>

              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                style={{ ...styles.input, height: 40 }}
              />

              <button
                type="button"
                onClick={confirmCode}
                disabled={otpCode.length !== 6}
                style={
                  otpCode.length === 6
                    ? styles.tinyBtn
                    : { ...styles.tinyBtn, background: '#ccc', cursor: 'not-allowed' }
                }
              >
                Confirm
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={styles.otpMsg} aria-live="polite">
                {otpMsg}
              </div>
              {cooldown > 0 && <div style={styles.countdown}>Resend in {cooldown}s</div>}
              {expiresIn > 0 && <div style={styles.countdown}>Code expires in {expiresIn}s</div>}
            </div>
            <small style={styles.hint}>
              To enable “Send code”, change the number, leave the input, and ensure it’s a valid international format.
            </small>
          </div>
        )}
        {phoneVerified && <div style={{ marginTop: 6, fontSize: 12 }}>Phone verified ✔</div>}
      </div>

      {/* ID Document Type */}
      <div style={styles.field}>
        <label style={styles.label}>ID Document Type</label>
        <Select
          options={DOC_TYPES}
          isClearable
          placeholder="Select document type..."
          value={docType}
          onChange={(opt) => {
            setDocType(opt);
            setDirty(true);
          }}
          styles={{
            control: (base) => ({
              ...base,
              minHeight: 40,
              borderRadius: 8,
              borderColor: '#E0E0E0',
              boxShadow: 'none',
            }),
          }}
        />
        {docType?.value === 'other' && (
          <input
            style={styles.input}
            type="text"
            value={docTypeOther}
            onChange={(e) => {
              setDocTypeOther(e.target.value);
              setDirty(true);
            }}
            placeholder="Describe the document"
          />
        )}
      </div>

      {/* ID Document (file) */}
      <div style={styles.field}>
        <label style={styles.label}>ID Document (file)</label>
        <div style={styles.fileBox}>
          <label htmlFor="idDocInput" style={styles.secondaryBtn}>Choose file</label>
          <input id="idDocInput" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={onPickIdDoc} style={{ display: 'none' }} />
          <span style={styles.fileName}>{fileNameOrPathTail(idDocFile, idDocPath)}</span>
        </div>
      </div>

      {/* Doc Photo (face close-up) — rinomina da “selfie” */}
      <div style={styles.field}>
        <label style={styles.label}>Doc Photo (face close-up)</label>
        <div style={styles.fileBox}>
          <label htmlFor="selfieInput" style={styles.secondaryBtn}>Choose file</label>
          <input id="selfieInput" type="file" accept=".jpg,.jpeg,.png" onChange={onPickSelfie} style={{ display: 'none' }} />
          <span style={styles.fileName}>{fileNameOrPathTail(selfieFile, selfiePath)}</span>
        </div>
      </div>

      {/* Save bar */}
      <div style={styles.saveBar}>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty}
          style={dirty ? styles.primaryBtn : { ...styles.primaryBtn, background: '#ccc', cursor: 'not-allowed' }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

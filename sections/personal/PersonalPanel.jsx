// /sections/personal/PersonalPanel.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import Select from 'react-select';
import countries from '../../utils/countries';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * PersonalPanel
 * - Dati anagrafici (first/last name, DOB, gender, nationality, birth_city, native_language)
 * - Telefono con flusso OTP (send code / confirm) e stato Verified ✔
 * - Salvataggio anagrafica: NON tocca phone (che viene scritto solo a verifica OTP riuscita)
 *
 * Props:
 *  - athlete: record corrente da tabella 'athlete'
 *  - onSaved(updatedAthlete): callback con il record aggiornato dopo Save
 *  - isMobile: boolean per piccoli aggiustamenti responsive
 */
export default function PersonalPanel({ athlete, onSaved, isMobile }) {
  // ---------- STATE FORM ----------
  const [formData, setFormData] = useState({
    first_name: athlete?.first_name || '',
    last_name: athlete?.last_name || '',
    date_of_birth: athlete?.date_of_birth || '',
    gender: athlete?.gender || '',
    nationality: athlete?.nationality || '',
    birth_city: athlete?.birth_city || '',
    native_language: athlete?.native_language || 'English',
    phone: normalizeToE164Initial(athlete?.phone || ''),
  });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // ---------- PHONE OTP STATE (copiato/adattato dal Wizard Step 2) ----------
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');

  // cooldown & TTL (coerenti con Wizard: NEXT_PUBLIC_PHONE_RESEND_COOLDOWN / NEXT_PUBLIC_PHONE_OTP_TTL)
  const COOLDOWN_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_RESEND_COOLDOWN || 60);
  const OTP_TTL_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_OTP_TTL || 600);
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);

  // Timers
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const id = setInterval(() => setExpiresIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [expiresIn]);

  // On mount / when phone changes: controlla se il numero risulta già verified (contacts_verification o Supabase Auth)
  useEffect(() => {
    (async () => {
      if (!athlete?.id) return;

      // 1) Verifica applicativa (contacts_verification)
      const { data: cvRows } = await supabase
        .from('contacts_verification')
        .select('phone_number, phone_verified')
        .eq('athlete_id', athlete.id)
        .limit(1);

      const cv = Array.isArray(cvRows) && cvRows[0];
      const eqDigits = (a, b) => digits(a) === digits(b);

      const verifiedInApp =
        cv?.phone_verified === true &&
        cv?.phone_number &&
        formData.phone &&
        eqDigits(cv.phone_number, formData.phone);

      if (verifiedInApp) {
        setPhoneVerified(true);
        setOtpSent(false);
        setOtpMessage('Phone already verified ✔');
        return;
      }

      // 2) Verifica lato Auth (numero confermato nell'account)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const authPhone = authUser?.phone ? `+${String(authUser.phone).replace(/^\+?/, '')}` : '';

      const sameNumber = !!formData.phone && eqDigits(formData.phone, authPhone);
      const confirmed = !!authUser?.phone_confirmed_at;

      // identities[].identity_data.phone_verified true/'true'
      const phoneIdVerified =
        Array.isArray(authUser?.identities) &&
        authUser.identities.some(id =>
          id?.provider === 'phone' &&
          (id?.identity_data?.phone_verified === true || id?.identity_data?.phone_verified === 'true')
        );

      if (sameNumber && (confirmed || phoneIdVerified)) {
        setPhoneVerified(true);
        setOtpSent(false);
        setOtpMessage('Phone already verified ✔');

        // Allinea anche la tabella applicativa
        await supabase
          .from('contacts_verification')
          .upsert(
            { athlete_id: athlete.id, phone_number: formData.phone, phone_verified: true },
            { onConflict: 'athlete_id' }
          );
        return;
      }

      // Se qui: non verified
      setPhoneVerified(false);
      setOtpMessage('');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athlete?.id, formData.phone]);

  // ---------- DATEPICKER / LIMITI ETÀ (10–60 anni) ----------
  const dobRef = useRef(null);
  const today = new Date();
  const maxDateObj = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate()); // max: 10 anni fa
  const minDateObj = new Date(today.getFullYear() - 60, today.getMonth(), today.getDate()); // min: 60 anni fa
  const toISO = (d) => d.toISOString().slice(0, 10);

  // Se il valore arrivasse in dd/mm/yyyy, converti una volta a ISO
  useEffect(() => {
    if (formData.date_of_birth && formData.date_of_birth.includes('/')) {
      const [dd, mm, yyyy] = formData.date_of_birth.split('/');
      const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      setFormData((prev) => ({ ...prev, date_of_birth: iso }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validazione DOB
  const validDob = useMemo(() => {
    const d = parseDob(formData.date_of_birth);
    return !!d && ageBetween10and60(d);
  }, [formData.date_of_birth]);

  // ---------- VALIDAZIONE PHONE ----------
  const normalizedPhone = (formData.phone || '').replace(/\s+/g, '');
  const parsedPhone = parsePhoneNumberFromString(normalizedPhone);
  const nationalLen = parsedPhone?.nationalNumber ? String(parsedPhone.nationalNumber).length : 0;
  const isValidPhone = !!parsedPhone && parsedPhone.isValid() && nationalLen >= 10;

  // Se l'utente cambia il numero, torna a not verified
  const onPhoneChange = (value) => {
    const e164 = toE164(value);
    setFormData((prev) => ({ ...prev, phone: e164 }));
    setOtpSent(false);
    setOtpCode('');
    setOtpMessage('');
    // Non forzo subito phoneVerified=false: lo farà l'effetto di verifica iniziale
  };

  // ---------- OTP ACTIONS (adattate dal Wizard Step 2) ----------
  const sendCode = async () => {
    try {
      if (!isValidPhone) {
        setOtpMessage('Invalid phone number');
        return;
      }
      if (cooldown > 0) {
        setOtpMessage(`Please wait ${cooldown}s before requesting a new code.`);
        return;
      }

      // Check session (se scaduta, updateUser fallisce); se vuoi, implementa ensureSession() come nel Wizard
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setOtpMessage('Session expired. Please sign in again.');
        return;
      }

      // Richiesta OTP (phone_change)
      const { error } = await supabase.auth.updateUser({ phone: formData.phone });
      if (error) {
        setOtpMessage(`Failed to request OTP: ${error.message}`);
        return;
      }

      setOtpSent(true);
      setCooldown(COOLDOWN_SECONDS);
      setExpiresIn(OTP_TTL_SECONDS);
      setOtpMessage('OTP requested. Check your SMS.');
    } catch (e) {
      setOtpMessage(`Send error: ${e?.message || String(e)}`);
    }
  };

  const confirmCode = async () => {
    try {
      if (expiresIn <= 0) {
        setOtpMessage('The code has expired. Please request a new one.');
        return;
      }
      if (otpCode.length !== 6) return;

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

      // Persisti su athlete
      await supabase
        .from('athlete')
        .update({ phone: formData.phone })
        .eq('id', athlete.id);

      // Fissa stato affidabilità contatto nella tabella applicativa
      const { error: dbError } = await supabase
        .from('contacts_verification')
        .upsert(
          { athlete_id: athlete.id, phone_number: formData.phone, phone_verified: true },
          { onConflict: 'athlete_id' }
        );
      if (dbError) {
        setOtpMessage((prev) => `${prev} (DB warn: ${dbError.message})`);
      }
    } catch (e) {
      setOtpMessage(`Verification error: ${e?.message || String(e)}`);
    }
  };

  // ---------- SAVE (SOLO ANAGRAFICA, NON PHONE) ----------
  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMsg('');

      const isoDob = toIsoMaybe(formData.date_of_birth);

      // Aggiorna anagrafica
      const { data, error } = await supabase
        .from('athlete')
        .update({
          first_name: (formData.first_name || '').trim(),
          last_name: (formData.last_name || '').trim(),
          date_of_birth: isoDob || null,
          gender: formData.gender || null, // DB vincolo: 'M' | 'F'
          nationality: formData.nationality || null,
          birth_city: (formData.birth_city || '').trim(),
          native_language: (formData.native_language || '').trim() || 'English',
        })
        .eq('id', athlete.id)
        .select()
        .single();

      if (error) throw error;

      // Flag minori < 14y
      const dobDate = parseDob(isoDob);
      if (dobDate && !isAdult14(dobDate)) {
        const { error: ageError } = await supabase
          .from('athlete')
          .update({ needs_parental_authorization: true })
          .eq('id', athlete.id);
        if (ageError) throw ageError;
      }

      onSaved?.(data);
      setSaveMsg('Saved successfully.');
      setTimeout(() => setSaveMsg(''), 1800);
    } catch (e) {
      console.error(e);
      alert('Error saving personal data');
    } finally {
      setSaving(false);
    }
  };

  // ---------- UI HELPERS ----------
  const fmtSecs = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const headerRowStyle = { display: 'grid', gap: 12, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' };
  const oneCol = { display: 'grid', gap: 12, gridTemplateColumns: '1fr' };

  return (
    <div>
      {/* Campi anagrafici */}
      <div style={headerRowStyle}>
        <TextInput
          placeholder="First Name"
          value={formData.first_name}
          onChange={(v) => setFormData((p) => ({ ...p, first_name: v }))}
        />
        <TextInput
          placeholder="Last Name"
          value={formData.last_name}
          onChange={(v) => setFormData((p) => ({ ...p, last_name: v }))}
        />
      </div>

      <div style={{ ...headerRowStyle, marginTop: 12 }}>
        <DateInput
          inputRef={dobRef}
          value={formData.date_of_birth || ''}
          min={toISO(minDateObj)}
          max={toISO(maxDateObj)}
          onChange={(v) => setFormData((p) => ({ ...p, date_of_birth: v }))}
          openPicker={() => {
            if (dobRef.current?.showPicker) dobRef.current.showPicker();
            else dobRef.current?.focus();
          }}
          invalid={!validDob && !!formData.date_of_birth}
        />

        <SelectGender
          value={formData.gender}
          onChange={(v) => setFormData((p) => ({ ...p, gender: v }))}
        />
      </div>

      <div style={{ ...headerRowStyle, marginTop: 12 }}>
        <CountrySelect
          value={formData.nationality}
          onChange={(v) => setFormData((p) => ({ ...p, nationality: v }))}
        />
        <TextInput
          placeholder="City of Birth"
          value={formData.birth_city}
          onChange={(v) => setFormData((p) => ({ ...p, birth_city: v }))}
        />
      </div>

      <div style={{ ...oneCol, marginTop: 12 }}>
        <TextInput
          placeholder="Native Language"
          value={formData.native_language}
          onChange={(v) => setFormData((p) => ({ ...p, native_language: v }))}
        />
      </div>

      {/* PHONE + OTP (identico per logica al Wizard Step 2) */}
      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Mobile Phone</label>
        <PhoneInput
          countryCodeEditable={false}
          country={undefined}
          value={formData.phone ? formData.phone.replace(/^\+/, '') : ''}
          onChange={onPhoneChange}
          enableSearch
          placeholder="Mobile phone number"
          inputStyle={{
            width: '100%',
            height: '48px',
            fontSize: '16px',
            borderRadius: '8px',
            paddingLeft: '48px',
            border: '1px solid #ccc',
            boxSizing: 'border-box'
          }}
          buttonStyle={{ border: 'none', background: 'none' }}
          containerStyle={{ width: '100%' }}
          dropdownStyle={{ borderRadius: '8px', zIndex: 1000 }}
        />

        {!phoneVerified && (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={sendCode}
              disabled={!isValidPhone || cooldown > 0}
              style={{
                background: (!isValidPhone || cooldown > 0) ? '#ccc' : 'linear-gradient(90deg, #27E3DA, #F7B84E)',
                color: '#fff',
                border: 'none',
                padding: '0.6rem',
                borderRadius: 8,
                cursor: (!isValidPhone || cooldown > 0) ? 'not-allowed' : 'pointer',
                fontWeight: 700
              }}
            >
              {otpSent ? 'Resend code' : 'Send code'}
            </button>

            <div style={{ fontSize: 12, color: '#555', textAlign: 'left' }}>
              {cooldown > 0 ? (
                <span>Resend in {fmtSecs(cooldown)}</span>
              ) : (
                otpSent && <span>You can resend now</span>
              )}
              {expiresIn > 0 && (
                <span style={{ marginLeft: 8 }}>• Code expires in {fmtSecs(expiresIn)}</span>
              )}
            </div>

            {otpSent && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    borderRadius: 8,
                    border: '1px solid #ccc',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={confirmCode}
                  disabled={otpCode.length !== 6}
                  style={{
                    background: otpCode.length === 6 ? 'linear-gradient(90deg, #27E3DA, #F7B84E)' : '#ccc',
                    color: '#fff',
                    border: 'none',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 8,
                    cursor: otpCode.length === 6 ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                    whiteSpace: 'nowrap'
                  }}
                >
                  Confirm
                </button>
              </div>
            )}

            {otpMessage && (
              <div style={{ fontSize: 14, color: '#444' }}>{otpMessage}</div>
            )}
          </div>
        )}

        {phoneVerified && (
          <div style={{ textAlign: 'left', color: 'green', fontWeight: 700, marginTop: 6 }}>
            Phone verified ✔
          </div>
        )}
      </div>

      {/* SAVE */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saving ? '#ccc' : 'linear-gradient(90deg, #27E3DA, #F7B84E)',
            color: '#fff',
            border: 'none',
            padding: '0.8rem 1rem',
            borderRadius: 10,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 800,
            minHeight: 44
          }}
          title="Save personal data"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saveMsg && <span style={{ color: '#2ECC71', fontWeight: 700 }}>{saveMsg}</span>}
      </div>
    </div>
  );
}

/* ===================== UI Subcomponents ===================== */

function TextInput({ placeholder, value, onChange }) {
  return (
    <input
      style={inputStyle}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function DateInput({ inputRef, value, min, max, onChange, openPicker, invalid }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <style jsx global>{`
        input[type="date"]::-webkit-calendar-picker-indicator { display: none; }
        input[type="date"] { -webkit-appearance: none; appearance: none; }
      `}</style>
      <input
        ref={inputRef}
        type="date"
        style={{ ...inputStyle, ...(invalid ? { borderColor: '#cc0000' } : null) }}
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={openPicker}
        style={calendarBtnStyle}
        aria-label="Open calendar"
        title="Open calendar"
      >
        📅
      </button>
    </div>
  );
}

function SelectGender({ value, onChange }) {
  return (
    <select
      style={inputStyle}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Select Gender</option>
      <option value="M">Male</option>
      <option value="F">Female</option>
    </select>
  );
}

function CountrySelect({ value, onChange }) {
  return (
    <Select
      name="nationality"
      placeholder="Start typing nationality"
      options={countries}
      value={countries.find(opt => opt.value === value) || null}
      onChange={(selected) => onChange(selected?.value || '')}
      filterOption={(option, inputValue) =>
        inputValue.length >= 2 &&
        option.label.toLowerCase().includes(inputValue.toLowerCase())
      }
      styles={{
        control: (base) => ({
          ...base,
          padding: '2px',
          borderRadius: '8px',
          borderColor: '#ccc',
        }),
      }}
    />
  );
}

/* ===================== Styles ===================== */

const inputStyle = {
  width: '100%',
  padding: '0.8rem',
  borderRadius: 8,
  border: '1px solid #ccc',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  textAlign: 'left',
  fontWeight: 700,
  marginBottom: 6
};

const calendarBtnStyle = {
  background: '#27E3DA',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '0.5rem 0.75rem',
  cursor: 'pointer',
  fontWeight: 700,
  lineHeight: 1,
};

/* ===================== Helpers ===================== */

function digits(v) {
  return v ? String(v).replace(/\D/g, '') : '';
}
function toE164(value) {
  const d = digits(value || '');
  return d ? `+${d}` : '';
}
function normalizeToE164Initial(v) {
  if (!v) return '';
  // se arriva già con +, normalizza; altrimenti aggiungi +
  const d = digits(v);
  return d ? `+${d}` : '';
}
function toIsoMaybe(dob) {
  if (!dob) return null;
  if (dob.includes('-')) return dob;
  if (dob.includes('/')) {
    const [dd, mm, yyyy] = dob.split('/');
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }
  return dob;
}
function parseDob(str) {
  if (!str) return null;
  let yyyy, mm, dd;
  if (str.includes('-')) {
    [yyyy, mm, dd] = str.split('-').map((v) => parseInt(v, 10));
  } else {
    const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    dd = parseInt(m[1], 10);
    mm = parseInt(m[2], 10);
    yyyy = parseInt(m[3], 10);
  }
  const d = new Date(yyyy, (mm - 1), dd);
  if (d.getFullYear() !== yyyy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) return null;
  return d;
}
function ageBetween10and60(d) {
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age >= 10 && age <= 60;
}
function isAdult14(d) {
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const mm = t.getMonth() - d.getMonth();
  if (mm < 0 || (mm === 0 && t.getDate() < d.getDate())) age--;
  return age >= 14;
}

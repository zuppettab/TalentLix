// sections/contacts/ContactsPanel.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase as sb } from '../../utils/supabaseClient';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

const supabase = sb;
const CV_TABLE = 'contacts_verification';
const ATHLETE_TABLE = 'athlete';

// OTP policy
const COOLDOWN_SECONDS = 30;
const OTP_TTL_SECONDS  = 600; // 10 min
const MAX_ATTEMPTS     = 5;

export default function ContactsPanel({ athlete, onSaved, isMobile }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [dirty, setDirty] = useState(false);

  // row contacts_verification (se serve)
  const [cv, setCv] = useState(null);

  // ---- Form
  const [form, setForm] = useState({
    phone: '',
    phone_verified: false,
    id_document_type: '',
    id_document_type_other: '',
    id_document_url: '',
    id_selfie_url: '',
    residence_region: '',
    residence_postal_code: '',
    residence_address: '',
  });

  // read-only
const residence_city = cv?.residence_city || '';
const residence_country = cv?.residence_country || '';

  // riferimento al numero iniziale (serve per sapere se è cambiato)
  const initialPhoneRef = useRef('');

  // ---- OTP state
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [attempts, setAttempts] = useState(0);

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

  // Prefill (athlete + contacts_verification)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: cvRow } = await supabase
          .from(CV_TABLE)
          .select('*')
          .eq('athlete_id', athlete.id)
          .single();

        const phone = athlete?.phone || cvRow?.phone_number || '';
        initialPhoneRef.current = phone;

        const initial = {
          phone,
          phone_verified: !!cvRow?.phone_verified,
          id_document_type: cvRow?.id_document_type || '',
          id_document_type_other: cvRow?.id_document_type_other || '',
          id_document_url: cvRow?.id_document_url || '',
          id_selfie_url: cvRow?.id_selfie_url || '',
          residence_region: cvRow?.residence_region || cvRow?.state_region || '',
          residence_postal_code: cvRow?.residence_postal_code || cvRow?.postal_code || '',
          residence_address: cvRow?.residence_address || cvRow?.address || '',
        };

        if (mounted) {
          setCv(cvRow || null);
          setForm(initial);
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [athlete?.id]);

  // -------- PHONE VALIDATION (E.164)
  const normalizedPhone = (form.phone || '').replace(/\s+/g, '');
  const parsed = useMemo(() => parsePhoneNumberFromString(normalizedPhone), [normalizedPhone]);
  const nationalLen = parsed?.nationalNumber ? String(parsed.nationalNumber).length : 0;
  const isValidPhone = !!parsed && parsed.isValid() && nationalLen >= 10;

  // è cambiato rispetto al numero iniziale?
  const phoneChanged = (form.phone || '') !== (initialPhoneRef.current || '');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    setDirty(true);
    setStatus({ type: '', msg: '' });
  };

  const handlePhoneChange = (val) => {
    const v = val?.startsWith('+') ? val : `+${val}`;
    setForm((p) => ({ ...p, phone: v, phone_verified: false }));
    setDirty(true);
    setStatus({ type: '', msg: '' });
    setOtpSent(false);
    setOtp('');
  };

  // OTP helpers
  const ensureSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      setOtpMsg('Session expired. Please sign in again.');
      return false;
    }
    return true;
  };

  const sendCode = async () => {
    try {
      if (!phoneChanged) { setOtpMsg('Edit your phone number before requesting a code.'); return; }
      if (!isValidPhone) { setOtpMsg('Please enter a valid phone number.'); return; }
      if (cooldown > 0) { setOtpMsg(`Please wait ${cooldown}s before requesting a new code.`); return; }
      if (!(await ensureSession())) return;

      const { error } = await supabase.auth.updateUser({ phone: form.phone });
      if (error) { setOtpMsg(`Failed to request OTP: ${error.message}`); return; }

      setOtpSent(true);
      setCooldown(COOLDOWN_SECONDS);
      setExpiresIn(OTP_TTL_SECONDS);
      setOtpMsg('OTP requested. Check your SMS.');
    } catch (e) {
      console.error(e);
      setOtpMsg(`Send error: ${e?.message || String(e)}`);
    }
  };

  const confirmCode = async () => {
    try {
      if (!otpSent) { setOtpMsg('Request a code first.'); return; }
      if (!otp) { setOtpMsg('Please enter the code.'); return; }
      if (expiresIn <= 0) { setOtpMsg('The code has expired. Please request a new one.'); return; }
      if (attempts >= MAX_ATTEMPTS) { setOtpMsg('Too many attempts. Please request a new code.'); return; }
      if (!(await ensureSession())) return;

      const { error } = await supabase.auth.verifyOtp({
        phone: form.phone,
        token: otp,
        type: 'phone_change'
      });
      setAttempts((n) => n + 1);
      if (error) { setOtpMsg(`Verification error: ${error.message}`); return; }

      // Successo → scrivi telefono su athlete + contacts_verification
      await supabase.from(ATHLETE_TABLE).update({ phone: form.phone }).eq('id', athlete.id);
      await supabase.from(CV_TABLE).upsert(
        { athlete_id: athlete.id, phone_number: form.phone, phone_verified: true },
        { onConflict: 'athlete_id' }
      );

      // Aggiorna stato locale + reset "changed"
      initialPhoneRef.current = form.phone;
      setForm((p) => ({ ...p, phone_verified: true }));
      setOtpSent(false);
      setOtp('');
      setOtpMsg('Phone verified ✓');

      // opzionale: refresh athlete
      if (onSaved) {
        const { data: fresh } = await supabase.from(ATHLETE_TABLE).select('*').eq('id', athlete.id).single();
        onSaved(fresh || null);
      }
    } catch (e) {
      console.error(e);
      setOtpMsg(`Verification error: ${e?.message || String(e)}`);
    }
  };

  // ---- UPLOAD (bucket PRIVATO "documents")
  const makePath = (kind) => {
    const ts = Date.now();
    if (kind === 'id') return `documents/${athlete.id}/id/${form.id_document_type || 'doc'}-${ts}`;
    if (kind === 'selfie') return `documents/${athlete.id}/selfie/${ts}`;
    return `documents/${athlete.id}/${ts}`;
  };

  const uploadFile = async (file, kind) => {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
    const path = `${makePath(kind)}.${ext}`;
    const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const makeSignedUrl = async (path) => {
    if (!path) return '';
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60);
    if (error) return '';
    return data?.signedUrl || '';
  };

  const [docPreview, setDocPreview] = useState('');
  const [selfiePreview, setSelfiePreview] = useState('');
  useEffect(() => {
    (async () => setDocPreview(await makeSignedUrl(form.id_document_url)))();
  }, [form.id_document_url]);
  useEffect(() => {
    (async () => setSelfiePreview(await makeSignedUrl(form.id_selfie_url)))();
  }, [form.id_selfie_url]);

  // file inputs nascosti + bottoni “Choose file”
  const docInputRef = useRef(null);
  const selfieInputRef = useRef(null);
  const clickDocPicker = () => docInputRef.current?.click();
  const clickSelfiePicker = () => selfieInputRef.current?.click();

  const onPickDoc = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const key = await uploadFile(f, 'id');
      setForm((p) => ({ ...p, id_document_url: key }));
      setDirty(true);
      setStatus({ type: '', msg: '' });
    } catch (e2) {
      console.error(e2);
      setStatus({ type: 'error', msg: 'Document upload failed.' });
    }
  };

  const onPickSelfie = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const key = await uploadFile(f, 'selfie');
      setForm((p) => ({ ...p, id_selfie_url: key }));
      setDirty(true);
      setStatus({ type: '', msg: '' });
    } catch (e2) {
      console.error(e2);
      setStatus({ type: 'error', msg: 'Selfie upload failed.' });
    }
  };

  // ---- SAVE (senza timestamp)
  const needOtherText = form.id_document_type === 'other';
  const canSave =
    !!form.id_document_type &&
    (!needOtherText || !!form.id_document_type_other?.trim()) &&
    !!form.residence_region &&
    !!form.residence_postal_code &&
    !!form.residence_address;

  const handleSave = async () => {
    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      const payload = {
        athlete_id: athlete.id,
        id_document_type: form.id_document_type || null,
        id_document_type_other: needOtherText ? (form.id_document_type_other || null) : null,
        id_document_url: form.id_document_url || null,
        id_selfie_url: form.id_selfie_url || null,
        residence_region: form.residence_region || null,
        residence_postal_code: form.residence_postal_code || null,
        residence_address: form.residence_address || null,
      };

      const { error } = await supabase.from(CV_TABLE).upsert(payload, { onConflict: 'athlete_id' });
      if (error) throw error;

      setDirty(false);
      setStatus({ type: 'ok', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ---- UI
  if (loading) return <div style={{ padding: 8, color: '#666' }}>Loading…</div>;

  const saveBtnStyle = !canSave || saving
    ? { ...styles.saveBtn, background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed' }
    : { ...styles.saveBtn, background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', border: 'none', cursor: 'pointer' };

  // OTP controls: tutti piccoli, dimensione uniforme
  const otpBtnDisabled = !phoneChanged || !isValidPhone || cooldown > 0;
  const codeInputDisabled = !otpSent;
  const confirmDisabled = !otpSent || !otp;

  return (
    <div style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : null) }}>
      {/* PHONE + OTP */}
      <div style={styles.field}>
        <label style={styles.label}>Phone</label>
        <PhoneInput
          value={form.phone}
          onChange={handlePhoneChange}
          country={'it'}
          inputStyle={{ width: '100%', height: 40 }}
          containerStyle={{ width: '100%' }}
          disableDropdown={false}
          placeholder="Enter phone number"
        />
        {!isValidPhone && form.phone && <div style={styles.error}>Invalid phone number.</div>}

        <div style={styles.otpRow}>
          <button
            type="button"
            onClick={sendCode}
            disabled={otpBtnDisabled}
            style={{ ...styles.otpBtn, ...(otpBtnDisabled ? styles.otpBtnDisabled : {}) }}
          >
            {cooldown > 0 ? `Send code (${cooldown}s)` : 'Send code'}
          </button>

          <input
            placeholder="Code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={styles.otpInput}
            disabled={codeInputDisabled}
          />

          <button
            type="button"
            onClick={confirmCode}
            disabled={confirmDisabled}
            style={{ ...styles.otpBtn, ...(confirmDisabled ? styles.otpBtnDisabled : {}) }}
          >
            Confirm
          </button>

          {form.phone_verified
            ? <span style={{ color: '#2ECC71', fontWeight: 600, fontSize: 12 }}>Verified ✓</span>
            : <span style={{ color: '#b00', fontSize: 12 }}>Not verified</span>}
        </div>
        {otpMsg && <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>{otpMsg}</div>}
      </div>

      {/* READ-ONLY City/Country */}
      <div style={styles.field}>
        <label style={styles.label}>Country of residence (read-only)</label>
        <input style={{ ...styles.input, background: '#FAFAFA' }} value={residence_country || '—'} readOnly />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>City of residence (read-only)</label>
        <input style={{ ...styles.input, background: '#FAFAFA' }} value={residence_city || '—'} readOnly />
      </div>

      {/* RESIDENCE (edit) */}
      <div style={styles.field}>
        <label style={styles.label}>Region/State *</label>
        <input name="residence_region" value={form.residence_region} onChange={handleChange} style={styles.input} placeholder="e.g., Puglia" />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Postal code *</label>
        <input name="residence_postal_code" value={form.residence_postal_code} onChange={handleChange} style={styles.input} placeholder="e.g., 72100" />
      </div>
      <div style={styles.fieldWide}>
        <label style={styles.label}>Address *</label>
        <input name="residence_address" value={form.residence_address} onChange={handleChange} style={styles.input} placeholder="Street, number" />
      </div>

      {/* ID DOCUMENT */}
      <div style={styles.field}>
        <label style={styles.label}>ID document type *</label>
        <select
          name="id_document_type"
          value={form.id_document_type}
          onChange={handleChange}
          style={styles.input}
        >
          <option value="">Select…</option>
          <option value="passport">Passport</option>
          <option value="national_id">National ID</option>
          <option value="driver_license">Driver’s license</option>
          <option value="residence_permit">Residence permit</option>
          <option value="other">Other</option>
        </select>
      </div>

      {form.id_document_type === 'other' && (
        <div style={styles.field}>
          <label style={styles.label}>Specify document *</label>
          <input
            name="id_document_type_other"
            value={form.id_document_type_other}
            onChange={handleChange}
            style={styles.input}
            placeholder="Describe the document (e.g., student card)"
          />
        </div>
      )}

      <div style={styles.field}>
        <label style={styles.label}>ID document (image/PDF)</label>
        <input ref={docInputRef} type="file" accept="image/*,.pdf" onChange={onPickDoc} style={{ display: 'none' }} />
        <button type="button" onClick={clickDocPicker} style={styles.fileBtn}>Choose file</button>
        {form.id_document_url && (
          <div style={{ marginTop: 8 }}>
            <a href={docPreview} target="_blank" rel="noreferrer" style={styles.linkBtn}>Preview (60s)</a>
          </div>
        )}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Selfie (image)</label>
        <input ref={selfieInputRef} type="file" accept="image/*" onChange={onPickSelfie} style={{ display: 'none' }} />
        <button type="button" onClick={clickSelfiePicker} style={styles.fileBtn}>Choose file</button>
        {form.id_selfie_url && (
          <div style={{ marginTop: 8 }}>
            <a href={selfiePreview} target="_blank" rel="noreferrer" style={styles.linkBtn}>Preview (60s)</a>
          </div>
        )}
      </div>

      {/* SAVE BAR (in basso a destra) */}
      <div style={styles.saveBar}>
        <button type="button" onClick={handleSave} disabled={!canSave || saving} style={saveBtnStyle}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status.msg && (
          <span style={{ color: status.type === 'error' ? '#b00' : '#2E7D32', fontWeight: 600, marginLeft: 10 }}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16
  },
  gridMobile: { gridTemplateColumns: '1fr' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldWide: { gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 },

  label: { fontSize: 13, fontWeight: 600 },
  input: {
    height: 40,
    padding: '8px 10px',
    border: '1px solid #E0E0E0',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none'
  },
  error: { color: '#b00', fontSize: 12 },

   // OTP controls uniformi (40px come il PhoneInput)
  otpRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
  otpBtn: {
    height: 40,
    minWidth: 120,
    padding: '0 12px',
    boxSizing: 'border-box',
    fontSize: 14,
    lineHeight: '40px',
    borderRadius: 8,
    border: '1px solid #E0E0E0',
    background: '#FFF',
    cursor: 'pointer'
  },
  otpBtnDisabled: { background: '#F6F6F6', color: '#999', cursor: 'not-allowed' },
  otpInput: {
    height: 40,
    minWidth: 120,
    padding: '0 12px',
    boxSizing: 'border-box',
    fontSize: 14,
    border: '1px solid #E0E0E0',
    borderRadius: 8,
    outline: 'none'
  },

  // File button stile progetto (come small button)
  fileBtn: {
    padding: '8px 12px',
    height: 36,
    minWidth: 140,
    fontSize: 13,
    borderRadius: 8,
    border: '1px solid #E0E0E0',
    background: '#FFF',
    cursor: 'pointer'
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textDecoration: 'underline',
    color: '#333',
    fontSize: 12,
    fontWeight: 600
  },

  // Save bar in basso a destra
  saveBar: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    justifyContent: 'flex-end'
  },
  saveBtn: { fontSize: 14, padding: '10px 16px', borderRadius: 8 }
};

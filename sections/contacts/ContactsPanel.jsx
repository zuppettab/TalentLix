// sections/contacts/ContactsPanel.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import Router from 'next/router';
import Select from 'react-select';
import countries from '../../utils/countries';
import { supabase as sb } from '../../utils/supabaseClient'; // Supabase client centralizzato :contentReference[oaicite:2]{index=2}
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

const supabase = sb;

const CV_TABLE = 'contacts_verification';
const ATHLETE_TABLE = 'athlete';

// OTP policy
const COOLDOWN_SECONDS = 60;  // 1 minute
const OTP_TTL_SECONDS = 600;  // 10 minutes
const MAX_ATTEMPTS = 5;

// ID document types
const ID_TYPES = [
  { value: 'id_card',        label: 'ID Card' },
  { value: 'passport',       label: 'Passport' },
  { value: 'driver_license', label: 'Driver License' },
  { value: 'other',          label: 'Other (specify)' },
];

// --------- Helpers (sanitization & UI) ---------
const ALLOWED_ID_TYPES = new Set(['id_card', 'passport', 'driver_license', 'other']);

function normalizeIdType(v) {
  const s = (v ?? '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (ALLOWED_ID_TYPES.has(s)) return s;
  if (s === 'identity_card' || s === 'id') return 'id_card';
  if (s === 'driving_license' || s === 'driving_licence' || s === 'licence' || s === 'license') return 'driver_license';
  return '';
}
function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}
function onlyDigits(v) {
  return String(v || '').replace(/\D+/g, '');
}
function normalizePhone(v) {
  return onlyDigits(v); // react-phone-input-2 vuole cifre (senza +)
}
function getFileNameFromPath(path) {
  if (!path) return '';
  const p = String(path);
  const ix = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return ix >= 0 ? p.slice(ix + 1) : p;
}
function elideMiddle(str, max = 28) {
  const s = String(str || '');
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return s.slice(0, half) + '…' + s.slice(s.length - half);
}

export default function ContactsPanel({ athlete, onSaved, isMobile }) {
  // ----------------------- STATE BASE -----------------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' }); // "Saved ✓" / error
  const [dirty, setDirty] = useState(false); // route guard

  const initialRef = useRef(null);    // snapshot iniziale (per diff non-telefono)
  const initialPhoneRef = useRef(''); // snapshot telefono normalizzato
  const [cv, setCv] = useState(null); // riga contacts_verification

  // Valori SALVATI (base per la progress %)
  const [saved, setSaved] = useState(null);

  // ----------------------- FORM -----------------------
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
    residence_city: '',
    residence_country: '',
  });

  // ----------------------- OTP STATE -----------------------
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [attempts, setAttempts] = useState(0);

  // Upload helpers
  const [docFileName, setDocFileName] = useState('');
  const [selfieFileName, setSelfieFileName] = useState('');
  const [docPreview, setDocPreview] = useState('');
  const [selfiePreview, setSelfiePreview] = useState('');

  // ----------------------- EFFECTS -----------------------
  // countdowns
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

        // telefono: preferisci athlete.phone, fallback cvRow.phone_number
        const rawPhone = athlete?.phone || cvRow?.phone_number || '';
        const normalizedPhone = normalizePhone(rawPhone);
        initialPhoneRef.current = normalizedPhone;

        const initial = {
          phone: normalizedPhone,
          phone_verified: !!cvRow?.phone_verified,
          id_document_type: normalizeIdType(cvRow?.id_document_type || ''),
          id_document_type_other: cvRow?.id_document_type_other || '',
          id_document_url: cvRow?.id_document_url || '',
          id_selfie_url: cvRow?.id_selfie_url || '',
          residence_region: cvRow?.residence_region || cvRow?.state_region || '',
          residence_postal_code: cvRow?.residence_postal_code || cvRow?.postal_code || '',
          residence_address: cvRow?.residence_address || cvRow?.address || '',
          residence_city: cvRow?.residence_city || athlete?.residence_city || '',
          residence_country: cvRow?.residence_country || athlete?.residence_country || '',
        };

        if (mounted) {
          setCv(cvRow || null);
          setForm(initial);
          initialRef.current = initial;
          setSaved(initial); // progress calcolata sui dati salvati
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [athlete?.id]);

  // Signed preview per file (link 60s)
  useEffect(() => {
    (async () => setDocPreview(await makeSignedUrl(form.id_document_url)))();
  }, [form.id_document_url]);
  useEffect(() => {
    (async () => setSelfiePreview(await makeSignedUrl(form.id_selfie_url)))();
  }, [form.id_selfie_url]);

  // Route guard su dirty
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const handleRouteChangeStart = () => {
      if (!dirty) return;
      const ok = window.confirm('You have unsaved changes. Leave without saving?');
      if (!ok) {
        Router.events.emit('routeChangeError');
        // eslint-disable-next-line no-throw-literal
        throw 'Route change aborted by user (unsaved changes)';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    Router.events.on('routeChangeStart', handleRouteChangeStart);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      Router.events.off('routeChangeStart', handleRouteChangeStart);
    };
  }, [dirty]);

  // ----------------------- DERIVED -----------------------
  // Review / lock
  const currentReviewStatus = useMemo(
    () => (cv?.review_status || 'draft'),
    [cv?.review_status]
  );
  const isLocked   = currentReviewStatus === 'submitted' || currentReviewStatus === 'approved';
  const isRejected = currentReviewStatus === 'rejected';

  // Phone validation
  const e164 = form.phone ? `+${onlyDigits(form.phone)}` : '';
  const isValidPhone = !!(e164 && parsePhoneNumberFromString(e164)?.isValid());
  const phoneChanged = useMemo(
    () => onlyDigits(form.phone) !== onlyDigits(initialPhoneRef.current || ''),
    [form.phone]
  );

  // Dirty non-telefono
  const NON_PHONE_FIELDS = [
    'id_document_type',
    'id_document_type_other',
    'id_document_url',
    'id_selfie_url',
    'residence_region',
    'residence_postal_code',
    'residence_address',
    'residence_city',
    'residence_country',
  ];
  const nonPhoneDirty = useMemo(() => {
    const initial = initialRef.current || {};
    return NON_PHONE_FIELDS.some(k => (form[k] ?? '') !== (initial[k] ?? ''));
  }, [form]);

  // Progress % (solo valori SALVATI)
  const progressInfo = useMemo(() => {
    const persisted = saved || {};
    const keys = [
      'phone',
      'id_document_type',
      'id_document_url',
      'id_selfie_url',
      'residence_region',
      'residence_postal_code',
      'residence_address',
      'residence_city',
      'residence_country',
    ];
    if (persisted.id_document_type === 'other') keys.push('id_document_type_other');

    const total = keys.length;
    const done = keys.reduce((acc, k) => acc + (hasValue(persisted[k]) ? 1 : 0), 0);
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, percent };
  }, [saved]);
  const progress = progressInfo.percent;

  // Gating bottoni
  const saveEnabled = nonPhoneDirty && !saving && !isLocked;

  // useEffect dedicato per garantire refresh immediato del gating "Submit for review"
  const [submitEnabled, setSubmitEnabled] = useState(false);
  useEffect(() => {
    const ok = progress === 100
      && (currentReviewStatus === 'draft' || currentReviewStatus === 'rejected')
      && !nonPhoneDirty
      && !saving;
    setSubmitEnabled(ok);
  }, [progress, currentReviewStatus, nonPhoneDirty, saving]);

  // ----------------------- HANDLERS -----------------------
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (isLocked && name !== 'phone') return; // crystallized: block everything but phone
    setForm((p) => ({ ...p, [name]: value }));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  // Country Select
  const countryOption = useMemo(() => {
    if (!form.residence_country) return null;
    const lower = String(form.residence_country).toLowerCase();
    return countries.find(o => {
      const cand = (o?.value ?? o?.code ?? o?.label ?? o?.name ?? '').toString().toLowerCase();
      return cand === lower;
    }) || null;
  }, [form.residence_country]);

  const onChangeCountry = (opt) => {
    if (isLocked) return;
    const next = opt?.value ?? opt?.code ?? opt?.label ?? opt?.name ?? '';
    setForm((p) => ({ ...p, residence_country: String(next) }));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  // ----------------------- OTP -----------------------
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
      if (cooldown > 0)  { setOtpMsg(`Please wait ${cooldown}s before requesting a new code.`); return; }
      if (!(await ensureSession())) return;

      const { error } = await supabase.auth.updateUser({ phone: e164 });
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
      if (!otpSent)         { setOtpMsg('Request a code first.'); return; }
      if (!otp)             { setOtpMsg('Please enter the code.'); return; }
      if (expiresIn <= 0)   { setOtpMsg('The code has expired. Please request a new one.'); return; }
      if (attempts >= MAX_ATTEMPTS) { setOtpMsg('Too many attempts. Please request a new code.'); return; }
      if (!(await ensureSession())) return;

      const { error } = await supabase.auth.verifyOtp({
        phone: e164,
        token: otp,
        type: 'phone_change',
      });
      setAttempts((n) => n + 1);
      if (error) { setOtpMsg(`Verification error: ${error.message}`); return; }

      // Persist: athlete + CV (phone verified) — flusso indipendente dal Save
      await supabase.from(ATHLETE_TABLE).update({ phone: e164 }).eq('id', athlete.id);
      await supabase.from(CV_TABLE).upsert(
        { athlete_id: athlete.id, phone_number: e164, phone_verified: true },
        { onConflict: 'athlete_id' }
      );

      // Sync UI
      setForm((p) => ({ ...p, phone_verified: true }));
      setOtp('');
      setOtpSent(false);
      setOtpMsg('Phone verified ✓');
      setCooldown(0);
      setExpiresIn(0);
      setAttempts(0);

      // Aggiorna snapshot + SAVED (progress)
      initialPhoneRef.current = onlyDigits(e164);
      setDirty(false);
      initialRef.current = { ...(initialRef.current || {}), phone: onlyDigits(e164), phone_verified: true };
      setSaved((s) => ({ ...(s || {}), phone: onlyDigits(e164), phone_verified: true }));

      // callback parent (rileggi athlete)
      if (onSaved) {
        const { data: fresh } = await supabase.from(ATHLETE_TABLE).select('*').eq('id', athlete.id).single();
        onSaved(fresh || null);
      }
    } catch (e) {
      console.error(e);
      setOtpMsg(`Verification error: ${e?.message || String(e)}`);
    }
  };

  // ----------------------- UPLOAD -----------------------
  const docInputRef = useRef(null);
  const selfieInputRef = useRef(null);
  const clickDocPicker = () => docInputRef.current?.click();
  const clickSelfiePicker = () => selfieInputRef.current?.click();

  const makePath = (kind) => {
    const ts = Date.now();
    const t = normalizeIdType(form.id_document_type) || 'doc';
    if (kind === 'id')     return `${athlete.id}/id/${t}-${ts}`;
    if (kind === 'selfie') return `${athlete.id}/selfie/${ts}`;
    return `${athlete.id}/${ts}`;
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

  const onPickDoc = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const key = await uploadFile(f, 'id');
      setDocFileName(f.name);
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
      setSelfieFileName(f.name);
      setForm((p) => ({ ...p, id_selfie_url: key }));
      setDirty(true);
      setStatus({ type: '', msg: '' });
    } catch (e2) {
      console.error(e2);
      setStatus({ type: 'error', msg: 'Face photo upload failed.' });
    }
  };

  // ----------------------- SAVE -----------------------
  const handleSave = async () => {
    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      const initial = initialRef.current || {};
      const cvFields = [
        'id_document_type',
        'id_document_type_other',
        'id_document_url',
        'id_selfie_url',
        'residence_region',
        'residence_postal_code',
        'residence_address',
        'residence_city',
        'residence_country',
      ];

      // Sanitizzazione robusta di id_document_type
      const sanitizedType = normalizeIdType(form.id_document_type);

      const cvPayload = { athlete_id: athlete.id };
      let cvChanged = false;
      for (const k of cvFields) {
        // Applica la normalizzazione solo al tipo
        const curRaw = (k === 'id_document_type') ? sanitizedType : (form[k] ?? '');
        const old = initial[k] ?? '';
        const cur = curRaw;

        // Se non 'other', azzera il campo "other"
        if (k === 'id_document_type_other' && sanitizedType !== 'other') {
          if ((initial[k] ?? '') !== '') {
            cvPayload[k] = null;
            cvChanged = true;
          }
          continue;
        }

        if (cur !== old) {
          cvPayload[k] = hasValue(cur) ? cur : null;
          cvChanged = true;
        }
      }

      if (cvChanged) {
        const { error } = await supabase.from(CV_TABLE).upsert(cvPayload, { onConflict: 'athlete_id' });
        if (error) throw error;
      }

      // refresh UI + snapshot + SAVED (per progress)
      const nextInitial = { ...(initialRef.current || {}), ...cvPayload };
      initialRef.current = {
        ...nextInitial,
        id_document_type: sanitizedType,
        id_document_type_other: sanitizedType === 'other' ? form.id_document_type_other : '',
        id_document_url: form.id_document_url,
        id_selfie_url: form.id_selfie_url,
        residence_region: form.residence_region,
        residence_postal_code: form.residence_postal_code,
        residence_address: form.residence_address,
        residence_city: form.residence_city,
        residence_country: form.residence_country,
      };

      setSaved((prev) => ({
        ...(prev || {}),
        id_document_type: sanitizedType,
        id_document_type_other: sanitizedType === 'other' ? form.id_document_type_other : '',
        id_document_url: form.id_document_url,
        id_selfie_url: form.id_selfie_url,
        residence_region: form.residence_region,
        residence_postal_code: form.residence_postal_code,
        residence_address: form.residence_address,
        residence_city: form.residence_city,
        residence_country: form.residence_country,
      }));

      setDirty(false);
      setStatus({ type: 'success', msg: 'Saved ✓' }); // Save bar guideline (consistente) :contentReference[oaicite:3]{index=3}

      if (onSaved) {
        const { data: fresh } = await supabase.from(ATHLETE_TABLE).select('*').eq('id', athlete.id).single();
        onSaved(fresh || null);
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ----------------------- SUBMIT FOR REVIEW -----------------------
  const submitForReview = async () => {
    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });
      const payload = {
        athlete_id: athlete.id,
        review_status: 'submitted',
        submitted_at: new Date().toISOString(),
        rejected_reason: null,
      };
      const { error } = await supabase.from(CV_TABLE).upsert(payload, { onConflict: 'athlete_id' });
      if (error) throw error;

      // Lock immediato in UI
      setCv((prev) => ({ ...(prev || {}), ...payload }));
      setStatus({ type: 'ok', msg: 'Under review…' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Submit failed.' });
    } finally {
      setSaving(false);
    }
  };

  // ----------------------- UI -----------------------
  if (loading) return <div style={{ padding: 8, color: '#666' }}>Loading…</div>;

  const enabledBtnStyleSmall  = { ...styles.smallBtn, ...styles.smallBtnEnabled };
  const disabledBtnStyleSmall = { ...styles.smallBtn, ...styles.smallBtnDisabled };

  const saveBtnStyle =
    !saveEnabled
      ? { ...styles.saveBtn, ...styles.saveBtnDisabled }
      : { ...styles.saveBtn, ...styles.saveBtnEnabled };

  const otpBtnDisabled   = !phoneChanged || !isValidPhone || cooldown > 0;
  const codeInputDisabled = !otpSent;
  const confirmDisabled   = !otpSent || !otp;

  const saveBarStyle       = isMobile ? styles.saveBarMobile : styles.saveBar;
  const progressLeftStyle  = isMobile ? styles.progressLeftMobile : styles.progressLeft;
  const progressTrackStyle = isMobile ? styles.progressTrackMobile : styles.progressTrack;

  // Nome file (cliccabile; ellipsis se lungo)
  const docName   = elideMiddle(docFileName || getFileNameFromPath(form.id_document_url) || '', 28);
  const selfieName= elideMiddle(selfieFileName || getFileNameFromPath(form.id_selfie_url) || '', 28);

  return (
    <div style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : null) }}>
      {/* ---------------- PHONE + OTP (always editable) ---------------- */}
      <div style={styles.fieldWide}>
        <label style={styles.label}>Phone</label>

        {/* Adaptive row (wrap prevented on mobile by sizes) */}
        <div style={styles.phoneRow}>
          <div style={styles.phoneInputWrap}>
            <PhoneInput
              country={'it'}
              value={form.phone}
              onChange={(v) => handleChange({ target: { name: 'phone', value: normalizePhone(v) } })}
              inputStyle={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #E0E0E0' }}
              buttonStyle={{ border: '1px solid #E0E0E0', borderRadius: '8px 0 0 8px' }}
              containerStyle={{ width: '100%' }}
              specialLabel={''}
              disabled={false}
            />
          </div>

          <button
            type="button"
            onClick={sendCode}
            disabled={otpBtnDisabled}
            style={otpBtnDisabled ? disabledBtnStyleSmall : enabledBtnStyleSmall}
            title={cooldown > 0 ? `Wait ${cooldown}s` : ''}
          >
            Request code
          </button>

          <input
            type="text"
            maxLength={8}
            placeholder="Code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.trim())}
            disabled={codeInputDisabled}
            style={{ ...styles.smallInput, ...(codeInputDisabled ? styles.smallInputDisabled : null) }}
          />

          <button
            type="button"
            onClick={confirmCode}
            disabled={confirmDisabled}
            style={confirmDisabled ? disabledBtnStyleSmall : enabledBtnStyleSmall}
          >
            Confirm
          </button>
        </div>

        <div style={styles.otpMeta}>
          {cooldown > 0 && <span style={styles.metaItem}>Cooldown: {cooldown}s</span>}
          {otpSent && expiresIn > 0 && <span style={styles.metaItem}>Expires in: {expiresIn}s</span>}
          {form.phone_verified
            ? <span style={{ ...styles.metaItem, color: '#2E7D32', fontWeight: 600 }}>Verified ✓</span>
            : <span style={{ ...styles.metaItem, color: '#b00' }}>Not verified</span>}
        </div>
        {otpMsg && <div style={styles.otpMsg}>{otpMsg}</div>}
      </div>

      {/* ---------------- CRYSTALLIZED BLOCK (everything except Phone) ---------------- */}
      <div style={isLocked ? styles.lockedWrap : undefined}>
        {/* ID document type */}
        <div style={styles.field}>
          <label style={styles.label}>ID document type</label>
          <Select
            isDisabled={isLocked}
            options={ID_TYPES}
            // Valore normalizzato per evitare mismatch DB -> UI
            value={ID_TYPES.find(o => o.value === normalizeIdType(form.id_document_type)) || null}
            onChange={(opt) => handleChange({ target: { name: 'id_document_type', value: opt?.value || '' } })}
            styles={selectStyles}
            placeholder="Select ID document..."
          />
        </div>

        {/* Other type (conditional) */}
        {normalizeIdType(form.id_document_type) === 'other' && (
          <div style={styles.field}>
            <label style={styles.label}>Other type</label>
            <input
              name="id_document_type_other"
              value={form.id_document_type_other || ''}
              onChange={handleChange}
              disabled={isLocked}
              style={styles.input}
              placeholder="Specify document type"
            />
          </div>
        )}

        {/* Upload ID Doc */}
        <div style={styles.field}>
          <label style={styles.label}>Upload ID Doc</label>
          <div style={styles.fileRow}>
            <input type="file" accept="image/*,application/pdf" ref={docInputRef} onChange={onPickDoc} style={{ display: 'none' }} />
            <button type="button" onClick={clickDocPicker} disabled={isLocked} style={isLocked ? disabledBtnStyleSmall : enabledBtnStyleSmall}>
              Choose file
            </button>

            {form.id_document_url ? (
              <a
                href={docPreview || '#'}
                target="_blank"
                rel="noreferrer"
                title={docFileName || getFileNameFromPath(form.id_document_url)}
                style={styles.fileLink}
              >
                {docName || 'File selected'}
              </a>
            ) : (
              <span style={styles.fileName}>No file</span>
            )}
          </div>
        </div>

        {/* Upload Face Photo */}
        <div style={styles.field}>
          <label style={styles.label}>Upload a Face Photo</label>
          <div style={styles.fileRow}>
            <input type="file" accept="image/*" ref={selfieInputRef} onChange={onPickSelfie} style={{ display: 'none' }} />
            <button type="button" onClick={clickSelfiePicker} disabled={isLocked} style={isLocked ? disabledBtnStyleSmall : enabledBtnStyleSmall}>
              Choose file
            </button>

            {form.id_selfie_url ? (
              <a
                href={selfiePreview || '#'}
                target="_blank"
                rel="noreferrer"
                title={selfieFileName || getFileNameFromPath(form.id_selfie_url)}
                style={styles.fileLink}
              >
                {selfieName || 'File selected'}
              </a>
            ) : (
              <span style={styles.fileName}>No file</span>
            )}
          </div>
        </div>

        {/* Residence */}
        <div style={styles.field}>
          <label style={styles.label}>Region / State</label>
          <input
            name="residence_region"
            value={form.residence_region || ''}
            onChange={handleChange}
            disabled={isLocked}
            style={styles.input}
            placeholder="Region / State"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Postal code</label>
          <input
            name="residence_postal_code"
            value={form.residence_postal_code || ''}
            onChange={handleChange}
            disabled={isLocked}
            style={styles.input}
            placeholder="Postal code"
          />
        </div>

        <div style={styles.fieldWide}>
          <label style={styles.label}>Address</label>
          <input
            name="residence_address"
            value={form.residence_address || ''}
            onChange={handleChange}
            disabled={isLocked}
            style={styles.input}
            placeholder="Street, number"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>City</label>
          <input
            name="residence_city"
            value={form.residence_city || ''}
            onChange={handleChange}
            disabled={isLocked}
            style={styles.input}
            placeholder="City"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Country</label>
          <Select
            isDisabled={isLocked}
            options={countries}
            value={countryOption}
            onChange={onChangeCountry}
            styles={selectStyles}
            placeholder="Select country..."
          />
        </div>
      </div>

      {/* ---------------- SAVE BAR (progress + submit + save) ---------------- */}
      <div style={saveBarStyle}>
        {/* Progress (short on mobile; single line) */}
        <div style={progressLeftStyle}>
          <div style={progressTrackStyle}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <span style={styles.progressText}>{progress}% {progress === 100 ? '✓' : ''}</span>

          {currentReviewStatus === 'submitted' && <span style={styles.badgePending}>Under review…</span>}
          {currentReviewStatus === 'approved'  && <span style={styles.badgeApproved}>Verified ✓</span>}
          {isRejected && <span style={styles.badgeRejected}>Rejected</span>}
        </div>

        {/* Submit for review */}
        {(currentReviewStatus === 'draft' || currentReviewStatus === 'rejected') && (
          <button
            type="button"
            onClick={submitForReview}
            disabled={!submitEnabled}
            style={submitEnabled ? enabledBtnStyleSmall : disabledBtnStyleSmall}
          >
            Submit for review
          </button>
        )}

        {/* Save */}
        <button type="button" onClick={handleSave} disabled={!saveEnabled} style={saveBtnStyle}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        {status.msg && (
          <span
            role="status"
            aria-live="polite"
            style={{
              marginLeft: 10,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              color: status.type === 'error' ? '#b00' : '#2E7D32'
            }}
          >
            {status.msg}
          </span>
        )}
      </div>

      {/* Rejection reason */}
      {isRejected && cv?.rejected_reason && (
        <div style={styles.rejectedNote}>Rejection reason: {cv.rejected_reason}</div>
      )}
    </div>
  );
}

// ----------------------- STYLES -----------------------
const styles = {
  // Grid with more air on desktop
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 18
  },
  gridMobile: { gridTemplateColumns: '1fr' },

  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  fieldWide: { gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 },

  label: { fontSize: 13, fontWeight: 600 },
  input: {
    height: 40,
    padding: '8px 10px',
    border: '1px solid #E0E0E0',
    borderRadius: 8,
    fontSize: 14
  },

  // Phone row
  phoneRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  phoneInputWrap: { flex: '1 1 240px', minWidth: 220 },

  smallInput: {
    height: 38,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid #E0E0E0',
    minWidth: 100
  },
  smallInputDisabled: { background: '#F7F7F7', color: '#999' },

  smallBtn: {
    height: 38,
    padding: '0 12px',
    borderRadius: 8,
    fontWeight: 600,
    minWidth: 120
  },
  smallBtnEnabled: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer'
  },
  smallBtnDisabled: {
    background: '#EEE',
    color: '#999',
    border: '1px solid #E0E0E0',
    cursor: 'not-allowed'
  },

  otpMeta: { display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: '#666', flexWrap: 'wrap' },
  metaItem: { whiteSpace: 'nowrap' },
  otpMsg: { marginTop: 6, fontSize: 12, color: '#666' },

  // File row + clickable filename with ellipsis
  fileRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  fileName: { fontSize: 12, color: '#555' },
  fileLink: {
    display: 'inline-block',
    maxWidth: 220,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: 12,
    color: '#0A66C2',
    textDecoration: 'underline'
  },

  // Lock wrapper
  lockedWrap: { pointerEvents: 'none', opacity: 0.6 },

  // Progress & badges
  progressLeft:        { marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8, minWidth: 200, whiteSpace: 'nowrap' },
  progressLeftMobile:  { marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' },
  progressTrack:       { width: 160, height: 8, background: '#EEE', borderRadius: 999, overflow: 'hidden' },
  progressTrackMobile: { width: 110, height: 8, background: '#EEE', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)' },
  progressText: { fontSize: 12, fontWeight: 600, color: '#333', whiteSpace: 'nowrap' },
  badgePending:  { fontSize: 12, fontWeight: 600, color: '#8A6D3B' },
  badgeApproved: { fontSize: 12, fontWeight: 600, color: '#2E7D32' },
  badgeRejected: { fontSize: 12, fontWeight: 600, color: '#B00020' },
  rejectedNote:  { gridColumn: '1 / -1', marginTop: 8, padding: '8px 10px', border: '1px solid #F5C2C7', background: '#F8D7DA', borderRadius: 8, fontSize: 12, color: '#842029' },

  // Save bar (immutabile dalle linee guida)
  saveBar: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    justifyContent: 'flex-end',
    flexWrap: 'nowrap'
  },
  saveBarMobile: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    justifyContent: 'flex-end',
    flexWrap: 'nowrap' // una riga anche su mobile (barra corta)
  },
  saveBtn: { height: 38, padding: '0 16px', borderRadius: 8, fontWeight: 600, border: 'none' },
  saveBtnEnabled: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', cursor: 'pointer' },
  saveBtnDisabled: { background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed' },
};

// react-select inline styles coesi
const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 40,
    borderRadius: 8,
    borderColor: state.isFocused ? '#BDBDBD' : '#E0E0E0',
    boxShadow: 'none',
    ':hover': { borderColor: '#BDBDBD' }
  }),
  valueContainer: (base) => ({ ...base, padding: '0 8px' }),
  indicatorsContainer: (base) => ({ ...base, paddingRight: 6 }),
  menu: (base) => ({ ...base, zIndex: 10 })
};

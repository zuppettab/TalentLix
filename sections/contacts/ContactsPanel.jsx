// sections/contacts/ContactsPanel.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import Router from 'next/router';
import Select from 'react-select';
import countries from '../../utils/countries';
import { supabase as sb } from '../../utils/supabaseClient'; // Supabase client centralizzato
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
  { value: 'national_id',     label: 'National ID' },
  { value: 'passport',        label: 'Passport' },
  { value: 'driver_license',  label: 'Driver License' },
  { value: 'residence_permit', label: 'Residence Permit' },
  { value: 'other',           label: 'Other (specify)' },
];

// --------- Helpers (sanitization & UI) ---------
const ALLOWED_ID_TYPES = new Set([
  'national_id',
  'passport',
  'driver_license',
  'residence_permit',
  'other',
]);
function normalizeIdType(v) {
  const s = (v ?? '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (ALLOWED_ID_TYPES.has(s)) return s;
  if (
    s === 'id_card' ||
    s === 'identity_card' ||
    s === 'id' ||
    s === 'idcard' ||
    s === 'identitycard' ||
    s === 'nationalid'
  ) return 'national_id';
  if (
    s === 'driving_license' ||
    s === 'driving_licence' ||
    s === 'licence' ||
    s === 'license'
  ) return 'driver_license';
  if (s === 'residencepermit') return 'residence_permit';
  return '';
}
function hasValue(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
function onlyDigits(v) { return String(v || '').replace(/\D+/g, ''); }
function normalizePhone(v) { return onlyDigits(v); } // react-phone-input-2 wants digits (no +)
function getFileNameFromPath(path) {
  if (!path) return '';
  const p = String(path); const ix = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return ix >= 0 ? p.slice(ix + 1) : p;
}
function elideMiddle(str, max = 28) {
  const s = String(str || ''); if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2); return s.slice(0, half) + '…' + s.slice(s.length - half);
}

export default function ContactsPanel({ athlete, onSaved, isMobile }) {
  // ----------------------- STATE BASE -----------------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' }); // "Saved ✓" / error
  const [dirty, setDirty] = useState(false); // route guard

  const initialRef = useRef(null);    // snapshot iniziale (per diff non-telefono)
  const initialPhoneRef = useRef(''); // snapshot telefono
  const [cv, setCv] = useState(null); // riga contacts_verification

  // Valori SALVATI (base per la progress %)
  const [saved, setSaved] = useState(null);

  // **NEW**: versione dello snapshot per forzare il ricalcolo dei dirty dopo save/OTP
  const [snapshotV, setSnapshotV] = useState(0);

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

        if (cvRow) cvRow.review_status = cvRow.review_status?.trim().toLowerCase();

        // phone: prefer athlete.phone, fallback cvRow.phone_number
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
          setSnapshotV((v) => v + 1); // forza prima valutazione dirty
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
  useEffect(() => { (async () => setDocPreview(await makeSignedUrl(form.id_document_url)))(); }, [form.id_document_url]);
  useEffect(() => { (async () => setSelfiePreview(await makeSignedUrl(form.id_selfie_url)))(); }, [form.id_selfie_url]);

  // Route guard su dirty
  useEffect(() => {
    const handleBeforeUnload = (e) => { if (!dirty) return; e.preventDefault(); e.returnValue = ''; };
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
  const currentReviewStatus = useMemo(() => (cv?.review_status || 'draft'), [cv?.review_status]);
  const isLocked   = currentReviewStatus === 'submitted' || currentReviewStatus === 'approved';
  const isRejected = currentReviewStatus === 'rejected';

  // Phone validation
  const e164 = form.phone ? `+${onlyDigits(form.phone)}` : '';
  const isValidPhone = !!(e164 && parsePhoneNumberFromString(e164)?.isValid());
  const phoneChanged = useMemo(
    () => onlyDigits(form.phone) !== onlyDigits(initialPhoneRef.current || ''),
    [form.phone]
  );

  // Dirty non-telefono (rispetto a snapshot iniziale) — **dipende** da snapshotV
  const NON_PHONE_FIELDS = [
    'id_document_type', 'id_document_type_other', 'id_document_url', 'id_selfie_url',
    'residence_region', 'residence_postal_code', 'residence_address', 'residence_city', 'residence_country',
  ];
  const nonPhoneDirty = useMemo(() => {
    const initial = initialRef.current || {};
    return NON_PHONE_FIELDS.some(k => (form[k] ?? '') !== (initial[k] ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, snapshotV]);

  // Progress % (solo valori SALVATI)
  const progressInfo = useMemo(() => {
    const persisted = saved || {};
    const keys = [
      'phone', 'id_document_type', 'id_document_url', 'id_selfie_url',
      'residence_region', 'residence_postal_code', 'residence_address', 'residence_city', 'residence_country',
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

  // Stato di abilitazione **Submit for review** (refresha appena cambia progress/snapshot)
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
    if (error || !session) { setOtpMsg('Session expired. Please sign in again.'); return false; }
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

      setOtpSent(true); setCooldown(COOLDOWN_SECONDS); setExpiresIn(OTP_TTL_SECONDS);
      setOtpMsg('OTP requested. Check your SMS.');
    } catch (e) {
      console.error(e); setOtpMsg(`Send error: ${e?.message || String(e)}`);
    }
  };

  const confirmCode = async () => {
    try {
      if (!otpSent) { setOtpMsg('Request a code first.'); return; }
      if (!otp) { setOtpMsg('Please enter the code.'); return; }
      if (expiresIn <= 0) { setOtpMsg('The code has expired. Please request a new one.'); return; }
      if (attempts >= MAX_ATTEMPTS) { setOtpMsg('Too many attempts. Please request a new code.'); return; }
      if (!(await ensureSession())) return;

      const { error } = await supabase.auth.verifyOtp({ phone: e164, token: otp, type: 'phone_change' });
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
      setOtp(''); setOtpSent(false); setOtpMsg('Phone verified ✓');
      setCooldown(0); setExpiresIn(0); setAttempts(0);

      // Aggiorna snapshot + SAVED (per progress) e forza rivalutazione dirty
      initialPhoneRef.current = onlyDigits(e164);
      setDirty(false);
      initialRef.current = { ...(initialRef.current || {}), phone: onlyDigits(e164), phone_verified: true };
      setSaved((s) => ({ ...(s || {}), phone: onlyDigits(e164), phone_verified: true }));
      setSnapshotV((v) => v + 1);

      // callback parent
      if (onSaved) {
        const { data: fresh } = await supabase.from(ATHLETE_TABLE).select('*').eq('id', athlete.id).single();
        onSaved(fresh || null);
      }
    } catch (e) {
      console.error(e); setOtpMsg(`Verification error: ${e?.message || String(e)}`);
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
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const key = await uploadFile(f, 'id');
      setDocFileName(f.name);
      setForm((p) => ({ ...p, id_document_url: key }));
      setDirty(true); if (status.type) setStatus({ type: '', msg: '' });
    } catch (e2) {
      console.error(e2); setStatus({ type: 'error', msg: 'Document upload failed.' });
    }
  };

  const onPickSelfie = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const key = await uploadFile(f, 'selfie');
      setSelfieFileName(f.name);
      setForm((p) => ({ ...p, id_selfie_url: key }));
      setDirty(true); if (status.type) setStatus({ type: '', msg: '' });
    } catch (e2) {
      console.error(e2); setStatus({ type: 'error', msg: 'Face photo upload failed.' });
    }
  };

  // ----------------------- SAVE -----------------------
  const handleSave = async () => {
    try {
      setSaving(true); setStatus({ type: '', msg: '' });

      const initial = initialRef.current || {};
      const sanitizedType = normalizeIdType(form.id_document_type);

      // payload coerente (include sempre i due campi "type"/"type_other")
      const basePayload = {
        athlete_id: athlete.id,
        id_document_type: hasValue(sanitizedType) ? sanitizedType : null,
        id_document_type_other: sanitizedType === 'other' ? (form.id_document_type_other || null) : null,
        id_document_url: hasValue(form.id_document_url) ? form.id_document_url : null,
        id_selfie_url: hasValue(form.id_selfie_url) ? form.id_selfie_url : null,
        residence_region: hasValue(form.residence_region) ? form.residence_region : null,
        residence_postal_code: hasValue(form.residence_postal_code) ? form.residence_postal_code : null,
        residence_address: hasValue(form.residence_address) ? form.residence_address : null,
        residence_city: hasValue(form.residence_city) ? form.residence_city : null,
        residence_country: hasValue(form.residence_country) ? form.residence_country : null,
      };

      // Determina se ci sono reali differenze rispetto a initial
      const cvFields = Object.keys(basePayload).filter(k => k !== 'athlete_id');
      let cvChanged = false;
      for (const k of cvFields) {
        const cur = basePayload[k];
        const old = hasValue(initial[k]) ? initial[k] : null;
        if (cur !== old) { cvChanged = true; break; }
      }

      if (cvChanged) {
        const { error } = await supabase.from(CV_TABLE).upsert(basePayload, { onConflict: 'athlete_id' });
        if (error) throw error;
      }

      // refresh UI + snapshot + SAVED (per progress) e forza rivalutazione dirty
      initialRef.current = {
        ...initialRef.current,
        ...basePayload,
      };
      setSaved((prev) => ({ ...(prev || {}), ...basePayload }));
      setSnapshotV((v) => v + 1);

      setDirty(false);
      setStatus({ type: 'success', msg: 'Saved ✓' });

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
      setSaving(true); setStatus({ type: '', msg: '' });
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

  // filename (cliccabile con ellipsis)
  const docName    = elideMiddle(docFileName || getFileNameFromPath(form.id_document_url) || '', 28);
  const selfieName = elideMiddle(selfieFileName || getFileNameFromPath(form.id_selfie_url) || '', 28);

  // layout responsive
  const saveBarStyle       = isMobile ? styles.saveBarMobile : styles.saveBar;
  const progressLeftStyle  = isMobile ? styles.progressLeftMobile : styles.progressLeft;
  const progressTrackStyle = isMobile ? styles.progressTrackMobile : styles.progressTrack;
  const buttonsWrapStyle   = isMobile ? styles.buttonsWrapMobile : styles.buttonsWrap;

  return (
    <div style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : null) }}>
      {/* ---------------- PHONE + OTP (always editable) ---------------- */}
      <div style={styles.fieldWide}>
        <label style={styles.label}>Phone</label>

        {/* Adaptive row */}
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
                {elideMiddle(docName, 36)}
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
                {elideMiddle(selfieName, 36)}
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

      {/* ---------------- SAVE AREA (progress + buttons) ---------------- */}
      <div style={saveBarStyle}>
        {/* Row 1 (mobile): progress full width. Desktop: compatto a sinistra */}
        <div style={progressLeftStyle}>
          <div style={progressTrackStyle}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <span style={styles.progressText}>{progress}% {progress === 100 ? '✓' : ''}</span>

          {currentReviewStatus === 'submitted' && <span style={styles.badgePending}>Under review…</span>}
          {currentReviewStatus === 'approved'  && <span style={styles.badgeApproved}>Verified ✓</span>}
          {isRejected && <span style={styles.badgeRejected}>Rejected</span>}
        </div>

        {/* Row 2 (mobile): buttons on the right */}
        <div style={buttonsWrapStyle}>
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
  // **Desktop**: più aria (gap aumentati)
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24
  },
  gridMobile: { gridTemplateColumns: '1fr' },

  // campi più distanziati
  field: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 },
  fieldWide: { gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 },

  label: { fontSize: 13, fontWeight: 600 },
  input: {
    height: 42,
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14
  },

  // Phone row
  phoneRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  phoneInputWrap: { flex: '1 1 260px', minWidth: 240 },

  smallInput: {
    height: 38,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid #E0E0E0',
    minWidth: 110
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
    maxWidth: 280,
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
  // Desktop: progress compatto a sinistra. Mobile: progress full-width su riga dedicata.
  progressLeft:        { marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 10, minWidth: 220, whiteSpace: 'nowrap' },
  progressLeftMobile:  { flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', marginBottom: 6 },
  progressTrack:       { width: 200, height: 8, background: '#EEE', borderRadius: 999, overflow: 'hidden' },
  progressTrackMobile: { width: '100%', height: 8, background: '#EEE', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)' },
  progressText: { fontSize: 12, fontWeight: 600, color: '#333', whiteSpace: 'nowrap' },
  badgePending:  { fontSize: 12, fontWeight: 600, color: '#8A6D3B' },
  badgeApproved: { fontSize: 12, fontWeight: 600, color: '#2E7D32' },
  badgeRejected: { fontSize: 12, fontWeight: 600, color: '#B00020' },
  rejectedNote:  { gridColumn: '1 / -1', marginTop: 8, padding: '8px 10px', border: '1px solid #F5C2C7', background: '#F8D7DA', borderRadius: 8, fontSize: 12, color: '#842029' },

  // Save area
  // Desktop: tutto su una riga, progress a sinistra e bottoni a destra.
  // Mobile: progress su riga 1 (full width), bottoni su riga 2 a destra.
  saveBar: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    justifyContent: 'flex-end',
    flexWrap: 'nowrap'
  },
  saveBarMobile: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'stretch',
    gap: 10,
    paddingTop: 12,
    justifyContent: 'flex-start',
    flexWrap: 'wrap'
  },
  buttonsWrap: { display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  buttonsWrapMobile: { display: 'flex', alignItems: 'center', gap: 8 },

  saveBtn: { height: 38, padding: '0 16px', borderRadius: 8, fontWeight: 600, border: 'none' },
  saveBtnEnabled: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', cursor: 'pointer' },
  saveBtnDisabled: { background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed' },
};

// react-select inline styles coesi
const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderRadius: 10,
    borderColor: state.isFocused ? '#BDBDBD' : '#E0E0E0',
    boxShadow: 'none',
    ':hover': { borderColor: '#BDBDBD' }
  }),
  valueContainer: (base) => ({ ...base, padding: '0 10px' }),
  indicatorsContainer: (base) => ({ ...base, paddingRight: 8 }),
  menu: (base) => ({ ...base, zIndex: 10 })
};

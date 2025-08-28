// @ts-check
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase as sb } from '../../utils/supabaseClient';
import Select from 'react-select';
import countries from '../../utils/countries';
const supabase = sb;

const ATHLETE_TABLE = 'athlete';

// Required fields + messages (EN)
const REQUIRED = [
  'first_name',
  'last_name',
  'date_of_birth',
  'gender',
  'nationality',
  'birth_city',
  'native_language',
  'profile_picture_url'
];

const MSG = {
  first_name: 'First name is required',
  last_name: 'Last name is required',
  date_of_birth_required: 'Date of birth is required',
  date_of_birth_range: 'Date of birth invalid or out of range (10–60y)',
  gender: 'Gender is required',
  nationality: 'Country of birth is required',
  birth_city: 'City of birth is required',
  native_language: 'Native language is required',
  profile_picture_url: 'Profile picture is required',
};

export default function PersonalPanel({ athlete, onSaved }) {
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    birth_city: '',
    native_language: '',
    additional_language: '',
    profile_picture_url: ''
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [afterSavePrompt, setAfterSavePrompt] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const dobRef = useRef(null);
  const today = new Date();
  const maxDateObj = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());
  const minDateObj = new Date(today.getFullYear() - 60, today.getMonth(), today.getDate());
  const toISO = (d) => d.toISOString().slice(0, 10);

  // Prefill dal record athlete
  useEffect(() => {
    if (!athlete) return;
    const isoDOB = athlete.date_of_birth
      ? new Date(athlete.date_of_birth).toISOString().slice(0, 10)
      : '';
    setForm({
      first_name: athlete.first_name || '',
      last_name: athlete.last_name || '',
      date_of_birth: isoDOB,
      gender: athlete.gender || '',
      nationality: athlete.nationality || '',
      birth_city: athlete.birth_city || '',
      native_language: athlete.native_language || '',
      additional_language: athlete.additional_language || '',
      profile_picture_url: athlete.profile_picture_url || ''
    });
    setDirty(false);
    setErrors({});
    setStatus({ type: '', msg: '' });
    setAfterSavePrompt(false);
  }, [athlete]);

  // Detect mobile (<=480px)
  useEffect(() => {
    const check = () =>
      setIsMobile(typeof window !== 'undefined' && window.matchMedia('(max-width: 480px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Prompt (EN) se lasci con modifiche non salvate
  useEffect(() => {
    const beforeUnload = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);

    const onRouteChangeStart = () => {
      if (!dirty) return;
      const ok = window.confirm('You have unsaved changes. Leave without saving?');
      if (!ok) {
        router.events.emit('routeChangeError');
        // eslint-disable-next-line no-throw-literal
        throw 'Route change aborted due to unsaved changes';
      }
    };
    router.events.on('routeChangeStart', onRouteChangeStart);

    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      router.events.off('routeChangeStart', onRouteChangeStart);
    };
  }, [dirty, router.events]);

  // Helpers
  const getAge = (yyyy_mm_dd) => {
    if (!yyyy_mm_dd) return null;
    const [y, m, d] = yyyy_mm_dd.split('-').map((n) => parseInt(n, 10));
    const birth = new Date(y, (m || 1) - 1, d || 1);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const mo = now.getMonth() - birth.getMonth();
    if (mo < 0 || (mo === 0 && now.getDate() < birth.getDate())) age--;
    return age;
  };

  const validateField = (name, value) => {
    if (name === 'date_of_birth') {
      if (!value) return MSG.date_of_birth_required;
      const age = getAge(value);
      if (age == null || age < 10 || age > 60) return MSG.date_of_birth_range;
      return '';
    }
    if (REQUIRED.includes(name)) {
      const v = (value ?? '').toString().trim();
      if (!v) return MSG[name] || 'This field is required';
    }
    return '';
  };

  const validateAll = (state = form) => {
    const out = {};
    for (const key of REQUIRED) {
      const err = validateField(key, state[key]);
      if (err) out[key] = err;
    }
    return out;
  };

  // Live validation onChange + onBlur
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
    setDirty(true);
    setStatus({ type: '', msg: '' });
    setAfterSavePrompt(false);
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setErrors((prev) => ({ ...prev, [name]: validateField(name, form[name]) }));
  };

  // Stato del pulsante Save (robusto anche su iOS)
  const allRequiredFilled = useMemo(() => {
    for (const k of REQUIRED) {
      const err = validateField(k, form[k]);
      if (err) return false;
    }
    return true;
  }, [form]);

  const hasErrors = useMemo(() => Object.values(errors).some(Boolean), [errors]);
  const isSaveDisabled = saving || !dirty || hasErrors || !allRequiredFilled;

  const onSave = async () => {
    if (isSaveDisabled) return; // guard extra (mobile/iOS)

    // validazione finale inline
    const newErrors = validateAll();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      const age = getAge(form.date_of_birth);
      const parental = age != null && age < 14 ? true : null;

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        nationality: form.nationality || null,
        birth_city: form.birth_city || null,
        native_language: form.native_language || null,
        additional_language: form.additional_language || null,
        profile_picture_url: form.profile_picture_url || null,
        ...(parental !== null ? { needs_parental_authorization: parental } : {})
      };

      const { data, error } = await supabase
        .from(ATHLETE_TABLE)
        .update(payload)
        .eq('id', athlete.id)
        .select()
        .single();

      if (error) throw error;
      onSaved?.(data);
      setDirty(false);
      setStatus({ type: 'success', msg: '' });
      setAfterSavePrompt(true);

      // auto-hide del banner dopo 5s
      setTimeout(() => setAfterSavePrompt(false), 5000);
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed. Please try again.' });
      setAfterSavePrompt(false);
    } finally {
      setSaving(false);
    }
  };

  // Stile dinamico del bottone Save (contrasto forte)
  const saveBtnStyle = isSaveDisabled
    ? {
        ...styles.saveBtn,
        background: '#EEE',
        color: '#999',
        border: '1px solid #E0E0E0',
        opacity: 1,
        cursor: 'not-allowed',
        pointerEvents: 'none'
      }
    : {
        ...styles.saveBtn,
        background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
        color: '#fff',
        border: 'none',
        cursor: 'pointer'
      };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} style={styles.formGrid}>
      <Field label="First name *" name="first_name" value={form.first_name} onChange={handleChange} onBlur={handleBlur} error={errors.first_name} />
      <Field label="Last name *" name="last_name" value={form.last_name} onChange={handleChange} onBlur={handleBlur} error={errors.last_name} />
      <div style={styles.field}>
        <label style={styles.label}>Country of birth *</label>
        <Select
          name="nationality"
          placeholder="Start typing country"
          options={countries}
          value={countries.find(opt => opt.value === form.nationality) || null}
          onChange={(selected) => {
            const value = selected?.value || '';
            setForm(prev => ({ ...prev, nationality: value }));
            setErrors(prev => ({ ...prev, nationality: validateField('nationality', value) }));
            setDirty(true);
            setStatus({ type: '', msg: '' });
            setAfterSavePrompt(false);
          }}
          filterOption={(option, inputValue) =>
            inputValue.length >= 2 &&
            option.label.toLowerCase().includes(inputValue.toLowerCase())
          }
          styles={{
            control: (base) => ({
              ...base,
              padding: '2px',
              borderRadius: '8px',
              borderColor: errors.nationality ? '#b00' : '#ccc',
            }),
          }}
        />
        {errors.nationality && <div style={styles.error}>{errors.nationality}</div>}
      </div>
      <Field label="City of birth *" name="birth_city" value={form.birth_city} onChange={handleChange} onBlur={handleBlur} error={errors.birth_city} />
      <Field label="Native language *" name="native_language" value={form.native_language} onChange={handleChange} onBlur={handleBlur} error={errors.native_language} />
      <Field label="Additional language (optional)" name="additional_language" value={form.additional_language} onChange={handleChange} onBlur={handleBlur} error={errors.additional_language} />

      {/* DOB */}
      <div style={styles.field}>
        <label style={styles.label}>Date of birth *</label>
        <input
          ref={dobRef}
          type="date"
          name="date_of_birth"
          value={form.date_of_birth}
          onChange={handleChange}
          onBlur={handleBlur}
          min={toISO(minDateObj)}
          max={toISO(maxDateObj)}
          style={{ ...styles.input, borderColor: errors.date_of_birth ? '#b00' : '#E0E0E0' }}
          aria-invalid={!!errors.date_of_birth}
        />
        {errors.date_of_birth && <div style={styles.error}>{errors.date_of_birth}</div>}
      </div>

      {/* Gender */}
      <div style={styles.field}>
        <label style={styles.label}>Gender *</label>
        <select
          name="gender"
          value={form.gender}
          onChange={handleChange}
          onBlur={handleBlur}
          style={{ ...styles.select, height: '40px', borderColor: errors.gender ? '#b00' : '#E0E0E0' }}
          aria-invalid={!!errors.gender}
        >
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        {errors.gender && <div style={styles.error}>{errors.gender}</div>}
      </div>

      {/* Profile picture */}
      <div style={styles.field}>
        <label style={styles.label}>Profile picture *</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="profileFile" style={styles.uploadBtn}>Choose file</label>
          <input
            id="profileFile"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !athlete?.id) return;

              const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
              const ts = Date.now();
              const filePath = `${athlete.id}/Profile-${ts}.${ext}`;

              const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { cacheControl: '3600', upsert: false });

              if (uploadError) {
                console.error('Upload error:', uploadError.message);
                setStatus({ type: 'error', msg: 'Image upload failed. Please try again.' });
                return;
              }

              const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
              const publicUrl = data?.publicUrl || '';
              setForm((prev) => ({ ...prev, profile_picture_url: publicUrl }));
              setErrors((prev) => ({ ...prev, profile_picture_url: validateField('profile_picture_url', publicUrl) }));
              setDirty(true);
              setStatus({ type: '', msg: '' });
              setAfterSavePrompt(false);
            }}
          />
        </div>

        {form.profile_picture_url && (
          <div
            style={{
              position: 'relative',
              width: isMobile ? '100%' : '220px',
              maxWidth: '100%',
              marginTop: '10px'
            }}
          >
            {/* MOBILE: X assoluta fuori dall’angolo destro alto (non copre l’immagine) */}
            {isMobile ? (
              <button
                type="button"
                onClick={() => {
                  const v = '';
                  setForm((prev) => ({ ...prev, profile_picture_url: v }));
                  setErrors((prev) => ({ ...prev, profile_picture_url: validateField('profile_picture_url', v) }));
                  setDirty(true);
                  setAfterSavePrompt(false);
                }}
                style={styles.removeBtnMobileAbsolute}
                aria-label="Remove picture"
                title="Remove picture"
              >
                <IconX small />
              </button>
            ) : (
              // DESKTOP: X in header (come Wizard)
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    const v = '';
                    setForm((prev) => ({ ...prev, profile_picture_url: v }));
                    setErrors((prev) => ({ ...prev, profile_picture_url: validateField('profile_picture_url', v) }));
                    setDirty(true);
                    setAfterSavePrompt(false);
                  }}
                  style={styles.removeBtnHeader}
                  aria-label="Remove picture"
                  title="Remove picture"
                >
                  <IconX />
                </button>
              </div>
            )}

            <img
              src={form.profile_picture_url}
              alt="Profile"
              style={{ width: '100%', height: 'auto', borderRadius: 8 }}
            />
          </div>
        )}
        {errors.profile_picture_url && <div style={styles.error}>{errors.profile_picture_url}</div>}
      </div>

      {/* Status + Save */}
      <div style={styles.saveBar}>
        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {status.type === 'success' && (
            <div role="status" aria-live="polite" style={styles.toastSuccess}>
              <strong>Saved ✓</strong>
              <span style={{ marginLeft: 8 }}>— Leave this page?</span>
              <button type="button" onClick={() => router.back()} style={{ ...styles.linkBtn, color: '#0a7' }}>
                Leave
              </button>
              <button type="button" onClick={() => setAfterSavePrompt(false)} style={styles.linkBtn}>
                Stay
              </button>
            </div>
          )}
          {status.type === 'error' && (
            <div role="status" aria-live="polite" style={styles.toastError}>
              {status.msg}
            </div>
          )}
        </div>

        <button
          type="submit"
          onClick={onSave}
          disabled={isSaveDisabled}
          style={isSaveDisabled ? styles.saveBtnDisabled : styles.saveBtn}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        
        {status.type === 'success' && (
          <span
            style={{
              color: '#0a7',
              fontWeight: 600,
              marginLeft: 10,
            }}
          >
            Saved ✓
          </span>
        )}
        {status.type === 'error' && (
          <span
            style={{
              color: '#b00',
              fontWeight: 600,
              marginLeft: 10,
            }}
          >
            {status.msg}
          </span>
        )}
        
        {status.msg && (
          <span
            style={{
              color: status.type === 'error' ? '#b00' : '#2E7D32',
              fontWeight: 600,
              marginLeft: 10,
            }}
          >
            {status.msg}
          </span>
        )}

      </div>
    </form>
  );
}

function Field({ label, name, value, onChange, onBlur, error }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        style={{ ...styles.input, borderColor: error ? '#b00' : '#E0E0E0' }}
        aria-invalid={!!error}
      />
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

function IconX({ small }) {
  const s = small ? 14 : 18;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
         width={s} height={s} fill="none" stroke="black"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="11" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

const styles = {
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, opacity: 0.8 },
  input: { padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, background: '#FFF' },
  select: { padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, background: '#FFF', height: '40px' },
  error: { fontSize: 11, color: '#b00', marginTop: 2 },

  uploadBtn: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    fontWeight: 'bold'
  },

  // X header (desktop): solo icona, niente bordo/sfondo
  removeBtnHeader: {
    background: 'transparent',
    border: 'none',
    width: 28,
    height: 28,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    WebkitTapHighlightColor: 'transparent'
  },

  // X mobile: posizionata nell'angolo in alto a destra dell'immagine, leggermente FUORI
  removeBtnMobileAbsolute: {
    position: 'absolute',
    top: 0,
    right: 0,
    transform: 'translate(70%, -70%)', // spinge ancora un po’ più a destra/su
    background: 'transparent',
    border: 'none',
    width: 24,
    height: 24,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    zIndex: 3,
    WebkitTapHighlightColor: 'transparent'
  },

  // Toasts
  toastSuccess: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: '#E6FAF0',
    color: '#0a7',
    border: '1px solid #B7F0CF',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600
  },
  toastError: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: '#FFECEC',
    color: '#b00',
    border: '1px solid #FFB3B3',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600
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

  saveBar: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8 },
  saveBtn: { fontSize: 14, padding: '10px 16px', borderRadius: 8 }
};

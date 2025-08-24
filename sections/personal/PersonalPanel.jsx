// @ts-check
import { useEffect, useState, useRef } from 'react';
import { supabase as sb } from '../../utils/supabaseClient';
const supabase = sb;

const ATHLETE_TABLE = 'athlete';

export default function PersonalPanel({ athlete, onSaved }) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    birth_city: '',
    native_language: '',
    additional_language: '',
    residence_city: '',
    residence_country: '',
    profile_picture_url: ''
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);

  const dobRef = useRef(null);
  const today = new Date();
  const maxDateObj = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());
  const minDateObj = new Date(today.getFullYear() - 60, today.getMonth(), today.getDate());
  const toISO = (d) => d.toISOString().slice(0, 10);

  // Prefill
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
      residence_city: athlete.residence_city || '',
      residence_country: athlete.residence_country || '',
      profile_picture_url: athlete.profile_picture_url || ''
    });
    setDirty(false);
  }, [athlete]);

  // Warning if user tries to leave with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = ''; // richiesto per Chrome
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
    setDirty(true);
  };

  const getAge = (yyyy_mm_dd) => {
    if (!yyyy_mm_dd) return null;
    const [y, m, d] = yyyy_mm_dd.split('-').map((n) => parseInt(n, 10));
    const birth = new Date(y, (m || 1) - 1, d || 1);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const mo = today.getMonth() - birth.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const validate = () => {
    const newErrors = {};
    if (!form.first_name?.trim()) newErrors.first_name = "First name is required";
    if (!form.last_name?.trim()) newErrors.last_name = "Last name is required";
    if (!form.date_of_birth) {
      newErrors.date_of_birth = "Date of birth is required";
    } else {
      const age = getAge(form.date_of_birth);
      if (age == null || age < 10 || age > 60) {
        newErrors.date_of_birth = "Date of birth invalid or out of range (10–60y)";
      }
    }
    if (!form.gender) newErrors.gender = "Gender is required";
    if (!form.nationality) newErrors.nationality = "Nationality is required";
    if (!form.birth_city) newErrors.birth_city = "City of birth is required";
    if (!form.native_language) newErrors.native_language = "Native language is required";
    if (!form.residence_city) newErrors.residence_city = "City of residence is required";
    if (!form.residence_country) newErrors.residence_country = "Country of residence is required";
    if (!form.profile_picture_url) newErrors.profile_picture_url = "Profile picture is required";
    return newErrors;
  };

  const onSave = async () => {
    const newErrors = validate();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      setSaving(true);
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
        residence_city: form.residence_city || null,
        residence_country: form.residence_country || null,
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
      alert('Saved.');
    } catch (e) {
      console.error(e);
      alert('Save error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} style={styles.formGrid}>
      {[
        { name: 'first_name', label: 'First name *' },
        { name: 'last_name', label: 'Last name *' },
        { name: 'nationality', label: 'Nationality *' },
        { name: 'birth_city', label: 'City of birth *' },
        { name: 'native_language', label: 'Native language *' },
        { name: 'additional_language', label: 'Additional language (optional)' },
        { name: 'residence_city', label: 'City of residence *' },
        { name: 'residence_country', label: 'Country of residence *' }
      ].map(field => (
        <div style={styles.field} key={field.name}>
          <label style={styles.label}>{field.label}</label>
          <input
            name={field.name}
            value={form[field.name]}
            onChange={onChange}
            style={{ ...styles.input, borderColor: errors[field.name] ? '#b00' : '#E0E0E0' }}
          />
          {errors[field.name] && <div style={styles.error}>{errors[field.name]}</div>}
        </div>
      ))}

      <div style={styles.field}>
        <label style={styles.label}>Date of birth *</label>
        <input
          ref={dobRef}
          type="date"
          name="date_of_birth"
          value={form.date_of_birth}
          onChange={onChange}
          min={toISO(minDateObj)}
          max={toISO(maxDateObj)}
          style={{ ...styles.input, borderColor: errors.date_of_birth ? '#b00' : '#E0E0E0' }}
        />
        {errors.date_of_birth && <div style={styles.error}>{errors.date_of_birth}</div>}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Gender *</label>
        <select
          name="gender"
          value={form.gender}
          onChange={onChange}
          style={{ ...styles.select, borderColor: errors.gender ? '#b00' : '#E0E0E0' }}
        >
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        {errors.gender && <div style={styles.error}>{errors.gender}</div>}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Profile picture *</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label
            htmlFor="profileFile"
            style={{
              background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Choose file
          </label>
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
                return;
              }

              const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
              const publicUrl = data?.publicUrl || '';
              setForm((prev) => ({ ...prev, profile_picture_url: publicUrl }));
              setErrors((prev) => ({ ...prev, profile_picture_url: '' }));
              setDirty(true);
            }}
          />
        </div>

        {form.profile_picture_url && (
          <div style={{ position: 'relative', width: '140px', marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
              <button
                type="button"
                onClick={() => { 
                  setForm((prev) => ({ ...prev, profile_picture_url: '' })); 
                  setDirty(true);
                }}
                style={{
                  background: 'rgba(255,255,255,0.9)',
                  border: '1px solid #ccc',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
                aria-label="Remove picture"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="black"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="11" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                </svg>
              </button>
            </div>
            <img
              src={form.profile_picture_url}
              alt="Profile"
              style={{ width: '100%', height: 'auto', borderRadius: '8px' }}
            />
          </div>
        )}
        {errors.profile_picture_url && <div style={styles.error}>{errors.profile_picture_url}</div>}
      </div>

      <div style={styles.saveBar}>
        <button type="submit" disabled={saving || !dirty} style={styles.saveBtn}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

const styles = {
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, opacity: 0.8 },
  input: { padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, background: '#FFF' },
  select: { padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, background: '#FFF' },
  error: { fontSize: 11, color: '#b00', marginTop: 2 },
  saveBar: { gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', paddingTop: 8 },
  saveBtn: { fontSize: 14, padding: '10px 16px', borderRadius: 8, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer' }
};

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

  const dobRef = useRef(null);
  const today = new Date();
  const maxDateObj = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate()); // max 10 anni fa
  const minDateObj = new Date(today.getFullYear() - 60, today.getMonth(), today.getDate()); // min 60 anni fa
  const toISO = (d) => d.toISOString().slice(0, 10);

  // Prefill dati esistenti
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
  }, [athlete]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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

  const onSave = async () => {
    if (!athlete) return;

    // Validazioni obbligatorie
    if (!form.first_name?.trim()) return alert("First name is required.");
    if (!form.last_name?.trim()) return alert("Last name is required.");
    if (!form.date_of_birth) return alert("Date of birth is required.");
    if (!form.gender) return alert("Gender is required.");
    if (!form.nationality) return alert("Nationality is required.");
    if (!form.birth_city) return alert("Birth city is required.");
    if (!form.native_language) return alert("Native language is required.");
    if (!form.residence_city) return alert("Residence city is required.");
    if (!form.residence_country) return alert("Residence country is required.");
    if (!form.profile_picture_url) return alert("Profile picture is required.");

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
      <div style={styles.field}>
        <label style={styles.label}>First name *</label>
        <input name="first_name" value={form.first_name} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Last name *</label>
        <input name="last_name" value={form.last_name} onChange={onChange} style={styles.input} />
      </div>

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
          style={styles.input}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Gender *</label>
        <select name="gender" value={form.gender} onChange={onChange} style={styles.select}>
          <option value="">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Nationality *</label>
        <input name="nationality" value={form.nationality} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>City of birth *</label>
        <input name="birth_city" value={form.birth_city} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Native language *</label>
        <input name="native_language" value={form.native_language} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Additional language</label>
        <input name="additional_language" value={form.additional_language} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>City of residence *</label>
        <input name="residence_city" value={form.residence_city} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Country of residence *</label>
        <input name="residence_country" value={form.residence_country} onChange={onChange} style={styles.input} />
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
            }}
          />
        </div>

        {form.profile_picture_url && (
          <div style={{ marginTop: '10px' }}>
            <img
              src={form.profile_picture_url}
              alt="Profile"
              style={{ width: '140px', height: 'auto', borderRadius: '8px' }}
            />
          </div>
        )}
      </div>

      <div style={styles.saveBar}>
        <button type="submit" disabled={saving} style={styles.saveBtn}>
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
  saveBar: { gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', paddingTop: 8 },
  saveBtn: { fontSize: 14, padding: '10px 16px', borderRadius: 8, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer' }
};

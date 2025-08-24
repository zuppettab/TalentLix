// @ts-check
import { useEffect, useState } from 'react';
import { supabase as sb } from '../../utils/supabaseClient';
const supabase = sb;

const ATHLETE_TABLE = 'athlete';

export default function PersonalPanel({ athlete, onSaved }) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '', // yyyy-mm-dd
    gender: '',
    nationality: '',
    birth_city: '',
    native_language: '',
    additional_language: '',
    residence_city: '',
    residence_country: ''
  });
  const [saving, setSaving] = useState(false);

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
      residence_country: athlete.residence_country || ''
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
    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      alert('First name and Last name are required.');
      return;
    }
    if (!form.date_of_birth) {
      alert('Date of birth is required.');
      return;
    }
    if (form.gender && !['M','F'].includes(form.gender)) {
      alert('Gender must be M or F.');
      return;
    }

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
        <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Gender</label>
        <select name="gender" value={form.gender} onChange={onChange} style={styles.select}>
          <option value="">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Nationality</label>
        <input name="nationality" value={form.nationality} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>City of birth</label>
        <input name="birth_city" value={form.birth_city} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Native language</label>
        <input name="native_language" value={form.native_language} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Additional language</label>
        <input name="additional_language" value={form.additional_language} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>City of residence</label>
        <input name="residence_city" value={form.residence_city} onChange={onChange} style={styles.input} />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Country of residence</label>
        <input name="residence_country" value={form.residence_country} onChange={onChange} style={styles.input} />
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
  hint: { fontSize: 11, opacity: 0.6, marginTop: 4 },
  saveBar: { gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', paddingTop: 8 },
  saveBtn: { fontSize: 14, padding: '10px 16px', borderRadius: 8, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer' }
};

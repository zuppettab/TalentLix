// sections/sports/SportInfoPanel.jsx
// @ts-check
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Select from 'react-select';
import { supabase as sb } from '../../utils/supabaseClient';
import sports from '../../utils/sports';

const supabase = sb;

const SPORTS_TABLE = 'sports_experiences';
const REQUIRED = ['sport', 'main_role', 'category']; // come Wizard Step 3
const MSG = {
  sport: 'Sport is required',
  main_role: 'Main role is required',
  category: 'Category is required',
  years_experience_int: 'Years must be an integer',
  years_experience_range: 'Years must be between 0 and 60'
};

export default function SportInfoPanel({ athlete, onSaved, isMobile }) {
  const router = useRouter();

  // ----------------------- STATE -----------------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' }); // success/error msg
  const [dirty, setDirty] = useState(false);

  const [expId, setExpId] = useState(null); // ultima riga da editare (se esiste)

  const [form, setForm] = useState({
    sport: '',
    main_role: '',
    category: '',
    team_name: '',
    previous_team: '',
    years_experience: '',
    seeking_team: false
  });
  const [errors, setErrors] = useState({});

  // ----------------------- GUARD: unsaved changes -----------------------
  useEffect(() => {
    const beforeUnload = (e) => { if (!dirty) return; e.preventDefault(); e.returnValue = ''; };
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

  // ----------------------- INIT (prefill dall'ultima esperienza) -----------------------
  useEffect(() => {
    if (!athlete?.id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from(SPORTS_TABLE)
          .select('id, sport, role, team, previous_team, category, years_experience, seeking_team')
          .eq('athlete_id', athlete.id)
          .order('id', { ascending: false })
          .limit(1);

        if (error) throw error;

        const last = Array.isArray(data) && data[0];
        if (mounted && last) {
          setExpId(last.id);
          setForm({
            sport: last.sport || '',
            main_role: last.role || '',
            category: last.category || '',
            team_name: last.team || '',
            previous_team: last.previous_team || '',
            years_experience: last.years_experience ?? '',
            seeking_team: !!last.seeking_team
          });
        }
        if (mounted) {
          setDirty(false);
          setErrors({});
        }
      } catch (e) {
        console.error(e);
        if (mounted) setStatus({ type: 'error', msg: 'Load failed' });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [athlete?.id]);

  // ----------------------- VALIDATION -----------------------
  const validateField = (name, value) => {
    if (REQUIRED.includes(name)) {
      const v = (value ?? '').toString().trim();
      if (!v) return MSG[name] || 'This field is required';
    }
    if (name === 'years_experience') {
      const v = (value ?? '').toString().trim();
      if (v === '') return ''; // opzionale
      const n = Number(v);
      if (!Number.isInteger(n)) return MSG.years_experience_int;
      if (n < 0 || n > 60) return MSG.years_experience_range;
    }
    return '';
  };
  const validateAll = (state = form) => {
    const out = {};
    for (const key of REQUIRED) {
      const err = validateField(key, state[key]);
      if (err) out[key] = err;
    }
    if (state.years_experience !== '') {
      const e = validateField('years_experience', state.years_experience);
      if (e) out.years_experience = e;
    }
    return out;
  };

  // ----------------------- INPUT HANDLERS -----------------------
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const v = type === 'checkbox' ? !!checked : value;
    setForm((prev) => ({ ...prev, [name]: v }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, v) }));
    setDirty(true);
    setStatus({ type: '', msg: '' });
  };

  const onSelectSport = (opt) => {
    const value = opt?.value || '';
    setForm((prev) => ({ ...prev, sport: value }));
    setErrors((prev) => ({ ...prev, sport: validateField('sport', value) }));
    setDirty(true);
    setStatus({ type: '', msg: '' });
  };

  const allRequiredFilled = useMemo(() => {
    for (const k of REQUIRED) {
      const err = validateField(k, form[k]);
      if (err) return false;
    }
    return true;
  }, [form]);

  const hasErrors = useMemo(() => Object.values(errors).some(Boolean), [errors]);
  const isSaveDisabled = saving || !dirty || hasErrors || !allRequiredFilled;

  // ----------------------- SAVE -----------------------
  const onSave = async () => {
    if (isSaveDisabled) return;

    // validazione finale
    const newErrors = validateAll();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      // sanitize years
      const years =
        form.years_experience === '' || form.years_experience == null
          ? null
          : Math.max(0, Math.min(60, parseInt(form.years_experience, 10)));

      const payload = {
        athlete_id: athlete.id,
        sport: (form.sport || '').trim(),
        role: (form.main_role || '').trim(),
        team: (form.team_name || null) || null,
        previous_team: (form.previous_team || null) || null,
        category: (form.category || '').trim(),
        years_experience: years,
        seeking_team: !!form.seeking_team
      };

      if (expId) {
        const { data, error } = await supabase
          .from(SPORTS_TABLE)
          .update(payload)
          .eq('id', expId)
          .select()
          .single();
        if (error) throw error;
        // sync
        setDirty(false);
        setStatus({ type: 'success', msg: 'Saved ✓' });
        setExpId(data?.id || expId);
      } else {
        const { data, error } = await supabase
          .from(SPORTS_TABLE)
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        setDirty(false);
        setStatus({ type: 'success', msg: 'Saved ✓' });
        setExpId(data?.id || null);
      }

      // callback parent (come le altre card): ricarico athlete per coerenza UI
      if (onSaved) {
        const { data: fresh } = await supabase.from('athlete').select('*').eq('id', athlete.id).single();
        onSaved(fresh || null);
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ----------------------- UI -----------------------
  if (loading) return <div style={{ padding: 8, color: '#666' }}>Loading…</div>;

  const saveBarStyle      = isMobile ? styles.saveBarMobile : styles.saveBar;
  const saveBtnStyle      = isSaveDisabled
    ? { ...styles.saveBtn, ...styles.saveBtnDisabled }
    : { ...styles.saveBtn, ...styles.saveBtnEnabled };

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: 42,
      borderRadius: 10,
      borderColor: errors.sport ? '#b00' : (state.isFocused ? '#BDBDBD' : '#E0E0E0'),
      boxShadow: 'none',
      ':hover': { borderColor: errors.sport ? '#b00' : '#BDBDBD' }
    }),
    valueContainer: (base) => ({ ...base, padding: '0 10px' }),
    indicatorsContainer: (base) => ({ ...base, paddingRight: 8 }),
    menu: (base) => ({ ...base, zIndex: 10 })
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : null) }}>
      {/* Sport */}
      <div style={styles.field}>
        <label style={styles.label}>Sport *</label>
        <Select
          name="sport"
          placeholder="Start typing sport"
          options={sports}
          value={sports.find(opt => opt.value === form.sport) || null}
          onChange={onSelectSport}
          filterOption={(option, inputValue) =>
            inputValue.length >= 2 &&
            option.label.toLowerCase().includes(inputValue.toLowerCase())
          }
          styles={selectStyles}
        />
        {errors.sport && <div style={styles.error}>{errors.sport}</div>}
      </div>

      {/* Years of experience (opzionale) */}
      <div style={styles.field}>
        <label style={styles.label}>Years of experience</label>
        <input
          type="number"
          name="years_experience"
          min={0}
          max={60}
          value={form.years_experience}
          onChange={handleChange}
          style={{ ...styles.input, borderColor: errors.years_experience ? '#b00' : '#E0E0E0' }}
        />
        {errors.years_experience && <div style={styles.error}>{errors.years_experience}</div>}
      </div>

      {/* Main role */}
      <div style={styles.field}>
        <label style={styles.label}>Main role *</label>
        <input
          name="main_role"
          value={form.main_role}
          onChange={handleChange}
          style={{ ...styles.input, borderColor: errors.main_role ? '#b00' : '#E0E0E0' }}
        />
        {errors.main_role && <div style={styles.error}>{errors.main_role}</div>}
      </div>

      {/* Category */}
      <div style={styles.field}>
        <label style={styles.label}>Category *</label>
        <input
          name="category"
          value={form.category}
          onChange={handleChange}
          style={{ ...styles.input, borderColor: errors.category ? '#b00' : '#E0E0E0' }}
        />
        {errors.category && <div style={styles.error}>{errors.category}</div>}
      </div>

      {/* Current team (opzionale) */}
      <div style={styles.field}>
        <label style={styles.label}>Current team (optional)</label>
        <input
          name="team_name"
          value={form.team_name}
          onChange={handleChange}
          style={styles.input}
        />
      </div>

      {/* Previous team (opzionale) */}
      <div style={styles.field}>
        <label style={styles.label}>Previous team (optional)</label>
        <input
          name="previous_team"
          value={form.previous_team}
          onChange={handleChange}
          style={styles.input}
        />
      </div>

      {/* Seeking team */}
      <div style={{ ...styles.field, alignSelf: 'end' }}>
        <label style={styles.label}>Seeking team</label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            name="seeking_team"
            checked={!!form.seeking_team}
            onChange={handleChange}
          />
          <span>Available and seeking a team</span>
        </label>
      </div>

      {/* SAVE BAR */}
      <div style={saveBarStyle}>
        <button type="submit" disabled={isSaveDisabled} style={saveBtnStyle}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status.msg && (
          <span style={{
            marginLeft: 10,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            color: status.type === 'error' ? '#b00' : '#2E7D32'
          }}>
            {status.msg}
          </span>
        )}
      </div>
    </form>
  );
}

// ----------------------- STYLES (coerenti con le altre card) -----------------------
const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24
  },
  gridMobile: { gridTemplateColumns: '1fr' },

  field: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: 600 },
  input: {
    height: 42,
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF'
  },
  error: { fontSize: 12, color: '#b00' },

  // Save bar identica alle altre card
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
  saveBtn: { height: 38, padding: '0 16px', borderRadius: 8, fontWeight: 600, border: 'none' },
  saveBtnEnabled: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', cursor: 'pointer' },
  saveBtnDisabled: { background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed' }
};

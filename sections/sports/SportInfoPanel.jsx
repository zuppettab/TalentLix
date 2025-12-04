

// sections/sports/SportInfoPanel.jsx
// @ts-check
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/router';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { supabase as sb } from '../../utils/supabaseClient';
import sports from '../../utils/sports';
import SeasonAccordionItem from './SeasonAccordionItem';

const supabase = sb;

const SPORTS_TABLE = 'sports_experiences';
const CAREER_TABLE = 'athlete_career';

// Obbligatori (coerenti con Wizard Step 3)
const REQUIRED = ['sport', 'category'];

const MSG = {
  sport: 'Sport is required',
  category: 'Category is required',
  years_experience_int: 'Years must be an integer',
  years_experience_range: 'Years must be between 0 and 60',
  years_experience_age: 'Years of experience must not exceed 90% of the athlete age',
  contract_end_date_invalid: 'Contract end date must be a valid date (YYYY-MM-DD)',
  trial_start_invalid: 'Trial start must be a valid date (YYYY-MM-DD)',
  trial_end_invalid: 'Trial end must be a valid date (YYYY-MM-DD)',
  trial_window_incomplete: 'Both trial dates are required',
  trial_window_order: 'Start date must be before or equal to end date',

  // Career widget
  season_start_required: 'Season start is required',
  season_year_range: 'Year must be between 1900 and 2100',
  season_order: 'Season end must be >= start (or empty)',
  team_required: 'Team is required',
  cat_required: 'Category is required',
};

// ---- helpers: daterange <-> 2 date ----
const shiftDate = (isoDate, days) => {
  const str = (isoDate ?? '').toString().trim();
  if (!str) return '';
  if (!days || !Number.isFinite(days)) return str;

  const [year, month, day] = str.split('-').map(Number);
  if ([year, month, day].some(Number.isNaN)) return str;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return str;

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const parseDateRange = (rng) => {
  if (!rng || typeof rng !== 'string') return { start: '', end: '' };
  const str = rng.trim();
  const exclusiveEnd = str.endsWith(')');

  const m = str.match(/^[\[\(]\s*"?(\d{4}-\d{2}-\d{2})"?\s*,\s*"?(\d{4}-\d{2}-\d{2})"?\s*[\]\)]$/);
  if (m) {
    const end = exclusiveEnd ? shiftDate(m[2], -1) : m[2];
    return { start: m[1], end };
  }

  const all = str.match(/(\d{4}-\d{2}-\d{2})/g);
  if (all && all.length >= 2) {
    const end = exclusiveEnd ? shiftDate(all[1], -1) : all[1];
    return { start: all[0], end };
  }
  return { start: '', end: '' };
};

const buildDateRange = (start, end) => {
  const s = (start ?? '').toString().trim();
  const e = (end ?? '').toString().trim();
  if (!s || !e) return null;
  const exclusiveEnd = shiftDate(e, 1);
  return `[${s},${exclusiveEnd})`;
};

const isValidISODate = (value) => {
  const str = (value ?? '').toString().trim();
  if (!str) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [year, month, day] = str.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === str;
};

// ---- react-select styles (coerenti) ----
const makeSelectStyles = (hasError) => ({
  container: (base) => ({ ...base, width: '100%' }),
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderRadius: 10,
    borderColor: hasError ? '#b00' : (state.isFocused ? '#BDBDBD' : '#E0E0E0'),
    boxShadow: 'none',
    ':hover': { borderColor: hasError ? '#b00' : '#BDBDBD' },
  }),
  valueContainer: (base) => ({ ...base, padding: '0 10px' }),
  indicatorsContainer: (base) => ({ ...base, paddingRight: 8 }),
  menu: (base) => ({ ...base, zIndex: 10 }),
});

const CONTRACT_STATUS_OPTIONS = [
  { value: 'free_agent', label: 'Free agent' },
  { value: 'under_contract', label: 'Under contract' },
  { value: 'on_loan', label: 'On loan' },
];

const getAge = (isoDate) => {
  if (!isoDate) return null;
  const str = isoDate.toString().trim();
  if (!str) return null;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [_, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const now = new Date();
  const birth = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(birth.getTime())) return null;

  let age = now.getFullYear() - birth.getFullYear();
  const mo = now.getMonth() - birth.getMonth();
  if (mo < 0 || (mo === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

export default function SportInfoPanel({ athlete, onSaved, isMobile }) {
  const router = useRouter();

  const athleteAge = useMemo(() => getAge(athlete?.date_of_birth), [athlete?.date_of_birth]);
  const experienceCap = useMemo(() => {
    if (athleteAge == null || !Number.isFinite(athleteAge) || athleteAge <= 0) return null;
    return Math.floor(athleteAge * 0.9);
  }, [athleteAge]);

  // ----------------------- STATE (form corrente) -----------------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' }); // success/error msg
  const [dirty, setDirty] = useState(false);

  const [expId, setExpId] = useState(null); // ultima riga da editare (se esiste)

  const [form, setForm] = useState({
    // core (già presenti)
    sport: '',
    main_role: '',
    category: '',
    team_name: '',
    previous_team: '',
    years_experience: '',
    seeking_team: false,

    // nuovi campi (tutti opzionali)
    secondary_role: '',
    playing_style: '',
    contract_status: '',          // enum
    contract_end_date: '',        // YYYY-MM-DD
    contract_notes: '',
    preferred_regions: [],        // string[]
    trial_start: '',              // derive trial_window
    trial_end: '',
    agent_name: '',
    agency_name: '',
    is_represented: false,
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
          .select(`
            id,
            sport, role, team, previous_team, category, years_experience, seeking_team,
            secondary_role, playing_style,
            contract_status, contract_end_date, contract_notes,
            preferred_regions, trial_window,
            agent_name, agency_name, is_represented
          `)
          .eq('athlete_id', athlete.id)
          .order('id', { ascending: false })
          .limit(1);

        if (error) throw error;

        const last = Array.isArray(data) && data[0];
        if (mounted && last) {
          const { start: tStart, end: tEnd } = parseDateRange(last.trial_window);
          setExpId(last.id);
          setForm({
            sport: last.sport || '',
            main_role: last.role || '',
            category: last.category || '',
            team_name: last.team || '',
            previous_team: last.previous_team || '',
            years_experience: last.years_experience ?? '',
            seeking_team: !!last.seeking_team,

            secondary_role: last.secondary_role || '',
            playing_style: last.playing_style || '',
            contract_status: last.contract_status || '',
            contract_end_date: last.contract_end_date || '',
            contract_notes: last.contract_notes || '',
            preferred_regions: Array.isArray(last.preferred_regions) ? last.preferred_regions : [],
            trial_start: tStart || '',
            trial_end: tEnd || '',
            agent_name: last.agent_name || '',
            agency_name: last.agency_name || '',
            is_represented: !!last.is_represented,
          });
        }
        if (mounted) {
          setDirty(false);
          setErrors({});
          // Non azzeriamo lo status qui: resta conforme alle linee guida save-bar
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
  const validateField = (name, value, state = form) => {
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
      if (experienceCap != null && n > experienceCap) return MSG.years_experience_age;
    }
    if (name === 'contract_end_date') {
      const v = (value ?? '').toString().trim();
      if (v === '') return '';
      if (!isValidISODate(v)) return MSG.contract_end_date_invalid;
    }
    if (name === 'trial_start') {
      if (!state.seeking_team) return '';
      const v = (value ?? '').toString().trim();
      if (v === '') return '';
      if (!isValidISODate(v)) return MSG.trial_start_invalid;
    }
    if (name === 'trial_end') {
      if (!state.seeking_team) return '';
      const v = (value ?? '').toString().trim();
      if (v === '') return '';
      if (!isValidISODate(v)) return MSG.trial_end_invalid;
    }
    if (name === 'trial_window') {
      if (!state.seeking_team) return '';
      const s = (state.trial_start ?? '').toString().trim();
      const e = (state.trial_end ?? '').toString().trim();
      if ((!s && !e)) return ''; // totalmente opzionale
      if ((s && !e) || (!s && e)) return MSG.trial_window_incomplete;
      if (!isValidISODate(s) || !isValidISODate(e)) return '';
      if (s > e) return MSG.trial_window_order;
    }
    return '';
  };

  const validateAll = (state = form) => {
    const out = {};
    for (const key of REQUIRED) {
      const err = validateField(key, state[key], state);
      if (err) out[key] = err;
    }
    if (state.years_experience !== '') {
      const e = validateField('years_experience', state.years_experience, state);
      if (e) out.years_experience = e;
    }
    const contractErr = validateField('contract_end_date', state.contract_end_date, state);
    if (contractErr) out.contract_end_date = contractErr;
    const trialStartErr = validateField('trial_start', state.trial_start, state);
    if (trialStartErr) out.trial_start = trialStartErr;
    const trialEndErr = validateField('trial_end', state.trial_end, state);
    if (trialEndErr) out.trial_end = trialEndErr;
    const tw = validateField('trial_window', null, state);
    if (tw) out.trial_window = tw;
    return out;
  };

  // ----------------------- INPUT HANDLERS -----------------------
  const setField = (name, value) => {
    setForm((prev) => {
      const nextForm = { ...prev, [name]: value };
      setErrors((prevErrors) => {
        const nextErrors = { ...prevErrors };
        const applyError = (key, err) => {
          if (err) nextErrors[key] = err;
          else delete nextErrors[key];
        };

        if (REQUIRED.includes(name)) {
          applyError(name, validateField(name, value, nextForm));
        }
        if (name === 'years_experience') {
          applyError('years_experience', validateField('years_experience', nextForm.years_experience, nextForm));
        }
        if (name === 'contract_end_date') {
          applyError('contract_end_date', validateField('contract_end_date', nextForm.contract_end_date, nextForm));
        }
        if (name === 'trial_start' || name === 'trial_end' || name === 'seeking_team') {
          applyError('trial_start', validateField('trial_start', nextForm.trial_start, nextForm));
          applyError('trial_end', validateField('trial_end', nextForm.trial_end, nextForm));
          applyError('trial_window', validateField('trial_window', null, nextForm));
        }

        return nextErrors;
      });
      return nextForm;
    });
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  const onSelectSport = (opt) => {
    const value = opt?.value || '';
    setField('sport', value);
  };

  const onSelectContract = (opt) => {
    const value = opt?.value || '';
    setField('contract_status', value);
  };

  const onChangeRegions = (opts) => {
    const arr = Array.isArray(opts) ? opts.map(o => o.value.trim()).filter(Boolean) : [];
    setField('preferred_regions', arr);
  };

  const allRequiredFilled = useMemo(() => {
    for (const k of REQUIRED) {
      const err = validateField(k, form[k], form);
      if (err) return false;
    }
    return true;
  }, [form]);

  const hasErrors = useMemo(() => Object.values(errors).some(Boolean), [errors]);
  const isSaveDisabled = saving || !dirty || hasErrors || !allRequiredFilled;

  // ----------------------- SAVE -----------------------
  const onSave = async () => {
    if (isSaveDisabled) return;

    const newErrors = validateAll();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      const years =
        form.years_experience === '' || form.years_experience == null
          ? null
          : Math.max(0, Math.min(60, parseInt(form.years_experience, 10)));

      const trial_window =
        form.seeking_team && form.trial_start && form.trial_end
          ? buildDateRange(form.trial_start, form.trial_end)
          : null;

      const preferred_regions = form.seeking_team ? form.preferred_regions : [];

      const agent_name = form.is_represented ? (form.agent_name || null) : null;
      const agency_name = form.is_represented ? (form.agency_name || null) : null;

      const payload = {
        athlete_id: athlete.id,
        sport: (form.sport || '').trim(),
        role: (form.main_role || '').trim() || null,
        team: (form.team_name || null) || null,
        previous_team: (form.previous_team || null) || null,
        category: (form.category || '').trim(),
        years_experience: years,
        seeking_team: !!form.seeking_team,

        secondary_role: (form.secondary_role || '').trim() || null,
        playing_style: (form.playing_style || '').trim() || null,
        contract_status: form.contract_status || null,
        contract_end_date: form.contract_end_date || null,
        contract_notes: (form.contract_notes || '').trim() || null,
        preferred_regions,
        trial_window,
        agent_name,
        agency_name,
        is_represented: !!form.is_represented,
      };

      if (expId) {
        const { data, error } = await supabase
          .from(SPORTS_TABLE)
          .update(payload)
          .eq('id', expId)
          .select()
          .single();
        if (error) throw error;
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

      // callback parent (come le altre card)
      if (onSaved) {
        const { data: fresh } = await supabase.from('athlete').select('*').eq('id', athlete.id).single();
        onSaved(fresh || null);
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  // ----------------------- UI -----------------------
  if (loading) return <div style={{ padding: 8, color: '#666' }}>Loading…</div>;

  const selectStylesSport = makeSelectStyles(!!errors.sport);
  const selectStylesEnum  = makeSelectStyles(false);
  const selectStylesTags  = makeSelectStyles(false);

  const saveBarStyle = isMobile ? styles.saveBarMobile : styles.saveBar;
  const saveBtnStyle = isSaveDisabled
    ? { ...styles.saveBtn, ...styles.saveBtnDisabled }
    : { ...styles.saveBtn, ...styles.saveBtnEnabled };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }}
          style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : null) }}>

      {/* --- BLOCCO: stato sportivo corrente (sports_experiences) --- */}
      <div style={styles.field}>
        <label style={styles.label}>Sport *</label>
        <Select
          name="sport"
          placeholder="Start typing sport"
          options={sports}
          value={sports.find(opt => opt.value === form.sport) || null}
          onChange={(opt) => onSelectSport(opt)}
          filterOption={(option, inputValue) =>
            inputValue.length >= 2 &&
            option.label.toLowerCase().includes(inputValue.toLowerCase())
          }
          styles={selectStylesSport}
        />
        {errors.sport && <div style={styles.error}>{errors.sport}</div>}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Years of experience</label>
        <input
          type="number"
          name="years_experience"
          min={0}
          max={60}
          value={form.years_experience}
          onChange={(e) => setField('years_experience', e.target.value)}
          style={{ ...styles.input, borderColor: errors.years_experience ? '#b00' : '#E0E0E0' }}
        />
        {errors.years_experience && <div style={styles.error}>{errors.years_experience}</div>}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Main role</label>
        <input
          name="main_role"
          value={form.main_role}
          onChange={(e) => setField('main_role', e.target.value)}
          style={{ ...styles.input, borderColor: errors.main_role ? '#b00' : '#E0E0E0' }}
        />
        {errors.main_role && <div style={styles.error}>{errors.main_role}</div>}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Category *</label>
        <input
          name="category"
          value={form.category}
          onChange={(e) => setField('category', e.target.value)}
          style={{ ...styles.input, borderColor: errors.category ? '#b00' : '#E0E0E0' }}
        />
        {errors.category && <div style={styles.error}>{errors.category}</div>}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Secondary role</label>
        <input
          name="secondary_role"
          value={form.secondary_role}
          onChange={(e) => setField('secondary_role', e.target.value)}
          style={styles.input}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Playing style / Key tasks</label>
        <textarea
          name="playing_style"
          rows={3}
          value={form.playing_style}
          onChange={(e) => setField('playing_style', e.target.value)}
          style={{ ...styles.input, height: 'auto', paddingTop: 10, paddingBottom: 10 }}
          placeholder="Short description (max 3 bullet points)"
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Current team (optional)</label>
        <input
          name="team_name"
          value={form.team_name}
          onChange={(e) => setField('team_name', e.target.value)}
          style={styles.input}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Previous team (optional)</label>
        <input
          name="previous_team"
          value={form.previous_team}
          onChange={(e) => setField('previous_team', e.target.value)}
          style={styles.input}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Contract status</label>
        <Select
          name="contract_status"
          placeholder="Select status"
          options={CONTRACT_STATUS_OPTIONS}
          value={CONTRACT_STATUS_OPTIONS.find(o => o.value === form.contract_status) || null}
          onChange={(opt) => onSelectContract(opt)}
          styles={makeSelectStyles(false)}
          isClearable
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Contract end date</label>
        <input
          type="date"
          name="contract_end_date"
          value={form.contract_end_date}
          onChange={(e) => setField('contract_end_date', e.target.value)}
          style={{ ...styles.input, borderColor: errors.contract_end_date ? '#b00' : '#E0E0E0' }}
        />
        {errors.contract_end_date && <div style={styles.error}>{errors.contract_end_date}</div>}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Contract notes</label>
        <input
          name="contract_notes"
          value={form.contract_notes}
          onChange={(e) => setField('contract_notes', e.target.value)}
          style={styles.input}
          placeholder="Short notes (no sensitive data)…"
        />
      </div>

      <div style={{ ...styles.field, alignSelf: 'end' }}>
        <label style={styles.label}>Seeking team</label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            name="seeking_team"
            checked={!!form.seeking_team}
            onChange={(e) => setField('seeking_team', e.target.checked)}
          />
          <span>Available and seeking a team</span>
        </label>
      </div>

      {form.seeking_team && (
        <div style={styles.field}>
          <label style={styles.label}>Preferred regions</label>
          <CreatableSelect
            isMulti
            placeholder="Add regions/countries…"
            value={(form.preferred_regions || []).map(v => ({ value: v, label: v }))}
            onChange={onChangeRegions}
            styles={makeSelectStyles(false)}
          />
        </div>
      )}

      {form.seeking_team && (
        <div style={styles.field}>
          <label style={styles.label}>Trial window (optional)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="date"
                name="trial_start"
                value={form.trial_start}
                onChange={(e) => setField('trial_start', e.target.value)}
                style={{ ...styles.input, borderColor: errors.trial_start ? '#b00' : '#E0E0E0' }}
              />
              {errors.trial_start && <div style={styles.error}>{errors.trial_start}</div>}
              <small style={{ color: '#666' }}>Start</small>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="date"
                name="trial_end"
                value={form.trial_end}
                onChange={(e) => setField('trial_end', e.target.value)}
                style={{ ...styles.input, borderColor: errors.trial_end ? '#b00' : '#E0E0E0' }}
              />
              {errors.trial_end && <div style={styles.error}>{errors.trial_end}</div>}
              <small style={{ color: '#666' }}>End</small>
            </div>
          </div>
          {errors.trial_window && <div style={styles.error}>{errors.trial_window}</div>}
        </div>
      )}

      <div style={styles.field}>
        <label style={styles.label}>Representation</label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            name="is_represented"
            checked={!!form.is_represented}
            onChange={(e) => setField('is_represented', e.target.checked)}
          />
          <span>Represented by an agent</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <input
            name="agent_name"
            value={form.agent_name}
            onChange={(e) => setField('agent_name', e.target.value)}
            placeholder="Agent name"
            style={styles.input}
          />
          <input
            name="agency_name"
            value={form.agency_name}
            onChange={(e) => setField('agency_name', e.target.value)}
            placeholder="Agency"
            style={styles.input}
          />
        </div>
      </div>

      {/* --- WIDGET: Career (athlete_career) --- */}
      <div style={{ gridColumn: '1 / -1' }}>
        <CareerWidget
          athleteId={athlete?.id}
          defaultSport={form.sport}
          isMobile={isMobile}
        />
      </div>

      {/* SAVE BAR (identica alle linee guida) */}
      <div style={saveBarStyle}>
        <button type="submit" disabled={isSaveDisabled} style={saveBtnStyle} aria-disabled={isSaveDisabled}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status.msg && (
          <span role="status" aria-live="polite" style={{
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

/** -------------------- Career widget -------------------- */
function CareerWidget({ athleteId, defaultSport, isMobile }) {
  const [rows, setRows] = useState([]);
  const [cLoading, setCLoading] = useState(true);
  const [cStatus, setCStatus] = useState({ type: '', msg: '' });

  // Add row state
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState({
    sport: '',
    season_start: '',
    season_end: '',
    team_name: '',
    role: '',
    category: '',
    league: '',
    notes: '',
    is_current: false,
  });
  const [addErrors, setAddErrors] = useState({});

  // Edit row state
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [openId, setOpenId] = useState(null); // accordion open row
  const [rowBusy, setRowBusy] = useState(null); // disable actions while saving/deleting

  const selectStyles = makeSelectStyles(false);

  const loadRows = async () => {
    if (!athleteId) return;
    try {
      setCLoading(true);
      const { data, error } = await supabase
        .from(CAREER_TABLE)
        .select('*')
        .eq('athlete_id', athleteId)
        .order('season_start', { ascending: false })
        .order('season_end', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      console.error(e);
      setCStatus({ type: 'error', msg: 'Load failed' });
    } finally {
      setCLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [athleteId]);

  useEffect(() => {
    // Imposta default sport sull'add quando apre/aggiorna il form
    if (adding && defaultSport && !add.sport) {
      setAdd((p) => ({ ...p, sport: defaultSport }));
    }
  }, [adding, defaultSport]);

  // ---- validation helpers ----
  const validYear = (y) => {
    const n = Number(y);
    return Number.isInteger(n) && n >= 1900 && n <= 2100;
  };

  const validateCareer = (obj, mode = 'add') => {
    const out = {};
    if (!obj.season_start) out.season_start = MSG.season_start_required;
    else if (!validYear(obj.season_start)) out.season_start = MSG.season_year_range;

    if (obj.season_end !== '' && obj.season_end != null) {
      if (!validYear(obj.season_end)) out.season_end = MSG.season_year_range;
      else if (Number(obj.season_end) < Number(obj.season_start)) out.season_end = MSG.season_order;
    }

    if (!obj.team_name?.toString().trim()) out.team_name = MSG.team_required;
    if (!obj.category?.toString().trim()) out.category = MSG.cat_required;

    return out;
  };

  const toggleSeason = (id) => {
    setEditId(null);
    setOpenId((p) => (p === id ? null : id));
  };

  // ---- ADD row ----
  const onAddClick = () => {
    setAdding(true);
    setCStatus({ type: '', msg: '' });
    setAdd({
      sport: defaultSport || '',
      season_start: '',
      season_end: '',
      team_name: '',
      role: '',
      category: '',
      league: '',
      notes: '',
      is_current: false,
    });
    setAddErrors({});
  };

  const onAddCancel = () => {
    setAdding(false);
    setAddErrors({});
    setCStatus({ type: '', msg: '' });
  };

  const onAddSave = async () => {
    const errs = validateCareer(add, 'add');
    setAddErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      setCStatus({ type: '', msg: '' });

      // se si imposta current, azzera gli altri current per stesso sport
      if (add.is_current) {
        await supabase
          .from(CAREER_TABLE)
          .update({ is_current: false })
          .eq('athlete_id', athleteId)
          .eq('sport', add.sport)
          .eq('is_current', true);
      }

      const payload = {
        athlete_id: athleteId,
        sport: add.sport || '',
        season_start: add.season_start ? Number(add.season_start) : null,
        season_end: add.season_end === '' ? null : Number(add.season_end),
        team_name: add.team_name || '',
        role: add.role || '',
        category: add.category || '',
        league: add.league || null,
        notes: add.notes || null,
        is_current: !!add.is_current,
      };

      const { error } = await supabase.from(CAREER_TABLE).insert([payload]);
      if (error) throw error;

      setAdding(false);
      setCStatus({ type: 'success', msg: 'Saved ✓' });
      await loadRows();
    } catch (e) {
      console.error(e);
      setCStatus({ type: 'error', msg: 'Save failed' });
    }
  };

  // ---- EDIT row ----
  const onEdit = (row) => {
    setOpenId(row.id);
    setEditId(row.id);
    setEdit({
      sport: row.sport || '',
      season_start: row.season_start ?? '',
      season_end: row.season_end ?? '',
      team_name: row.team_name || '',
      role: row.role || '',
      category: row.category || '',
      league: row.league || '',
      notes: row.notes || '',
      is_current: !!row.is_current,
    });
    setEditErrors({});
    setCStatus({ type: '', msg: '' });
  };

  const onEditCancel = () => {
    setEditId(null);
    setEdit({});
    setEditErrors({});
  };

  const onEditSave = async (id) => {
    const errs = validateCareer(edit, 'edit');
    setEditErrors(errs);
    if (Object.keys(errs).length) {
      const el = document.getElementById(`season-region-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    try {
      setCStatus({ type: '', msg: '' });
      setRowBusy(id);

      if (edit.is_current) {
        await supabase
          .from(CAREER_TABLE)
          .update({ is_current: false })
          .eq('athlete_id', athleteId)
          .eq('sport', edit.sport)
          .eq('is_current', true)
          .neq('id', id);
      }

      const payload = {
        sport: edit.sport || '',
        season_start: edit.season_start ? Number(edit.season_start) : null,
        season_end: edit.season_end === '' ? null : Number(edit.season_end),
        team_name: edit.team_name || '',
        role: edit.role || '',
        category: edit.category || '',
        league: edit.league || null,
        notes: edit.notes || null,
        is_current: !!edit.is_current,
      };

      const { error } = await supabase
        .from(CAREER_TABLE)
        .update(payload)
        .eq('id', id);
      if (error) throw error;

      setEditId(null);
      setCStatus({ type: 'success', msg: 'Saved ✓' });
      await loadRows();
    } catch (e) {
      console.error(e);
      setCStatus({ type: 'error', msg: 'Save failed' });
    }
    setRowBusy(null);
  };

  // ---- DELETE row ----
  const onDelete = async (id) => {
    const ok = window.confirm('Delete this season?');
    if (!ok) return;
    try {
      setRowBusy(id);
      const { error } = await supabase.from(CAREER_TABLE).delete().eq('id', id);
      if (error) throw error;
      setCStatus({ type: 'success', msg: 'Saved ✓' });
      await loadRows();
      setOpenId((p) => (p === id ? null : p));
      if (editId === id) setEditId(null);
    } catch (e) {
      console.error(e);
      setCStatus({ type: 'error', msg: 'Delete failed' });
    }
    setRowBusy(null);
  };

  const SeasonCell = ({ start, end }) => {
    const s = start ? String(start) : '';
    const e = end ? String(end) : '';
    let disp = s;
    if (s && e) {
      const short = e.length === 4 ? e.slice(2) : e;
      disp = `${s}/${short}`;
    }
    return <span>{disp || '-'}</span>;
  };

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Career (seasons)</h3>
        {!adding ? (
          <button type="button" onClick={onAddClick} style={styles.smallBtn}>+ Add season</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onAddSave} style={styles.smallBtnPrimary}>Save</button>
            <button type="button" onClick={onAddCancel} style={styles.smallBtn}>Cancel</button>
          </div>
        )}
      </div>

      {/* Add row form (inline) */}
      {adding && (
        <div style={{ ...styles.careerForm, ...(isMobile ? styles.careerFormMobile : null) }}>
          <div>
            <label style={styles.sublabel}>Sport</label>
            <Select
              placeholder="Sport"
              options={sports}
              value={sports.find(o => o.value === add.sport) || null}
              onChange={(opt) => setAdd((p) => ({ ...p, sport: opt?.value || '' }))}
              styles={selectStyles}
            />
          </div>
          <div>
            <label style={styles.sublabel}>Season start *</label>
            <input
              type="number"
              value={add.season_start}
              onChange={(e) => setAdd((p) => ({ ...p, season_start: e.target.value }))}
              style={{ ...styles.careerInput, borderColor: addErrors.season_start ? '#b00' : '#E0E0E0' }}
            />
            {addErrors.season_start && <div style={styles.error}>{addErrors.season_start}</div>}
          </div>
          <div>
            <label style={styles.sublabel}>Season end</label>
            <input
              type="number"
              value={add.season_end}
              onChange={(e) => setAdd((p) => ({ ...p, season_end: e.target.value }))}
              style={{ ...styles.careerInput, borderColor: addErrors.season_end ? '#b00' : '#E0E0E0' }}
            />
            {addErrors.season_end && <div style={styles.error}>{addErrors.season_end}</div>}
          </div>
          <div>
            <label style={styles.sublabel}>Team *</label>
            <input
              value={add.team_name}
              onChange={(e) => setAdd((p) => ({ ...p, team_name: e.target.value }))}
              style={{ ...styles.careerInput, borderColor: addErrors.team_name ? '#b00' : '#E0E0E0' }}
            />
            {addErrors.team_name && <div style={styles.error}>{addErrors.team_name}</div>}
          </div>
          <div>
            <label style={styles.sublabel}>Role</label>
            <input
              value={add.role}
              onChange={(e) => setAdd((p) => ({ ...p, role: e.target.value }))}
              style={{ ...styles.careerInput, borderColor: addErrors.role ? '#b00' : '#E0E0E0' }}
            />
            {addErrors.role && <div style={styles.error}>{addErrors.role}</div>}
          </div>
          <div>
            <label style={styles.sublabel}>Category *</label>
            <input
              value={add.category}
              onChange={(e) => setAdd((p) => ({ ...p, category: e.target.value }))}
              style={{ ...styles.careerInput, borderColor: addErrors.category ? '#b00' : '#E0E0E0' }}
            />
            {addErrors.category && <div style={styles.error}>{addErrors.category}</div>}
          </div>
          <div>
            <label style={styles.sublabel}>League</label>
            <input
              value={add.league}
              onChange={(e) => setAdd((p) => ({ ...p, league: e.target.value }))}
              style={styles.careerInput}
            />
          </div>
          <div>
            <label style={styles.sublabel}>Notes</label>
            <input
              value={add.notes}
              onChange={(e) => setAdd((p) => ({ ...p, notes: e.target.value }))}
              style={styles.careerInput}
            />
          </div>
          <div>
            <label style={styles.sublabel}>Current</label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!add.is_current}
                onChange={(e) => setAdd((p) => ({ ...p, is_current: e.target.checked }))}
              />
              <span>This is my current season</span>
            </label>
          </div>
        </div>
      )}

      {/* Table/list */}
      <div style={styles.tableWrap}>
        {cLoading ? (
          <div style={{ padding: 8, color: '#666' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 8, color: '#666' }}>No seasons yet.</div>
        ) : !isMobile ? (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Season</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Sport</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Team</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Role</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Category</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>League</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Current</th>
                <th style={{ ...styles.thRight, ...(isMobile ? styles.thMobile : null) }}>
                  <span style={styles.srOnly}>Row actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isEditing = editId === r.id;
                return (
                  <tr key={r.id}>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      {isEditing ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <input
                            type="number"
                            value={edit.season_start}
                            onChange={(e) => setEdit((p) => ({ ...p, season_start: e.target.value }))}
                            style={{ ...styles.careerInput, borderColor: editErrors.season_start ? '#b00' : '#E0E0E0' }}
                          />
                          <input
                            type="number"
                            value={edit.season_end}
                            onChange={(e) => setEdit((p) => ({ ...p, season_end: e.target.value }))}
                            style={{ ...styles.careerInput, borderColor: editErrors.season_end ? '#b00' : '#E0E0E0' }}
                          />
                        </div>
                      ) : (
                        <SeasonCell start={r.season_start} end={r.season_end} />
                      )}
                      {(isEditing && (editErrors.season_start || editErrors.season_end)) && (
                        <div style={styles.error}>{editErrors.season_start || editErrors.season_end}</div>
                      )}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null), minWidth: 150 }}>
                      {isEditing ? (
                        <Select
                          options={sports}
                          value={sports.find(o => o.value === edit.sport) || null}
                          onChange={(opt) => setEdit((p) => ({ ...p, sport: opt?.value || '' }))}
                          styles={makeSelectStyles(false)}
                        />
                      ) : (r.sport || '-')}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      {isEditing ? (
                        <>
                          <input
                            value={edit.team_name}
                            onChange={(e) => setEdit((p) => ({ ...p, team_name: e.target.value }))}
                            style={{ ...styles.careerInput, borderColor: editErrors.team_name ? '#b00' : '#E0E0E0' }}
                          />
                          {editErrors.team_name && <div style={styles.error}>{editErrors.team_name}</div>}
                        </>
                      ) : (r.team_name || '-')}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      {isEditing ? (
                        <>
                          <input
                            value={edit.role}
                            onChange={(e) => setEdit((p) => ({ ...p, role: e.target.value }))}
                            style={{ ...styles.careerInput, borderColor: editErrors.role ? '#b00' : '#E0E0E0' }}
                          />
                          {editErrors.role && <div style={styles.error}>{editErrors.role}</div>}
                        </>
                      ) : (r.role || '-')}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      {isEditing ? (
                        <>
                          <input
                            value={edit.category}
                            onChange={(e) => setEdit((p) => ({ ...p, category: e.target.value }))}
                            style={{ ...styles.careerInput, borderColor: editErrors.category ? '#b00' : '#E0E0E0' }}
                          />
                          {editErrors.category && <div style={styles.error}>{editErrors.category}</div>}
                        </>
                      ) : (r.category || '-')}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      {isEditing ? (
                        <input
                          value={edit.league}
                          onChange={(e) => setEdit((p) => ({ ...p, league: e.target.value }))}
                          style={styles.careerInput}
                        />
                      ) : (r.league || '-')}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null), textAlign: 'center' }}>
                      {isEditing ? (
                        <input
                          type="checkbox"
                          aria-label="Current season"
                          checked={!!edit.is_current}
                          onChange={(e) => setEdit((p) => ({ ...p, is_current: e.target.checked }))}
                        />
                      ) : (
                        r.is_current ? 'Yes' : '—'
                      )}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null), textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!isEditing ? (
                        <div style={styles.tableActions}>
                          <button
                            type="button"
                            style={styles.iconBtn}
                            onClick={() => onEdit(r)}
                            disabled={rowBusy === r.id}
                            aria-label="Edit season"
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            style={{ ...styles.iconBtn, color: '#b00' }}
                            onClick={() => onDelete(r.id)}
                            disabled={rowBusy === r.id}
                            aria-label="Delete season"
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button type="button" style={styles.linkBtn} onClick={() => onEditSave(r.id)} disabled={rowBusy === r.id}>Save</button>
                          <span style={{ margin: '0 6px' }}>|</span>
                          <button type="button" style={styles.linkBtn} onClick={onEditCancel} disabled={rowBusy === r.id}>Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>
            {rows.map((r) => (
              <SeasonAccordionItem
                key={r.id}
                row={r}
                isOpen={openId === r.id}
                isEditing={editId === r.id}
                toggle={() => toggleSeason(r.id)}
                onEdit={() => onEdit(r)}
                onEditSave={() => onEditSave(r.id)}
                onEditCancel={onEditCancel}
                onDelete={() => onDelete(r.id)}
                edit={edit}
                setEdit={setEdit}
                editErrors={editErrors}
                selectStyles={selectStyles}
                styles={styles}
                busy={rowBusy === r.id}
              />
            ))}
          </div>
        )}
      </div>

      {cStatus.msg && (
        <div style={{
          marginTop: 8,
          fontWeight: 600,
          color: cStatus.type === 'error' ? '#b00' : '#2E7D32',
          display: 'inline-flex',
          alignItems: 'center'
        }}>
          {cStatus.msg}
        </div>
      )}
    </div>
  );
}

// ----------------------- STYLES (identici / armonizzati) -----------------------
const baseLinkBtn = {
  background: 'transparent',
  border: 'none',
  color: '#1976d2',
  cursor: 'pointer',
  fontWeight: 600,
};

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
  },
  gridMobile: { gridTemplateColumns: '1fr' },

  field: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: 600 },
  sublabel: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 },

  input: {
    height: 42,
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF',
    width: '100%',
    boxSizing: 'border-box',
  },
  careerInput: {
    height: 38,
    padding: '8px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF',
    width: '100%',
    boxSizing: 'border-box',
  },
  error: { fontSize: 12, color: '#b00' },

  // Save bar unificata
  saveBar: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
  },
  saveBarMobile: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'stretch',
    gap: 10,
    paddingTop: 12,
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
  saveBtn: { height: 38, padding: '0 16px', borderRadius: 8, fontWeight: 600, border: 'none' },
  saveBtnEnabled: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', cursor: 'pointer' },
  saveBtnDisabled: { background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed' },

  // Career widget
  smallBtn: {
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #E0E0E0',
    background: '#FFF',
    cursor: 'pointer',
    fontWeight: 600,
  },
  smallBtnPrimary: {
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  linkBtn: {
    ...baseLinkBtn,
    padding: 0,
  },
  iconBtn: {
    ...baseLinkBtn,
    padding: 4,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    lineHeight: 1,
  },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #EEE',
    borderRadius: 10,
    background: '#FFF',
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
  th: {
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 700,
    padding: '10px 12px',
    borderBottom: '1px solid #EEE',
    whiteSpace: 'nowrap',
  },
  thRight: { textAlign: 'right', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE' },
  thMobile: { padding: '12px 20px', minWidth: 180 },
  td: {
    fontSize: 14,
    padding: '10px 12px',
    borderBottom: '1px solid #F5F5F5',
    verticalAlign: 'top',
  },
  tdMobile: { padding: '12px 20px', minWidth: 180 },

  careerForm: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    margin: '12px 0',
    padding: 12,
    border: '1px dashed #E0E0E0',
    borderRadius: 10,
    background: '#FAFAFA',
  },
  careerFormMobile: {
    gridTemplateColumns: '1fr',
  },

  // Mobile season accordion
  seasonCard: {
    border: '1px solid #EEE',
    borderRadius: 12,
    marginBottom: 8,
    background: '#FFF',
  },
  seasonSummary: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    minHeight: 56,
  },
  seasonText: { fontSize: 16, fontWeight: 600, color: '#111827' },
  pill: { borderRadius: 999, padding: '2px 8px', fontSize: 12, marginLeft: 8 },
  pillSport: { background: '#F3F4F6', color: '#111827' },
  pillCurrent: { background: '#E8F7EE', color: '#111827' },
  teamText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginLeft: 8,
  },
  chevron: { width: 16, height: 16, transition: 'transform 0.2s', flexShrink: 0 },
  seasonDetails: {
    padding: 12,
    borderTop: '1px solid #EEE',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  seasonDetailRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  seasonLabel: { fontSize: 12, color: '#6B7280' },
  seasonValue: { fontSize: 14, color: '#111827' },
  tableActions: { display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' },
  seasonActions: { display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
};

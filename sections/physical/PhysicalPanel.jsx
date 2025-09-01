// sections/physical/PhysicalPanel.jsx
// @ts-check
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase as sb } from '../../utils/supabaseClient';

const supabase = sb;
const PHYSICAL_TABLE = 'physical_data';

// Nessun campo obbligatorio in questa card (richiesta utente)
const REQUIRED = []; 

// Opzioni laterality coerenti e multi-sport
const LATERALITY = [
  { value: '', label: '—' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'ambi', label: 'Ambidextrous' },
  { value: 'unknown', label: 'Unknown' },
];

// Messaggi errore base
const MSG = {
  range: (label, min, max, unit = '') => `${label}: value must be between ${min} and ${max}${unit ? ' ' + unit : ''}`,
  gt0: (label) => `${label}: value must be > 0`,
  notFuture: (label) => `${label}: cannot be in the future`,
};

export default function PhysicalPanel({ athlete, onSaved, isMobile: isMobileProp }) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(!!isMobileProp);
  const today = new Date();
  const todayISO = toISO(today);

  // Stato UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [dirty, setDirty] = useState(false);

  // Record target (uno per atleta). Se non esiste -> insert, altrimenti update
  const [rowId, setRowId] = useState(null);

  // Form state: tutti i campi della tabella physical_data
  const [form, setForm] = useState({
    physical_measured_at: '',
    height_cm: '',
    weight_kg: '',
    wingspan_cm: '',
    standing_reach_cm: '',
    body_fat_percent: '',
    dominant_hand: '',
    dominant_foot: '',
    dominant_eye: '',
    physical_notes: '',

    performance_measured_at: '',
    grip_strength_left_kg: '',
    grip_strength_right_kg: '',
    vertical_jump_cmj_cm: '',
    standing_long_jump_cm: '',
    sprint_10m_s: '',
    sprint_20m_s: '',
    pro_agility_5_10_5_s: '',
    sit_and_reach_cm: '',
    plank_hold_s: '',
    cooper_12min_m: '',
    performance_notes: '',
  });

  // Errori per campo (stile identico alle altre card)
  const [errors, setErrors] = useState({});

  // Detect mobile (>= coerenza con PersonalPanel)
  useEffect(() => {
    if (isMobileProp != null) return; // se passato dal parent, rispettiamo
    const check = () =>
      setIsMobile(typeof window !== 'undefined' && window.matchMedia('(max-width: 480px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [isMobileProp]);

  // Guard su cambi non salvati (coerente con PersonalPanel/SportInfoPanel)
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

  // Prefill: carichiamo l’ultima riga physical_data dell’atleta (se esiste)
  useEffect(() => {
    if (!athlete?.id) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from(PHYSICAL_TABLE)
          .select('*')
          .eq('athlete_id', athlete.id)
          .order('id', { ascending: false })
          .limit(1);

        if (error) throw error;
        const last = Array.isArray(data) && data[0];

        if (mounted && last) {
          setRowId(last.id);
          setForm({
            physical_measured_at: toISODate(last.physical_measured_at),
            height_cm: toStr(last.height_cm),
            weight_kg: toStr(last.weight_kg),
            wingspan_cm: toStr(last.wingspan_cm),
            standing_reach_cm: toStr(last.standing_reach_cm),
            body_fat_percent: toStr(last.body_fat_percent),
            dominant_hand: last.dominant_hand || '',
            dominant_foot: last.dominant_foot || '',
            dominant_eye: last.dominant_eye || '',
            physical_notes: last.physical_notes || '',

            performance_measured_at: toISODate(last.performance_measured_at),
            grip_strength_left_kg: toStr(last.grip_strength_left_kg),
            grip_strength_right_kg: toStr(last.grip_strength_right_kg),
            vertical_jump_cmj_cm: toStr(last.vertical_jump_cmj_cm),
            standing_long_jump_cm: toStr(last.standing_long_jump_cm),
            sprint_10m_s: toStr(last.sprint_10m_s),
            sprint_20m_s: toStr(last.sprint_20m_s),
            pro_agility_5_10_5_s: toStr(last.pro_agility_5_10_5_s),
            sit_and_reach_cm: toStr(last.sit_and_reach_cm),
            plank_hold_s: toStr(last.plank_hold_s),
            cooper_12min_m: toStr(last.cooper_12min_m),
            performance_notes: last.performance_notes || '',
          });
          setErrors({});
        }
      } catch (e) {
        console.error(e);
        setStatus({ type: 'error', msg: 'Load failed' });
      } finally {
        if (mounted) {
          setDirty(false);
          setLoading(false);
        }
      }
    })();

    return () => { mounted = false; };
  }, [athlete?.id]);

  // ---------- VALIDAZIONE (stile/flow identico alle altre card) ----------
  const validateField = (name, value) => {
    // Tutti opzionali: validiamo solo se valorizzati
    if (value === '' || value == null) return '';

    // Date: non nel futuro
    if (name === 'physical_measured_at' || name === 'performance_measured_at') {
      if (value > todayISO) return MSG.notFuture(labelOf(name));
      return '';
    }

    // Numerici con range plausibili
    const n = Number(value);
    if (Number.isNaN(n)) return ''; // lasciamo vuoti/strings non numerici silenziosi
    switch (name) {
      case 'height_cm': return inRange(n, 100, 250, 'cm', 'Height');
      case 'weight_kg': return inRange(n, 30, 200, 'kg', 'Weight');
      case 'wingspan_cm': return inRange(n, 100, 270, 'cm', 'Wingspan');
      case 'standing_reach_cm': return inRange(n, 100, 280, 'cm', 'Standing reach');
      case 'body_fat_percent': return inRange(n, 1, 60, '%', 'Body fat');

      case 'grip_strength_left_kg':
      case 'grip_strength_right_kg': return inRange(n, 5, 90, 'kg', 'Grip strength');

      case 'vertical_jump_cmj_cm': return inRange(n, 10, 100, 'cm', 'Vertical jump (CMJ)');
      case 'standing_long_jump_cm': return inRange(n, 50, 400, 'cm', 'Standing long jump');

      case 'sprint_10m_s': return inRange(n, 1, 10, 's', 'Sprint 10m');
      case 'sprint_20m_s': return inRange(n, 2, 15, 's', 'Sprint 20m');
      case 'pro_agility_5_10_5_s': return inRange(n, 2, 20, 's', 'Pro agility 5-10-5');

      case 'sit_and_reach_cm': return inRange(n, -10, 60, 'cm', 'Sit & reach');
      case 'plank_hold_s': return inRange(n, 5, 1800, 's', 'Plank hold');
      case 'cooper_12min_m': return inRange(n, 500, 4000, 'm', 'Cooper 12-min distance');

      default: return '';
    }
  };

  const validateAll = (state = form) => {
    const out = {};
    // Nessun required; applichiamo solo i controlli di range/formato
    for (const key of Object.keys(state)) {
      const err = validateField(key, state[key]);
      if (err) out[key] = err;
    }
    return out;
  };

  // ---------- HANDLERS ----------
  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  const onSave = async () => {
    if (isSaveDisabled) return;

    const newErrors = validateAll();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      const payload = {
        athlete_id: athlete.id,
        physical_measured_at: nullIfEmpty(form.physical_measured_at),

        height_cm: toNumOrNull(form.height_cm),
        weight_kg: toNumOrNull(form.weight_kg),
        wingspan_cm: toNumOrNull(form.wingspan_cm),
        standing_reach_cm: toIntOrNull(form.standing_reach_cm),
        body_fat_percent: toNumOrNull(form.body_fat_percent),
        dominant_hand: normStr(form.dominant_hand),
        dominant_foot: normStr(form.dominant_foot),
        dominant_eye: normStr(form.dominant_eye),
        physical_notes: normStr(form.physical_notes),

        performance_measured_at: nullIfEmpty(form.performance_measured_at),
        grip_strength_left_kg: toNumOrNull(form.grip_strength_left_kg),
        grip_strength_right_kg: toNumOrNull(form.grip_strength_right_kg),
        vertical_jump_cmj_cm: toIntOrNull(form.vertical_jump_cmj_cm),
        standing_long_jump_cm: toIntOrNull(form.standing_long_jump_cm),
        sprint_10m_s: toNumOrNull(form.sprint_10m_s),
        sprint_20m_s: toNumOrNull(form.sprint_20m_s),
        pro_agility_5_10_5_s: toNumOrNull(form.pro_agility_5_10_5_s),
        sit_and_reach_cm: toIntOrNull(form.sit_and_reach_cm),
        plank_hold_s: toIntOrNull(form.plank_hold_s),
        cooper_12min_m: toIntOrNull(form.cooper_12min_m),
        performance_notes: normStr(form.performance_notes),
      };

      if (rowId) {
        const { error, data } = await supabase
          .from(PHYSICAL_TABLE)
          .update(payload)
          .eq('id', rowId)
          .select()
          .single();
        if (error) throw error;
        setRowId(data?.id || rowId);
      } else {
        const { error, data } = await supabase
          .from(PHYSICAL_TABLE)
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        setRowId(data?.id || null);
      }

      setDirty(false);
      setStatus({ type: 'success', msg: 'Saved ✓' });

      // callback parent (coerenza con SportInfoPanel)
      if (onSaved) {
        const { data: fresh } = await supabase
          .from('athlete')
          .select('*')
          .eq('id', athlete.id)
          .single();
        onSaved(fresh || null);
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const allRequiredFilled = useMemo(() => {
    for (const k of REQUIRED) {
      const v = form[k];
      const err = validateField(k, v);
      if (err) return false;
      const isEmpty = v == null || String(v).trim() === '';
      if (isEmpty) return false;
    }
    return true;
  }, [form]);

  const hasErrors = useMemo(() => Object.values(errors).some(Boolean), [errors]);
  const isSaveDisabled = saving || !dirty || hasErrors || !allRequiredFilled;

  const saveBtnStyle = isSaveDisabled
    ? { ...styles.saveBtn, ...styles.saveBtnDisabled }
    : { ...styles.saveBtn, ...styles.saveBtnEnabled };

  // ---------- RENDER ----------
  if (loading) return <div style={{ padding: 8, color: '#666' }}>Loading…</div>;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(); }}
      style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : null) }}
    >
      {/* ----- SNAPSHOT FISICO ----- */}
      <SectionTitle title="Physical snapshot" />
      <DateField
        label="Measurement date"
        name="physical_measured_at"
        value={form.physical_measured_at}
        max={todayISO}
        onChange={(v) => setField('physical_measured_at', v)}
        error={errors.physical_measured_at}
        help="Date of the physical measurements (height/weight/etc.). Not in the future."
      />

      <NumberField
        label="Height (cm)"
        name="height_cm"
        value={form.height_cm}
        onChange={(v) => setField('height_cm', v)}
        error={errors.height_cm}
        step="0.1"
        placeholder="e.g., 185.0"
        help="Height without shoes, in centimeters."
      />
      <NumberField
        label="Weight (kg)"
        name="weight_kg"
        value={form.weight_kg}
        onChange={(v) => setField('weight_kg', v)}
        error={errors.weight_kg}
        step="0.1"
        placeholder="e.g., 78.5"
        help="Body weight in kilograms."
      />
      <NumberField
        label="Wingspan / Arm span (cm)"
        name="wingspan_cm"
        value={form.wingspan_cm}
        onChange={(v) => setField('wingspan_cm', v)}
        error={errors.wingspan_cm}
        step="0.1"
        placeholder="e.g., 190.0"
        help="Fingertip-to-fingertip reach with arms extended horizontally."
      />
      <NumberField
        label="Standing reach (cm)"
        name="standing_reach_cm"
        value={form.standing_reach_cm}
        onChange={(v) => setField('standing_reach_cm', v)}
        error={errors.standing_reach_cm}
        step="1"
        placeholder="e.g., 240"
        help="Maximum overhead reach while standing, heels on floor."
      />
      <NumberField
        label="Body fat (%)"
        name="body_fat_percent"
        value={form.body_fat_percent}
        onChange={(v) => setField('body_fat_percent', v)}
        error={errors.body_fat_percent}
        step="0.1"
        placeholder="e.g., 12.5"
        help="If available. Indicate the measurement method in notes."
      />

      <SelectInline
        label="Dominant hand"
        name="dominant_hand"
        value={form.dominant_hand}
        onChange={(v) => setField('dominant_hand', v)}
        options={LATERALITY}
        error={errors.dominant_hand}
        help="Preferred hand in sport-specific or daily tasks."
      />
      <SelectInline
        label="Dominant foot"
        name="dominant_foot"
        value={form.dominant_foot}
        onChange={(v) => setField('dominant_foot', v)}
        options={LATERALITY}
        error={errors.dominant_foot}
        help="Preferred foot for kicking, pushing off, balance."
      />
      <SelectInline
        label="Dominant eye"
        name="dominant_eye"
        value={form.dominant_eye}
        onChange={(v) => setField('dominant_eye', v)}
        options={LATERALITY}
        error={errors.dominant_eye}
        help="Eye dominance (useful for precision/aim sports)."
      />

      <TextField
        label="Notes"
        name="physical_notes"
        value={form.physical_notes}
        onChange={(v) => setField('physical_notes', v)}
        error={errors.physical_notes}
        placeholder="Method, device/model, conditions (optional)…"
        help="Add method (e.g., BIA / skinfold), device, conditions (rested, indoor…)."
        multiline
      />

      {/* ----- PERFORMANCE TEST ----- */}
      <SectionTitle title="Performance tests" />

      <DateField
        label="Test date"
        name="performance_measured_at"
        value={form.performance_measured_at}
        max={todayISO}
        onChange={(v) => setField('performance_measured_at', v)}
        error={errors.performance_measured_at}
        help="Date of the performance tests (sprint, jump, etc.). Not in the future."
      />

      {/* Forza/Esplosività */}
      <NumberField
        label="Grip strength L (kg)"
        name="grip_strength_left_kg"
        value={form.grip_strength_left_kg}
        onChange={(v) => setField('grip_strength_left_kg', v)}
        error={errors.grip_strength_left_kg}
        step="0.1"
        placeholder="e.g., 44.0"
        help="Best of 2 attempts with dynamometer, left hand."
      />
      <NumberField
        label="Grip strength R (kg)"
        name="grip_strength_right_kg"
        value={form.grip_strength_right_kg}
        onChange={(v) => setField('grip_strength_right_kg', v)}
        error={errors.grip_strength_right_kg}
        step="0.1"
        placeholder="e.g., 46.0"
        help="Best of 2 attempts with dynamometer, right hand."
      />
      <NumberField
        label="Vertical jump (CMJ) (cm)"
        name="vertical_jump_cmj_cm"
        value={form.vertical_jump_cmj_cm}
        onChange={(v) => setField('vertical_jump_cmj_cm', v)}
        error={errors.vertical_jump_cmj_cm}
        step="1"
        placeholder="e.g., 38"
        help="Countermovement jump height in centimeters."
      />
      <NumberField
        label="Standing long jump (cm)"
        name="standing_long_jump_cm"
        value={form.standing_long_jump_cm}
        onChange={(v) => setField('standing_long_jump_cm', v)}
        error={errors.standing_long_jump_cm}
        step="1"
        placeholder="e.g., 240"
        help="Two-feet standing broad jump distance."
      />

      {/* Velocità/Agilità */}
      <NumberField
        label="Sprint 10 m (s)"
        name="sprint_10m_s"
        value={form.sprint_10m_s}
        onChange={(v) => setField('sprint_10m_s', v)}
        error={errors.sprint_10m_s}
        step="0.001"
        placeholder="e.g., 1.850"
        help="Time for 10 meters. Use seconds with 3 decimals."
      />
      <NumberField
        label="Sprint 20 m (s)"
        name="sprint_20m_s"
        value={form.sprint_20m_s}
        onChange={(v) => setField('sprint_20m_s', v)}
        error={errors.sprint_20m_s}
        step="0.001"
        placeholder="e.g., 3.250"
        help="Time for 20 meters. Seconds with 3 decimals."
      />
      <NumberField
        label="Pro agility 5–10–5 (s)"
        name="pro_agility_5_10_5_s"
        value={form.pro_agility_5_10_5_s}
        onChange={(v) => setField('pro_agility_5_10_5_s', v)}
        error={errors.pro_agility_5_10_5_s}
        step="0.001"
        placeholder="e.g., 4.400"
        help="Standard shuttle run 5–10–5 seconds."
      />

      {/* Mobilità/Core/Endurance */}
      <NumberField
        label="Sit & reach (cm)"
        name="sit_and_reach_cm"
        value={form.sit_and_reach_cm}
        onChange={(v) => setField('sit_and_reach_cm', v)}
        error={errors.sit_and_reach_cm}
        step="1"
        placeholder="e.g., 25"
        help="Flexibility test (may be negative if below 0)."
      />
      <NumberField
        label="Plank hold (s)"
        name="plank_hold_s"
        value={form.plank_hold_s}
        onChange={(v) => setField('plank_hold_s', v)}
        error={errors.plank_hold_s}
        step="1"
        placeholder="e.g., 120"
        help="Maximum front plank time in seconds."
      />
      <NumberField
        label="Cooper 12’ (m)"
        name="cooper_12min_m"
        value={form.cooper_12min_m}
        onChange={(v) => setField('cooper_12min_m', v)}
        error={errors.cooper_12min_m}
        step="1"
        placeholder="e.g., 2700"
        help="Total distance covered in 12 minutes, in meters."
      />

      <TextField
        label="Notes"
        name="performance_notes"
        value={form.performance_notes}
        onChange={(v) => setField('performance_notes', v)}
        error={errors.performance_notes}
        placeholder="Protocol, device, surface, footwear, attempt count…"
        help="Add protocol, device/model, surface, footwear, rested/fatigued, attempts."
        multiline
      />

      {/* SAVE BAR (posizione, stile e messaggi coerenti) */}
      <div style={isMobile ? styles.saveBarMobile : styles.saveBar}>
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

/* -------------------- CAMPI UI -------------------- */

function SectionTitle({ title }) {
  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 4, marginBottom: -4 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
    </div>
  );
}

function DateField({ label, name, value, onChange, error, help, min, max }) {
  return (
    <div style={styles.field}>
      <LabelWithHelp label={label} help={help} />
      <input
        type="date"
        name={name}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        style={{ ...styles.input, borderColor: error ? '#b00' : '#E0E0E0' }}
        aria-invalid={!!error}
      />
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

function NumberField({ label, name, value, onChange, error, help, step = '1', placeholder }) {
  return (
    <div style={styles.field}>
      <LabelWithHelp label={label} help={help} />
      <input
        type="number"
        name={name}
        value={value}
        placeholder={placeholder}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...styles.input, borderColor: error ? '#b00' : '#E0E0E0' }}
        aria-invalid={!!error}
      />
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

function TextField({ label, name, value, onChange, error, help, placeholder, multiline = false }) {
  return (
    <div style={styles.field}>
      <LabelWithHelp label={label} help={help} />
      {multiline ? (
        <textarea
          name={name}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...styles.input, height: 'auto', paddingTop: 10, paddingBottom: 10 }}
          aria-invalid={!!error}
        />
      ) : (
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...styles.input, borderColor: error ? '#b00' : '#E0E0E0' }}
          aria-invalid={!!error}
        />
      )}
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

function SelectInline({ label, name, value, onChange, error, options, help }) {
  return (
    <div style={styles.field}>
      <LabelWithHelp label={label} help={help} />
      <div style={{ position: 'relative' }}>
        <select
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...styles.select, borderColor: error ? '#b00' : '#E0E0E0' }}
          aria-invalid={!!error}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

/* -------------------- HELP (?) -------------------- */

function LabelWithHelp({ label, help }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }} ref={ref}>
      <label style={{ ...styles.label, flex: 1 }}>{label}</label>
      <button
        type="button"
        aria-label={`Help for ${label}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)} // mobile toggle
        style={{ ...styles.helpBtn, marginLeft: 8 }}
      >
        ?
      </button>
      {open && help && (
        <div role="tooltip" style={styles.helpBubble}>
          {help}
        </div>
      )}
    </div>
  );
}

/* -------------------- HELPERS -------------------- */

function toISO(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
function toISODate(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    return toISO(d);
  } catch { return ''; }
}
function toStr(v) {
  return (v === null || v === undefined) ? '' : String(v);
}
function normStr(v) {
  const s = (v ?? '').toString().trim();
  return s === '' ? null : s;
}
function nullIfEmpty(v) {
  const s = (v ?? '').toString().trim();
  return s === '' ? null : s;
}
function toNumOrNull(v) {
  const s = (v ?? '').toString().trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}
function toIntOrNull(v) {
  const s = (v ?? '').toString().trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : Math.trunc(n);
}
function labelOf(name) {
  const map = {
    physical_measured_at: 'Measurement date',
    performance_measured_at: 'Test date',
  };
  return map[name] || name;
}
function inRange(n, min, max, unit, label) {
  if (n < min || n > max) return MSG.range(label, min, max, unit);
  return '';
}

/* -------------------- STYLES (coerenti con le altre card) -------------------- */
const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
  },
  gridMobile: { gridTemplateColumns: '1fr' },

  field: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },

  input: {
    height: 42,
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF',
  },
  select: {
    height: 42,
    width: '100%',
    padding: '0 10px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF',
    appearance: 'menulist',
  },
  error: { fontSize: 12, color: '#b00' },

  // Save bar (identica per posizionamento e look)
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

  // Help (?)
  helpBtn: {
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: '1px solid #E0E0E0',
    background: '#FFF',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    padding: 0,
    color: '#333',
    flexShrink: 0,
  },
  helpBubble: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    background: '#FFF',
    border: '1px solid #EEE',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    padding: '8px 10px',
    fontSize: 12,
    color: '#333',
    maxWidth: 360,
    zIndex: 5,
  },
};

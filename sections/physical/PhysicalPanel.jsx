// sections/physical/PhysicalPanel.jsx
// @ts-check
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase as sb } from '../../utils/supabaseClient';

const supabase = sb;
const PHYSICAL_TABLE = 'physical_data';

// Nessun campo obbligatorio in questa card (richiesta utente)
const REQUIRED = []; 

// Opzioni laterality coerenti e multi-sport
const SUPABASE_LATERALITY = ['Left', 'Right', 'Ambidextrous', 'Unknown'];
const LATERALITY = [
  { value: '', label: '—' },
  ...SUPABASE_LATERALITY.map((value) => ({ value, label: value })),
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
            dominant_hand: lateralityForForm(last.dominant_hand),
            dominant_foot: lateralityForForm(last.dominant_foot),
            dominant_eye: lateralityForForm(last.dominant_eye),
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
    const n = parseDecimalFromUI(value);
    if (n == null) return '';
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
        dominant_hand: lateralityForPayload(form.dominant_hand),
        dominant_foot: lateralityForPayload(form.dominant_foot),
        dominant_eye: lateralityForPayload(form.dominant_eye),
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
      />

      <NumberField
        label="Height (cm, use comma)"
        name="height_cm"
        value={form.height_cm}
        onChange={(v) => setField('height_cm', v)}
        error={errors.height_cm}
        step="0.1"
        placeholder="e.g. 185,0 (use comma)"
      />
      <NumberField
        label="Weight (kg, use comma)"
        name="weight_kg"
        value={form.weight_kg}
        onChange={(v) => setField('weight_kg', v)}
        error={errors.weight_kg}
        step="0.1"
        placeholder="e.g. 78,5 (use comma)"
      />
      <NumberField
        label="Wingspan / Arm span (cm, use comma)"
        name="wingspan_cm"
        value={form.wingspan_cm}
        onChange={(v) => setField('wingspan_cm', v)}
        error={errors.wingspan_cm}
        step="0.1"
        placeholder="e.g. 190,0 (use comma)"
      />
      <NumberField
        label="Standing reach (cm, use comma)"
        name="standing_reach_cm"
        value={form.standing_reach_cm}
        onChange={(v) => setField('standing_reach_cm', v)}
        error={errors.standing_reach_cm}
        step="1"
        placeholder="e.g. 240 (use comma for decimals)"
      />
      <NumberField
        label="Body fat (%, use comma)"
        name="body_fat_percent"
        value={form.body_fat_percent}
        onChange={(v) => setField('body_fat_percent', v)}
        error={errors.body_fat_percent}
        step="0.1"
        placeholder="e.g. 12,5 (use comma)"
      />

      <SelectInline
        label="Dominant hand"
        name="dominant_hand"
        value={form.dominant_hand}
        onChange={(v) => setField('dominant_hand', v)}
        options={LATERALITY}
        error={errors.dominant_hand}
      />
      <SelectInline
        label="Dominant foot"
        name="dominant_foot"
        value={form.dominant_foot}
        onChange={(v) => setField('dominant_foot', v)}
        options={LATERALITY}
        error={errors.dominant_foot}
      />
      <SelectInline
        label="Dominant eye"
        name="dominant_eye"
        value={form.dominant_eye}
        onChange={(v) => setField('dominant_eye', v)}
        options={LATERALITY}
        error={errors.dominant_eye}
      />

      <TextField
        label="Notes"
        name="physical_notes"
        value={form.physical_notes}
        onChange={(v) => setField('physical_notes', v)}
        error={errors.physical_notes}
        placeholder="Method, device/model, conditions (optional)…"
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
      />

      {/* Forza/Esplosività */}
      <NumberField
        label="Grip strength L (kg, use comma)"
        name="grip_strength_left_kg"
        value={form.grip_strength_left_kg}
        onChange={(v) => setField('grip_strength_left_kg', v)}
        error={errors.grip_strength_left_kg}
        step="0.1"
        placeholder="e.g. 44,0 (use comma)"
      />
      <NumberField
        label="Grip strength R (kg, use comma)"
        name="grip_strength_right_kg"
        value={form.grip_strength_right_kg}
        onChange={(v) => setField('grip_strength_right_kg', v)}
        error={errors.grip_strength_right_kg}
        step="0.1"
        placeholder="e.g. 46,0 (use comma)"
      />
      <NumberField
        label="Vertical jump (CMJ) (cm, use comma)"
        name="vertical_jump_cmj_cm"
        value={form.vertical_jump_cmj_cm}
        onChange={(v) => setField('vertical_jump_cmj_cm', v)}
        error={errors.vertical_jump_cmj_cm}
        step="1"
        placeholder="e.g. 38 (use comma for decimals)"
      />
      <NumberField
        label="Standing long jump (cm, use comma)"
        name="standing_long_jump_cm"
        value={form.standing_long_jump_cm}
        onChange={(v) => setField('standing_long_jump_cm', v)}
        error={errors.standing_long_jump_cm}
        step="1"
        placeholder="e.g. 240 (use comma for decimals)"
      />

      {/* Velocità/Agilità */}
      <NumberField
        label="Sprint 10 m (s, use comma)"
        name="sprint_10m_s"
        value={form.sprint_10m_s}
        onChange={(v) => setField('sprint_10m_s', v)}
        error={errors.sprint_10m_s}
        step="0.001"
        placeholder="e.g. 1,850 (use comma)"
      />
      <NumberField
        label="Sprint 20 m (s, use comma)"
        name="sprint_20m_s"
        value={form.sprint_20m_s}
        onChange={(v) => setField('sprint_20m_s', v)}
        error={errors.sprint_20m_s}
        step="0.001"
        placeholder="e.g. 3,250 (use comma)"
      />
      <NumberField
        label="Pro agility 5–10–5 (s, use comma)"
        name="pro_agility_5_10_5_s"
        value={form.pro_agility_5_10_5_s}
        onChange={(v) => setField('pro_agility_5_10_5_s', v)}
        error={errors.pro_agility_5_10_5_s}
        step="0.001"
        placeholder="e.g. 4,400 (use comma)"
      />

      {/* Mobilità/Core/Endurance */}
      <NumberField
        label="Sit & reach (cm, use comma)"
        name="sit_and_reach_cm"
        value={form.sit_and_reach_cm}
        onChange={(v) => setField('sit_and_reach_cm', v)}
        error={errors.sit_and_reach_cm}
        step="1"
        placeholder="e.g. 25 (use comma for decimals)"
      />
      <NumberField
        label="Plank hold (s, use comma)"
        name="plank_hold_s"
        value={form.plank_hold_s}
        onChange={(v) => setField('plank_hold_s', v)}
        error={errors.plank_hold_s}
        step="1"
        placeholder="e.g. 120 (use comma for decimals)"
      />
      <NumberField
        label="Cooper 12’ (m, use comma)"
        name="cooper_12min_m"
        value={form.cooper_12min_m}
        onChange={(v) => setField('cooper_12min_m', v)}
        error={errors.cooper_12min_m}
        step="1"
        placeholder="e.g. 2700 (use comma for decimals)"
      />

      <TextField
        label="Notes"
        name="performance_notes"
        value={form.performance_notes}
        onChange={(v) => setField('performance_notes', v)}
        error={errors.performance_notes}
        placeholder="Protocol, device, surface, footwear, attempt count…"
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

function DateField({ label, name, value, onChange, error, min, max }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
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

function NumberField({ label, name, value, onChange, error, step = '1', placeholder }) {
  const handleChange = (e) => {
    const normalized = normalizeDecimalInput(e.target.value);
    onChange(normalized);
  };

  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      <input
        type="text"
        inputMode="decimal"
        name={name}
        value={value == null ? '' : String(value)}
        placeholder={placeholder}
        data-step={step}
        onChange={handleChange}
        style={{ ...styles.input, borderColor: error ? '#b00' : '#E0E0E0' }}
        aria-invalid={!!error}
      />
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

function TextField({ label, name, value, onChange, error, placeholder, multiline = false }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
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

function SelectInline({ label, name, value, onChange, error, options }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
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
  return formatDecimalForUI(v);
}
function lateralityForForm(v) {
  return normalizeLateralityValue(v) || '';
}
function lateralityForPayload(v) {
  const normalized = normalizeLateralityValue(v);
  return normalized || null;
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
  const n = parseDecimalFromUI(v);
  return n == null ? null : n;
}
function toIntOrNull(v) {
  const n = parseDecimalFromUI(v);
  return n == null ? null : Math.trunc(n);
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

function formatDecimalForUI(value) {
  const normalized = normalizeDecimalInput(value);
  return normalized;
}

function parseDecimalFromUI(value) {
  const normalized = normalizeDecimalInput(value);
  if (normalized === '' || normalized === '-') return null;
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDecimalInput(value) {
  if (value === null || value === undefined) return '';
  let s = value.toString();
  if (s === '') return '';
  s = s.replace(/\s+/g, '');
  s = s.replace(/\./g, ',');
  s = s.replace(/[^0-9,-]/g, '');

  let sign = '';
  if (s.startsWith('-')) {
    sign = '-';
    s = s.slice(1);
  }
  s = s.replace(/-/g, '');

  const hadComma = s.includes(',');
  let parts = s.split(',');
  if (parts.length > 2) {
    parts = [parts[0], parts.slice(1).join('')];
  }
  let integerPart = parts[0] || '';
  let decimalPart = parts[1] || '';

  if (!hadComma && integerPart === '' && sign) {
    return '-';
  }
  if (!hadComma && integerPart === '') {
    return '';
  }

  if (hadComma && integerPart === '') {
    integerPart = '0';
  }

  let result = sign + integerPart;
  if (hadComma) {
    result += ',';
    result += decimalPart;
  }

  return result;
}

function normalizeLateralityValue(value) {
  const raw = (value ?? '').toString().trim();
  if (raw === '') return '';

  const direct = SUPABASE_LATERALITY.find((opt) => opt.toLowerCase() === raw.toLowerCase());
  if (direct) return direct;

  const lower = raw.toLowerCase();
  if (lower === 'l' || lower.startsWith('left')) return 'Left';
  if (lower === 'r' || lower.startsWith('right')) return 'Right';
  if (
    lower === 'ambi' ||
    lower.startsWith('ambi') ||
    lower === 'both' ||
    lower === 'either'
  ) {
    return 'Ambidextrous';
  }
  if (
    lower === 'unknown' ||
    lower === 'unk' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === 'none' ||
    lower === 'unspecified'
  ) {
    return 'Unknown';
  }

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

};

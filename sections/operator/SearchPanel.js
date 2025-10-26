'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { supabase } from '../../utils/supabaseClient';
import countries from '../../utils/countries';
import sports from '../../utils/sports';
import { flagFromCountry } from '../../utils/flags';

/* -------------------- Costanti -------------------- */
const CONTRACT_STATUS = [
  { value: 'free_agent',     label: 'Free agent' },
  { value: 'under_contract', label: 'Under contract' },
  { value: 'on_loan',        label: 'On loan' },
];

const pageSize = 12;

/* -------------------- Helper date/età -------------------- */
const toISO = (d) => d.toISOString().slice(0, 10);
const addYears = (date, years) => { const d = new Date(date); d.setFullYear(d.getFullYear() + years); return d; };
const dobBoundsForAgeEq  = (age) => { const today = new Date(); const maxDOB = addYears(today, -age); const minDOB = new Date(addYears(today, -age - 1)); minDOB.setDate(minDOB.getDate() + 1); return { min: toISO(minDOB), max: toISO(maxDOB) }; };
const dobBoundForAgeGte  = (age) => toISO(addYears(new Date(), -age));           // DOB <= this
const dobBoundForAgeLte  = (age) => { const min = addYears(new Date(), -age - 1); min.setDate(min.getDate() + 1); return toISO(min); }; // DOB >= this

/* -------------------- Helper pattern sport -------------------- */
const buildSportPattern = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const escaped = normalized.replace(/[%_]/g, '\\$&');
  return `%${escaped}%`; // ILIKE + wildcard
};

/* -------------------- Debounce -------------------- */
function useDebouncedEffect(fn, deps, delay = 250) {
  useEffect(() => { const id = setTimeout(() => fn?.(), delay); return () => clearTimeout(id); /* eslint-disable-next-line */ }, deps);
}

/* -------------------- Stili (come i tuoi) -------------------- */
const styles = {
  page: { minHeight: '100vh', padding: 'clamp(2rem, 5vw, 4rem) clamp(1.5rem, 5vw, 4rem)', background: 'radial-gradient(circle at top left, rgba(39, 227, 218, 0.35), transparent 55%), radial-gradient(circle at bottom right, rgba(247, 184, 78, 0.35), transparent 52%), radial-gradient(circle at 20% 80%, rgba(249, 115, 22, 0.22), transparent 62%), #f8fafc', color: '#0f172a' },
  stageCard: { background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(39,227,218,0.16), rgba(249,115,22,0.18))', border: '1px solid rgba(249,115,22,0.22)', borderRadius: 28, padding: 'clamp(1.75rem, 4vw, 2.5rem)', boxShadow: '0 35px 90px -60px rgba(249,115,22,0.35)', maxWidth: 1180, margin: '0 auto' },
  bigLabel: { fontSize: 'clamp(2rem, 4vw, 2.65rem)', fontWeight: 700, margin: 0, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0f172a' },
  sub: { margin: '.5rem 0 1rem', color: '#0f172a', fontWeight: 500, fontSize: '1rem', maxWidth: 360 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  btn: { height: 44, padding: '0 16px', borderRadius: 10, fontWeight: 700, border: 'none', background: 'linear-gradient(100deg, #1dd6cb 0%, #f97316 48%, #facc15 100%)', color: '#0f172a', boxShadow: '0 12px 30px -18px rgba(249,115,22,0.55)', cursor: 'pointer' },
  btnGhost: { height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', color: '#0f172a', fontWeight: 600, cursor: 'pointer' },
  warn: { color: '#b45309', background: 'rgba(250,204,21,0.15)', border: '1px solid rgba(250,204,21,0.35)', padding: 10, borderRadius: 10 },
  layout: { display: 'grid', gap: 'clamp(1.5rem, 4vw, 2.75rem)', gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)', maxWidth: 1180, margin: '0 auto' },
  filters: { display: 'grid', gap: 16, position: 'sticky', top: 16, alignSelf: 'start' },
  topRow: { display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', margin: '0 auto clamp(1.2rem, 2.4vw, 1.8rem)', maxWidth: 1180 },
  sportRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  resultsIntro: { display: 'grid', gap: 4, alignItems: 'start', minWidth: 0 },
  resultsCount: { marginLeft: 8, fontSize: '1rem', fontWeight: 700, color: '#0f172a' },
  resultsStatus: { fontWeight: 600, color: '#0f172a' },
  filterCard: { background: 'linear-gradient(140deg, rgba(255,255,255,0.98), rgba(39,227,218,0.12), rgba(249,115,22,0.12))', border: '1px solid rgba(249,115,22,0.18)', borderRadius: 20, padding: '1.35rem', boxShadow: '0 28px 60px -44px rgba(249,115,22,0.32)', display: 'grid', gap: 12, backdropFilter: 'blur(18px)' },
  h2: { margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' },
  h3: { margin: 0, fontSize: '.95rem', color: '#475569', fontWeight: 600 },
  radioRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  results: { display: 'grid', gap: 16, minWidth: 0 },
  grid: {
    display: 'grid',
    gap: 'clamp(2rem, 4vw, 3rem)',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))',
    justifyItems: 'center',
  },
  card: {
    position: 'relative',
    borderRadius: 22,
    padding: 0,
    border: '1px solid rgba(15,23,42,0.06)',
    background: '#fff',
    boxShadow: '0 22px 45px -28px rgba(15,23,42,0.32)',
    width: '100%',
    maxWidth: 360,
  },
  cardInner: {
    background: '#fff',
    borderRadius: 22,
    padding: '1.5rem',
    display: 'grid',
    gap: 16,
    minHeight: '100%',
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 16 },
  avatarWrap: { position: 'relative', width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 12px 24px -18px rgba(15,23,42,0.6)', background: 'linear-gradient(135deg, rgba(39,227,218,0.25), rgba(15,23,42,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitials: { fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' },
  avatarFlag: { position: 'absolute', bottom: -2, right: -2, transform: 'translate(0, 0)', fontSize: 18, lineHeight: 1, filter: 'drop-shadow(0 4px 8px rgba(15,23,42,0.35))' },
  nameWrap: { display: 'grid', gap: 4, flex: 1, minWidth: 0 },
  nameRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  name: { margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' },
  verifiedBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 999, background: 'linear-gradient(120deg, rgba(34,197,94,0.2), rgba(22,163,74,0.32))', color: '#166534', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' },
  categoryBadge: { marginLeft: 'auto', background: 'rgba(15,23,42,0.08)', color: '#0f172a', borderRadius: 999, padding: '4px 10px', fontSize: '.75rem', fontWeight: 700 },
  small: { margin: 0, color: '#475569', fontSize: '.9rem' },
  metaGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  },
  metaItem: { background: 'linear-gradient(135deg, rgba(254,215,170,0.7), rgba(253,186,116,0.65))', borderRadius: 14, padding: '12px 14px', fontSize: '.9rem', color: '#0f172a', display: 'grid', gap: 6, boxShadow: '0 18px 32px -28px rgba(249,115,22,0.4)' },
  metaLabel: { fontSize: '.72rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#0f172a', fontWeight: 700, opacity: 0.7 },
  section: { display: 'grid', gap: 8 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { padding: '4px 9px', borderRadius: 999, fontSize: '.75rem', fontWeight: 600, background: 'linear-gradient(120deg, rgba(247,184,78,0.24), rgba(249,115,22,0.24))', color: '#0f172a' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    borderRadius: 999,
    fontSize: '.75rem',
    fontWeight: 700,
    letterSpacing: '.02em',
    lineHeight: 1,
    background: 'linear-gradient(120deg, rgba(39,227,218,0.25), rgba(247,184,78,0.25))',
    color: '#0f172a',
  },
  tagSeeking: { background: 'linear-gradient(120deg, rgba(39,227,218,0.35), rgba(56,189,248,0.35))' },
  tagAgent: { background: 'linear-gradient(120deg, rgba(109,40,217,0.25), rgba(14,165,233,0.25))', color: '#1e293b' },
  pager: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 'clamp(2.25rem, 5vw, 3.5rem)', flexWrap: 'wrap' },
  pageBtn: { border: '1px solid #CBD5E1', background: '#fff', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  disabled: { opacity: .4, cursor: 'not-allowed' },
  '@media (max-width: 1080px)': { layout: { gridTemplateColumns: '1fr' }, filters: { position: 'relative', top: 0 } },
  '@media (max-width: 640px)': { metaGrid: { gridTemplateColumns: '1fr' } },
};

const createSelectStyles = (minHeight, { menuZIndex } = {}) => {
  const baseStyles = {
    control: (provided, state) => ({
      ...provided,
      minHeight,
      borderRadius: minHeight >= 56 ? 14 : 12,
      background: 'rgba(255,255,255,0.95)',
      borderColor: state.isFocused ? '#27E3DA' : 'rgba(148, 163, 184, 0.45)',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(39,227,218,0.2)' : 'none',
      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    }),
    valueContainer: (provided) => ({ ...provided, padding: '0 12px' }),
    placeholder: (provided) => ({ ...provided, color: '#64748B', fontWeight: 500 }),
    input: (provided) => ({ ...provided, color: '#0f172a' }),
    singleValue: (provided) => ({ ...provided, color: '#0f172a', fontWeight: 600 }),
    multiValue: (provided) => ({
      ...provided,
      background: 'linear-gradient(120deg, rgba(39,227,218,0.35), rgba(247,184,78,0.35))',
      borderRadius: 999,
      border: '1px solid rgba(39,227,218,0.4)',
      color: '#0f172a',
    }),
    multiValueLabel: (provided) => ({ ...provided, color: '#0f172a', fontWeight: 600 }),
    multiValueRemove: (provided) => ({
      ...provided,
      color: '#0f172a',
      ':hover': { background: 'rgba(15,23,42,0.08)', color: '#0f172a' },
    }),
    dropdownIndicator: (provided, state) => ({
      ...provided,
      color: state.isFocused ? '#0f172a' : '#475569',
      ':hover': { color: '#0f172a' },
    }),
    clearIndicator: (provided) => ({
      ...provided,
      color: '#475569',
      ':hover': { color: '#0f172a' },
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    menu: (provided) => ({
      ...provided,
      background: '#fff',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 20px 45px -30px rgba(15,23,42,0.35)',
      border: '1px solid rgba(148, 163, 184, 0.18)',
      marginTop: 6,
    }),
    menuList: (provided) => ({ ...provided, padding: 8 }),
    option: (provided, state) => ({
      ...provided,
      borderRadius: 10,
      color: '#0f172a',
      fontWeight: state.isSelected ? 700 : 500,
      background: state.isSelected
        ? 'linear-gradient(120deg, rgba(39,227,218,0.35), rgba(247,184,78,0.35))'
        : state.isFocused
          ? 'rgba(39,227,218,0.12)'
          : 'transparent',
    }),
  };

  if (menuZIndex) {
    const originalMenu = baseStyles.menu;
    baseStyles.menu = (provided, state) => ({ ...originalMenu(provided, state), zIndex: menuZIndex });
  }

  return baseStyles;
};

/* ========================================================= */

export default function SearchPanel() {
  /* -------- Stage -------- */
  const [stage, setStage] = useState('select'); // 'select' | 'search'
  const [sport, setSport] = useState(null);     // { value, label }
  const [checking, setChecking] = useState(false);
  const [noData, setNoData] = useState('');

  /* -------- Filtri -------- */
  const [gender, setGender] = useState(null);
  const [roles, setRoles] = useState([]);     // array di {value,label}
  const [nats, setNats] = useState([]);       // array di {value,label}
  const [ageMode, setAgeMode] = useState(null);  // 'eq' | 'gte' | 'lte' | null
  const [ageValue, setAgeValue] = useState('');
  const [seeking, setSeeking] = useState(false);
  const [represented, setRepresented] = useState(false);
  const [contractStatuses, setContractStatuses] = useState([]); // array di string

  /* -------- Risultati/paginazione -------- */
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const resetFilters = () => {
    setGender(null); setRoles([]); setNats([]);
    setAgeMode(null); setAgeValue('');
    setSeeking(false); setRepresented(false);
    setContractStatuses([]); setPage(1);
  };

  const backToSport = () => { resetFilters(); setNoData(''); setStage('select'); };

  /* -------- Stage 1: pre-check esistenza --------
     Regola: interrogo sports_experiences e faccio join su athlete!inner,
     filtro exp.sport e athlete.profile_published; prendo 1 riga. */
  const onContinue = async () => {
    setNoData('');
    if (!sport?.value) return;
    const pattern = buildSportPattern(sport.value);
    if (!pattern) return;

    try {
      setChecking(true);
      const { data, error } = await supabase
        .from('sports_experiences')
        .select('id, athlete!inner(id, profile_published)')
        .eq('athlete.profile_published', true)
        .ilike('sport', pattern)
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) {
        setNoData(`No published athletes found for ${sport.label}.`);
        return;
      }
      setStage('search');
    } catch (e) {
      setNoData(`Error checking sport: ${e.message}`);
    } finally {
      setChecking(false);
    }
  };

  /* -------- Suggerimenti "Role" dinamici -------- */
  const loadRoleOptions = async (inputValue) => {
    if (!sport?.value) return [];
    const pattern = buildSportPattern(sport.value);
    const like = (inputValue || '').trim();

    try {
      let q = supabase
        .from('sports_experiences')
        .select('role, athlete!inner(profile_published)')
        .eq('athlete.profile_published', true)
        .ilike('sport', pattern)
        .order('role', { ascending: true })
        .limit(200);

      if (like) q = q.ilike('role', `%${like.replace(/[%_]/g, '\\$&')}%`);
      const { data, error } = await q;
      if (error) return [];

      const uniq = Array.from(new Set((data || []).map(r => (r?.role || '').trim()).filter(Boolean)));
      return uniq.map(r => ({ value: r, label: r }));
    } catch {
      return [];
    }
  };

  /* -------- Stage 2: query risultati --------
     Base: athlete; join: exp:sports_experiences!inner
     IMPORTANTISSIMO: filtri annidati SEMPRE sull'alias `exp`      */
  const fetchPage = async () => {
    if (!sport?.value) return;
    const pattern = buildSportPattern(sport.value);
    if (!pattern) return;

    setLoading(true);
    setNoData('');

    try {
      let q = supabase
        .from('athlete')
        .select(`
          id, first_name, last_name, gender, nationality, date_of_birth, profile_picture_url, profile_published,
          contacts_verification!left(id_verified, residence_city, residence_country),
          exp:sports_experiences!inner(
            sport, role, team, category, seeking_team, is_represented, contract_status, preferred_regions
          )
        `, { count: 'exact' })
        .eq('profile_published', true)
        .filter('exp.sport', 'ilike', pattern);   // filtro sempre sull'alias

      // filtri su ATLETA
      if (gender) q = q.eq('gender', gender);
      if (nats.length > 0) q = q.in('nationality', nats.map(n => n.value));

      // filtri su sports_experiences (alias exp)
      if (roles.length > 0) q = q.in('exp.role', roles.map(o => o.value || o));
      if (seeking) q = q.eq('exp.seeking_team', true);
      if (represented) q = q.eq('exp.is_represented', true);
      if (contractStatuses.length > 0) q = q.in('exp.contract_status', contractStatuses);

      // filtro età -> su athlete.date_of_birth
      const n = parseInt(String(ageValue || '').trim(), 10);
      if (!Number.isNaN(n) && n >= 0 && ageMode) {
        if (ageMode === 'eq') { const { min, max } = dobBoundsForAgeEq(n); q = q.gte('date_of_birth', min).lte('date_of_birth', max); }
        else if (ageMode === 'gte') { q = q.lte('date_of_birth', dobBoundForAgeGte(n)); }
        else if (ageMode === 'lte') { q = q.gte('date_of_birth', dobBoundForAgeLte(n)); }
      }

      // ordinamento + paginazione
      q = q.order('last_name', { ascending: true });
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data, count, error } = await q;
      if (error) throw error;

      setRows(data || []);
      setTotal(count || 0);
      if ((count || 0) === 0) setNoData('No matches for the selected filters.');
    } catch (e) {
      setRows([]); setTotal(0);
      setNoData(`Search error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Debounced refetch: quando cambiano filtri e sport, riparti da pagina 1
  useDebouncedEffect(() => { if (stage === 'search') { setPage(1); fetchPage(); } },
    [stage, sport?.value, gender, JSON.stringify(roles), JSON.stringify(nats), ageMode, ageValue, seeking, represented, JSON.stringify(contractStatuses)]
  );

  // Cambio pagina
  useEffect(() => { if (stage === 'search') fetchPage(); /* eslint-disable-next-line */ }, [page]);

  /* -------------------- Render -------------------- */
  if (stage === 'select') {
    return (
      <>
        <Head>
          <link rel="icon" href="/talentlix_favicon_32x32.ico" sizes="32x32" />
          <link rel="icon" href="/talentlix_favicon_16x16.ico" sizes="16x16" />
        </Head>

        <div style={styles.page}>
          <div style={styles.stageCard} aria-live="polite">
            <div style={{ display: 'grid', gap: '1rem' }}>
              <h1 style={styles.bigLabel}>Select a sport</h1>
              <p style={styles.sub}>Pick one sport to search athletes. You can always go back and change it.</p>

              <Select
                inputId="sport-select"
                placeholder="Start typing a sport"
                isClearable
                options={sports}
                value={sport}
                onChange={(opt) => setSport(opt)}
                styles={{
                  ...createSelectStyles(56),
                  container: (provided) => ({ ...provided, fontSize: '1rem' }),
                }}
              />

              <div style={styles.row}>
                <button type="button" onClick={onContinue} disabled={!sport || checking} style={{ ...styles.btn, opacity: !sport || checking ? .6 : 1 }}>
                  {checking ? 'Checking…' : 'Continue'}
                </button>
                {noData && <span style={styles.warn}>{noData}</span>}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Stage 2
  return (
    <>
      <Head>
        <link rel="icon" href="/talentlix_favicon_32x32.ico" sizes="32x32" />
        <link rel="icon" href="/talentlix_favicon_16x16.ico" sizes="16x16" />
      </Head>

      <div style={styles.page}>
        <div style={styles.topRow}>
          <div style={styles.sportRow}>
            <button type="button" onClick={backToSport} style={styles.btnGhost}>← Change sport</button>
            <span><strong>Sport:</strong> {sport?.label}</span>
          </div>
          <div style={styles.resultsIntro} aria-live="polite">
            <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
              Athletes
              {!loading && (
                <span style={styles.resultsCount}>
                  ({total} result{total === 1 ? '' : 's'})
                </span>
              )}
            </h2>
            <p style={{ margin: 0, color: '#334155', fontWeight: 500 }}>Profiles update in real time as you adjust filters.</p>
            {loading && <span style={styles.resultsStatus}>Loading…</span>}
          </div>
        </div>

        <div style={styles.layout}>
          {/* Filtri */}
          <aside style={styles.filters}>
            <section className="filterCard" style={styles.filterCard}>
              <h2 style={styles.h2}>Player profile</h2>

              <div>
                <h3 style={styles.h3}>Gender</h3>
                <div style={styles.radioRow} role="radiogroup" aria-label="Gender">
                  <label><input type="radio" name="g" checked={gender === 'M'} onChange={() => setGender('M')} /> Male</label>
                  <label><input type="radio" name="g" checked={gender === 'F'} onChange={() => setGender('F')} /> Female</label>
                  <button type="button" onClick={() => setGender(null)} style={styles.btnGhost}>Clear</button>
                </div>
              </div>

              <div>
                <h3 style={styles.h3}>Role (OR)</h3>
                <AsyncSelect
                  isMulti
                  cacheOptions
                  defaultOptions
                  loadOptions={loadRoleOptions}
                  value={roles}
                  onChange={(opts) => setRoles(Array.isArray(opts) ? opts : [])}
                  placeholder="Type to search roles"
                  styles={createSelectStyles(42, { menuZIndex: 20 })}
                />
              </div>

              <div>
                <h3 style={styles.h3}>Nationality (OR)</h3>
                <Select
                  isMulti
                  options={countries}
                  value={nats}
                  onChange={(opts) => setNats(Array.isArray(opts) ? opts : [])}
                  placeholder="Start typing a country"
                  styles={createSelectStyles(42, { menuZIndex: 20 })}
                />
              </div>

              <div>
                <h3 style={styles.h3}>Age</h3>
                <div style={styles.radioRow}>
                  <label><input type="radio" name="age" checked={ageMode === 'eq'}  onChange={() => setAgeMode('eq')} /> =</label>
                  <label><input type="radio" name="age" checked={ageMode === 'gte'} onChange={() => setAgeMode('gte')} /> ≥</label>
                  <label><input type="radio" name="age" checked={ageMode === 'lte'} onChange={() => setAgeMode('lte')} /> ≤</label>
                  <input type="number" min={0} value={ageValue} onChange={(e) => setAgeValue(e.target.value.replace(/[^\d]/g, ''))}
                         style={{ height: 36, borderRadius: 8, border: '1px solid #E0E0E0', padding: '0 8px', width: 90 }} placeholder="Years" />
                  <button type="button" onClick={() => { setAgeMode(null); setAgeValue(''); }} style={styles.btnGhost}>Clear</button>
                </div>
              </div>
            </section>

            <section className="filterCard" style={styles.filterCard}>
              <h2 style={styles.h2}>Availability</h2>
              <label><input type="checkbox" checked={seeking} onChange={(e) => setSeeking(e.target.checked)} /> Available and seeking a team</label>
              <label><input type="checkbox" checked={represented} onChange={(e) => setRepresented(e.target.checked)} /> Represented by an agent</label>
              <div>
                <h3 style={styles.h3}>Contract status (OR)</h3>
                <div style={{ display: 'grid', gap: 6 }}>
                  {CONTRACT_STATUS.map(cs => {
                    const checked = contractStatuses.includes(cs.value);
                    return (
                      <label key={cs.value}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setContractStatuses(prev => e.target.checked ? [...prev, cs.value] : prev.filter(v => v !== cs.value))
                          }
                        /> {cs.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <button type="button" onClick={resetFilters} style={styles.btnGhost}>Reset all</button>
            </section>
          </aside>

          {/* Risultati */}
          <main style={styles.results} aria-live="polite">
            {noData && !loading && (
              <div style={{ ...styles.warn, alignSelf: 'start' }}>{noData}</div>
            )}

            <section style={styles.grid}>
              {rows.map((ath) => {
                const exp = Array.isArray(ath.exp) ? ath.exp[0] : null;
                const contactsRecord = Array.isArray(ath.contacts_verification)
                  ? (ath.contacts_verification[0] || null)
                  : (ath.contacts_verification || null);
                const residenceCity = (contactsRecord?.residence_city || '').trim();
                const residenceCountry = (contactsRecord?.residence_country || '').trim();
                const age = (() => {
                  if (!ath.date_of_birth) return null;
                  const dob = new Date(ath.date_of_birth); const now = new Date();
                  let a = now.getFullYear() - dob.getFullYear();
                  const m = now.getMonth() - dob.getMonth();
                  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) a--;
                  return a;
                })();
                const natFlag = flagFromCountry(ath.nationality) || '🌍';
                const regions = Array.isArray(exp?.preferred_regions) ? exp.preferred_regions.filter(Boolean) : [];
                const formattedRegions = regions.slice(0, 3).join(', ');
                const fullName = [ath.first_name, ath.last_name]
                  .map((part) => (part ? String(part).trim() : ''))
                  .filter(Boolean)
                  .join(' ');
                const initials = [ath.first_name, ath.last_name]
                  .map((part) => (part ? String(part).trim()[0] : ''))
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'TL';
                const residenceParts = [residenceCity, residenceCountry].filter(Boolean);
                const residence = residenceParts.length > 0 ? residenceParts.join(', ') : '—';
                const contractLabel = exp?.contract_status
                  ? (CONTRACT_STATUS.find((x) => x.value === exp.contract_status)?.label || exp.contract_status)
                  : '—';
                const metaItems = [
                  { label: 'Nationality', value: ath.nationality || '—' },
                  { label: 'Current team', value: exp?.team || '—' },
                  { label: 'Current residence', value: residence },
                  { label: 'Contract status', value: contractLabel },
                ];
                const showTags = exp?.seeking_team || exp?.is_represented;

                return (
                  <article key={ath.id} style={styles.card}>
                    <div style={styles.cardInner}>
                      <header style={styles.cardHeader}>
                        <div style={styles.avatarWrap}>
                          {ath.profile_picture_url ? (
                            <img
                              src={ath.profile_picture_url}
                              alt={(fullName || 'Athlete').trim() || 'Athlete avatar'}
                              style={styles.avatarImg}
                            />
                          ) : (
                            <span style={styles.avatarInitials} aria-hidden="true">{initials}</span>
                          )}
                          <span style={styles.avatarFlag} aria-hidden="true">{natFlag}</span>
                        </div>
                        <div style={styles.nameWrap}>
                          <div style={styles.nameRow}>
                            <h3 style={styles.name}>{fullName || `${ath.first_name || ''} ${ath.last_name || ''}`.trim() || '—'}</h3>
                            {contactsRecord?.id_verified && (
                              <span style={styles.verifiedBadge}>Verified</span>
                            )}
                            {(exp?.category || '').trim() && (
                              <span style={styles.categoryBadge}>{exp.category}</span>
                            )}
                          </div>
                          <p style={styles.small}>
                            {exp?.role ? `${exp.role}` : 'Role —'} • {sport?.label}
                            {ath.gender ? ` • ${ath.gender === 'M' ? 'Male' : 'Female'}` : ''}
                            {typeof age === 'number' ? ` • ${age} y` : ''}
                          </p>
                        </div>
                      </header>

                      <div style={styles.metaGrid}>
                        {metaItems.map((item) => (
                          <div key={item.label} style={styles.metaItem}>
                            <span style={styles.metaLabel}>{item.label}</span>
                            <span>{item.value}</span>
                          </div>
                        ))}
                      </div>

                      <div style={{ ...styles.section, gap: showTags ? 12 : styles.section.gap }}>
                        <span style={styles.metaLabel}>
                          Preferred regions:
                          {' '}
                          <span style={{ fontWeight: 700, letterSpacing: 'normal', textTransform: 'none' }}>
                            {regions.length > 0 ? formattedRegions : '—'}
                          </span>
                        </span>

                        {showTags && (
                          <div style={styles.tagRow}>
                            {exp?.seeking_team && <span style={{ ...styles.tag, ...styles.tagSeeking }}>Seeking team</span>}
                            {exp?.is_represented && <span style={{ ...styles.tag, ...styles.tagAgent }}>Agent</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            {total > pageSize && (
              <nav style={styles.pager} aria-label="Pagination">
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                        style={{ ...styles.pageBtn, ...(page <= 1 ? styles.disabled : null) }}>Prev</button>
                <span>Page {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
                <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / pageSize)}
                        style={{ ...styles.pageBtn, ...(page >= Math.ceil(total / pageSize) ? styles.disabled : null) }}>Next</button>
              </nav>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

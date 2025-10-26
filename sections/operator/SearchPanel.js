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
  page: { minHeight: '100vh', padding: 'clamp(2rem, 5vw, 4rem) clamp(1.5rem, 5vw, 4rem)', background: 'radial-gradient(circle at top left, rgba(39, 227, 218, 0.35), transparent 55%), radial-gradient(circle at bottom right, rgba(247, 184, 78, 0.35), transparent 50%), #f8fafc', color: '#0f172a' },
  stageCard: { background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(39,227,218,0.18))', border: '1px solid rgba(39,227,218,0.25)', borderRadius: 28, padding: 'clamp(1.75rem, 4vw, 2.5rem)', boxShadow: '0 35px 90px -60px rgba(15,23,42,0.45)', maxWidth: 1180, margin: '0 auto' },
  bigLabel: { fontSize: 'clamp(2rem, 4vw, 2.65rem)', fontWeight: 700, margin: 0, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0f172a' },
  sub: { margin: '.5rem 0 1rem', color: '#0f172a', fontWeight: 500, fontSize: '1rem', maxWidth: 360 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  btn: { height: 44, padding: '0 16px', borderRadius: 10, fontWeight: 700, border: 'none', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#0f172a', cursor: 'pointer' },
  btnGhost: { height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', color: '#0f172a', fontWeight: 600, cursor: 'pointer' },
  warn: { color: '#b45309', background: 'rgba(250,204,21,0.15)', border: '1px solid rgba(250,204,21,0.35)', padding: 10, borderRadius: 10 },
  layout: { display: 'grid', gap: 'clamp(1.5rem, 4vw, 2.75rem)', gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)', maxWidth: 1180, margin: '0 auto' },
  filters: { display: 'grid', gap: 16, position: 'sticky', top: 16, alignSelf: 'start' },
  filterCard: { background: 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(39,227,218,0.16))', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 20, padding: '1.35rem', boxShadow: '0 28px 60px -44px rgba(15,23,42,0.35)', display: 'grid', gap: 12, backdropFilter: 'blur(18px)' },
  h2: { margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' },
  h3: { margin: 0, fontSize: '.95rem', color: '#475569', fontWeight: 600 },
  radioRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  results: { display: 'grid', gap: 16, minWidth: 0 },
  resultsHeader: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' },
  meta: { fontWeight: 600, color: '#0f172a' },
  grid: { display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))' },
  card: { position: 'relative', borderRadius: 22, padding: 2, background: 'linear-gradient(140deg, rgba(39,227,218,0.35), rgba(247,184,78,0.35))', boxShadow: '0 24px 60px -30px rgba(15,23,42,0.35)' },
  cardInner: { background: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: '1.25rem', display: 'grid', gap: 14, minHeight: '100%' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 14 },
  flagBubble: { width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(39,227,218,0.2), rgba(15,23,42,0.06))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 12px 24px -18px rgba(15,23,42,0.6)' },
  nameWrap: { display: 'grid', gap: 4, flex: 1, minWidth: 0 },
  nameRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  name: { margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' },
  categoryBadge: { marginLeft: 'auto', background: 'rgba(15,23,42,0.08)', color: '#0f172a', borderRadius: 999, padding: '4px 10px', fontSize: '.75rem', fontWeight: 700 },
  small: { margin: 0, color: '#475569', fontSize: '.9rem' },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  badge: { padding: '4px 10px', borderRadius: 999, fontSize: '.78rem', fontWeight: 700, background: 'rgba(39,227,218,0.15)', color: '#0f172a' },
  badgeSecondary: { background: 'rgba(15,23,42,0.06)' },
  metaGrid: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' },
  metaItem: { background: 'rgba(15,23,42,0.04)', borderRadius: 12, padding: '10px 12px', fontSize: '.85rem', color: '#0f172a', display: 'grid', gap: 4 },
  metaLabel: { fontSize: '.72rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 },
  section: { display: 'grid', gap: 8 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { padding: '4px 9px', borderRadius: 999, fontSize: '.75rem', fontWeight: 600, background: 'rgba(247,184,78,0.2)', color: '#0f172a' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tag: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, fontSize: '.75rem', fontWeight: 700, letterSpacing: '.02em', background: 'linear-gradient(120deg, rgba(39,227,218,0.25), rgba(247,184,78,0.25))', color: '#0f172a' },
  tagSeeking: { background: 'linear-gradient(120deg, rgba(39,227,218,0.35), rgba(56,189,248,0.35))' },
  tagAgent: { background: 'linear-gradient(120deg, rgba(109,40,217,0.25), rgba(14,165,233,0.25))', color: '#1e293b' },
  tagContract: { background: 'linear-gradient(120deg, rgba(247,184,78,0.35), rgba(244,114,182,0.2))' },
  pager: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' },
  pageBtn: { border: '1px solid #CBD5E1', background: '#fff', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  disabled: { opacity: .4, cursor: 'not-allowed' },
  '@media (max-width: 1080px)': { layout: { gridTemplateColumns: '1fr' }, filters: { position: 'relative', top: 0 } },
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
          exp:sports_experiences!inner(
            sport, role, category, seeking_team, is_represented, contract_status, preferred_regions
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
                  control: (b, s) => ({ ...b, minHeight: 56, borderRadius: 14, boxShadow: 'none', borderColor: s.isFocused ? '#BDBDBD' : '#E0E0E0' }),
                  container: (b) => ({ ...b, fontSize: '1rem' }),
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '0 auto clamp(1rem, 2vw, 1.4rem)', maxWidth: 1180 }}>
          <button type="button" onClick={backToSport} style={styles.btnGhost}>← Change sport</button>
          <span><strong>Sport:</strong> {sport?.label}</span>
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
                  styles={{ control: (b, s) => ({ ...b, minHeight: 42, borderRadius: 10, boxShadow: 'none', borderColor: s.isFocused ? '#BDBDBD' : '#E0E0E0' }), menu: (b) => ({ ...b, zIndex: 20 }) }}
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
                  styles={{ control: (b, s) => ({ ...b, minHeight: 42, borderRadius: 10, boxShadow: 'none', borderColor: s.isFocused ? '#BDBDBD' : '#E0E0E0' }), menu: (b) => ({ ...b, zIndex: 20 }) }}
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
            <header style={styles.resultsHeader}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color: '#0f172a' }}>Athletes</h2>
                <p style={{ margin: '.35rem 0 0', color: '#334155', fontWeight: 500 }}>Profiles update in real time as you adjust filters.</p>
              </div>
              <div style={styles.meta}>{loading ? 'Loading…' : `${total} result${total === 1 ? '' : 's'}`}</div>
            </header>

            {noData && !loading && <div style={styles.warn}>{noData}</div>}

            <section style={styles.grid}>
              {rows.map((ath) => {
                const exp = Array.isArray(ath.exp) ? ath.exp[0] : null;
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

                return (
                  <article key={ath.id} style={styles.card}>
                    <div style={styles.cardInner}>
                      <header style={styles.cardHeader}>
                        <div style={styles.flagBubble} aria-hidden="true">{natFlag}</div>
                        <div style={styles.nameWrap}>
                          <div style={styles.nameRow}>
                            <h3 style={styles.name}>{ath.first_name} {ath.last_name}</h3>
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

                      <div style={styles.badgeRow}>
                        <span style={styles.badge}>{ath.nationality || 'Nationality —'}</span>
                        {exp?.preferred_regions?.length ? <span style={{ ...styles.badge, ...styles.badgeSecondary }}>Preferred regions</span> : null}
                        {exp?.contract_status && (
                          <span style={{ ...styles.badge, ...styles.badgeSecondary }}>
                            {CONTRACT_STATUS.find(x => x.value === exp.contract_status)?.label || exp.contract_status}
                          </span>
                        )}
                      </div>

                      <div style={styles.metaGrid}>
                        <div style={styles.metaItem}>
                          <span style={styles.metaLabel}>Nationality</span>
                          <span>{ath.nationality || '—'}</span>
                        </div>
                        <div style={styles.metaItem}>
                          <span style={styles.metaLabel}>Category</span>
                          <span>{exp?.category || '—'}</span>
                        </div>
                        <div style={styles.metaItem}>
                          <span style={styles.metaLabel}>Seeking</span>
                          <span>{exp ? (exp.seeking_team ? 'Actively looking for a team' : 'Not seeking') : '—'}</span>
                        </div>
                        <div style={styles.metaItem}>
                          <span style={styles.metaLabel}>Representation</span>
                          <span>{exp ? (exp.is_represented ? 'Represented by an agent' : 'No agent listed') : '—'}</span>
                        </div>
                      </div>

                      <div style={styles.section}>
                        <span style={styles.metaLabel}>Preferred regions</span>
                        {regions.length > 0 ? (
                          <div style={styles.chipRow}>
                            {regions.map((region) => (
                              <span key={region} style={styles.chip}>{region}</span>
                            ))}
                          </div>
                        ) : (
                          <span style={styles.small}>—</span>
                        )}
                      </div>

                      <footer style={styles.tagRow}>
                        {exp?.seeking_team && <span style={{ ...styles.tag, ...styles.tagSeeking }}>Seeking team</span>}
                        {exp?.is_represented && <span style={{ ...styles.tag, ...styles.tagAgent }}>Agent</span>}
                        {exp?.contract_status && (
                          <span style={{ ...styles.tag, ...styles.tagContract }}>
                            {CONTRACT_STATUS.find(x => x.value === exp.contract_status)?.label || exp.contract_status}
                          </span>
                        )}
                      </footer>
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

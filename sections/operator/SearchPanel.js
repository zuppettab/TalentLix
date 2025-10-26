'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { supabase } from '../../utils/supabaseClient';
import countries from '../../utils/countries';
import sports from '../../utils/sports';

// --- Contract status: allineati a SportInfoPanel ---
const CONTRACT_STATUS = [
  { value: 'free_agent',     label: 'Free agent' },
  { value: 'under_contract', label: 'Under contract' },
  { value: 'on_loan',        label: 'On loan' },
];

// --- Helpers: date/age ---
const toISO = (d) => d.toISOString().slice(0, 10);
const addYears = (date, years) => {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
};
const dobBoundsForAgeEq = (age) => {
  const today = new Date();
  const maxDOB = addYears(today, -age);
  const minDOB = new Date(addYears(today, -age - 1));
  minDOB.setDate(minDOB.getDate() + 1);
  return { min: toISO(minDOB), max: toISO(maxDOB) };
};
const dobBoundForAgeGte = (age) => toISO(addYears(new Date(), -age)); // DOB <= this
const dobBoundForAgeLte = (age) => { const min = addYears(new Date(), -age - 1); min.setDate(min.getDate() + 1); return toISO(min); };

const buildSportPattern = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const escaped = normalized.replace(/[%_]/g, '\\$&');
  return `%${escaped}%`;
};

// --- Debounce ---
function useDebouncedEffect(fn, deps, delay = 250) {
  useEffect(() => {
    const id = setTimeout(() => fn?.(), delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// --- Styles coerenti (minimal/sobrio) ---
const styles = {
  page: { minHeight: '100vh', padding: 'clamp(2rem, 5vw, 4rem) clamp(1.5rem, 5vw, 4rem)', background: 'radial-gradient(circle at top left, rgba(39, 227, 218, 0.35), transparent 55%), radial-gradient(circle at bottom right, rgba(247, 184, 78, 0.3), transparent 50%), #f8fafc', color: '#0f172a' },
  stageCard: {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(39,227,218,0.12))',
    border: '1px solid rgba(39,227,218,0.22)',
    borderRadius: 28,
    padding: 'clamp(1.75rem, 4vw, 2.5rem)',
    boxShadow: '0 35px 90px -60px rgba(15,23,42,0.45)',
    maxWidth: 1180, margin: '0 auto',
  },
  bigLabel: { fontSize: 'clamp(2rem, 4vw, 2.65rem)', fontWeight: 700, margin: 0, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0f172a' },
  sub: { margin: '.5rem 0 1rem', color: '#0f172a', fontWeight: 500, fontSize: '1rem', maxWidth: 360 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  btn: { height: 44, padding: '0 16px', borderRadius: 10, fontWeight: 700, border: 'none', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#0f172a', cursor: 'pointer' },
  btnGhost: { height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', color: '#0f172a', fontWeight: 600, cursor: 'pointer' },
  warn: { color: '#b45309', background: 'rgba(250,204,21,0.15)', border: '1px solid rgba(250,204,21,0.35)', padding: 10, borderRadius: 10 },
  layout: { display: 'grid', gap: 'clamp(1.5rem, 4vw, 2.75rem)', gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)', maxWidth: 1180, margin: '0 auto' },
  filters: { display: 'grid', gap: 16, position: 'sticky', top: 16, alignSelf: 'start' },
  filterCard: { background: 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(39,227,218,0.12))', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 20, padding: '1.35rem', boxShadow: '0 28px 60px -44px rgba(15,23,42,0.35)', display: 'grid', gap: 12, backdropFilter: 'blur(18px)' },
  h2: { margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' },
  h3: { margin: 0, fontSize: '.95rem', color: '#475569', fontWeight: 600 },
  radioRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  results: { display: 'grid', gap: 16, minWidth: 0 },
  resultsHeader: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' },
  meta: { fontWeight: 600, color: '#0f172a' },
  grid: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))' },
  card: { background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 16, padding: 14, display: 'grid', gap: 10, boxShadow: '0 20px 54px -32px rgba(15,23,42,0.25)' },
  name: { margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' },
  small: { margin: 0, color: '#475569', fontSize: '.92rem' },
  factGrid: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: 'rgba(148,163,184,.18)', color: '#0f172a', fontWeight: 700, fontSize: '.78rem' },
  pager: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' },
  pageBtn: { border: '1px solid #CBD5E1', background: '#fff', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  disabled: { opacity: .4, cursor: 'not-allowed' },
  '@media (max-width: 1080px)': { layout: { gridTemplateColumns: '1fr' }, filters: { position: 'relative', top: 0 } },
};

export default function SearchPanel() {
  // ---------------- Stage ----------------
  const [stage, setStage] = useState('select'); // 'select' | 'search'
  const [sport, setSport] = useState(null);     // { value, label }
  const [checking, setChecking] = useState(false);
  const [noData, setNoData] = useState('');

  // ---------------- Filters ----------------
  const [gender, setGender] = useState(null);       // 'M' | 'F' | null
  const [roles, setRoles] = useState([]);           // array di {value,label}
  const [nats, setNats] = useState([]);             // array di {value,label}
  const [ageMode, setAgeMode] = useState(null);     // 'eq' | 'gte' | 'lte' | null
  const [ageValue, setAgeValue] = useState('');
  const [seeking, setSeeking] = useState(false);
  const [represented, setRepresented] = useState(false);
  const [contractStatuses, setContractStatuses] = useState([]); // array di string

  // ---------------- Results / pagination ----------------
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Reset filtri
  const resetFilters = () => {
    setGender(null); setRoles([]); setNats([]);
    setAgeMode(null); setAgeValue('');
    setSeeking(false); setRepresented(false);
    setContractStatuses([]); setPage(1);
  };

  const backToSport = () => {
    resetFilters();
    setNoData('');
    setStage('select');
  };

  // ---------------- Stage 1: check esistenza atleti pubblicati per sport (case-insensitive) ----------------
  const onContinue = async () => {
    setNoData('');
    if (!sport?.value) return;
    const pattern = buildSportPattern(sport.value);
    if (!pattern) return;
    try {
      setChecking(true);
      const { count, error } = await supabase
        .from('sports_experiences')
        .select('id, athlete!inner(profile_published)', { count: 'exact', head: true })
        .eq('athlete.profile_published', true) // SOLO profili pubblicati
        .ilike('sport', pattern);              // case-insensitive + partial match to absorb minor variations
      if (error) throw error;
      if ((count || 0) < 1) {
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

  // ---------------- Role suggestions (solo per sport selezionato + profilo pubblicato) ----------------
  const loadRoleOptions = async (inputValue) => {
    if (!sport?.value) return [];
    const pattern = buildSportPattern(sport.value);
    if (!pattern) return [];
    const like = (inputValue || '').trim();
    try {
      let q = supabase
        .from('sports_experiences')
        .select('role, athlete!inner(profile_published)')
        .eq('athlete.profile_published', true)
        .ilike('sport', pattern)
        .order('role', { ascending: true })
        .limit(200);
      if (like) q = q.ilike('role', `%${like}%`);
      const { data, error } = await q;
      if (error) return [];
      const uniq = Array.from(new Set((data || []).map(r => (r?.role || '').trim()).filter(Boolean)));
      return uniq.map(r => ({ value: r, label: r }));
    } catch {
      return [];
    }
  };

  // ---------------- Query risultati (Stage 2) ----------------
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
          experiences:sports_experiences!inner(
            sport, role, category, seeking_team, is_represented, contract_status, preferred_regions
          )
        `, { count: 'exact' })
        .eq('profile_published', true)
        .filter('sports_experiences.sport', 'ilike', pattern); // case-insensitive sullo sport

      // Gender
      if (gender) q = q.eq('gender', gender);

      // Nationality (OR)
      if (nats.length > 0) q = q.in('nationality', nats.map(n => n.value));

      // Role (OR)
      if (roles.length > 0) q = q.in('sports_experiences.role', roles.map(o => o.value || o));

      // Seeking / Represented
      if (seeking) q = q.eq('sports_experiences.seeking_team', true);
      if (represented) q = q.eq('sports_experiences.is_represented', true);

      // Contract status (OR)
      if (contractStatuses.length > 0) q = q.in('sports_experiences.contract_status', contractStatuses);

      // Age
      const n = parseInt(String(ageValue || '').trim(), 10);
      if (!Number.isNaN(n) && n >= 0 && ageMode) {
        if (ageMode === 'eq') {
          const { min, max } = dobBoundsForAgeEq(n);
          q = q.gte('date_of_birth', min).lte('date_of_birth', max);
        } else if (ageMode === 'gte') {
          q = q.lte('date_of_birth', dobBoundForAgeGte(n));
        } else if (ageMode === 'lte') {
          q = q.gte('date_of_birth', dobBoundForAgeLte(n));
        }
      }

      // Ordine + paginazione
      q = q.order('last_name', { ascending: true });
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data, count, error } = await q;
      if (error) throw error;

      setRows(data || []);
      setTotal(count || 0);
      if ((count || 0) === 0) {
        setNoData('No matches for the selected filters.');
      }
    } catch (e) {
      setRows([]);
      setTotal(0);
      setNoData(`Search error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Re-query su filtri (debounced)
  useDebouncedEffect(() => {
    if (stage === 'search') {
      setPage(1);
      fetchPage();
    }
  }, [stage, sport?.value, gender, JSON.stringify(roles), JSON.stringify(nats), ageMode, ageValue, seeking, represented, JSON.stringify(contractStatuses)]);

  // Fetch su cambio pagina (no debounce)
  useEffect(() => { if (stage === 'search') fetchPage(); /* eslint-disable-next-line */ }, [page]);

  // ---------------- Render ----------------
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

  // Stage 2: motore di ricerca
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
                  styles={{
                    control: (b, s) => ({ ...b, minHeight: 42, borderRadius: 10, boxShadow: 'none', borderColor: s.isFocused ? '#BDBDBD' : '#E0E0E0' }),
                    menu: (b) => ({ ...b, zIndex: 20 })
                  }}
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
                  styles={{
                    control: (b, s) => ({ ...b, minHeight: 42, borderRadius: 10, boxShadow: 'none', borderColor: s.isFocused ? '#BDBDBD' : '#E0E0E0' }),
                    menu: (b) => ({ ...b, zIndex: 20 })
                  }}
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
                          onChange={(e) => {
                            setContractStatuses(prev => e.target.checked ? [...prev, cs.value] : prev.filter(v => v !== cs.value));
                          }}
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
                const exp = Array.isArray(ath.experiences) ? ath.experiences[0] : null;
                const age = (() => {
                  if (!ath.date_of_birth) return null;
                  const dob = new Date(ath.date_of_birth); const now = new Date();
                  let a = now.getFullYear() - dob.getFullYear();
                  const m = now.getMonth() - dob.getMonth();
                  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) a--;
                  return a;
                })();
                return (
                  <article key={ath.id} style={styles.card}>
                    <header>
                      <h3 style={styles.name}>{ath.first_name} {ath.last_name}</h3>
                      <p style={styles.small}>
                        {exp?.role ? `${exp.role}` : '-'} • {sport?.label}
                        {ath.gender ? ` • ${ath.gender === 'M' ? 'Male' : 'Female'}` : ''}
                        {typeof age === 'number' ? ` • ${age} y` : ''}
                      </p>
                    </header>
                    <div style={styles.factGrid}>
                      <div><strong>Nationality:</strong><br />{ath.nationality || '-'}</div>
                      <div><strong>Category:</strong><br />{exp?.category || '-'}</div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <strong>Preferred regions:</strong><br />
                        {Array.isArray(exp?.preferred_regions) && exp.preferred_regions.length > 0 ? exp.preferred_regions.join(', ') : '-'}
                      </div>
                    </div>
                    <footer style={styles.tagRow}>
                      {exp?.seeking_team && <span style={styles.tag}>Seeking team</span>}
                      {exp?.is_represented && <span style={styles.tag}>Agent</span>}
                      {exp?.contract_status && <span style={styles.tag}>{CONTRACT_STATUS.find(x => x.value === exp.contract_status)?.label || exp.contract_status}</span>}
                    </footer>
                  </article>
                );
              })}
            </section>

            {/* Paginazione */}
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

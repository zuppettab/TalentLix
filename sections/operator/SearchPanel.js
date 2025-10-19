'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';

const FACET_CONFIG = [
  { attribute: 'sport', title: 'Sport' },
  { attribute: 'role', title: 'Role' },
  { attribute: 'secondary_role', title: 'Secondary role' },
  { attribute: 'gender', title: 'Gender' },
  { attribute: 'nationality', title: 'Nationality', searchable: true, placeholder: 'Search nationalities' },
  { attribute: 'category', title: 'Category' },
  { attribute: 'preferred_regions', title: 'Preferred regions', searchable: true, placeholder: 'Search regions' },
];

const TOGGLE_CONFIG = [
  { attribute: 'is_verified', label: 'Verified' },
  { attribute: 'seeking_team', label: 'Seeking team' },
  { attribute: 'has_active_contract', label: 'Has active contract' },
  { attribute: 'is_represented', label: 'Has agent' },
];

const HITS_PER_PAGE = 24;

const createInitialFacetState = () => FACET_CONFIG.reduce((acc, item) => ({ ...acc, [item.attribute]: [] }), {});
const createInitialToggleState = () => TOGGLE_CONFIG.reduce((acc, item) => ({ ...acc, [item.attribute]: false }), {});

const defaultFacetOptions = FACET_CONFIG.reduce((acc, item) => ({ ...acc, [item.attribute]: [] }), {});

function humanizeLabel(input) {
  if (input == null) return '';
  const s = String(input);
  const noTrailingDigits = s.replace(/\d+$/, '');
  const withSpaces = noTrailingDigits.replace(/[_-]+/g, ' ').trim();
  return withSpaces.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatGender(value) {
  if (!value) return '';
  const normalized = String(value).toLowerCase();
  if (normalized === 'm' || normalized === 'male') return 'male';
  if (normalized === 'f' || normalized === 'female') return 'female';
  return normalized;
}

const tagConfig = [
  { key: 'is_verified', label: 'Verified', tone: 'success' },
  { key: 'seeking_team', label: 'Seeking team', tone: 'accent' },
  { key: 'has_active_contract', label: 'Active contract', tone: 'warning' },
  { key: 'is_represented', label: 'Agent', tone: 'neutral' },
];

const StateMessage = ({ tone = 'default', children }) => {
  const base = { ...styles.stateBox };
  if (tone === 'error') Object.assign(base, styles.stateBoxError);
  return <div style={base}>{children}</div>;
};

function SearchToolbar({ query, onQueryChange, onClearSearch, onResetFilters, hasFilters }) {
  return (
    <div style={styles.toolbar}>
      <div style={styles.searchInputWrap}>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Search by role, sport, nationality or regions"
          style={styles.searchInput}
        />
        {query && (
          <button type="button" onClick={onClearSearch} style={styles.searchClearBtn}>
            Clear
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onResetFilters}
        style={{
          ...styles.clearFiltersBtn,
          ...(hasFilters ? null : styles.clearFiltersBtnDisabled),
        }}
        disabled={!hasFilters}
      >
        Reset filters
      </button>
    </div>
  );
}

function FacetGroup({ attribute, title, options, selectedValues, onToggle, searchable, placeholder = 'Search…' }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
    setQuery('');
  }, [attribute, options]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const lower = query.trim().toLowerCase();
    return options.filter((item) => item.label.toLowerCase().includes(lower));
  }, [options, query]);

  const displayOptions = useMemo(() => {
    if (expanded) return filteredOptions;
    return filteredOptions.slice(0, 8);
  }, [expanded, filteredOptions]);

  const canShowMore = filteredOptions.length > 8;

  return (
    <div style={styles.facetGroup}>
      <div style={styles.facetHeader}>
        <span style={styles.facetTitle}>{title}</span>
        {canShowMore && (
          <button type="button" onClick={() => setExpanded((value) => !value)} style={styles.showMoreBtn}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      {searchable && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={placeholder}
          style={styles.facetSearchInput}
        />
      )}
      <div style={styles.facetList}>
        {displayOptions.length ? (
          displayOptions.map((item) => {
            const active = selectedValues.includes(item.value);
            return (
              <label key={item.value} style={{ ...styles.facetItem, ...(active ? styles.facetItemActive : null) }}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => onToggle(attribute, item.value)}
                  style={styles.facetCheckbox}
                />
                <span style={styles.facetLabel}>{item.label}</span>
              </label>
            );
          })
        ) : (
          <div style={styles.emptyFacet}>No options available</div>
        )}
      </div>
    </div>
  );
}

function AgeRangeFacet({ value, stats, onApply, onReset }) {
  const [minInput, setMinInput] = useState(value.min ?? '');
  const [maxInput, setMaxInput] = useState(value.max ?? '');

  useEffect(() => {
    setMinInput(value.min ?? '');
    setMaxInput(value.max ?? '');
  }, [value.min, value.max]);

  const hasStats = Number.isFinite(stats?.min) && Number.isFinite(stats?.max) && stats.min !== stats.max;

  const handleSubmit = (event) => {
    event.preventDefault();
    onApply(minInput, maxInput);
  };

  return (
    <div style={styles.facetGroup}>
      <div style={styles.facetHeader}>
        <span style={styles.facetTitle}>Age range</span>
      </div>
      {!hasStats && <div style={styles.emptyFacet}>No age data available</div>}
      {hasStats && (
        <form onSubmit={handleSubmit} style={styles.ageForm}>
          <div style={styles.ageInputs}>
            <label style={styles.ageInputLabel}>
              Min
              <input
                type="number"
                value={minInput}
                onChange={(event) => setMinInput(event.currentTarget.value)}
                min={stats.min}
                max={stats.max}
                style={styles.ageInput}
              />
            </label>
            <label style={styles.ageInputLabel}>
              Max
              <input
                type="number"
                value={maxInput}
                onChange={(event) => setMaxInput(event.currentTarget.value)}
                min={stats.min}
                max={stats.max}
                style={styles.ageInput}
              />
            </label>
          </div>
          <div style={styles.ageActions}>
            <button type="submit" style={styles.ageApplyBtn}>
              Apply
            </button>
            <button type="button" onClick={onReset} style={styles.ageResetBtn}>
              Reset
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ToggleGroup({ values, onToggle }) {
  return (
    <div style={styles.toggleGroup}>
      {TOGGLE_CONFIG.map((item) => {
        const checked = !!values[item.attribute];
        return (
          <label key={item.attribute} style={{ ...styles.toggleRow, ...(checked ? null : styles.toggleRowInactive) }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(item.attribute)}
              style={styles.toggleInput}
            />
            <span style={styles.toggleLabel}>{item.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function StatsHeader({ status, total, processingTimeMS }) {
  const loading = status === 'loading';
  const error = status === 'error';
  return (
    <div style={styles.statsBar}>
      <span style={styles.statsText}>
        {loading && 'Searching athletes…'}
        {error && 'Unable to load athletes'}
        {!loading && !error && `${total.toLocaleString()} athletes found`}
      </span>
      {!loading && !error && (
        <span style={styles.statsMeta}>Updated in {processingTimeMS} ms</span>
      )}
    </div>
  );
}

function Flag({ value, label }) {
  const active = Boolean(value);
  return (
    <span style={{ ...styles.flagBadge, ...(active ? styles.flagBadgeActive : styles.flagBadgeInactive) }}>
      {label}
    </span>
  );
}

function HitsGrid({ status, hits }) {
  if (status === 'loading') {
    return (
      <div style={styles.hitsGrid}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} style={styles.hitCardSkeleton}>
            <div style={styles.hitSkeletonLine} />
            <div style={{ ...styles.hitSkeletonLine, width: '60%' }} />
            <div style={{ ...styles.hitSkeletonLine, width: '40%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return <div style={styles.emptyResults}>Unable to load athletes for the selected filters.</div>;
  }

  if (!hits.length) {
    return <div style={styles.emptyResults}>No athletes match the current filters.</div>;
  }

  return (
    <div style={styles.hitsGrid}>
      {hits.map((hit) => {
        const tags = tagConfig.filter(({ key }) => Boolean(hit?.[key]));
        const titleRole = humanizeLabel(hit?.role || 'Athlete');
        const sportLabel = humanizeLabel(hit?.sport || '');
        const secondaryRoles = Array.isArray(hit?.secondary_role)
          ? hit.secondary_role.filter(Boolean).map(humanizeLabel)
          : [];
        const preferredRegions = Array.isArray(hit?.preferred_regions)
          ? hit.preferred_regions.filter(Boolean)
          : [];

        return (
          <div key={hit.objectID || hit.id} style={styles.hitCard}>
            <div style={styles.hitHeader}>
              <span style={styles.hitRole}>{titleRole}</span>
              {sportLabel && <span style={styles.hitBadge}>{sportLabel}</span>}
            </div>
            {secondaryRoles.length > 0 && (
              <div style={styles.hitTags}>
                {secondaryRoles.map((item) => (
                  <span key={item} style={styles.hitTag}>
                    {item}
                  </span>
                ))}
              </div>
            )}
            <div style={styles.hitMeta}>
              {hit?.nationality && <span style={styles.metaItem}>Nationality: {humanizeLabel(hit.nationality)}</span>}
              {Number.isFinite(hit?.age) && <span style={styles.metaItem}>Age: {hit.age}</span>}
              {hit?.category && <span style={styles.metaItem}>Category: {humanizeLabel(hit.category)}</span>}
            </div>
            {preferredRegions.length > 0 && (
              <div style={styles.hitRegions}>
                Preferred regions:
                <div style={styles.hitRegionList}>
                  {preferredRegions.map((region) => (
                    <span key={region} style={styles.regionBadge}>
                      {humanizeLabel(region)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={styles.hitFlags}>
              <Flag value={hit?.is_verified} label="Verified" />
              <Flag value={hit?.seeking_team} label="Seeking team" />
              <Flag value={hit?.has_active_contract} label="Active contract" />
              <Flag value={hit?.is_represented} label="Has agent" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaginationControls({ status, page, nbPages, onPageChange }) {
  if (nbPages <= 1) return null;

  const pages = Array.from({ length: nbPages }, (_, index) => index);

  return (
    <div style={styles.pagination}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0 || status === 'loading'}
        style={{ ...styles.pageBtn, ...(page === 0 || status === 'loading' ? styles.pageBtnDisabled : null) }}
      >
        Previous
      </button>
      <div style={styles.pageList}>
        {pages.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            disabled={status === 'loading'}
            style={{
              ...styles.pageNumber,
              ...(item === page ? styles.pageNumberActive : null),
              ...(status === 'loading' ? styles.pageBtnDisabled : null),
            }}
          >
            {item + 1}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page + 1 >= nbPages || status === 'loading'}
        style={{
          ...styles.pageBtn,
          ...(page + 1 >= nbPages || status === 'loading' ? styles.pageBtnDisabled : null),
        }}
      >
        Next
      </button>
    </div>
  );
}

const formatFacetOption = (attribute, value) => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (attribute === 'gender') {
    return { value: raw, label: humanizeLabel(formatGender(raw)) };
  }
  return { value: raw, label: humanizeLabel(raw) };
};

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}

export default function SearchPanel({ isMobile = false }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  const [facetSelections, setFacetSelections] = useState(() => createInitialFacetState());
  const [facetOptions, setFacetOptions] = useState(defaultFacetOptions);
  const [toggles, setToggles] = useState(() => createInitialToggleState());
  const [ageRange, setAgeRange] = useState({ min: '', max: '' });
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [result, setResult] = useState({ hits: [], total: 0, nbPages: 0, processingTimeMS: 0 });
  const [optionsState, setOptionsState] = useState({ loading: true, error: null, age: { min: null, max: null } });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setOptionsState((prev) => ({ ...prev, loading: true, error: null }));

    fetch('/api/operator/search/options', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || 'Unable to load search filters metadata.');
        }
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        const rawOptions = payload?.options || {};
        const mapped = FACET_CONFIG.reduce((acc, item) => {
          const values = Array.isArray(rawOptions[item.attribute]) ? rawOptions[item.attribute] : [];
          const formatted = values
            .map((value) => formatFacetOption(item.attribute, value))
            .filter(Boolean);
          acc[item.attribute] = formatted;
          return acc;
        }, {});
        setFacetOptions((prev) => ({ ...prev, ...mapped }));
        setOptionsState({
          loading: false,
          error: null,
          age: {
            min: typeof payload?.age?.min === 'number' ? payload.age.min : null,
            max: typeof payload?.age?.max === 'number' ? payload.age.max : null,
          },
        });
      })
      .catch((err) => {
        if (err.name === 'AbortError' || !active) return;
        console.error('Failed to load operator search options', err);
        setOptionsState({ loading: false, error: err, age: { min: null, max: null } });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const requestSignature = useMemo(() => {
    return JSON.stringify({
      query: debouncedQuery,
      page,
      perPage: HITS_PER_PAGE,
      filters: {
        facets: facetSelections,
        toggles,
        age: ageRange,
      },
    });
  }, [debouncedQuery, page, facetSelections, toggles, ageRange]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    fetch('/api/operator/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestSignature,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || 'Unable to fetch athlete directory records.');
        }
        return response.json();
      })
      .then((payload) => {
        setResult({
          hits: Array.isArray(payload?.hits) ? payload.hits : [],
          total: typeof payload?.total === 'number' ? payload.total : 0,
          nbPages: typeof payload?.nbPages === 'number' ? payload.nbPages : 0,
          processingTimeMS: typeof payload?.processingTimeMS === 'number' ? payload.processingTimeMS : 0,
        });
        setStatus('success');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Operator search request failed', err);
        setStatus('error');
        setError(err);
        setResult({ hits: [], total: 0, nbPages: 0, processingTimeMS: 0 });
      });

    return () => controller.abort();
  }, [requestSignature]);

  const hasFilters = useMemo(() => {
    const hasFacetSelections = Object.values(facetSelections).some((values) => (values || []).length > 0);
    const hasToggle = Object.values(toggles).some(Boolean);
    const hasAge = ageRange.min !== '' || ageRange.max !== '';
    return hasFacetSelections || hasToggle || hasAge;
  }, [facetSelections, toggles, ageRange]);

  const handleQueryChange = useCallback((value) => {
    setQuery(value);
    setPage(0);
  }, []);

  const handleClearSearch = useCallback(() => {
    setQuery('');
    setPage(0);
  }, []);

  const handleToggleFacet = useCallback((attribute, value) => {
    setFacetSelections((prev) => {
      const nextValues = prev[attribute] || [];
      const exists = nextValues.includes(value);
      const updated = exists ? nextValues.filter((item) => item !== value) : [...nextValues, value];
      return {
        ...prev,
        [attribute]: updated,
      };
    });
    setPage(0);
  }, []);

  const handleToggle = useCallback((attribute) => {
    setToggles((prev) => ({
      ...prev,
      [attribute]: !prev[attribute],
    }));
    setPage(0);
  }, []);

  const handleApplyAgeRange = useCallback((min, max) => {
    setAgeRange({
      min: min ?? '',
      max: max ?? '',
    });
    setPage(0);
  }, []);

  const handleResetAgeRange = useCallback(() => {
    setAgeRange({ min: '', max: '' });
    setPage(0);
  }, []);

  const handleResetFilters = useCallback(() => {
    setFacetSelections(createInitialFacetState());
    setToggles(createInitialToggleState());
    setAgeRange({ min: '', max: '' });
    setPage(0);
  }, []);

  const handlePageChange = useCallback((nextPage) => {
    if (Number.isInteger(nextPage) && nextPage >= 0 && nextPage !== page) {
      setPage(Math.min(nextPage, Math.max(result.nbPages - 1, 0)));
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [page, result.nbPages]);

  const layoutStyle = { ...styles.layout, ...(isMobile ? styles.layoutMobile : null) };
  const filtersStyle = { ...styles.filters, ...(isMobile ? styles.filtersMobile : null) };
  const resultsStyle = { ...styles.results, ...(isMobile ? styles.resultsMobile : null) };

  return (
    <>
      <Head>
        <link rel="icon" href="/talentlix_favicon_32x32.ico" sizes="32x32" />
        <link rel="icon" href="/talentlix_favicon_16x16.ico" sizes="16x16" />
      </Head>

      <div style={styles.wrapper}>
        <div style={styles.headerCard}>
          <h2 style={styles.headerTitle}>Talent Search</h2>
          <p style={styles.headerSubtitle}>
            Discover athletes that match your scouting strategy. Refine results with sport, position, nationality, regions and
            more to build tailored shortlists.
          </p>
          <SearchToolbar
            query={query}
            onQueryChange={handleQueryChange}
            onClearSearch={handleClearSearch}
            onResetFilters={handleResetFilters}
            hasFilters={hasFilters}
          />
        </div>

        {status === 'error' && error && (
          <StateMessage tone="error">{error.message || 'Unable to load search results.'}</StateMessage>
        )}

        <div style={layoutStyle}>
          <aside style={filtersStyle}>
            {optionsState.loading && <div style={styles.filterNotice}>Loading filter options…</div>}
            {optionsState.error && (
              <div style={styles.filterError}>
                {optionsState.error.message || 'Unable to load filter options.'}
              </div>
            )}

            {FACET_CONFIG.map((facet) => (
              <FacetGroup
                key={facet.attribute}
                attribute={facet.attribute}
                title={facet.title}
                options={facetOptions[facet.attribute] || []}
                selectedValues={facetSelections[facet.attribute] || []}
                onToggle={handleToggleFacet}
                searchable={facet.searchable}
                placeholder={facet.placeholder}
              />
            ))}
            <AgeRangeFacet value={ageRange} stats={optionsState.age} onApply={handleApplyAgeRange} onReset={handleResetAgeRange} />
            <ToggleGroup values={toggles} onToggle={handleToggle} />
          </aside>

          <div style={resultsStyle}>
            <div style={styles.resultsCard}>
              <StatsHeader status={status} total={result.total} processingTimeMS={result.processingTimeMS} />
              <HitsGrid status={status} hits={result.hits} />
              <PaginationControls status={status} page={page} nbPages={result.nbPages} onPageChange={handlePageChange} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  headerCard: {
    background: '#0B3D91',
    color: '#FFFFFF',
    borderRadius: 18,
    padding: 28,
    boxShadow: '0 18px 36px rgba(11,61,145,0.26)',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  headerTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
  },
  headerSubtitle: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.6,
    maxWidth: 640,
  },
  toolbar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  searchInputWrap: {
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    borderRadius: 14,
    border: 'none',
    padding: '14px 44px 14px 18px',
    fontSize: 16,
    outline: 'none',
    boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
  },
  searchClearBtn: {
    position: 'absolute',
    top: '50%',
    right: 12,
    transform: 'translateY(-50%)',
    border: 'none',
    background: '#0B3D91',
    color: '#FFFFFF',
    borderRadius: 999,
    padding: '4px 10px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  clearFiltersBtn: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.7)',
    color: '#0B3D91',
    background: '#FFFFFF',
    padding: '6px 16px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  clearFiltersBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    gap: 24,
    alignItems: 'flex-start',
  },
  layoutMobile: {
    gridTemplateColumns: '1fr',
  },
  filters: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  filtersMobile: {
    order: 2,
  },
  filterNotice: {
    fontSize: 13,
    color: '#0B3D91',
    background: '#EBF2FF',
    borderRadius: 12,
    padding: '10px 12px',
  },
  filterError: {
    fontSize: 13,
    color: '#B91C1C',
    background: '#FEE2E2',
    borderRadius: 12,
    padding: '10px 12px',
  },
  results: {
    display: 'flex',
  },
  resultsMobile: {
    order: 1,
  },
  resultsCard: {
    background: '#F8FAFC',
    borderRadius: 24,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    boxShadow: '0 12px 30px rgba(11,61,145,0.12)',
  },
  facetGroup: {
    background: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    boxShadow: '0 10px 24px rgba(15,23,42,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  facetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  facetTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#0F172A',
  },
  showMoreBtn: {
    border: 'none',
    background: 'transparent',
    color: '#0B3D91',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  facetSearchInput: {
    width: '100%',
    borderRadius: 12,
    border: '1px solid #CBD5F5',
    padding: '8px 12px',
    fontSize: 13,
  },
  facetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  facetItem: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    alignItems: 'center',
    gap: 10,
    background: '#F8FAFF',
    borderRadius: 12,
    padding: '8px 12px',
    border: '1px solid transparent',
  },
  facetItemActive: {
    borderColor: '#0B3D91',
    background: 'rgba(11,61,145,0.1)',
  },
  facetCheckbox: {
    width: 16,
    height: 16,
  },
  facetLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#0F172A',
  },
  emptyFacet: {
    fontSize: 13,
    color: '#64748B',
  },
  ageForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  ageInputs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
  },
  ageInputLabel: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: 12,
    color: '#475569',
    fontWeight: 600,
    gap: 6,
  },
  ageInput: {
    borderRadius: 10,
    border: '1px solid #CBD5F5',
    padding: '8px 10px',
    fontSize: 13,
  },
  ageActions: {
    display: 'flex',
    gap: 8,
  },
  ageApplyBtn: {
    flex: 1,
    border: 'none',
    borderRadius: 999,
    background: '#0B3D91',
    color: '#FFFFFF',
    padding: '8px 12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  ageResetBtn: {
    flex: 1,
    borderRadius: 999,
    border: '1px solid #CBD5F5',
    background: '#FFFFFF',
    color: '#0B3D91',
    padding: '8px 12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  toggleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    boxShadow: '0 10px 24px rgba(15,23,42,0.1)',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 13,
    fontWeight: 600,
    color: '#0F172A',
  },
  toggleRowInactive: {
    color: '#64748B',
  },
  toggleInput: {
    width: 16,
    height: 16,
  },
  toggleLabel: {
    flex: 1,
  },
  statsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statsText: {
    fontSize: 15,
    fontWeight: 700,
    color: '#0F172A',
  },
  statsMeta: {
    fontSize: 13,
    color: '#475569',
  },
  hitsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 18,
  },
  hitCard: {
    background: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 12px 24px rgba(15,23,42,0.12)',
  },
  hitHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  hitRole: {
    fontSize: 16,
    fontWeight: 700,
    color: '#0F172A',
  },
  hitBadge: {
    background: '#EBF2FF',
    color: '#0B3D91',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  hitTags: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  hitTag: {
    background: '#0B3D91',
    color: '#FFFFFF',
    borderRadius: 12,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
  },
  hitMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    color: '#475569',
  },
  metaItem: {
    display: 'inline-flex',
    gap: 4,
  },
  hitRegions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    color: '#475569',
  },
  hitRegionList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  regionBadge: {
    background: '#E2E8F0',
    color: '#0F172A',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
  },
  hitFlags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  flagBadge: {
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid transparent',
  },
  flagBadgeActive: {
    background: '#0B3D91',
    color: '#FFFFFF',
  },
  flagBadgeInactive: {
    background: '#E2E8F0',
    color: '#475569',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  pageBtn: {
    borderRadius: 999,
    border: '1px solid #CBD5F5',
    background: '#FFFFFF',
    color: '#0B3D91',
    padding: '8px 14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  pageBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  pageList: {
    display: 'flex',
    gap: 6,
  },
  pageNumber: {
    borderRadius: 10,
    border: '1px solid transparent',
    background: '#FFFFFF',
    color: '#0B3D91',
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  pageNumberActive: {
    background: '#0B3D91',
    color: '#FFFFFF',
  },
  emptyResults: {
    padding: 24,
    textAlign: 'center',
    background: '#FFFFFF',
    borderRadius: 18,
    color: '#475569',
    fontSize: 14,
    boxShadow: '0 8px 16px rgba(15,23,42,0.08)',
  },
  hitCardSkeleton: {
    background: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 12px 24px rgba(15,23,42,0.12)',
  },
  hitSkeletonLine: {
    height: 12,
    background: 'linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9)',
    borderRadius: 999,
  },
  stateBox: {
    padding: 16,
    borderRadius: 12,
    background: '#EBF2FF',
    color: '#0B3D91',
    fontWeight: 600,
  },
  stateBoxError: {
    background: '#FEE2E2',
    color: '#B91C1C',
  },
};

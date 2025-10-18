diff --git a/sections/operator/SearchPanel.js b/sections/operator/SearchPanel.js
index f548dd9498ff109542222d3659ec7802e1d82517..325888ca1381c917dcf5922c27f716b36ffc362b 100644
--- a/sections/operator/SearchPanel.js
+++ b/sections/operator/SearchPanel.js
@@ -1,10 +1,879 @@
-import PlaceholderPanel from './PlaceholderPanel';
+import { useEffect, useMemo, useState } from 'react';
+import algoliasearch from 'algoliasearch/lite';
+import {
+  InstantSearch,
+  useSearchBox,
+  useClearRefinements,
+  useRefinementList,
+  useRange,
+  useToggleRefinement,
+  useHits,
+  useStats,
+  useInstantSearch,
+  usePagination,
+  Configure,
+} from 'react-instantsearch-hooks-web';
+
+const ALGOLIA_APP_ID = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
+const ALGOLIA_SEARCH_KEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
+const ALGOLIA_INDEX = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_ATHLETE_SEARCH;
+
+const StateMessage = ({ tone = 'default', children }) => {
+  const base = { ...styles.stateBox };
+  if (tone === 'error') Object.assign(base, styles.stateBoxError);
+  return <div style={base}>{children}</div>;
+};
+
+function SearchToolbar() {
+  const { query, refine, clear } = useSearchBox();
+  const { canRefine, refine: clearAll } = useClearRefinements();
+
+  return (
+    <div style={styles.toolbar}>
+      <div style={styles.searchInputWrap}>
+        <input
+          type="search"
+          value={query}
+          onChange={(event) => refine(event.currentTarget.value)}
+          placeholder="Search by role, sport, nationality or regions"
+          style={styles.searchInput}
+        />
+        {query && (
+          <button type="button" onClick={() => clear()} style={styles.searchClearBtn}>
+            Clear
+          </button>
+        )}
+      </div>
+      <button
+        type="button"
+        onClick={() => clearAll()}
+        style={{
+          ...styles.clearFiltersBtn,
+          ...(canRefine ? null : styles.clearFiltersBtnDisabled),
+        }}
+        disabled={!canRefine}
+      >
+        Reset filters
+      </button>
+    </div>
+  );
+}
+
+function FacetGroup({ attribute, title, searchable = false, placeholder = 'Search...', transformItemLabel }) {
+  const { items, refine, searchForItems, canRefine, isFromSearch, canToggleShowMore, isShowingMore, toggleShowMore } =
+    useRefinementList({
+      attribute,
+      limit: 8,
+      showMore: true,
+      sortBy: ['isRefined:desc', 'name:asc'],
+    });
+  const [query, setQuery] = useState('');
+
+  useEffect(() => {
+    if (!searchable) return;
+    searchForItems(query);
+  }, [query, searchable, searchForItems]);
+
+  return (
+    <div style={styles.facetGroup}>
+      <div style={styles.facetHeader}>
+        <span style={styles.facetTitle}>{title}</span>
+        {canToggleShowMore && (
+          <button type="button" onClick={() => toggleShowMore()} style={styles.showMoreBtn}>
+            {isShowingMore ? 'Show less' : 'Show more'}
+          </button>
+        )}
+      </div>
+      {searchable && (
+        <input
+          type="search"
+          value={query}
+          onChange={(event) => setQuery(event.currentTarget.value)}
+          placeholder={placeholder}
+          style={styles.facetSearchInput}
+        />
+      )}
+      <div style={styles.facetList}>
+        {canRefine ? (
+          items.map((item) => {
+            const label = transformItemLabel ? transformItemLabel(item.label) : item.label;
+            return (
+              <label key={item.value} style={{ ...styles.facetItem, ...(item.isRefined ? styles.facetItemActive : null) }}>
+                <input
+                  type="checkbox"
+                  checked={item.isRefined}
+                  onChange={() => refine(item.value)}
+                  style={styles.facetCheckbox}
+                />
+                <span style={styles.facetLabel}>{label}</span>
+                <span style={styles.facetCount}>{item.count}</span>
+              </label>
+            );
+          })
+        ) : (
+          <div style={styles.emptyFacet}>{isFromSearch ? 'No matches' : 'No options available'}</div>
+        )}
+      </div>
+    </div>
+  );
+}
+
+function AgeRangeFacet() {
+  const { start, range, refine, canRefine } = useRange({ attribute: 'age' });
+  const [min, max] = start || [];
+  const [minInput, setMinInput] = useState('');
+  const [maxInput, setMaxInput] = useState('');
+
+  useEffect(() => {
+    setMinInput(Number.isFinite(min) ? String(min) : '');
+    setMaxInput(Number.isFinite(max) ? String(max) : '');
+  }, [min, max]);
+
+  const handleSubmit = (event) => {
+    event.preventDefault();
+    const nextMin = minInput.trim() === '' ? undefined : Number(minInput);
+    const nextMax = maxInput.trim() === '' ? undefined : Number(maxInput);
+    refine([Number.isFinite(nextMin) ? nextMin : undefined, Number.isFinite(nextMax) ? nextMax : undefined]);
+  };
+
+  const handleReset = () => {
+    setMinInput('');
+    setMaxInput('');
+    refine([undefined, undefined]);
+  };
+
+  const hasRange = Number.isFinite(range?.min) && Number.isFinite(range?.max) && range.min !== range.max;
+
+  return (
+    <div style={styles.facetGroup}>
+      <div style={styles.facetHeader}>
+        <span style={styles.facetTitle}>Age range</span>
+      </div>
+      {!hasRange && <div style={styles.emptyFacet}>No age data available</div>}
+      {hasRange && (
+        <form onSubmit={handleSubmit} style={styles.ageForm}>
+          <div style={styles.ageInputs}>
+            <label style={styles.ageLabel}>
+              <span>Min</span>
+              <input
+                type="number"
+                min={range.min ?? undefined}
+                max={range.max ?? undefined}
+                value={minInput}
+                onChange={(event) => setMinInput(event.currentTarget.value)}
+                style={styles.ageInput}
+              />
+            </label>
+            <label style={styles.ageLabel}>
+              <span>Max</span>
+              <input
+                type="number"
+                min={range.min ?? undefined}
+                max={range.max ?? undefined}
+                value={maxInput}
+                onChange={(event) => setMaxInput(event.currentTarget.value)}
+                style={styles.ageInput}
+              />
+            </label>
+          </div>
+          <div style={styles.ageActions}>
+            <button type="submit" style={{ ...styles.applyBtn, ...(canRefine ? null : styles.applyBtnDisabled) }}>
+              Apply
+            </button>
+            <button type="button" onClick={handleReset} style={styles.resetBtn}>
+              Clear
+            </button>
+          </div>
+        </form>
+      )}
+    </div>
+  );
+}
+
+function ToggleGroup({ attribute, label }) {
+  const { value, canRefine, refine } = useToggleRefinement({ attribute, value: true });
+  const checked = value?.isRefined ?? false;
+  const disabled = !canRefine && !checked;
+
+  return (
+    <label style={{ ...styles.toggleRow, ...(disabled ? styles.toggleRowDisabled : null) }}>
+      <input
+        type="checkbox"
+        checked={checked}
+        onChange={() => refine()}
+        disabled={disabled}
+        style={styles.toggleInput}
+      />
+      <span style={styles.toggleLabel}>{label}</span>
+    </label>
+  );
+}
+
+function StatsHeader() {
+  const { status } = useInstantSearch();
+  const { nbHits, processingTimeMS } = useStats();
+
+  return (
+    <div style={styles.statsBar}>
+      <span style={styles.statsText}>
+        {status === 'loading' ? 'Searching athletes…' : `${nbHits.toLocaleString()} athletes found`}
+      </span>
+      {status !== 'loading' && (
+        <span style={styles.statsMeta}>Updated in {processingTimeMS} ms</span>
+      )}
+    </div>
+  );
+}
+
+function HitsGrid() {
+  const { hits } = useHits();
+  const { status } = useInstantSearch();
+
+  if (status === 'loading') {
+    return (
+      <div style={styles.hitsGrid}>
+        {Array.from({ length: 6 }).map((_, index) => (
+          <div key={index} style={styles.hitCardSkeleton}>
+            <div style={styles.hitSkeletonLine} />
+            <div style={{ ...styles.hitSkeletonLine, width: '60%' }} />
+            <div style={{ ...styles.hitSkeletonLine, width: '40%' }} />
+          </div>
+        ))}
+      </div>
+    );
+  }
+
+  if (!hits.length) {
+    return <div style={styles.emptyResults}>No athletes match the current filters.</div>;
+  }
 
-export default function SearchPanel() {
   return (
-    <PlaceholderPanel
-      title="Search"
-      description="Discover athletes that match your scouting strategy. Filters, saved searches and collaboration tools will appear in this section."
-    />
+    <div style={styles.hitsGrid}>
+      {hits.map((hit) => (
+        <div key={hit.objectID} style={styles.hitCard}>
+          <div style={styles.hitHeader}>
+            <span style={styles.hitRole}>{hit.role || 'Role unavailable'}</span>
+            {hit.sport && <span style={styles.hitBadge}>{hit.sport}</span>}
+          </div>
+          {Array.isArray(hit.secondary_role) && hit.secondary_role.length > 0 && (
+            <div style={styles.hitTags}>
+              {hit.secondary_role.map((item) => (
+                <span key={item} style={styles.hitTag}>
+                  {item}
+                </span>
+              ))}
+            </div>
+          )}
+          <div style={styles.hitMeta}>
+            {hit.nationality && <span style={styles.metaItem}>Nationality: {hit.nationality}</span>}
+            {Number.isFinite(hit.age) && <span style={styles.metaItem}>Age: {hit.age}</span>}
+            {hit.category && <span style={styles.metaItem}>Category: {hit.category}</span>}
+          </div>
+          {Array.isArray(hit.preferred_regions) && hit.preferred_regions.length > 0 && (
+            <div style={styles.hitRegions}>
+              Preferred regions:
+              <div style={styles.hitRegionList}>
+                {hit.preferred_regions.map((region) => (
+                  <span key={region} style={styles.regionBadge}>
+                    {region}
+                  </span>
+                ))}
+              </div>
+            </div>
+          )}
+          <div style={styles.hitFlags}>
+            <Flag value={hit.is_verified} label="Verified" />
+            <Flag value={hit.seeking_team} label="Seeking team" />
+            <Flag value={hit.has_active_contract} label="Active contract" />
+            <Flag value={hit.is_represented} label="Has agent" />
+          </div>
+        </div>
+      ))}
+    </div>
   );
 }
+
+function Flag({ value, label }) {
+  const active = Boolean(value);
+  return (
+    <span style={{ ...styles.flagBadge, ...(active ? styles.flagBadgeActive : styles.flagBadgeInactive) }}>
+      {label}
+    </span>
+  );
+}
+
+function PaginationControls() {
+  const { pages, currentRefinement, nbPages, refine, isFirstPage, isLastPage } = usePagination();
+
+  if (nbPages <= 1) return null;
+
+  return (
+    <div style={styles.pagination}>
+      <button
+        type="button"
+        onClick={() => refine(currentRefinement - 1)}
+        disabled={isFirstPage}
+        style={{ ...styles.pageBtn, ...(isFirstPage ? styles.pageBtnDisabled : null) }}
+      >
+        Previous
+      </button>
+      <div style={styles.pageList}>
+        {pages.map((page) => (
+          <button
+            key={page}
+            type="button"
+            onClick={() => refine(page)}
+            style={{
+              ...styles.pageNumber,
+              ...(page === currentRefinement ? styles.pageNumberActive : null),
+            }}
+          >
+            {page + 1}
+          </button>
+        ))}
+      </div>
+      <button
+        type="button"
+        onClick={() => refine(currentRefinement + 1)}
+        disabled={isLastPage}
+        style={{ ...styles.pageBtn, ...(isLastPage ? styles.pageBtnDisabled : null) }}
+      >
+        Next
+      </button>
+    </div>
+  );
+}
+
+export default function SearchPanel({ isMobile = false }) {
+  const [mounted, setMounted] = useState(false);
+
+  useEffect(() => {
+    setMounted(true);
+  }, []);
+
+  const searchClient = useMemo(() => {
+    if (!mounted) return null;
+    if (!ALGOLIA_APP_ID || !ALGOLIA_SEARCH_KEY) return null;
+    return algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);
+  }, [mounted, ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY]);
+
+  if (!ALGOLIA_APP_ID || !ALGOLIA_SEARCH_KEY || !ALGOLIA_INDEX) {
+    return (
+      <StateMessage tone="error">
+        Missing Algolia environment configuration. Ensure NEXT_PUBLIC_ALGOLIA_APP_ID, NEXT_PUBLIC_ALGOLIA_SEARCH_KEY and
+        NEXT_PUBLIC_ALGOLIA_INDEX_ATHLETE_SEARCH are defined.
+      </StateMessage>
+    );
+  }
+
+  if (!mounted || !searchClient) {
+    return <StateMessage>Loading search tools…</StateMessage>;
+  }
+
+  const layoutStyle = { ...styles.layout, ...(isMobile ? styles.layoutMobile : null) };
+  const filtersStyle = { ...styles.filters, ...(isMobile ? styles.filtersMobile : null) };
+  const resultsStyle = { ...styles.results, ...(isMobile ? styles.resultsMobile : null) };
+
+  return (
+    <InstantSearch searchClient={searchClient} indexName={ALGOLIA_INDEX}>
+      <Configure hitsPerPage={12} />
+      <div style={styles.wrapper}>
+        <div style={styles.headerCard}>
+          <h3 style={styles.headerTitle}>Athlete search</h3>
+          <p style={styles.headerSubtitle}>
+            Explore the international athlete database, filter by key attributes and sync shortlisted profiles with your
+            scouting workflow.
+          </p>
+          <SearchToolbar />
+        </div>
+
+        <div style={layoutStyle}>
+          <aside style={filtersStyle}>
+            <FacetGroup attribute="sport" title="Sport" />
+            <FacetGroup attribute="role" title="Role" />
+            <FacetGroup attribute="secondary_role" title="Secondary role" />
+            <FacetGroup attribute="gender" title="Gender" />
+            <FacetGroup attribute="nationality" title="Nationality" searchable placeholder="Search nationalities" />
+            <FacetGroup attribute="category" title="Category" />
+            <AgeRangeFacet />
+            <FacetGroup
+              attribute="preferred_regions"
+              title="Preferred regions"
+              searchable
+              placeholder="Search regions"
+            />
+            <div style={styles.toggleGroup}>
+              <ToggleGroup attribute="is_verified" label="Verified" />
+              <ToggleGroup attribute="seeking_team" label="Seeking team" />
+              <ToggleGroup attribute="has_active_contract" label="Has active contract" />
+              <ToggleGroup attribute="is_represented" label="Has agent" />
+            </div>
+          </aside>
+
+          <div style={resultsStyle}>
+            <div style={styles.resultsCard}>
+              <StatsHeader />
+              <HitsGrid />
+              <PaginationControls />
+            </div>
+          </div>
+        </div>
+      </div>
+    </InstantSearch>
+  );
+}
+
+const styles = {
+  wrapper: {
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 24,
+  },
+  headerCard: {
+    background: '#0B3D91',
+    color: '#FFFFFF',
+    borderRadius: 18,
+    padding: 28,
+    boxShadow: '0 18px 36px rgba(11,61,145,0.26)',
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 18,
+  },
+  headerTitle: {
+    margin: 0,
+    fontSize: 24,
+    fontWeight: 700,
+  },
+  headerSubtitle: {
+    margin: 0,
+    fontSize: 15,
+    lineHeight: 1.6,
+    maxWidth: 640,
+  },
+  toolbar: {
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 12,
+  },
+  searchInputWrap: {
+    position: 'relative',
+  },
+  searchInput: {
+    width: '100%',
+    borderRadius: 14,
+    border: 'none',
+    padding: '14px 44px 14px 18px',
+    fontSize: 16,
+    outline: 'none',
+    boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
+  },
+  searchClearBtn: {
+    position: 'absolute',
+    top: '50%',
+    right: 12,
+    transform: 'translateY(-50%)',
+    border: 'none',
+    background: '#0B3D91',
+    color: '#FFFFFF',
+    borderRadius: 999,
+    padding: '6px 12px',
+    fontSize: 12,
+    fontWeight: 600,
+    cursor: 'pointer',
+  },
+  clearFiltersBtn: {
+    alignSelf: 'flex-start',
+    background: '#FFFFFF',
+    color: '#0B3D91',
+    borderRadius: 999,
+    padding: '8px 16px',
+    border: '1px solid rgba(255,255,255,0.6)',
+    fontSize: 13,
+    fontWeight: 600,
+    cursor: 'pointer',
+  },
+  clearFiltersBtnDisabled: {
+    opacity: 0.5,
+    cursor: 'not-allowed',
+  },
+  layout: {
+    display: 'grid',
+    gridTemplateColumns: '320px 1fr',
+    gap: 24,
+    alignItems: 'flex-start',
+  },
+  layoutMobile: {
+    gridTemplateColumns: '1fr',
+  },
+  filters: {
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 16,
+  },
+  filtersMobile: {
+    order: 2,
+  },
+  results: {
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 16,
+  },
+  resultsMobile: {
+    order: 1,
+  },
+  facetGroup: {
+    background: '#FFFFFF',
+    borderRadius: 16,
+    border: '1px solid #E2E8F0',
+    padding: 18,
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 14,
+    boxShadow: '0 12px 24px rgba(15,23,42,0.08)',
+  },
+  facetHeader: {
+    display: 'flex',
+    justifyContent: 'space-between',
+    alignItems: 'center',
+  },
+  facetTitle: {
+    fontSize: 13,
+    fontWeight: 700,
+    letterSpacing: '0.04em',
+    textTransform: 'uppercase',
+    color: '#0F172A',
+  },
+  showMoreBtn: {
+    border: 'none',
+    background: 'transparent',
+    color: '#0B3D91',
+    fontSize: 12,
+    fontWeight: 600,
+    cursor: 'pointer',
+  },
+  facetSearchInput: {
+    width: '100%',
+    borderRadius: 10,
+    border: '1px solid #CBD5F5',
+    padding: '8px 12px',
+    fontSize: 14,
+  },
+  facetList: {
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 8,
+  },
+  facetItem: {
+    display: 'flex',
+    alignItems: 'center',
+    justifyContent: 'space-between',
+    gap: 12,
+    padding: '8px 10px',
+    borderRadius: 10,
+    background: '#F8FAFC',
+    border: '1px solid transparent',
+    cursor: 'pointer',
+  },
+  facetItemActive: {
+    borderColor: '#0B3D91',
+    background: 'rgba(11,61,145,0.08)',
+  },
+  facetCheckbox: {
+    marginRight: 8,
+  },
+  facetLabel: {
+    flex: 1,
+    fontSize: 14,
+    fontWeight: 600,
+    color: '#0F172A',
+  },
+  facetCount: {
+    fontSize: 12,
+    color: '#475569',
+    fontWeight: 600,
+  },
+  emptyFacet: {
+    fontSize: 13,
+    color: '#64748B',
+  },
+  ageForm: {
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 12,
+  },
+  ageInputs: {
+    display: 'flex',
+    gap: 12,
+  },
+  ageLabel: {
+    flex: 1,
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 6,
+    fontSize: 13,
+    color: '#334155',
+    fontWeight: 600,
+  },
+  ageInput: {
+    borderRadius: 10,
+    border: '1px solid #CBD5F5',
+    padding: '8px 12px',
+    fontSize: 14,
+  },
+  ageActions: {
+    display: 'flex',
+    gap: 10,
+  },
+  applyBtn: {
+    background: '#0B3D91',
+    color: '#FFFFFF',
+    border: 'none',
+    borderRadius: 10,
+    padding: '8px 16px',
+    fontSize: 13,
+    fontWeight: 600,
+    cursor: 'pointer',
+  },
+  applyBtnDisabled: {
+    opacity: 0.6,
+    cursor: 'not-allowed',
+  },
+  resetBtn: {
+    border: 'none',
+    background: 'transparent',
+    color: '#0B3D91',
+    fontWeight: 600,
+    cursor: 'pointer',
+  },
+  toggleGroup: {
+    display: 'grid',
+    gap: 8,
+  },
+  toggleRow: {
+    display: 'flex',
+    alignItems: 'center',
+    gap: 10,
+    padding: '10px 12px',
+    background: '#FFFFFF',
+    borderRadius: 12,
+    border: '1px solid #E2E8F0',
+    fontWeight: 600,
+    color: '#0F172A',
+    cursor: 'pointer',
+    boxShadow: '0 8px 16px rgba(15,23,42,0.05)',
+  },
+  toggleRowDisabled: {
+    opacity: 0.6,
+    cursor: 'not-allowed',
+  },
+  toggleInput: {
+    width: 16,
+    height: 16,
+  },
+  toggleLabel: {
+    fontSize: 14,
+  },
+  resultsCard: {
+    background: '#FFFFFF',
+    borderRadius: 20,
+    border: '1px solid #E2E8F0',
+    padding: 24,
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 20,
+    boxShadow: '0 16px 28px rgba(15,23,42,0.08)',
+  },
+  statsBar: {
+    display: 'flex',
+    flexWrap: 'wrap',
+    justifyContent: 'space-between',
+    gap: 8,
+    alignItems: 'center',
+  },
+  statsText: {
+    fontSize: 16,
+    fontWeight: 700,
+    color: '#0F172A',
+  },
+  statsMeta: {
+    fontSize: 13,
+    color: '#64748B',
+    fontWeight: 500,
+  },
+  hitsGrid: {
+    display: 'grid',
+    gap: 16,
+    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
+  },
+  hitCard: {
+    background: '#F8FAFC',
+    borderRadius: 16,
+    padding: 18,
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 12,
+    border: '1px solid rgba(15,23,42,0.05)',
+  },
+  hitHeader: {
+    display: 'flex',
+    justifyContent: 'space-between',
+    alignItems: 'center',
+    gap: 12,
+  },
+  hitRole: {
+    fontSize: 17,
+    fontWeight: 700,
+    color: '#0F172A',
+  },
+  hitBadge: {
+    background: '#0B3D91',
+    color: '#FFFFFF',
+    fontSize: 12,
+    fontWeight: 600,
+    padding: '4px 10px',
+    borderRadius: 999,
+  },
+  hitTags: {
+    display: 'flex',
+    flexWrap: 'wrap',
+    gap: 6,
+  },
+  hitTag: {
+    background: '#E2E8F0',
+    color: '#0F172A',
+    fontSize: 12,
+    fontWeight: 600,
+    padding: '4px 8px',
+    borderRadius: 999,
+  },
+  hitMeta: {
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 4,
+    fontSize: 13,
+    color: '#334155',
+  },
+  metaItem: {
+    fontWeight: 600,
+  },
+  hitRegions: {
+    display: 'flex',
+    flexDirection: 'column',
+    gap: 6,
+    fontSize: 13,
+    color: '#0F172A',
+  },
+  hitRegionList: {
+    display: 'flex',
+    flexWrap: 'wrap',
+    gap: 6,
+  },
+  regionBadge: {
+    background: '#FFF',
+    border: '1px solid #CBD5F5',
+    borderRadius: 999,
+    padding: '4px 10px',
+    fontSize: 12,
+    fontWeight: 600,
+    color: '#0B3D91',
+  },
+  hitFlags: {
+    display: 'flex',
+    flexWrap: 'wrap',
+    gap: 8,
+  },
+  flagBadge: {
+    fontSize: 11,
+    fontWeight: 700,
+    padding: '4px 8px',
+    borderRadius: 999,
+    textTransform: 'uppercase',
+    letterSpacing: '0.04em',
+  },
+  flagBadgeActive: {
+    background: 'rgba(11,61,145,0.12)',
+    color: '#0B3D91',
+  },
+  flagBadgeInactive: {
+    background: '#E2E8F0',
+    color: '#64748B',
+  },
+  hitCardSkeleton: {
+    background: '#F1F5F9',
+    borderRadius: 16,
+    padding: 18,
+    display: 'grid',
+    gap: 10,
+  },
+  hitSkeletonLine: {
+    height: 12,
+    borderRadius: 6,
+    background: 'linear-gradient(90deg, rgba(226,232,240,0.8), rgba(148,163,184,0.5), rgba(226,232,240,0.8))',
+  },
+  emptyResults: {
+    fontSize: 15,
+    color: '#475569',
+    padding: '40px 0',
+    textAlign: 'center',
+    fontWeight: 600,
+  },
+  pagination: {
+    display: 'flex',
+    alignItems: 'center',
+    justifyContent: 'space-between',
+    gap: 12,
+    flexWrap: 'wrap',
+  },
+  pageBtn: {
+    background: '#0B3D91',
+    color: '#FFFFFF',
+    border: 'none',
+    borderRadius: 999,
+    padding: '8px 16px',
+    fontSize: 13,
+    fontWeight: 600,
+    cursor: 'pointer',
+  },
+  pageBtnDisabled: {
+    opacity: 0.5,
+    cursor: 'not-allowed',
+  },
+  pageList: {
+    display: 'flex',
+    gap: 6,
+    flexWrap: 'wrap',
+  },
+  pageNumber: {
+    minWidth: 36,
+    height: 36,
+    borderRadius: 10,
+    border: '1px solid #CBD5F5',
+    background: '#FFFFFF',
+    color: '#0F172A',
+    fontSize: 13,
+    fontWeight: 600,
+    display: 'flex',
+    alignItems: 'center',
+    justifyContent: 'center',
+    cursor: 'pointer',
+  },
+  pageNumberActive: {
+    background: '#0B3D91',
+    color: '#FFFFFF',
+    borderColor: '#0B3D91',
+  },
+  stateBox: {
+    borderRadius: 16,
+    border: '1px solid rgba(2,115,115,0.3)',
+    background: 'linear-gradient(135deg, rgba(39,227,218,0.1), rgba(247,184,78,0.18))',
+    padding: 24,
+    color: '#0F172A',
+    fontSize: 15,
+    fontWeight: 600,
+  },
+  stateBoxError: {
+    border: '1px solid rgba(220,38,38,0.35)',
+    background: 'linear-gradient(135deg, rgba(248,113,113,0.12), rgba(254,215,170,0.18))',
+    color: '#991B1B',
+  },
+};

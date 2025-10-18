'use client';

import React from 'react';
import Head from 'next/head';
import singletonRouter from 'next/router';
import { liteClient as algoliasearch } from 'algoliasearch/lite';
import {
  InstantSearch,
  SearchBox,
  Hits,
  Highlight,
  RefinementList,
  ToggleRefinement,
  RangeInput,
  CurrentRefinements,
  ClearRefinements,
  Pagination,
  Configure,
} from 'react-instantsearch';
import { createInstantSearchRouterNext } from 'react-instantsearch-router-nextjs';

// Env client
const APP_ID = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
const SEARCH_KEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
const INDEX_NAME = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_ATHLETE_SEARCH;

// Client Algolia (lite per il browser)
const searchClient = algoliasearch(APP_ID, SEARCH_KEY);

// Router Next per sincronizzare stato ↔ URL
const routing = { router: createInstantSearchRouterNext({ singletonRouter }) };

function Hit({ hit }) {
  return (
    <article style={{ border: '1px solid #eee', borderRadius: 12, padding: 12, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>ID #{hit.objectID}</div>
      <div>
        <strong><Highlight attribute="role" hit={hit} /></strong> · <Highlight attribute="sport" hit={hit} />
      </div>
      <div style={{ fontSize: 14 }}>
        {hit.nationality && <span>{hit.nationality}</span>}
        {typeof hit.age === 'number' && <span> · {hit.age} y</span>}
      </div>
      {Array.isArray(hit.secondary_role) && hit.secondary_role.length > 0 && (
        <div style={{ fontSize: 13, opacity: 0.9 }}>
          Secondary: {hit.secondary_role.join(', ')}
        </div>
      )}
      {Array.isArray(hit.preferred_regions) && hit.preferred_regions.length > 0 && (
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Pref. regions: {hit.preferred_regions.join(', ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        {hit.is_verified && <span style={pill('#1E88E5')}>Verified</span>}
        {hit.seeking_team && <span style={pill('#8E24AA')}>Seeking team</span>}
        {hit.has_active_contract && <span style={pill('#3949AB')}>Active contract</span>}
        {hit.is_represented && <span style={pill('#00897B')}>Agent</span>}
      </div>
    </article>
  );
}
const pill = (bg) => ({
  background: bg, color: 'white', borderRadius: 999, padding: '2px 8px', fontSize: 12,
});

export default function SearchPanel() {
  return (
    <>
      <Head>
        <link rel="icon" href="/talentlix_favicon_32x32.ico" sizes="32x32" />
        <link rel="icon" href="/talentlix_favicon_16x16.ico" sizes="16x16" />
      </Head>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, minHeight: '70vh' }}>
        <InstantSearch searchClient={searchClient} indexName={INDEX_NAME} routing={routing} insights>
          <Configure hitsPerPage={24} />

          {/* Sidebar filtri */}
          <aside style={{ display: 'grid', gap: 12 }}>
            <ClearRefinements />
            <CurrentRefinements />

            <h4>Search</h4>
            <SearchBox placeholder="Search role, sport, nationality, regions…" />

            <h4>Filters</h4>
            <RefinementList attribute="sport" />
            <RefinementList attribute="role" />
            <RefinementList attribute="secondary_role" />
            <RefinementList attribute="gender" />
            <RefinementList attribute="nationality" searchable searchablePlaceholder="Type a country…" />
            <RefinementList attribute="category" />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Age range</div>
              <RangeInput attribute="age" />
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Preferred regions</div>
              <RefinementList attribute="preferred_regions" searchable searchablePlaceholder="Type a region…" />
            </div>

            <h4>Flags</h4>
            <ToggleRefinement attribute="is_verified" label="Verified" on={true} />
            <ToggleRefinement attribute="seeking_team" label="Seeking team" on={true} />
            <ToggleRefinement attribute="has_active_contract" label="Has active contract" on={true} />
            <ToggleRefinement attribute="is_represented" label="Agent" on={true} />
          </aside>

          {/* Risultati */}
          <main style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Athletes</div>
            </div>
            <Hits hitComponent={Hit} />
            <Pagination />
          </main>
        </InstantSearch>
      </div>
    </>
  );
}

'use client';

import React, { useMemo } from 'react';
import Head from 'next/head';
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

// Env client
const APP_ID = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
const SEARCH_KEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
const INDEX_NAME = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_ATHLETE_SEARCH;

const fallbackSearchClient = {
  search(requests = []) {
    return Promise.resolve({
      results: requests.map((request) => {
        const params = request?.params || {};
        const hitsPerPage = Number(params?.hitsPerPage) || 24;
        const page = Number(params?.page) || 0;
        const query = typeof params?.query === 'string' ? params.query : '';
        const serializedParams =
          typeof params === 'string'
            ? params
            : new URLSearchParams(Object.entries(params || {}).filter(([, value]) => value != null)).toString();

        return {
          hits: [],
          nbHits: 0,
          processingTimeMS: 0,
          hitsPerPage,
          page,
          exhaustiveNbHits: false,
          query,
          params: serializedParams,
          facets: {},
        };
      }),
    });
  },
  searchForFacetValues() {
    return Promise.resolve({ facetHits: [] });
  },
};

const tagConfig = [
  { key: 'is_verified', label: 'Verified', tone: 'success' },
  { key: 'seeking_team', label: 'Seeking team', tone: 'accent' },
  { key: 'has_active_contract', label: 'Active contract', tone: 'warning' },
  { key: 'is_represented', label: 'Agent', tone: 'neutral' },
];

function Hit({ hit }) {
  const tags = useMemo(() => {
    return tagConfig
      .filter(({ key }) => Boolean(hit?.[key]))
      .map(({ key, label, tone }) => ({ key, label, tone }));
  }, [hit]);

  const secondaryRoles = Array.isArray(hit.secondary_role) ? hit.secondary_role.filter(Boolean) : [];
  const preferredRegions = Array.isArray(hit.preferred_regions)
    ? hit.preferred_regions.filter(Boolean)
    : [];

  return (
    <article className="hitCard">
      <header className="hitCard__header">
        <div className="hitCard__titleGroup">
          <span className="hitCard__id">#{hit.objectID}</span>
          {hit.category && <span className="hitCard__category">{hit.category}</span>}
        </div>
        <h3 className="hitCard__title">
          <Highlight attribute="role" hit={hit} />
        </h3>
        <p className="hitCard__subtitle">
          <span className="hitCard__sport">
            <Highlight attribute="sport" hit={hit} />
          </span>
          {hit.gender && <span className="hitCard__dot">•</span>}
          {hit.gender && <span className="hitCard__meta">{hit.gender}</span>}
          {typeof hit.age === 'number' && (
            <>
              <span className="hitCard__dot">•</span>
              <span className="hitCard__meta">{hit.age} y</span>
            </>
          )}
        </p>
      </header>

      <div className="hitCard__body">
        <dl className="hitCard__list">
          {hit.nationality && (
            <div className="hitCard__listItem">
              <dt>Nationality</dt>
              <dd>{hit.nationality}</dd>
            </div>
          )}
          {preferredRegions.length > 0 && (
            <div className="hitCard__listItem">
              <dt>Preferred regions</dt>
              <dd>{preferredRegions.join(', ')}</dd>
            </div>
          )}
          {secondaryRoles.length > 0 && (
            <div className="hitCard__listItem">
              <dt>Secondary roles</dt>
              <dd>{secondaryRoles.join(', ')}</dd>
            </div>
          )}
        </dl>
      </div>

      {tags.length > 0 && (
        <footer className="hitCard__footer">
          {tags.map((tag) => (
            <span key={tag.key} className={`hitCard__tag hitCard__tag--${tag.tone}`}>
              {tag.label}
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}

export default function SearchPanel() {
  const isSearchConfigured = Boolean(APP_ID && SEARCH_KEY && INDEX_NAME);
  const searchClient = useMemo(() => {
    if (isSearchConfigured) {
      return algoliasearch(APP_ID, SEARCH_KEY);
    }
    return fallbackSearchClient;
  }, [isSearchConfigured]);
  const indexName = isSearchConfigured ? INDEX_NAME : 'placeholder-index';

  return (
    <>
      <Head>
        <link rel="icon" href="/talentlix_favicon_32x32.ico" sizes="32x32" />
        <link rel="icon" href="/talentlix_favicon_16x16.ico" sizes="16x16" />
      </Head>

      <div className="searchPanel">
        <InstantSearch searchClient={searchClient} indexName={indexName} insights>
          <Configure hitsPerPage={24} />

          <div className="searchPanel__hero">
            <div className="searchPanel__heroText">
              <p className="searchPanel__eyebrow">Talent directory</p>
              <h1>Find athletes fast</h1>
              <p className="searchPanel__description">Search by sport, role or region and tune filters in real time.</p>
            </div>
            <div className="searchPanel__quickActions">
              <ClearRefinements className="clearButton" translations={{ resetButtonText: 'Reset all filters' }} />
              <CurrentRefinements className="currentRefinements" />
            </div>
          </div>

          <div className="searchPanel__layout">
            <aside className="searchPanel__filters">
              <section className="filterCard">
                <header>
                  <h2>Search</h2>
                  <p>Type a role, sport, nationality or region.</p>
                </header>
                <SearchBox
                  placeholder="Search athletes…"
                  classNames={{
                    root: 'searchBox',
                    form: 'searchBox__form',
                    input: 'searchBox__input',
                    submit: 'searchBox__submit',
                    submitIcon: 'searchBox__submitIcon',
                    reset: 'searchBox__reset',
                    resetIcon: 'searchBox__resetIcon',
                    loadingIndicator: 'searchBox__loading',
                  }}
                />
              </section>

              <section className="filterCard">
                <header>
                  <h2>Sports & Roles</h2>
                </header>
                <RefinementList attribute="sport" className="refinementList" searchable searchablePlaceholder="Search sport" />
                <RefinementList attribute="role" className="refinementList" searchable searchablePlaceholder="Search role" />
                <RefinementList
                  attribute="secondary_role"
                  className="refinementList"
                  searchable
                  searchablePlaceholder="Search secondary role"
                />
                <RefinementList attribute="category" className="refinementList" />
              </section>

              <section className="filterCard">
                <header>
                  <h2>Player profile</h2>
                </header>
                <RefinementList attribute="gender" className="refinementList" />
                <RefinementList
                  attribute="nationality"
                  className="refinementList"
                  searchable
                  searchablePlaceholder="Search nationality"
                />
                <div className="filterCard__group">
                  <h3>Age range</h3>
                  <RangeInput attribute="age" className="rangeInput" />
                </div>
                <div className="filterCard__group">
                  <h3>Preferred regions</h3>
                  <RefinementList
                    attribute="preferred_regions"
                    className="refinementList"
                    searchable
                    searchablePlaceholder="Search region"
                  />
                </div>
              </section>

              <section className="filterCard">
                <header>
                  <h2>Availability</h2>
                  <p>Use the toggles to focus on contract status or representation.</p>
                </header>
                <div className="toggleList">
                  <ToggleRefinement attribute="is_verified" label="Verified" />
                  <ToggleRefinement attribute="seeking_team" label="Seeking team" />
                  <ToggleRefinement attribute="has_active_contract" label="Has active contract" />
                  <ToggleRefinement attribute="is_represented" label="Agent" />
                </div>
              </section>
            </aside>

            <main className="searchPanel__results">
              <header className="resultsHeader">
                <div>
                  <h2>Athletes</h2>
                  <p>Profiles update in real time as you adjust filters.</p>
                  {!isSearchConfigured && (
                    <p className="resultsHeader__notice">Search is disabled in this demo environment.</p>
                  )}
                </div>
              </header>
              <Hits
                hitComponent={Hit}
                classNames={{
                  root: 'hits',
                  list: 'hits__list',
                  item: 'hits__item',
                }}
              />
              <Pagination classNames={{ root: 'pagination' }} />
            </main>
          </div>
        </InstantSearch>
      </div>

      <style jsx>{`
        .searchPanel {
          min-height: 100vh;
          padding: clamp(2rem, 5vw, 4rem) clamp(1.5rem, 5vw, 4rem);
          background: linear-gradient(150deg, rgba(39, 227, 218, 0.18), rgba(247, 184, 78, 0.18) 42%, #f8fafc 90%);
          color: #0f172a;
        }

        .searchPanel__hero {
          display: grid;
          gap: clamp(1.25rem, 4vw, 2.5rem);
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
          align-items: start;
          max-width: 1180px;
          margin: 0 auto clamp(2rem, 4vw, 3rem);
          padding: clamp(1.75rem, 4vw, 2.5rem);
          border-radius: 28px;
          background: linear-gradient(135deg, rgba(39, 227, 218, 0.18), rgba(247, 184, 78, 0.22));
          border: 1px solid rgba(39, 227, 218, 0.22);
          box-shadow: 0 35px 90px -60px rgba(15, 23, 42, 0.45);
        }

        .searchPanel__heroText h1 {
          font-size: clamp(2rem, 4vw, 2.65rem);
          margin: 0 0 0.5rem 0;
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: #0f172a;
        }

        .searchPanel__heroText {
          display: grid;
          gap: 0.75rem;
        }

        .searchPanel__eyebrow {
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-size: 0.75rem;
          font-weight: 600;
          color: #0f172a;
          margin: 0;
          opacity: 0.8;
        }

        .searchPanel__description {
          margin: 0;
          color: #0f172a;
          font-weight: 500;
          font-size: 1rem;
          max-width: 360px;
        }

        .searchPanel__quickActions {
          display: grid;
          gap: 1rem;
          justify-items: end;
        }

        .searchPanel__layout {
          display: grid;
          gap: clamp(1.5rem, 4vw, 2.75rem);
          grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
          max-width: 1180px;
          margin: 0 auto;
        }

        .searchPanel__filters {
          display: grid;
          gap: 1.25rem;
          position: sticky;
          top: clamp(1rem, 3vw, 2rem);
          align-self: start;
        }

        .filterCard {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(39, 227, 218, 0.08));
          border: 1px solid rgba(39, 227, 218, 0.18);
          border-radius: 20px;
          padding: 1.35rem;
          box-shadow: 0 28px 60px -40px rgba(15, 23, 42, 0.35);
          display: grid;
          gap: 1rem;
          backdrop-filter: blur(22px);
        }

        .filterCard header h2 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 600;
          color: #0f172a;
        }

        .filterCard header p {
          margin: 0.25rem 0 0;
          font-size: 0.88rem;
          color: #0f172a;
          font-weight: 500;
        }

        .filterCard__group {
          display: grid;
          gap: 0.6rem;
        }

        .filterCard__group h3 {
          margin: 0;
          font-size: 0.95rem;
          color: #475569;
        }

        .toggleList {
          display: grid;
          gap: 0.8rem;
        }

        .searchPanel__results {
          display: grid;
          gap: 1.5rem;
          min-width: 0;
        }

        .resultsHeader h2 {
          margin: 0;
          font-size: 1.6rem;
          font-weight: 600;
          color: #0f172a;
        }

        .resultsHeader p {
          margin: 0.25rem 0 0;
          color: #334155;
          font-weight: 500;
        }

        .resultsHeader__notice {
          display: inline-flex;
          align-items: center;
          margin-top: 0.6rem;
          padding: 0.35rem 0.8rem;
          border-radius: 999px;
          background: linear-gradient(120deg, rgba(39, 227, 218, 0.25), rgba(247, 184, 78, 0.3));
          color: #0f172a;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        .hitCard {
          background: rgba(255, 255, 255, 0.92);
          border-radius: 20px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          padding: 1.35rem;
          display: grid;
          gap: 1.15rem;
          box-shadow: 0 18px 48px -28px rgba(15, 23, 42, 0.22);
        }

        .hitCard__header {
          display: grid;
          gap: 0.4rem;
        }

        .hitCard__title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #0f172a;
        }

        .hitCard__subtitle {
          margin: 0;
          font-size: 0.95rem;
          color: #475569;
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          align-items: center;
        }

        .hitCard__sport :global(mark) {
          background: rgba(59, 130, 246, 0.18);
          color: #0f172a;
        }

        .hitCard__title :global(mark) {
          background: rgba(20, 184, 166, 0.18);
          color: #0f172a;
        }

        .hitCard__titleGroup {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .hitCard__id {
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #94a3b8;
        }

        .hitCard__category {
          font-size: 0.75rem;
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          background: rgba(59, 130, 246, 0.12);
          color: #2563eb;
          border: 1px solid rgba(37, 99, 235, 0.2);
        }

        .hitCard__dot {
          opacity: 0.4;
        }

        .hitCard__list {
          display: grid;
          gap: 0.75rem;
        }

        .hitCard__listItem {
          display: grid;
          gap: 0.3rem;
        }

        .hitCard__listItem dt {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #94a3b8;
        }

        .hitCard__listItem dd {
          margin: 0;
          font-size: 0.95rem;
          color: #0f172a;
        }

        .hitCard__footer {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .hitCard__tag {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          background: rgba(15, 23, 42, 0.06);
          color: #0f172a;
        }

        .hitCard__tag--success {
          background: rgba(34, 197, 94, 0.16);
          color: #15803d;
        }

        .hitCard__tag--accent {
          background: rgba(59, 130, 246, 0.16);
          color: #1d4ed8;
        }

        .hitCard__tag--warning {
          background: rgba(250, 204, 21, 0.18);
          color: #b45309;
        }

        .hitCard__tag--neutral {
          background: rgba(148, 163, 184, 0.2);
          color: #475569;
        }

        @media (max-width: 1080px) {
          .searchPanel__hero {
            grid-template-columns: 1fr;
            padding: clamp(1.5rem, 5vw, 2rem);
          }

          .searchPanel__layout {
            grid-template-columns: 1fr;
          }

          .searchPanel__filters {
            position: relative;
            top: 0;
          }

          .searchPanel__quickActions {
            justify-items: start;
          }
        }

        @media (max-width: 720px) {
          .searchPanel {
            padding: 1.75rem 1.25rem 2.5rem;
          }

          .searchPanel__heroText h1 {
            font-size: 2.1rem;
          }

          .searchPanel__hero {
            padding: 1.5rem;
          }

          .searchPanel__quickActions {
            gap: 0.75rem;
          }
        }
      `}</style>

      <style jsx global>{`
        .clearButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.65rem 1.2rem;
          border-radius: 999px;
          border: none;
          background: linear-gradient(90deg, #27e3da, #f7b84e);
          color: #0f172a;
          font-weight: 700;
          font-size: 0.9rem;
          letter-spacing: 0.01em;
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
          cursor: pointer;
          box-shadow: 0 18px 38px -24px rgba(247, 184, 78, 0.7);
        }

        .clearButton:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
          box-shadow: 0 24px 50px -26px rgba(247, 184, 78, 0.75);
        }

        .currentRefinements {
          background: rgba(255, 255, 255, 0.96);
          border-radius: 16px;
          padding: 0.85rem 1.1rem;
          border: 1px solid rgba(39, 227, 218, 0.22);
          max-width: 340px;
          box-shadow: inset 0 0 0 1px rgba(39, 227, 218, 0.16);
        }

        .currentRefinements ul {
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          list-style: none;
        }

        .currentRefinements li {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          background: linear-gradient(120deg, rgba(39, 227, 218, 0.28), rgba(247, 184, 78, 0.28));
          font-size: 0.8rem;
          color: #0f172a;
          font-weight: 600;
        }

        .searchBox {
          width: 100%;
        }

        .searchBox__form {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          background: rgba(248, 250, 252, 0.96);
          border-radius: 999px;
          padding: 0.35rem 0.5rem;
          border: 1px solid rgba(39, 227, 218, 0.24);
          transition: border 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }

        .searchBox__form:focus-within {
          border-color: rgba(247, 184, 78, 0.55);
          box-shadow: 0 0 0 4px rgba(39, 227, 218, 0.25);
          transform: translateY(-1px);
        }

        .searchBox__input {
          background: transparent;
          border: none;
          color: #0f172a;
          padding: 0.6rem 0.9rem;
          font-size: 1rem;
        }

        .searchBox__input::placeholder {
          color: #94a3b8;
        }

        .searchBox__input:focus {
          outline: none;
        }

        .searchBox__submit,
        .searchBox__reset {
          border: none;
          background: transparent;
          cursor: pointer;
          color: #0f172a;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.3rem 0.6rem;
        }

        .searchBox__submitIcon svg,
        .searchBox__resetIcon svg {
          width: 1rem;
          height: 1rem;
        }

        .searchBox__loading {
          display: none;
        }

        .refinementList ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 0.45rem;
        }

        .refinementList li {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.92rem;
          color: #334155;
        }

        .refinementList input[type='checkbox'] {
          accent-color: #2563eb;
          width: 16px;
          height: 16px;
        }

        .refinementList .ais-SearchBox-form {
          border-radius: 12px;
          background: rgba(248, 250, 252, 0.95);
          padding: 0.4rem 0.6rem;
          border: 1px solid rgba(226, 232, 240, 0.9);
        }

        .refinementList .ais-SearchBox-input {
          padding: 0.45rem 0.4rem;
          font-size: 0.85rem;
          color: #0f172a;
        }

        .rangeInput {
          display: flex;
          gap: 0.6rem;
          align-items: center;
        }

        .rangeInput input[type='number'] {
          width: 100%;
          padding: 0.5rem 0.7rem;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          background: rgba(248, 250, 252, 0.95);
          color: #0f172a;
        }

        .rangeInput button {
          padding: 0.5rem 0.85rem;
          border-radius: 10px;
          border: 1px solid rgba(37, 99, 235, 0.25);
          background: rgba(59, 130, 246, 0.12);
          color: #1d4ed8;
          cursor: pointer;
          transition: background 0.2s ease, box-shadow 0.2s ease;
        }

        .rangeInput button:hover {
          background: rgba(59, 130, 246, 0.2);
          box-shadow: 0 12px 25px -18px rgba(37, 99, 235, 0.45);
        }

        .toggleList .ais-ToggleRefinement {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding: 0.65rem 0.85rem;
          border-radius: 14px;
          background: rgba(248, 250, 252, 0.95);
          border: 1px solid rgba(203, 213, 225, 0.9);
          color: #0f172a;
          transition: background 0.2s ease, border 0.2s ease, box-shadow 0.2s ease;
        }

        .toggleList .ais-ToggleRefinement--checked {
          background: rgba(59, 130, 246, 0.15);
          border-color: rgba(37, 99, 235, 0.35);
          color: #1d4ed8;
          box-shadow: 0 12px 24px -18px rgba(37, 99, 235, 0.35);
        }

        .toggleList input[type='checkbox'] {
          accent-color: #2563eb;
          width: 18px;
          height: 18px;
        }

        .hits {
          width: 100%;
        }

        .hits__list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1.35rem;
          padding: 0;
          margin: 0;
          list-style: none;
        }

        .hits__item {
          list-style: none;
        }

        .pagination {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          justify-content: center;
          padding: 1rem 0 0;
        }

        .pagination ul {
          display: contents;
        }

        .pagination li {
          list-style: none;
        }

        .pagination a,
        .pagination span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 2.25rem;
          height: 2.25rem;
          border-radius: 999px;
          padding: 0 0.75rem;
          color: #475569;
          text-decoration: none;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(248, 250, 252, 0.95);
          transition: background 0.2s ease, border 0.2s ease, color 0.2s ease;
        }

        .pagination a:hover {
          background: rgba(59, 130, 246, 0.12);
          color: #1d4ed8;
          border-color: rgba(37, 99, 235, 0.3);
        }

        .pagination .ais-Pagination-link--selected {
          background: rgba(59, 130, 246, 0.18);
          color: #1d4ed8;
          border-color: rgba(37, 99, 235, 0.35);
        }
      `}</style>
    </>
  );
}

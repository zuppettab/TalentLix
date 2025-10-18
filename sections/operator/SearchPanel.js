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

// Client Algolia (lite per il browser)
const searchClient = algoliasearch(APP_ID, SEARCH_KEY);

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
  return (
    <>
      <Head>
        <link rel="icon" href="/talentlix_favicon_32x32.ico" sizes="32x32" />
        <link rel="icon" href="/talentlix_favicon_16x16.ico" sizes="16x16" />
      </Head>

      <div className="searchPanel">
        <InstantSearch searchClient={searchClient} indexName={INDEX_NAME} insights>
          <Configure hitsPerPage={24} />

          <div className="searchPanel__hero">
            <div className="searchPanel__heroText">
              <p className="searchPanel__eyebrow">Talent directory</p>
              <h1>Find the right athlete for your next opportunity</h1>
              <p className="searchPanel__description">
                Explore profiles, filter by role, sport and availability, and keep track of your selections with
                instant refinements.
              </p>
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
                  <p>Toggle flags to refine by contract status and representation.</p>
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
          padding: clamp(2rem, 5vw, 4rem) clamp(1.5rem, 4vw, 3rem);
          background: radial-gradient(circle at top left, rgba(66, 133, 244, 0.12), transparent 45%),
            radial-gradient(circle at bottom right, rgba(30, 150, 155, 0.14), transparent 50%),
            #0b0c10;
          color: #f7f8fa;
        }

        .searchPanel__hero {
          display: grid;
          gap: clamp(1.5rem, 4vw, 3rem);
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
          align-items: start;
          max-width: 1200px;
          margin: 0 auto clamp(2rem, 4vw, 3rem);
        }

        .searchPanel__heroText h1 {
          font-size: clamp(2rem, 4vw, 2.8rem);
          margin: 0 0 0.75rem 0;
          line-height: 1.1;
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
          color: rgba(247, 248, 250, 0.7);
          margin: 0;
        }

        .searchPanel__description {
          margin: 0;
          color: rgba(247, 248, 250, 0.75);
          font-size: 1rem;
          max-width: 520px;
        }

        .searchPanel__quickActions {
          display: grid;
          gap: 1rem;
          justify-items: end;
        }

        .searchPanel__layout {
          display: grid;
          gap: clamp(1.5rem, 4vw, 2.5rem);
          grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
          max-width: 1200px;
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
          background: rgba(11, 12, 16, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          padding: 1.25rem;
          backdrop-filter: blur(18px);
          box-shadow: 0 18px 45px -30px rgba(9, 12, 24, 0.85);
          display: grid;
          gap: 1rem;
        }

        .filterCard header h2 {
          margin: 0;
          font-size: 1.1rem;
        }

        .filterCard header p {
          margin: 0.35rem 0 0;
          font-size: 0.9rem;
          color: rgba(247, 248, 250, 0.65);
        }

        .filterCard__group {
          display: grid;
          gap: 0.5rem;
        }

        .filterCard__group h3 {
          margin: 0;
          font-size: 0.95rem;
          color: rgba(247, 248, 250, 0.7);
        }

        .toggleList {
          display: grid;
          gap: 0.75rem;
        }

        .searchPanel__results {
          display: grid;
          gap: 1.5rem;
          min-width: 0;
        }

        .resultsHeader h2 {
          margin: 0;
          font-size: 1.6rem;
        }

        .resultsHeader p {
          margin: 0.25rem 0 0;
          color: rgba(247, 248, 250, 0.65);
        }

        .hitCard {
          background: rgba(11, 12, 16, 0.75);
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 1.25rem;
          display: grid;
          gap: 1.25rem;
          box-shadow: 0 20px 45px -28px rgba(8, 10, 22, 0.9);
        }

        .hitCard__header {
          display: grid;
          gap: 0.35rem;
        }

        .hitCard__title {
          margin: 0;
          font-size: 1.2rem;
          font-weight: 700;
        }

        .hitCard__subtitle {
          margin: 0;
          font-size: 0.95rem;
          color: rgba(247, 248, 250, 0.7);
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          align-items: center;
        }

        .hitCard__sport :global(mark) {
          background: rgba(30, 136, 229, 0.25);
          color: #fff;
        }

        .hitCard__title :global(mark) {
          background: rgba(250, 128, 114, 0.25);
          color: #fff;
        }

        .hitCard__titleGroup {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .hitCard__id {
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(247, 248, 250, 0.5);
        }

        .hitCard__category {
          font-size: 0.75rem;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: rgba(30, 150, 155, 0.2);
          color: #7ef0ff;
          border: 1px solid rgba(126, 240, 255, 0.35);
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
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(247, 248, 250, 0.5);
        }

        .hitCard__listItem dd {
          margin: 0;
          font-size: 0.95rem;
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
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          background: rgba(255, 255, 255, 0.08);
          color: #f7f8fa;
        }

        .hitCard__tag--success {
          background: rgba(76, 175, 80, 0.25);
          color: #9effa4;
        }

        .hitCard__tag--accent {
          background: rgba(63, 81, 181, 0.25);
          color: #aeb8ff;
        }

        .hitCard__tag--warning {
          background: rgba(255, 193, 7, 0.2);
          color: #ffe6a2;
        }

        .hitCard__tag--neutral {
          background: rgba(158, 158, 158, 0.2);
          color: #e0e0e0;
        }

        @media (max-width: 1080px) {
          .searchPanel__hero {
            grid-template-columns: 1fr;
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
            font-size: 1.9rem;
          }
        }
      `}</style>

      <style jsx global>{`
        .clearButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.65rem 1.1rem;
          border-radius: 999px;
          border: 1px solid rgba(126, 240, 255, 0.3);
          background: rgba(126, 240, 255, 0.12);
          color: #7ef0ff;
          font-weight: 600;
          font-size: 0.9rem;
          transition: background 0.2s ease, transform 0.2s ease;
          cursor: pointer;
        }

        .clearButton:hover {
          background: rgba(126, 240, 255, 0.2);
          transform: translateY(-1px);
        }

        .currentRefinements {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 14px;
          padding: 0.8rem 1rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          max-width: 320px;
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
          padding: 0.3rem 0.6rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.08);
          font-size: 0.8rem;
        }

        .searchBox {
          width: 100%;
        }

        .searchBox__form {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 0.35rem 0.5rem;
          border: 1px solid transparent;
          transition: border 0.2s ease, box-shadow 0.2s ease;
        }

        .searchBox__form:focus-within {
          border-color: rgba(126, 240, 255, 0.35);
          box-shadow: 0 0 0 3px rgba(126, 240, 255, 0.18);
        }

        .searchBox__input {
          background: transparent;
          border: none;
          color: #f7f8fa;
          padding: 0.6rem 0.9rem;
          font-size: 1rem;
        }

        .searchBox__input::placeholder {
          color: rgba(247, 248, 250, 0.5);
        }

        .searchBox__input:focus {
          outline: none;
        }

        .searchBox__submit,
        .searchBox__reset {
          border: none;
          background: transparent;
          cursor: pointer;
          color: rgba(247, 248, 250, 0.8);
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
          font-size: 0.9rem;
          color: rgba(247, 248, 250, 0.8);
        }

        .refinementList input[type='checkbox'] {
          accent-color: #7ef0ff;
          width: 16px;
          height: 16px;
        }

        .refinementList .ais-SearchBox-form {
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.4rem 0.6rem;
        }

        .refinementList .ais-SearchBox-input {
          padding: 0.45rem 0.4rem;
          font-size: 0.85rem;
        }

        .rangeInput {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .rangeInput input[type='number'] {
          width: 100%;
          padding: 0.45rem 0.6rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
          color: #f7f8fa;
        }

        .rangeInput button {
          padding: 0.45rem 0.75rem;
          border-radius: 10px;
          border: 1px solid rgba(126, 240, 255, 0.3);
          background: rgba(126, 240, 255, 0.12);
          color: #7ef0ff;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .rangeInput button:hover {
          background: rgba(126, 240, 255, 0.2);
        }

        .toggleList .ais-ToggleRefinement {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.6rem 0.8rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(247, 248, 250, 0.85);
          transition: background 0.2s ease, border 0.2s ease;
        }

        .toggleList .ais-ToggleRefinement--checked {
          background: rgba(126, 240, 255, 0.16);
          border-color: rgba(126, 240, 255, 0.35);
          color: #7ef0ff;
        }

        .toggleList input[type='checkbox'] {
          accent-color: #7ef0ff;
          width: 18px;
          height: 18px;
        }

        .hits {
          width: 100%;
        }

        .hits__list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1.25rem;
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
          gap: 0.35rem;
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
          color: rgba(247, 248, 250, 0.75);
          text-decoration: none;
          border: 1px solid transparent;
          transition: background 0.2s ease, border 0.2s ease, color 0.2s ease;
        }

        .pagination a:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .pagination .ais-Pagination-link--selected {
          background: rgba(126, 240, 255, 0.2);
          color: #7ef0ff;
          border-color: rgba(126, 240, 255, 0.35);
        }
      `}</style>
    </>
  );
}

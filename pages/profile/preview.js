// /pages/profile/preview.js
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../utils/supabaseClient';

// ---- Small responsive hook (same style as Dashboard)
function useIsMobile(breakpointPx = 1024) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width:${breakpointPx}px)`);
    const onChange = (e) => setIsMobile(!!e.matches);
    onChange(mq);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [breakpointPx]);
  return isMobile;
}

// ---- Helpers
const sections = [
  { id: 'media',    title: 'Media' },
  { id: 'career',   title: 'Career' },
  { id: 'profile',  title: 'Profile' },
  { id: 'physical', title: 'Physical data' },
  { id: 'social',   title: 'Social' },
  { id: 'contacts', title: 'Contacts' },
  { id: 'awards',   title: 'Awards' },
];

function calcAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function seasonLabel(s) {
  // Accepts { season_start, season_end } or a string
  if (!s) return '';
  if (typeof s === 'string') return s;
  const a = s?.season_start ? String(s.season_start) : '';
  const b = s?.season_end ? String(s.season_end).slice(-2) : '';
  return a && b ? `${a}/${b}` : a || '';
}

function safeArray(x) { return Array.isArray(x) ? x : []; }
function fmtNum(x) { return (x || x === 0) ? String(x) : '—'; }
function joinPills(arr) { return safeArray(arr).filter(Boolean).join(' · ') || '—'; }

export default function ProfilePreview() {
  const router = useRouter();
  const isMobile = useIsMobile(1024);

  // Auth + current user
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  // Aggregated data
  const [athlete, setAthlete] = useState(null);
  const [currentSport, setCurrentSport] = useState(null);
  const [career, setCareer] = useState([]);
  const [physical, setPhysical] = useState(null);
  const [social, setSocial] = useState([]);
  const [awards, setAwards] = useState([]);
  const [contacts, setContacts] = useState(null);
  const [media, setMedia] = useState({ hero: null, highlights: [], featured: [], fullMatches: [], gallery: [] });

  // UI state
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [active, setActive] = useState('media');

  // IntersectionObserver for sticky sub-nav highlighting
  const sectionRefs = useRef({});
  sections.forEach(s => { if (!sectionRefs.current[s.id]) sectionRefs.current[s.id] = { el: null }; });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // ---- Auth
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace('/login'); return; }
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { router.replace('/login'); return; }
        if (!mounted) return;
        setUser(u);

        const uid = u.id;

        // ---- Fetch in parallel (no new deps)
        const [
          athleteRes,
          sportsExpRes,
          careerRes,
          physicalRes,
          socialRes,
          awardsRes,
          contactsVerRes,
          mediaRes,
        ] = await Promise.allSettled([
          supabase.from('athlete').select('*').eq('id', uid).single(),
          supabase.from('sports_experiences').select('*').eq('athlete_id', uid).order('id', { ascending: false }).limit(1),
          supabase.from('athlete_career').select('*').eq('athlete_id', uid).order('season_start', { ascending: false }).order('season_end', { ascending: false }),
          supabase.from('physical_data').select('*').eq('athlete_id', uid).order('measured_at', { ascending: false }).limit(1),
          supabase.from('social_profiles').select('*').eq('athlete_id', uid).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
          supabase.from('awards_recognitions').select('*').eq('athlete_id', uid).order('season_start', { ascending: false }).order('date_awarded', { ascending: false }).order('id', { ascending: false }),
          supabase.from('contacts_verification').select('*').eq('athlete_id', uid).single(),
          supabase.from('media_item').select('*').eq('athlete_id', uid).order('created_at', { ascending: false }),
        ]);

        // ---- Athlete
        if (athleteRes.status === 'fulfilled' && athleteRes.value?.data) {
          setAthlete(athleteRes.value.data);
        } else {
          setErrors(e => ({ ...e, athlete: 'Unable to load athlete.' }));
        }

        // ---- Current sport snapshot
        if (sportsExpRes.status === 'fulfilled') {
          const arr = sportsExpRes.value?.data || [];
          setCurrentSport(arr[0] || null);
        } else {
          setErrors(e => ({ ...e, sports: 'Unable to load current sport.' }));
        }

        // ---- Career timeline
        if (careerRes.status === 'fulfilled') {
          setCareer(safeArray(careerRes.value?.data));
        } else {
          setErrors(e => ({ ...e, career: 'Unable to load career.' }));
        }

        // ---- Physical
        if (physicalRes.status === 'fulfilled') {
          const arr = physicalRes.value?.data || [];
          setPhysical(arr[0] || null);
        } else {
          setErrors(e => ({ ...e, physical: 'Unable to load physical data.' }));
        }

        // ---- Social
        if (socialRes.status === 'fulfilled') {
          setSocial(safeArray(socialRes.value?.data));
        } else {
          setErrors(e => ({ ...e, social: 'Unable to load social.' }));
        }

        // ---- Awards
        if (awardsRes.status === 'fulfilled') {
          setAwards(safeArray(awardsRes.value?.data));
        } else {
          setErrors(e => ({ ...e, awards: 'Unable to load awards.' }));
        }

        // ---- Contacts (merge user email + athlete phone + verification badges)
        if (contactsVerRes.status === 'fulfilled') {
          const cv = contactsVerRes.value?.data || null;
          setContacts({
            email: u.email || null,
            phone: athleteRes?.value?.data?.phone || null,
            phone_verified: !!cv?.phone_verified,
            id_verified: !!cv?.id_verified,
            residence_city: cv?.residence_city || null,
            residence_country: cv?.residence_country || null,
          });
        } else {
          setContacts({ email: u.email || null, phone: athleteRes?.value?.data?.phone || null });
        }

        // ---- Media grouping (intro/featured/highlight/full_match/gallery)
        if (mediaRes.status === 'fulfilled') {
          const rows = safeArray(mediaRes.value?.data);
          const byCat = (c) => rows.filter(r => (r?.category || '').toLowerCase() === c);
          const intro = byCat('intro')[0] || null;
          const featured = byCat('featured').slice(0, 3);
          const highlights = byCat('highlight').slice(0, 3);
          const fullMatches = byCat('full_match');
          const gallery = byCat('gallery').slice(0, 20);

          // Hero selection: intro video > first featured > first highlight > null
          const hero = intro || featured[0] || highlights[0] || null;

          setMedia({ hero, highlights, featured, fullMatches, gallery });
        } else {
          setErrors(e => ({ ...e, media: 'Unable to load media.' }));
        }
      } catch (err) {
        console.error(err);
        setErrors(e => ({ ...e, fatal: 'Unexpected error.' }));
      } finally {
        setAuthReady(true);
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u2 = session?.user || null;
      setUser(u2);
      if (!u2) router.replace('/login');
    });
    return () => sub.subscription?.unsubscribe?.();
  }, [router]);

  // Derived
  const fullName = useMemo(() => {
    const fn = [athlete?.first_name, athlete?.last_name].filter(Boolean).join(' ').trim();
    return fn || 'Full Name';
  }, [athlete]);

  const age = useMemo(() => calcAge(athlete?.date_of_birth), [athlete?.date_of_birth]);
  const completion = Math.min(100, Math.max(0, Number(athlete?.completion_percentage ?? 0)));

  // Sticky sub-nav active section
  useEffect(() => {
    if (!authReady) return;
    const els = sections
      .map(s => ({ id: s.id, el: document.getElementById(`sec-${s.id}`) }))
      .filter(x => x.el);
    const obs = new IntersectionObserver(
      entries => {
        // Choose the one with the biggest intersection ratio near top
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id.replace('sec-', ''));
      },
      { rootMargin: '-33% 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    els.forEach(x => obs.observe(x.el));
    return () => obs.disconnect();
  }, [authReady, loading]);

  if (!authReady) return null;

  return (
    <div style={styles.page}>
      {/* HEADER (aligned with Dashboard look & feel) */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <img src="/logo-talentlix.png" alt="TalentLix" style={styles.logo} />
          <div>
            <div style={styles.headerTitle}>Athlete Profile Preview</div>
            <div style={styles.headerSub}>{fullName}</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <a href="/dashboard" style={styles.link}>Back to Dashboard</a>
          <div style={styles.authBox}>
            {athlete?.profile_picture_url
              ? <img src={athlete.profile_picture_url} alt="Avatar" style={styles.authAvatar} />
              : <div style={styles.authAvatarPlaceholder} />
            }
            <span style={styles.authEmail}>{user?.email || '—'}</span>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section style={styles.hero}>
        <div style={styles.heroMedia}>
          <HeroMedia media={media?.hero} fallbackName={fullName} />
        </div>
        <div style={styles.heroMeta}>
          <h1 style={styles.h1}>{fullName}</h1>
          <div style={styles.pillsRow}>
            {currentSport?.role && <span style={styles.pill}>{currentSport.role}</span>}
            {currentSport?.team_name && <span style={styles.pill}>{currentSport.team_name}</span>}
            {currentSport?.league && <span style={styles.pill}>{currentSport.league}</span>}
            {athlete?.nationality && <span style={styles.pill}>{athlete.nationality}</span>}
            {age != null && <span style={styles.pill}>{age} y/o</span>}
          </div>
          <div style={styles.completionWrap}>
            <span style={styles.progressLabel}>Profile completion</span>
            <div style={styles.progressBar}><div style={{ ...styles.progressFill, width: `${completion}%` }} /></div>
            <span style={styles.progressPct}>{completion}%</span>
          </div>
        </div>
      </section>

      {/* SUB-NAV STICKY */}
      <nav style={styles.subnav}>
        <div style={styles.subnavInner}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => {
                const el = document.getElementById(`sec-${s.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              style={{ ...styles.subnavBtn, ...(active === s.id ? styles.subnavBtnActive : null) }}
              title={s.title}
            >
              {s.title}
            </button>
          ))}
        </div>
      </nav>

      {/* MAIN LAYOUT */}
      <main style={isMobile ? styles.mainMobile : styles.main}>
        <div style={isMobile ? styles.colMainMobile : styles.colMain}>
          {/* MEDIA */}
          <section id="sec-media" style={styles.card}>
            <h2 style={styles.h2}>Media</h2>
            {loading && <div style={styles.skeleton}>Loading media…</div>}
            {!loading && !errors.media && (
              <>
                {/* Highlights Carousel (max 3) */}
                {media.highlights?.length > 0 && (
                  <>
                    <h3 style={styles.h3}>Highlights</h3>
                    <div style={isMobile ? styles.carouselMobile : styles.carouselDesktop}>
                      {media.highlights.map((m, idx) => (
                        <VideoCard key={`hl-${idx}`} item={m} />
                      ))}
                    </div>
                  </>
                )}

                {/* Featured photos (max 3) */}
                {media.featured?.length > 0 && (
                  <>
                    <h3 style={styles.h3}>Featured photos</h3>
                    <div style={isMobile ? styles.grid2 : styles.grid3}>
                      {media.featured.map((m, idx) => (
                        <ImageCard key={`ph-${idx}`} item={m} />
                      ))}
                    </div>
                  </>
                )}

                {/* Full matches (accordion by season) */}
                {media.fullMatches?.length > 0 && (
                  <>
                    <h3 style={styles.h3}>Full matches</h3>
                    <MatchList items={media.fullMatches} />
                  </>
                )}
              </>
            )}
            {!loading && errors.media && <ErrorInline msg="Unable to load media. Please retry." />}
          </section>

          {/* CAREER */}
          <section id="sec-career" style={styles.card}>
            <h2 style={styles.h2}>Career</h2>
            {loading && <div style={styles.skeleton}>Loading career…</div>}
            {!loading && !errors.career && (
              <>
                {/* Current snapshot */}
                <div style={styles.snapshot}>
                  <div style={styles.snapshotRow}>
                    <SnapshotItem label="Sport" value={currentSport?.sport || '—'} />
                    <SnapshotItem label="Team" value={currentSport?.team_name || currentSport?.team || '—'} />
                    <SnapshotItem label="Category" value={currentSport?.category || '—'} />
                    <SnapshotItem label="League" value={currentSport?.league || '—'} />
                  </div>
                  <div style={styles.snapshotRow}>
                    <SnapshotItem label="Role" value={currentSport?.role || '—'} />
                    <SnapshotItem label="Secondary role" value={currentSport?.secondary_role || '—'} />
                    <SnapshotItem label="Playing style" value={currentSport?.playing_style || '—'} />
                    <SnapshotItem label="Seeking team" value={currentSport?.seeking_team ? 'Yes' : 'No'} />
                  </div>
                  <div style={styles.snapshotRow}>
                    <SnapshotItem label="Contract status" value={currentSport?.contract_status || '—'} />
                    <SnapshotItem label="Contract end" value={currentSport?.contract_end_date || '—'} />
                    <SnapshotItem label="Agent" value={currentSport?.agent_name || '—'} />
                    <SnapshotItem label="Agency" value={currentSport?.agency_name || '—'} />
                  </div>
                  <div style={styles.snapshotRow}>
                    <SnapshotItem label="Preferred regions" value={joinPills(currentSport?.preferred_regions)} />
                    <SnapshotItem label="Trial window" value={currentSport?.trial_window || '—'} />
                  </div>
                </div>

                {/* Timeline (reverse chronological) */}
                {safeArray(career).length > 0 ? (
                  <ul style={styles.timeline}>
                    {safeArray(career).map((row, i) => (
                      <li key={`car-${i}`} style={styles.timelineItem}>
                        <div style={styles.timelineHead}>
                          <span style={styles.timelineSeason}>{seasonLabel(row)}</span>
                          <span style={styles.timelineTeam}>{row?.team_name || '—'}</span>
                        </div>
                        <div style={styles.timelineMeta}>
                          <span>{row?.role || '—'}</span>
                          <span>·</span>
                          <span>{row?.category || '—'}</span>
                          {row?.league ? (<><span>·</span><span>{row.league}</span></>) : null}
                        </div>
                        {row?.notes && <div style={styles.timelineNotes}>{row.notes}</div>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={styles.empty}>No career records yet.</div>
                )}
              </>
            )}
            {!loading && errors.career && <ErrorInline msg="Unable to load career. Please retry." />}
          </section>

          {/* PROFILE (anagraphics) */}
          <section id="sec-profile" style={styles.card}>
            <h2 style={styles.h2}>Profile</h2>
            {loading && <div style={styles.skeleton}>Loading profile…</div>}
            {!loading && (
              <div style={isMobile ? styles.grid1 : styles.grid2}>
                <Field label="Date of birth" value={athlete?.date_of_birth || '—'} />
                <Field label="Age" value={age != null ? `${age}` : '—'} />
                <Field label="Nationality" value={athlete?.nationality || '—'} />
                <Field label="Birth city" value={athlete?.birth_city || '—'} />
                <Field label="Native language" value={athlete?.native_language || '—'} />
                <Field label="Additional language" value={athlete?.additional_language || '—'} />
                <Field label="Residence city" value={contacts?.residence_city || '—'} />
                <Field label="Residence country" value={contacts?.residence_country || '—'} />
                {athlete?.gender && <Field label="Gender" value={athlete?.gender} />}
              </div>
            )}
          </section>

          {/* AWARDS */}
          <section id="sec-awards" style={styles.card}>
            <h2 style={styles.h2}>Awards</h2>
            {loading && <div style={styles.skeleton}>Loading awards…</div>}
            {!loading && !errors.awards && (
              safeArray(awards).length > 0 ? (
                <ul style={styles.awardsList}>
                  {awards.map((a, i) => (
                    <li key={`aw-${i}`} style={styles.awardItem}>
                      <div style={styles.awardHead}>
                        <span style={styles.awardTitle}>{a?.title || '—'}</span>
                        {a?.awarding_entity && <span style={styles.awardEntity}> · {a.awarding_entity}</span>}
                      </div>
                      <div style={styles.awardMeta}>
                        {seasonLabel(a)}{a?.date_awarded ? ` · ${a.date_awarded}` : ''}
                      </div>
                      {a?.description && <div style={styles.awardDesc}>{a.description}</div>}
                      {a?.evidence_external_url && (
                        <a href={a.evidence_external_url} target="_blank" rel="noopener" style={styles.link}>
                          View source
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={styles.empty}>No awards yet.</div>
              )
            )}
            {!loading && errors.awards && <ErrorInline msg="Unable to load awards. Please retry." />}
          </section>
        </div>

        {/* SIDEBAR */}
        <aside style={isMobile ? styles.colSideMobile : styles.colSide}>
          {/* PHYSICAL */}
          <section id="sec-physical" style={styles.card}>
            <h2 style={styles.h2}>Physical data</h2>
            {loading && <div style={styles.skeleton}>Loading physical data…</div>}
            {!loading && !errors.physical && (
              <>
                <div style={styles.quickFacts}>
                  <QF label="Height" value={physical?.height_cm ? `${physical.height_cm} cm` : '—'} />
                  <QF label="Weight" value={physical?.weight_kg ? `${physical.weight_kg} kg` : '—'} />
                  <QF label="Wingspan" value={physical?.wingspan_cm ? `${physical.wingspan_cm} cm` : '—'} />
                  <QF label="Dominant hand" value={physical?.dominant_hand || '—'} />
                  {physical?.dominant_foot && <QF label="Dominant foot" value={physical.dominant_foot} />}
                </div>
                {/* Expandable tests/measures */}
                <details style={styles.details}>
                  <summary style={styles.summary}>See all measures</summary>
                  <div style={styles.measuresGrid}>
                    <Field label="Standing reach" value={physical?.standing_reach_cm ? `${physical.standing_reach_cm} cm` : '—'} />
                    <Field label="Vertical jump (CMJ)" value={physical?.vertical_jump_cmj_cm ? `${physical.vertical_jump_cmj_cm} cm` : '—'} />
                    <Field label="Sprint 10m" value={physical?.sprint_10m_s ? `${physical.sprint_10m_s} s` : '—'} />
                    <Field label="Sprint 20m" value={physical?.sprint_20m_s ? `${physical.sprint_20m_s} s` : '—'} />
                    <Field label="5-10-5 agility" value={physical?.pro_agility_5_10_5_s ? `${physical.pro_agility_5_10_5_s} s` : '—'} />
                    <Field label="Grip L" value={physical?.grip_strength_left_kg ? `${physical.grip_strength_left_kg} kg` : '—'} />
                    <Field label="Grip R" value={physical?.grip_strength_right_kg ? `${physical.grip_strength_right_kg} kg` : '—'} />
                    <Field label="Plank hold" value={physical?.plank_hold_s ? `${physical.plank_hold_s} s` : '—'} />
                    <Field label="Cooper 12-min" value={physical?.cooper_12min_m ? `${physical.cooper_12min_m} m` : '—'} />
                    <Field label="Sit & reach" value={physical?.sit_and_reach_cm ? `${physical.sit_and_reach_cm} cm` : '—'} />
                  </div>
                  {physical?.measured_at && (
                    <div style={styles.measureDate}>Last measured: {physical.measured_at}</div>
                  )}
                </details>
              </>
            )}
            {!loading && errors.physical && <ErrorInline msg="Unable to load physical data. Please retry." />}
          </section>

          {/* SOCIAL */}
          <section id="sec-social" style={styles.card}>
            <h2 style={styles.h2}>Social</h2>
            {loading && <div style={styles.skeleton}>Loading social…</div>}
            {!loading && !errors.social && (
              safeArray(social).length > 0 ? (
                <ul style={styles.socialList}>
                  {social.map((s, i) => (
                    <li key={`soc-${i}`} style={styles.socialItem}>
                      <a href={s?.profile_url || '#'} target="_blank" rel="noopener" style={styles.socialLink}>
                        <span style={styles.socialPlatform}>{s?.platform || 'Social'}</span>
                        {s?.handle && <span style={styles.socialHandle}> · {s.handle}</span>}
                      </a>
                      {s?.is_primary && <span style={styles.badgePrimary}>Primary</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={styles.empty}>No social profiles yet.</div>
              )
            )}
            {!loading && errors.social && <ErrorInline msg="Unable to load social profiles. Please retry." />}
          </section>

          {/* CONTACTS (private preview = show) */}
          <section id="sec-contacts" style={styles.card}>
            <h2 style={styles.h2}>Contacts</h2>
            {loading && <div style={styles.skeleton}>Loading contacts…</div>}
            {!loading && (
              <>
                <Field label="Email" value={contacts?.email || '—'} />
                <Field label="Phone" value={contacts?.phone || '—'} />
                <div style={styles.badgesRow}>
                  <Badge ok={!!contacts?.phone_verified} label={contacts?.phone_verified ? 'Phone verified' : 'Phone not verified'} />
                  <Badge ok={!!contacts?.id_verified} label={contacts?.id_verified ? 'ID verified' : 'ID not verified'} />
                </div>
                {(contacts?.residence_city || contacts?.residence_country) && (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    {contacts?.residence_city || '—'}, {contacts?.residence_country || '—'}
                  </div>
                )}
              </>
            )}
          </section>
        </aside>
      </main>

      {/* FOOTER space */}
      <div style={{ height: 24 }} />
    </div>
  );
}

// ---- Small presentational building blocks (no new libs)
function HeroMedia({ media, fallbackName }) {
  if (!media) {
    return (
      <div style={styles.heroFallback}>
        <div style={styles.fallbackCircle}>{(fallbackName || 'A P').split(' ').map(s => s[0]).join('').slice(0,2)}</div>
      </div>
    );
  }
  const cat = (media?.category || '').toLowerCase();
  const url = media?.url || media?.src || media?.external_url || media?.public_url || media?.path || '';
  const thumb = media?.thumbnail || media?.thumbnail_url || media?.poster || '';
  if (cat === 'intro' || cat === 'highlight' || cat === 'full_match' || (media?.type || '').toLowerCase() === 'video') {
    return (
      <video
        controls
        preload="none"
        poster={thumb || undefined}
        style={styles.heroVideo}
        src={url}
      />
    );
  }
  return (
    <img
      src={url}
      alt="Hero"
      style={styles.heroImg}
    />
  );
}

function VideoCard({ item }) {
  const url = item?.url || item?.external_url || item?.public_url || item?.path || '';
  const poster = item?.thumbnail || item?.thumbnail_url || item?.poster || '';
  return (
    <div style={styles.videoCard}>
      <video controls preload="none" poster={poster || undefined} style={styles.videoEl} src={url} />
      <div style={styles.cardCaption}>{item?.title || 'Highlight'}</div>
    </div>
  );
}

function ImageCard({ item }) {
  const url = item?.url || item?.public_url || item?.external_url || item?.path || '';
  const cap = item?.caption || item?.title || '';
  return (
    <a href={url} target="_blank" rel="noopener" style={styles.imgCard}>
      <img src={url} alt={cap || 'Photo'} style={styles.imgEl} />
      {cap && <div style={styles.cardCaption}>{cap}</div>}
    </a>
  );
}

function MatchList({ items }) {
  // If there are many, you could group by season; keep it simple here.
  return (
    <ul style={styles.matchList}>
      {items.map((m, i) => {
        const label = [
          m?.match_date, m?.opponent ? `vs ${m.opponent}` : null, m?.competition
        ].filter(Boolean).join(' · ');
        const url = m?.external_url || m?.url || m?.public_url || m?.path || '#';
        return (
          <li key={`fm-${i}`} style={styles.matchItem}>
            <span style={styles.matchMeta}>{label || 'Match'}</span>
            <a href={url} target="_blank" rel="noopener" style={styles.link}>Watch</a>
          </li>
        );
      })}
    </ul>
  );
}

function SnapshotItem({ label, value }) {
  return (
    <div style={styles.snapItem}>
      <div style={styles.snapLabel}>{label}</div>
      <div style={styles.snapValue}>{value || '—'}</div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      <div style={styles.fieldValue}>{value || '—'}</div>
    </div>
  );
}

function QF({ label, value }) {
  return (
    <div style={styles.qf}>
      <div style={styles.qfLabel}>{label}</div>
      <div style={styles.qfValue}>{value}</div>
    </div>
  );
}

function Badge({ ok, label }) {
  return (
    <span style={{ ...styles.badge, ...(ok ? styles.badgeOk : styles.badgeKo) }}>{label}</span>
  );
}

function ErrorInline({ msg }) {
  return <div style={styles.error}>{msg}</div>;
}

// ---- Styles (aligned with Dashboard: radius, shadows, gradient, spacing)
const styles = {
  page: { fontFamily: 'Inter, sans-serif', background: '#F8F9FA', color: '#000', minHeight: '100vh' },

  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px', background: '#FFF', borderBottom: '1px solid #E0E0E0'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { width: 40, height: 'auto' },
  headerTitle: { fontSize: 18, fontWeight: 700, lineHeight: 1.1 },
  headerSub: { fontSize: 14, opacity: 0.7, lineHeight: 1.1 },
  link: { color: '#27E3DA', textDecoration: 'none' },

  authBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: 8, background: '#FFF' },
  authAvatar: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' },
  authAvatarPlaceholder: { width: 28, height: 28, borderRadius: '50%', background: '#EEE' },
  authEmail: { fontSize: 12, opacity: 0.8, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(280px, 720px) 1fr',
    gap: 24, padding: 24, borderBottom: '1px solid #E0E0E0',
    background: '#FFF'
  },
  heroMedia: { width: '100%', aspectRatio: '16/9', background: '#EEE', borderRadius: 12, overflow: 'hidden' },
  heroVideo: { width: '100%', height: '100%', objectFit: 'cover' },
  heroImg: { width: '100%', height: '100%', objectFit: 'cover' },
  heroFallback: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(90deg, #27E3DA 0%, #F7B84E 100%)' },
  fallbackCircle: { width: 96, height: 96, borderRadius: '50%', background: '#FFF', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 26 },
  heroMeta: { display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' },
  h1: { margin: 0, fontSize: 28, fontWeight: 800 },
  pillsRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  pill: { fontSize: 12, padding: '6px 10px', borderRadius: 999, border: '1px solid #E0E0E0', background: '#FFF' },

  completionWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  progressLabel: { fontSize: 12, opacity: 0.7 },
  progressBar: { width: 160, height: 8, background: '#EEE', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #27E3DA 0%, #F7B84E 100%)' },
  progressPct: { fontSize: 12, opacity: 0.8, minWidth: 32, textAlign: 'right' },

  subnav: { position: 'sticky', top: 76, zIndex: 9, background: '#FFFFFF', borderBottom: '1px solid #E0E0E0' },
  subnavInner: { display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  subnavBtn: {
    padding: '10px 12px', borderRadius: 999, border: '1px solid #E0E0E0', background: '#FFF',
    fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap'
  },
  subnavBtnActive: { borderColor: '#27E3DA', boxShadow: '0 0 0 2px rgba(39,227,218,0.15)', background: 'linear-gradient(90deg, rgba(39,227,218,0.08), rgba(247,184,78,0.08))' },

  main: { display: 'grid', gridTemplateColumns: 'minmax(560px,1fr) 360px', gap: 24, padding: 24, boxSizing: 'border-box' },
  mainMobile: { display: 'block', padding: 12 },

  colMain: { },
  colSide: { },
  colMainMobile: {},
  colSideMobile: {},

  card: {
    background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 12, padding: 16,
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 24
  },
  h2: { fontSize: 20, margin: '0 0 12px 0' },
  h3: { fontSize: 16, margin: '8px 0' },

  skeleton: { padding: 12, color: '#666', fontStyle: 'italic' },
  empty: { padding: 8, color: '#666' },
  error: { padding: 10, color: '#A00', background: '#FFF5F5', border: '1px solid #F1C0C0', borderRadius: 8 },

  // Media blocks
  carouselDesktop: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  carouselMobile: { display: 'grid', gridTemplateColumns: '1fr', gap: 12 },
  videoCard: { background: '#FAFAFA', border: '1px solid #EEE', borderRadius: 12, overflow: 'hidden' },
  videoEl: { width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' },
  cardCaption: { padding: 8, fontSize: 12 },

  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  imgCard: { display: 'block', borderRadius: 12, overflow: 'hidden', border: '1px solid #EEE', background: '#FAFAFA' },
  imgEl: { width: '100%', aspectRatio: '3/2', objectFit: 'cover', display: 'block' },

  matchList: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 },
  matchItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid #EEE', borderRadius: 10, background: '#FAFAFA' },
  matchMeta: { fontSize: 13, opacity: 0.9 },

  // Career snapshot & timeline
  snapshot: { display: 'grid', gap: 8, marginBottom: 12 },
  snapshotRow: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, 1fr)' },
  snapItem: { border: '1px solid #EEE', borderRadius: 10, padding: 10, background: '#FAFAFA' },
  snapLabel: { fontSize: 11, opacity: 0.6, marginBottom: 3 },
  snapValue: { fontSize: 13, fontWeight: 600 },

  timeline: { listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 10 },
  timelineItem: { borderLeft: '3px solid #27E3DA', paddingLeft: 10 },
  timelineHead: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 },
  timelineSeason: { fontSize: 13 },
  timelineTeam: { fontSize: 13, opacity: 0.85 },
  timelineMeta: { fontSize: 12, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 },
  timelineNotes: { fontSize: 12, opacity: 0.85, marginTop: 4 },

  // Fields & grids
  grid1: { display: 'grid', gridTemplateColumns: '1fr', gap: 10 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  field: { border: '1px solid #EEE', borderRadius: 10, padding: 10, background: '#FAFAFA' },
  fieldLabel: { fontSize: 11, opacity: 0.6, marginBottom: 3 },
  fieldValue: { fontSize: 13, fontWeight: 600 },

  // Physical quick facts
  quickFacts: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 },
  qf: { border: '1px solid #EEE', borderRadius: 10, padding: 10, background: '#FAFAFA' },
  qfLabel: { fontSize: 11, opacity: 0.6, marginBottom: 3 },
  qfValue: { fontSize: 13, fontWeight: 600 },

  // Measures
  details: { marginTop: 8 },
  summary: { cursor: 'pointer', fontWeight: 600, userSelect: 'none' },
  measuresGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 },
  measureDate: { marginTop: 8, fontSize: 12, opacity: 0.8 },

  // Social
  socialList: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 },
  socialItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid #EEE', borderRadius: 10, background: '#FAFAFA' },
  socialLink: { color: '#111', textDecoration: 'none' },
  socialPlatform: { fontWeight: 700, fontSize: 13 },
  socialHandle: { fontSize: 13, opacity: 0.8 },
  badgePrimary: { marginLeft: 8, fontSize: 11, padding: '4px 8px', borderRadius: 999, background: 'rgba(39,227,218,0.1)', border: '1px solid #27E3DA' },

  // Contacts badges
  badgesRow: { display: 'flex', gap: 8, marginTop: 8 },
  badge: { fontSize: 11, padding: '6px 10px', borderRadius: 999, border: '1px solid #E0E0E0', background: '#FFF' },
  badgeOk: { borderColor: '#2ECC71', background: 'rgba(46,204,113,0.08)', color: '#1E874B' },
  badgeKo: { borderColor: '#D9534F', background: 'rgba(217,83,79,0.08)', color: '#8A2D2A' },
};

// /pages/dashboard.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { SECTIONS, DEFAULT_SECTION, isValidSection } from '../utils/dashboardSections';
import { supabase } from '../utils/supabaseClient';
import { computeProfileCompletion, MEDIA_CATEGORIES } from '../utils/profileCompletion';
import { sendEmail } from '../utils/emailDispatcher';
import PersonalPanel from '../sections/personal/PersonalPanel';
import ContactsPanel from '../sections/contacts/ContactsPanel';
import SportInfoPanel from '../sections/sports/SportInfoPanel';
import PhysicalPanel from '../sections/physical/PhysicalPanel';
import MediaPanel from '../sections/media/MediaPanel';
import SocialPanel from '../sections/social/SocialPanel';
import MessagesPanel from '../sections/messages/MessagesPanel';
import AwardsWidget from '../sections/awards/AwardsWidget';
import PrivacyPanel from '../sections/privacy/PrivacyPanel';

const ATHLETE_TABLE = 'athlete';

const SECTION_TITLE_BY_ID = SECTIONS.reduce((acc, section) => {
  acc[section.id] = section.title;
  return acc;
}, {});

// --- Hook responsive (JS, niente CSS esterno)
function useIsMobile(breakpointPx = 480) {
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

export default function Dashboard() {
  const router = useRouter();
  const isMobile = useIsMobile(480);

  // ---- URL state: sezione attiva
  const current = useMemo(() => {
    const raw = Array.isArray(router.query.section) ? router.query.section[0] : router.query.section;
    return isValidSection(raw) ? raw : DEFAULT_SECTION;
  }, [router.query.section]);

  const setSection = (id) => {
    router.push({ pathname: '/dashboard', query: { ...router.query, section: id } }, undefined, { shallow: true });
  };

  // ---- Stato auth + atleta
  const [user, setUser] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingPublish, setSavingPublish] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [cardData, setCardData] = useState({
    contactsVerification: null,
    sportsExperience: null,
    physical: null,
    awards: [],
    mediaItems: [],
    mediaGameMeta: [],
    socialProfiles: [],
  });
  const [completionBreakdown, setCompletionBreakdown] = useState(null);
  const [completionTooltipOpen, setCompletionTooltipOpen] = useState(false);

  const athleteRef = useRef(null);
  const cardDataRef = useRef(cardData);
  const tooltipWrapRef = useRef(null);

  useEffect(() => { athleteRef.current = athlete; }, [athlete]);
  useEffect(() => { cardDataRef.current = cardData; }, [cardData]);

  const fetchContactsVerification = useCallback(async (athleteId) => {
    const { data, error } = await supabase
      .from('contacts_verification')
      .select('*')
      .eq('athlete_id', athleteId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (data && typeof data.review_status === 'string') {
      data.review_status = data.review_status.trim().toLowerCase();
    }
    return data || null;
  }, [supabase]);

  const fetchLatestSportExperience = useCallback(async (athleteId) => {
    const { data, error } = await supabase
      .from('sports_experiences')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw error;
    return Array.isArray(data) && data[0] ? data[0] : null;
  }, [supabase]);

  const fetchPhysicalData = useCallback(async (athleteId) => {
    const { data, error } = await supabase
      .from('physical_data')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw error;
    return Array.isArray(data) && data[0] ? data[0] : null;
  }, [supabase]);

  const fetchAwardsData = useCallback(async (athleteId) => {
    const { data, error } = await supabase
      .from('awards_recognitions')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('season_start', { ascending: false })
      .order('date_awarded', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    return data || [];
  }, [supabase]);

  const fetchMediaData = useCallback(async (athleteId) => {
    const { data, error } = await supabase
      .from('media_item')
      .select('*')
      .eq('athlete_id', athleteId);
    if (error) throw error;
    const items = data || [];
    const gameIds = items
      .filter(item => (item?.category || '') === MEDIA_CATEGORIES.GAME)
      .map(item => item.id);
    let gameMeta = [];
    if (gameIds.length) {
      const { data: metaRows, error: metaError } = await supabase
        .from('media_game_meta')
        .select('*')
        .in('media_item_id', gameIds);
      if (metaError) throw metaError;
      gameMeta = metaRows || [];
    }
    return { items, gameMeta };
  }, [supabase]);

  const fetchSocialProfiles = useCallback(async (athleteId) => {
    const { data, error } = await supabase
      .from('social_profiles')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }, [supabase]);

  const applyDerivedFields = useCallback((base, overrides = {}) => {
    if (!base) return base;
    const next = { ...base };
    const cv = overrides.contactsVerification ?? cardDataRef.current.contactsVerification;
    if (cv) {
      next.residence_city = cv.residence_city || '';
      next.residence_country = cv.residence_country || '';
    } else {
      next.residence_city = next.residence_city || '';
      next.residence_country = next.residence_country || '';
    }
    const sports = overrides.sportsExperience ?? cardDataRef.current.sportsExperience;
    if (sports) {
      next.seeking_team = !!sports.seeking_team;
    } else if (next.seeking_team == null) {
      next.seeking_team = false;
    }
    return next;
  }, []);

  const sendFullCompletionEmail = useCallback(async (firstNameRaw) => {
    if (!user?.email) return;
    const firstName = (firstNameRaw || '').trim();
    try {
      await sendEmail({
        to: user.email,
        subject: 'TalentLix · Profile 100% complete',
        heading: 'You reached 100% completion',
        previewText: 'Operators can now review every detail of your TalentLix profile.',
        message: [
          firstName ? `Hi ${firstName},` : 'Hi there,',
          'Congratulations! You have completed 100% of your TalentLix profile.',
          'Operators, agents, and clubs can now access every detail they need to evaluate you and get in touch.',
          'Keep your information fresh and respond quickly to opportunities to make the most of your visibility.',
          'See you on TalentLix,',
          'The TalentLix Team',
        ],
      });
    } catch (emailError) {
      console.error('Failed to send profile completion email', emailError);
    }
  }, [user]);

  const sendProfilePublishedEmail = useCallback(async (firstNameRaw) => {
    if (!user?.email) return;
    const firstName = (firstNameRaw || '').trim();
    try {
      await sendEmail({
        to: user.email,
        subject: 'TalentLix · Profile published',
        heading: 'Your TalentLix profile is live',
        previewText: 'Operators can now find and contact you on TalentLix.',
        message: [
          firstName ? `Hi ${firstName},` : 'Hi there,',
          'Your TalentLix profile is now published and visible in searches performed by operators, agents, and clubs.',
          'Stay active on the platform, monitor your inbox, and keep your details current so you never miss a new opportunity.',
          'We are cheering for you,',
          'The TalentLix Team',
        ],
      });
    } catch (emailError) {
      console.error('Failed to send profile published email', emailError);
    }
  }, [user]);

  const recomputeCompletion = useCallback(async ({ overrides = {}, athleteOverride } = {}) => {
    const currentAthlete = athleteOverride
      ? athleteOverride
      : applyDerivedFields(athleteRef.current, overrides);
    if (!currentAthlete?.id) return;

    const currentCardData = cardDataRef.current;
    const helperInput = {
      athlete: currentAthlete,
      contactsVerification: overrides.contactsVerification ?? currentCardData.contactsVerification,
      sportsExperience: overrides.sportsExperience ?? currentCardData.sportsExperience,
      physical: overrides.physical ?? currentCardData.physical,
      awards: overrides.awards ?? currentCardData.awards,
      mediaItems: overrides.mediaItems ?? currentCardData.mediaItems,
      mediaGameMeta: overrides.mediaGameMeta ?? currentCardData.mediaGameMeta,
      socialProfiles: overrides.socialProfiles ?? currentCardData.socialProfiles,
    };

    const { completion, breakdown } = computeProfileCompletion(helperInput);
    setCompletionBreakdown(breakdown);
    const clamped = Math.max(40, Math.min(100, Math.round(completion)));
    const currentCompletion = Number(currentAthlete.completion_percentage ?? 0);
    const reachedFullCompletion = clamped === 100 && currentCompletion < 100;

    if (currentCompletion !== clamped) {
      try {
        const { data: updated, error } = await supabase
          .from(ATHLETE_TABLE)
          .update({ completion_percentage: clamped })
          .eq('id', currentAthlete.id)
          .select()
          .single();
        if (error) throw error;
        setAthlete(applyDerivedFields(updated, overrides));
        if (reachedFullCompletion) {
          await sendFullCompletionEmail(updated?.first_name);
        }
      } catch (err) {
        console.error(err);
        setAthlete(prev => {
          const base = prev ? { ...prev } : { ...(currentAthlete || {}) };
          return applyDerivedFields({ ...base, completion_percentage: clamped }, overrides);
        });
        if (reachedFullCompletion) {
          await sendFullCompletionEmail(currentAthlete?.first_name);
        }
      }
    } else if (athleteOverride) {
      setAthlete(prev => {
        const base = prev ? { ...prev, ...athleteOverride } : { ...athleteOverride };
        return applyDerivedFields({ ...base, completion_percentage: clamped }, overrides);
      });
    } else {
      setAthlete(prev => (prev ? { ...prev, completion_percentage: clamped } : prev));
      if (reachedFullCompletion) {
        const fallbackName = athleteOverride?.first_name || athleteRef.current?.first_name;
        await sendFullCompletionEmail(fallbackName);
      }
    }
  }, [applyDerivedFields, sendFullCompletionEmail]);

  const handleSectionSaved = useCallback(async (sectionId, nextAthlete = null) => {
    const baseAthlete = nextAthlete ? { ...(athleteRef.current || {}), ...nextAthlete } : athleteRef.current;
    const athleteId = nextAthlete?.id || baseAthlete?.id;
    if (!athleteId) return;

    const overrides = {};
    try {
      if (sectionId === 'contacts') {
        overrides.contactsVerification = await fetchContactsVerification(athleteId);
      } else if (sectionId === 'sports') {
        overrides.sportsExperience = await fetchLatestSportExperience(athleteId);
      } else if (sectionId === 'physical') {
        overrides.physical = await fetchPhysicalData(athleteId);
      } else if (sectionId === 'awards') {
        overrides.awards = await fetchAwardsData(athleteId);
      } else if (sectionId === 'media') {
        const mediaData = await fetchMediaData(athleteId);
        overrides.mediaItems = mediaData.items;
        overrides.mediaGameMeta = mediaData.gameMeta;
      } else if (sectionId === 'social') {
        overrides.socialProfiles = await fetchSocialProfiles(athleteId);
      }
    } catch (err) {
      console.error(err);
    }

    if (Object.keys(overrides).length) {
      setCardData(prev => ({ ...prev, ...overrides }));
    }

    const mergedAthlete = baseAthlete ? applyDerivedFields(baseAthlete, overrides) : baseAthlete;
    if (mergedAthlete) {
      setAthlete(mergedAthlete);
    }

    await recomputeCompletion({ overrides, athleteOverride: mergedAthlete });
  }, [
    fetchAwardsData,
    fetchContactsVerification,
    fetchLatestSportExperience,
    fetchMediaData,
    fetchPhysicalData,
    fetchSocialProfiles,
    applyDerivedFields,
    recomputeCompletion,
  ]);

  const handlePersonalSaved = useCallback((next) => handleSectionSaved('personal', next), [handleSectionSaved]);
  const handleContactsSaved = useCallback((next) => handleSectionSaved('contacts', next), [handleSectionSaved]);
  const handleSportsSaved = useCallback((next) => handleSectionSaved('sports', next), [handleSectionSaved]);
  const handleMediaSaved = useCallback((next) => handleSectionSaved('media', next), [handleSectionSaved]);
  const handleSocialSaved = useCallback((next) => handleSectionSaved('social', next), [handleSectionSaved]);
  const handlePhysicalSaved = useCallback((next) => handleSectionSaved('physical', next), [handleSectionSaved]);
  const handleAwardsSaved = useCallback(() => handleSectionSaved('awards'), [handleSectionSaved]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (mounted) setAuthReady(true);
          router.replace('/login');
          return;
        }

        const { data: { user: u }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !u) {
          if (mounted) setAuthReady(true);
          router.replace('/login');
          return;
        }
        if (mounted) setUser(u);

        const { data, error } = await supabase
          .from(ATHLETE_TABLE)
          .select(`
                  id,
                  first_name,
                  last_name,
                  date_of_birth,
                  gender,
                  nationality,
                  birth_city,
                  native_language,
                  additional_language,
                  phone,
                  profile_picture_url,
                  profile_published,
                  completion_percentage,
                  current_step,
                  needs_parental_authorization,
                  gdpr_accepted,
                  gdpr_accepted_at,
                  guardian_first_name,
                  guardian_last_name,
                  parental_consent,
                  parental_consent_at
                `)

          .eq('id', u.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error; // errore reale
        if (!data) {
          if (mounted) setAuthReady(true);
          router.replace('/wizard');
          return;
        }

        const completionVal = Number(data?.completion_percentage ?? 0);
        if ((data?.current_step && data.current_step > 0) || completionVal < 40) {
          const step = (data?.current_step && data.current_step > 0) ? String(data.current_step) : null;
          if (mounted) setAuthReady(true);
          router.replace(step ? `/wizard?step=${step}` : '/wizard');
          return;
        }

        let contactsRow = null;
        let sportsRow = null;
        let physicalRow = null;
        let awardsRows = [];
        let mediaResult = { items: [], gameMeta: [] };
        let socialRows = [];

        try { contactsRow = await fetchContactsVerification(u.id); } catch (err) { console.error(err); }
        try { sportsRow = await fetchLatestSportExperience(u.id); } catch (err) { console.error(err); }
        try { physicalRow = await fetchPhysicalData(u.id); } catch (err) { console.error(err); }
        try { awardsRows = await fetchAwardsData(u.id); } catch (err) { console.error(err); }
        try { mediaResult = await fetchMediaData(u.id); } catch (err) { console.error(err); mediaResult = { items: [], gameMeta: [] }; }
        try { socialRows = await fetchSocialProfiles(u.id); } catch (err) { console.error(err); }

        const overrides = {
          contactsVerification: contactsRow,
          sportsExperience: sportsRow,
          physical: physicalRow,
          awards: awardsRows,
          mediaItems: mediaResult.items,
          mediaGameMeta: mediaResult.gameMeta,
          socialProfiles: socialRows,
        };

        const merged = applyDerivedFields(data, overrides);

        if (mounted) {
          setCardData(overrides);
          setAthlete(merged);
          await recomputeCompletion({ overrides, athleteOverride: merged });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) {
          setAuthReady(true);
          setLoading(false);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (!u) router.replace('/login');
    });

    return () => { sub.subscription?.unsubscribe?.(); mounted = false; };
  }, [
    router,
    fetchAwardsData,
    fetchContactsVerification,
    fetchLatestSportExperience,
    fetchMediaData,
    fetchPhysicalData,
    fetchSocialProfiles,
    applyDerivedFields,
    recomputeCompletion,
  ]);

  const fullName = [athlete?.first_name, athlete?.last_name].filter(Boolean).join(' ') || 'Full Name';
  const isPublished = !!athlete?.profile_published;
  const completion = Math.max(40, Math.min(100, Number(athlete?.completion_percentage ?? 40)));
  const tooltipId = 'profile-completion-tooltip';

  const breakdownReady = completionBreakdown != null;

  const missingSections = useMemo(() => {
    if (!completionBreakdown) return [];
    return Object.entries(completionBreakdown)
      .filter(([, info]) => info && info.contributes === false)
      .map(([sectionId]) => SECTION_TITLE_BY_ID[sectionId] || sectionId);
  }, [completionBreakdown]);

  const sectionStatus = useMemo(() => {
    const statusMap = {};
    for (const section of SECTIONS) {
      let status = section.id === 'personal' || section.id === 'privacy' ? 'complete' : 'unknown';
      const info = completionBreakdown?.[section.id];
      if (info && typeof info.contributes === 'boolean') {
        status = info.contributes ? 'complete' : 'incomplete';
      }
      statusMap[section.id] = status;
    }
    return statusMap;
  }, [completionBreakdown]);

  const handleTooltipKeyDown = useCallback((event) => {
    if (event.key === 'Escape' && completionTooltipOpen) {
      event.preventDefault();
      setCompletionTooltipOpen(false);
    }
  }, [completionTooltipOpen]);

  useEffect(() => {
    if (!completionTooltipOpen) return;
    const handleClick = (event) => {
      if (!tooltipWrapRef.current) return;
      if (!tooltipWrapRef.current.contains(event.target)) {
        setCompletionTooltipOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [completionTooltipOpen]);

  const togglePublish = async () => {
    if (!athlete) return;
    const completionVal = Number(athlete?.completion_percentage ?? 0);
    if (completionVal < 40 || (athlete?.current_step && athlete.current_step > 0)) {
      alert('Complete your base profile in the Wizard before publishing.');
      router.replace('/wizard');
      return;
    }
    try {
      setSavingPublish(true);
      const { data, error } = await supabase
        .from(ATHLETE_TABLE)
        .update({ profile_published: !isPublished })
        .eq('id', athlete.id)
        .select()
        .single();
      if (error) throw error;
      setAthlete(data);
      if (!isPublished && data?.profile_published) {
        await sendProfilePublishedEmail(data?.first_name);
      }
    } catch (e) {
      console.error(e);
      alert('Error updating publish status');
    } finally {
      setSavingPublish(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (e) {
    console.error(e);
      alert('Logout error');
    }
  };

  const sectionObj = SECTIONS.find(s => s.id === current);

  if (!authReady) return null;

  // --- Stili dinamici derivati (mobile vs desktop)
  const headerStyle = { ...styles.header, ...(isMobile ? styles.headerMobile : null) };
  const headerLeftStyle = { ...styles.headerLeft, ...(isMobile ? styles.headerLeftMobile : null) };
  const headerRightStyle = { display: 'flex', alignItems: 'center', gap: 12, ...(isMobile ? styles.authWrapMobileSlot : {}) };

  const subHeaderStyle = { ...styles.subHeader, ...(isMobile ? styles.subHeaderMobile : null) };
  const progressBarStyle = { ...styles.progressBar, ...(isMobile ? { width: '100%' } : null) };
  const mainStyle = { ...styles.main, ...(isMobile ? styles.mainMobile : null) };

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <header style={headerStyle}>
        <div style={headerLeftStyle}>
          <img src="/logo-talentlix.png" alt="TalentLix" style={styles.logo} />
          <div>
            <div style={styles.headerTitle}>Athlete Dashboard</div>
            <div style={styles.headerName}>{fullName}</div>
          </div>
        </div>

        <div style={headerRightStyle}>
          <AuthControl
            email={user?.email}
            avatarUrl={athlete?.profile_picture_url}
            onLogout={handleLogout}
            compact={isMobile}
            athleteId={athlete?.id}
          />
        </div>
      </header>

      {/* SUB-HEADER più arioso su mobile */}
      <div style={subHeaderStyle}>
        {athlete?.profile_picture_url
          ? <img src={athlete.profile_picture_url} alt="Avatar" style={{ ...styles.avatar, objectFit: 'cover' }} />
          : <div style={styles.avatar} />
        }

        <div style={{ ...styles.publishRow, ...(isMobile ? styles.publishRowMobile : null) }}>
          <div style={{ ...styles.publishDot, background: isPublished ? '#2ECC71' : '#D9534F' }} />
          <span style={styles.publishText}>
            Profile status: {isPublished ? 'Published' : 'Unpublished'}
          </span>
          <button
            onClick={togglePublish}
            disabled={!athlete || savingPublish}
            style={{ ...styles.publishBtn, ...(isMobile ? styles.touchBtn : null) }}
            title={isPublished ? 'Unpublish profile' : 'Publish profile'}
          >
            {savingPublish ? 'Saving…' : (isPublished ? 'Unpublish' : 'Publish')}
          </button>
        </div>

        <div
          ref={tooltipWrapRef}
          style={{ ...styles.progressWrap, ...(isMobile ? styles.progressWrapMobile : null) }}
        >
          <div style={styles.progressLabelWrap}>
            <span style={styles.progressLabel}>Profile completion</span>
            <button
              type="button"
              onClick={() => setCompletionTooltipOpen(prev => !prev)}
              onKeyDown={handleTooltipKeyDown}
              onBlur={(event) => {
                if (!tooltipWrapRef.current) return;
                if (event.relatedTarget && tooltipWrapRef.current.contains(event.relatedTarget)) return;
                setCompletionTooltipOpen(false);
              }}
              aria-label="Show details about profile completion"
              aria-expanded={completionTooltipOpen}
              aria-controls={completionTooltipOpen ? tooltipId : undefined}
              aria-describedby={completionTooltipOpen ? tooltipId : undefined}
              style={styles.tooltipButton}
            >
              ?
            </button>
            {completionTooltipOpen && (
              <div id={tooltipId} role="tooltip" style={styles.tooltipBox}>
                {!breakdownReady ? (
                  <div style={styles.tooltipTitle}>Loading completion details…</div>
                ) : missingSections.length ? (
                  <>
                    <div style={styles.tooltipTitle}>Finish these sections to boost your profile:</div>
                    <ul style={styles.tooltipList}>
                      {missingSections.map((label) => (
                        <li key={label} style={styles.tooltipListItem}>{label}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div style={styles.tooltipTitle}>All set! Every section is contributing.</div>
                )}
              </div>
            )}
          </div>
          <div style={progressBarStyle}>
            <div style={{ ...styles.progressFill, width: `${completion}%` }} />
          </div>
          <div style={styles.progressPct}>{completion}%</div>
        </div>
      </div>

      {/* NAV MOBILE (nastro con frecce + fade) */}
      {isMobile && (
        <MobileScrollableTabs
          sections={SECTIONS}
          current={current}
          onSelect={setSection}
          statusMap={sectionStatus}
        />
      )}

      {/* MAIN LAYOUT */}
      <main style={mainStyle}>
        {/* LEFT NAV (solo desktop/tablet) */}
        {!isMobile && (
          <nav style={styles.leftNav}>
            {SECTIONS.map(s => {
              const status = sectionStatus[s.id] || 'unknown';
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                style={{
                  ...styles.navBtn,
                  ...(s.id === 'messages' ? styles.navBtnMessages : null),
                  ...(status === 'complete' ? styles.navBtnComplete : null),
                  ...(status === 'incomplete' ? styles.navBtnIncomplete : null),
                  ...(current === s.id ? styles.navBtnActive : null),
                }}
                  title={s.title}
                >
                  {s.title}
              </button>
            );
            })}
          </nav>
        )}

        {/* CONTENT PANEL */}
        <section style={styles.panel}>
          {/* FIX MOBILE (Save visibile + date input allineato) */}
          <style>{`
            @media (max-width: 480px) {
              /* tutto dentro il pannello si adatta e non deborda */
              .panel-body-mobile-fix * { min-width: 0 !important; }

              .panel-body-mobile-fix input,
              .panel-body-mobile-fix select,
              .panel-body-mobile-fix textarea,
              .panel-body-mobile-fix button,
              .panel-body-mobile-fix [type="submit"] {
                width: 100% !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                font-size: 14px !important;
                line-height: 1.2 !important;
              }

              /* testo Save sempre visibile */
              .panel-body-mobile-fix button,
              .panel-body-mobile-fix [type="submit"] {
                color: #111 !important;
                font-weight: 600 !important;
                text-indent: 0 !important;
                text-shadow: none !important;
                overflow: visible !important;
                visibility: visible !important;
                opacity: 1 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: auto !important;
                max-width: 100% !important;
                white-space: nowrap !important;
                flex-shrink: 0 !important;
              }
              .panel-body-mobile-fix button > * { display: inline !important; }
              .panel-body-mobile-fix button::before,
              .panel-body-mobile-fix button::after { display: none !important; }

              /* righe/colonne in stack su mobile */
              .panel-body-mobile-fix .row, 
              .panel-body-mobile-fix .col,
              .panel-body-mobile-fix .two-col {
                display: block !important;
                width: 100% !important;
              }

              /* input date allineato e senza overflow */
              .panel-body-mobile-fix input[type="date"] {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                -webkit-appearance: none;
                appearance: none;
                padding-right: 8px !important;
                box-sizing: border-box !important;
              }
            }
          `}</style>

          <style jsx>{`
            @keyframes profilePreviewSpin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>

          {loading ? (
            <div style={styles.loaderContainer} role="status" aria-live="polite">
              <div style={styles.spinner} aria-hidden="true" />
              <span style={styles.srOnly}>Loading profile…</span>
            </div>
          ) : (
            <>
              <h2 style={styles.panelTitle}>{sectionObj?.title}</h2>
              <div className="panel-body-mobile-fix" style={styles.panelBody}>
                {current === 'personal' && (
                  <PersonalPanel athlete={athlete} onSaved={handlePersonalSaved} isMobile={isMobile} />
                )}
                {current === 'contacts' && (
                  <ContactsPanel athlete={athlete} onSaved={handleContactsSaved} isMobile={isMobile} />
                )}
                {current === 'sports' && (
                  <SportInfoPanel athlete={athlete} onSaved={handleSportsSaved} isMobile={isMobile} />
                )}
                {current === 'media' && (
                 <MediaPanel athlete={athlete} onSaved={handleMediaSaved} isMobile={isMobile} />
                )}
                {current === 'social' && (
                  <SocialPanel athlete={athlete} onSaved={handleSocialSaved} isMobile={isMobile} />
                )}
                {current === 'physical' && (
                  <PhysicalPanel athlete={athlete} onSaved={handlePhysicalSaved} isMobile={isMobile} />
                )}
                {current === 'awards' && (
                  <AwardsWidget athleteId={athlete?.id} isMobile={isMobile} onSaved={handleAwardsSaved} />
                )}
                {current === 'messages' && (
                  <MessagesPanel isMobile={isMobile} />
                )}
                {current === 'privacy' && (
                  <PrivacyPanel athlete={athlete} />
                )}
                {current !== 'personal' && current !== 'contacts' && current !== 'sports' && current !== 'media' && current !== 'social' && current !== 'physical' && current !== 'awards' && current !== 'messages' && current !== 'privacy' && (
                  <p style={styles.placeholder}>TODO — “{sectionObj?.title}”</p>
                )}

              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

/** Login/logout in alto a destra */
function AuthControl({ email, avatarUrl, onLogout, compact, athleteId }) {
  return (
    <div style={{ ...styles.authWrap, ...(compact ? styles.authWrapMobile : null) }}>
      <div style={styles.linkGroup}>
        <a href="/index" style={styles.link}>Home</a>
        <span>|</span>
        {athleteId
          ? <a href={`/profile/preview?id=${athleteId}`} style={styles.link}>Preview</a>
          : <a style={{ ...styles.link, pointerEvents: 'none', opacity: 0.5 }}>Preview</a>
        }
        {!compact && <span>|</span>}
      </div>
      <div style={styles.authBox}>
        {avatarUrl
          ? <img src={avatarUrl} alt="Avatar" style={styles.authAvatar} />
          : <div style={styles.authAvatarPlaceholder} />
        }
        <span style={styles.authEmail}>{email || '—'}</span>
        <button onClick={onLogout} style={{ ...styles.logoutBtn, ...styles.touchBtn }} title="Logout">Logout</button>
      </div>
    </div>
  );
}

/** Nastro tabs mobile con frecce grandi e 3 bottoni visibili */
function MobileScrollableTabs({ sections, current, onSelect, statusMap }) {
  const scrollerRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateShadows = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setAtStart(scrollLeft <= 0);
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 1);
  };

  useEffect(() => {
    updateShadows();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => updateShadows();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(updateShadows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []);

  const nudge = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.9), behavior: 'smooth' });
  };

  return (
    <div style={styles.mobileTabsWrap}>
      {!atStart && (
        <button aria-label="Scroll left" onClick={() => nudge(-1)} style={{ ...styles.nudgeBtn, left: 6 }}>
          ‹
        </button>
      )}
      {!atEnd && (
        <button aria-label="Scroll right" onClick={() => nudge(1)} style={{ ...styles.nudgeBtn, right: 6 }}>
          ›
        </button>
      )}

      {!atStart && <div style={{ ...styles.edgeFade, left: 0, background: 'linear-gradient(90deg, rgba(255,255,255,1) 15%, rgba(255,255,255,0) 85%)' }} />}
      {!atEnd && <div style={{ ...styles.edgeFade, right: 0, background: 'linear-gradient(270deg, rgba(255,255,255,1) 15%, rgba(255,255,255,0) 85%)' }} />}

      <div ref={scrollerRef} style={styles.mobileTabsScroller}>
        {sections.map(s => {
          const status = statusMap?.[s.id] || 'unknown';
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                ...styles.mobileTabBtn,
                ...(s.id === 'messages' ? styles.mobileTabBtnMessages : null),
                ...(status === 'complete' ? styles.mobileTabBtnComplete : null),
                ...(status === 'incomplete' ? styles.mobileTabBtnIncomplete : null),
                ...(current === s.id ? styles.mobileTabBtnActive : null)
              }}
              title={s.title}
            >
              {s.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  page: { fontFamily: 'Inter, sans-serif', background: '#F8F9FA', minHeight: '100vh', color: '#000' },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid #E0E0E0',
    background: '#FFFFFF',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    boxSizing: 'border-box'
  },
  headerMobile: { flexWrap: 'wrap', rowGap: 8 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  headerLeftMobile: { flex: '1 1 100%' },
  logo: { width: 40, height: 'auto' },
  headerTitle: { fontSize: 18, fontWeight: 700, lineHeight: 1.1 },
  headerName: { fontSize: 14, opacity: 0.7, lineHeight: 1.1 },

  authWrapMobileSlot: { flex: '1 1 100%', display: 'flex', justifyContent: 'flex-end' },

  authWrap: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  authWrapMobile: { width: '100%', justifyContent: 'space-between' },
  linkGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  authBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: 8, background: '#FFF' },
  authAvatar: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' },
  authAvatarPlaceholder: { width: 28, height: 28, borderRadius: '50%', background: '#EEE' },
  authEmail: { fontSize: 12, opacity: 0.8, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  logoutBtn: { fontSize: 12, padding: '8px 12px', borderRadius: 10, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer' },

  link: { color: '#27E3DA', textDecoration: 'none' },

  // --- Sub-header
  subHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    padding: '14px 24px',
    borderBottom: '1px solid #E0E0E0',
    background: '#FFFFFF',
    boxSizing: 'border-box'
  },
  subHeaderMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 14, padding: '16px 16px' },
  avatar: { width: 56, height: 56, borderRadius: '50%', background: '#EEE' },

  publishRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  publishRowMobile: { order: 2 },
  publishDot: { width: 10, height: 10, borderRadius: '50%' },
  publishText: { fontSize: 12, opacity: 0.85 },
  publishBtn: { fontSize: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer' },

  progressWrap: { display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  progressWrapMobile: { marginLeft: 0, order: 3, flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  progressLabelWrap: { display: 'flex', alignItems: 'center', gap: 8, position: 'relative' },
  progressLabel: { fontSize: 12, opacity: 0.7 },
  progressBar: { width: 180, height: 8, background: '#EEE', borderRadius: 999 },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #27E3DA 0%, #F7B84E 100%)', borderRadius: 999 },
  progressPct: { fontSize: 12, opacity: 0.8, minWidth: 32, textAlign: 'right' },
  tooltipButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: '1px solid #27E3DA',
    background: '#FFFFFF',
    color: '#27E3DA',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  tooltipBox: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: 220,
    background: '#FFFFFF',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
    padding: '12px 14px',
    fontSize: 12,
    lineHeight: 1.5,
    color: '#000',
    zIndex: 20,
  },
  tooltipTitle: { fontWeight: 600, marginBottom: 6 },
  tooltipList: { margin: 0, padding: 0, listStyle: 'none' },
  tooltipListItem: { margin: '4px 0', paddingLeft: 0 },

  // --- Nastro tabs mobile (3 bottoni in primo piano)
  mobileTabsWrap: {
    position: 'relative',
    borderBottom: '1px solid #E0E0E0',
    background: '#FFFFFF',
    padding: '8px 8px',
    boxSizing: 'border-box'
  },
  mobileTabsScroller: {
    display: 'flex',
    gap: 6,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '4px 8px',
    scrollbarWidth: 'none'
  },
  mobileTabBtn: {
    flex: '0 0 33.33%', // ~3 visibili
    textAlign: 'center',
    padding: '10px 8px',
    border: '1px solid #E0E0E0',
    background: '#FFFFFF',
    borderRadius: 999,
    fontSize: 14,
    cursor: 'pointer',
    minHeight: 40,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease'
  },
  mobileTabBtnMessages: { borderColor: '#27E3DA', background: '#E8FFFB', color: '#027373' },
  mobileTabBtnComplete: { borderColor: '#1E88E5', background: '#E3F2FD', color: '#0D47A1' },
  mobileTabBtnIncomplete: { borderColor: '#FB8C00', background: '#FFF4E5', color: '#7C3A00' },
  mobileTabBtnActive: {
    borderColor: '#27E3DA',
    boxShadow: '0 0 0 2px rgba(39,227,218,0.2)'
  },
  // Frecce grandi
  nudgeBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2,
    border: '1px solid #E0E0E0',
    background: '#FFF',
    borderRadius: '999px',
    width: 40,
    height: 40,
    lineHeight: '38px',
    textAlign: 'center',
    fontSize: 24,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.10)'
  },
  edgeFade: {
    position: 'absolute',
    top: 0,
    width: 36,
    height: '100%',
    zIndex: 1,
    pointerEvents: 'none'
  },

  // --- Main
  main: { display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, padding: 24, boxSizing: 'border-box', minWidth: 0 },
  mainMobile: { gridTemplateColumns: '1fr', gap: 12, padding: 12 },

  // left nav (desktop/tablet)
  leftNav: { display: 'flex', flexDirection: 'column', gap: 8, position: 'sticky', top: 100, alignSelf: 'start' },
  navBtn: {
    textAlign: 'left',
    padding: '12px 14px',
    border: '1px solid #E0E0E0',
    background: '#FFFFFF',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
    minHeight: 44,
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease'
  },
  navBtnMessages: { borderColor: '#27E3DA', background: '#E8FFFB', color: '#027373' },
  navBtnComplete: { borderColor: '#1E88E5', background: '#E3F2FD', color: '#0B3D91' },
  navBtnIncomplete: { borderColor: '#FB8C00', background: '#FFF4E5', color: '#7C3A00' },
  navBtnActive: { borderColor: '#27E3DA', boxShadow: '0 0 0 2px rgba(39,227,218,0.25)' },

  // panel
  panel: { 
    background: '#FFFFFF', 
    border: '1px solid #E0E0E0', 
    borderRadius: 12, 
    padding: 16, 
    minHeight: 360, 
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)', 
    boxSizing: 'border-box',
    minWidth: 0,
    maxWidth: '100%'
  },
  panelTitle: { fontSize: 18, margin: '4px 0 12px 0' },
  panelBody: { padding: 8, minWidth: 0, maxWidth: '100%', overflowX: 'visible', wordBreak: 'break-word' },
  placeholder: { color: '#666' },

  loaderContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 16,
    padding: 48,
    textAlign: 'center',
    minHeight: 'calc(100vh - 32px)',
    width: '100%'
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '4px solid #27E3DA',
    borderTopColor: '#F7B84E',
    animation: 'profilePreviewSpin 1s linear infinite'
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0
  },

  // touch-friendly
  touchBtn: { minHeight: 44 }
};

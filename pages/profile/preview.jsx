// pages/profile/preview.jsx
// TalentLix — Athlete Profile Preview (read-only, full-screen)
// - Solo lettura, visibile solo all’atleta autenticato (redireziona se non loggato).
// - Full-bleed Hero con overlay e chips informative.
// - Sub-nav sticky (80–96px) con IntersectionObserver per evidenziare la sezione attiva.
// - Layout responsive: desktop 2 colonne (8/12 + 4/12), mobile stack.
// - Media: intro video -> featured photo -> highlight più recente -> fallback monogramma.
// - Highlights: carosello orizzontale 16:9 (no autoplay), Partite intere in accordion per stagione.
// - Profilo/Fisico/Social/Contatti/Premi: mapping completo, badge verifiche, WhatsApp se prefisso valido.
// - Performance: lazy loading, thumbnails, pre-carica Hero + prime 2 immagini, signed URL 60s.
// - Accessibilità: alt text, focus ring, ESC chiude lightbox, tastiera su sub-nav/carosello.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Play, Mail, Phone, Globe, MapPin, BadgeCheck, ShieldCheck, Link as LinkIcon,
  ChevronRight, ChevronDown, ExternalLink, Verified, Image as ImageIcon, Video, Award
} from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';

// ---- Costanti stile (coerenti con il progetto)
const TOKENS = {
  radiusCard: 16,          // ≈ 2xl
  gutter: 24,
  pad: 20,
  maxW: 1280,              // container max width 1200–1280
  stickyTopDesktop: 88,    // 80–96px sotto l’header -> 88px
  stickyTopMobile: 0,
  gradient: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  zebra: '#F9FAFB',
};

const CAT = {
  INTRO: 'intro',
  FEATURED_HEAD: 'featured_headshot',
  FEATURED_G1: 'featured_game1',
  FEATURED_G2: 'featured_game2',
  HIGHLIGHT: 'highlight',
  GALLERY: 'gallery',
  GAME: 'game',
};

const BUCKET_MEDIA = 'media';
const BUCKET_DOCS  = 'documents'; // per Premi — evidenze

// ---- Utilities
const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
const toISODate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
};
const formatSeason = (start, end) => {
  const s = start ? String(start) : '';
  const e = end ? String(end) : '';
  if (s && e) return `${s}/${(e + '').slice(-2)}`;
  return s || '—';
};
const calcAge = (yyyy_mm_dd) => {
  if (!yyyy_mm_dd) return null;
  const [y, m, d] = yyyy_mm_dd.split('-').map(Number);
  const b = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(b.getTime())) return null;
  const n = new Date();
  let age = n.getFullYear() - b.getFullYear();
  const mo = n.getMonth() - b.getMonth();
  if (mo < 0 || (mo === 0 && n.getDate() < b.getDate())) age--;
  return age;
};
const onlyDigits = (v) => String(v || '').replace(/\D+/g, '');
const isValidE164 = (v) => /^\+?[1-9]\d{6,14}$/.test(String(v || ''));
const toWhatsAppLink = (phone) => (isValidE164(phone) ? `https://wa.me/${onlyDigits(phone)}` : '');
const youTubeId = (url) => {
  try {
    const u = new URL(String(url));
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
    }
  } catch {}
  return '';
};
const youTubeThumb = (id) => (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '');

// Signed URL (60s) con mini cache in memoria
const useSignedUrlCache = () => {
  const cache = useRef(new Map()); // key -> { url, exp }
  const get = async (bucket, path) => {
    if (!path) return '';
    const key = `${bucket}:${path}`;
    const now = Date.now();
    const hit = cache.current.get(key);
    if (hit && hit.exp > now + 2000) return hit.url;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error) return '';
    const url = data?.signedUrl || '';
    cache.current.set(key, { url, exp: now + 55_000 });
    return url;
  };
  return get;
};

// ---- Scheletri coerenti
function Skeleton({ style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        background: `linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 37%, #F3F4F6 63%)`,
        backgroundSize: '400% 100%',
        animation: 'skeleton 1.2s ease-in-out infinite',
        borderRadius: 12,
        ...style,
      }}
    />
  );
}

// ---- Lightbox molto semplice (ESC chiude, frecce per navigare)
function Lightbox({ items, index, onClose, onPrev, onNext }) {
  const esc = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') onPrev(); if (e.key === 'ArrowRight') onNext(); };
  useEffect(() => {
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
  const item = items[index] || {};
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
      }}
    >
      {/* immagine */}
      {item.url ? (
        <img
          src={item.url}
          alt={item.alt || 'Media'}
          style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div onClick={(e) => e.stopPropagation()} style={{ color: '#fff' }}>No image</div>
      )}
      {/* hint */}
      <div aria-hidden="true" style={{ position: 'fixed', bottom: 16, color: '#fff', fontSize: 12, opacity: 0.8 }}>
        ESC per chiudere • ←/→ per navigare
      </div>
    </div>
  );
}

export default function ProfilePreviewPage() {
  const router = useRouter();
  const getSigned = useSignedUrlCache();

  // ---- Responsive
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia('(max-width: 1023px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ---- Auth gate (solo atleta autenticato)
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionUserId, setSessionUserId] = useState(null);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      const userId = data?.session?.user?.id || null;
      if (!userId || error) {
        router.replace('/login');
        return;
      }
      setSessionUserId(userId);
      setSessionChecked(true);
    })();
  }, [router]);

  // ---- Stato dati
  const [loading, setLoading] = useState(true);
  const [athlete, setAthlete] = useState(null);
  const [sportExp, setSportExp] = useState(null);       // stato sportivo "Attuale"
  const [career, setCareer] = useState([]);             // athlete_career[]
  const [media, setMedia] = useState({                  // media per categorie
    intro: null, featured: { head: null, g1: null, g2: null },
    highlights: [], gallery: [], games: []              // games: [{item, meta}]
  });
  const [physical, setPhysical] = useState(null);       // ultima riga physical_data
  const [socials, setSocials] = useState([]);           // profili social
  const [contacts, setContacts] = useState(null);       // contacts_verification
  const [awards, setAwards] = useState([]);             // awards_recognitions

  // ---- Lightbox state
  const [lightbox, setLightbox] = useState({ open: false, items: [], index: 0 });

  // ---- Caricamento iniziale
  useEffect(() => {
    if (!sessionChecked || !sessionUserId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);

        // 1) Athlete (profilo base)
        const { data: a } = await supabase
          .from('athlete')
          .select('*')
          .eq('id', sessionUserId)
          .single();

        // 2) Sports (ultima esperienza come "Attuale")
        const { data: se } = await supabase
          .from('sports_experiences')
          .select('id, sport, role, team, previous_team, category, years_experience, seeking_team, secondary_role, playing_style, contract_status, contract_end_date, preferred_regions, trial_window, agent_name, agency_name, is_represented')
          .eq('athlete_id', sessionUserId)
          .order('id', { ascending: false })
          .limit(1);

        // 3) Career timeline
        const { data: car } = await supabase
          .from('athlete_career')
          .select('id, season_start, season_end, team_name, role, category, league, is_current')
          .eq('athlete_id', sessionUserId)
          .order('season_start', { ascending: false })
          .order('id', { ascending: false });

        // 4) Media items
        const { data: mi } = await supabase
          .from('media_item')
          .select('*')
          .eq('athlete_id', sessionUserId);

        // Game meta
        let games = [];
        const gameItems = (mi || []).filter(r => r.category === CAT.GAME);
        if (gameItems.length) {
          const ids = gameItems.map(r => r.id);
          const { data: meta } = await supabase
            .from('media_game_meta')
            .select('*')
            .in('media_item_id', ids);
          const by = new Map((meta || []).map(m => [m.media_item_id, m]));
          games = gameItems
            .map(item => ({ item, meta: by.get(item.id) || {} }))
            .sort((a, b) => (b?.meta?.match_date || '').localeCompare(a?.meta?.match_date || ''));
        }

        // 5) Physical (ultima rilevazione)
        const { data: phy } = await supabase
          .from('physical_data')
          .select('*')
          .eq('athlete_id', sessionUserId)
          .order('id', { ascending: false })
          .limit(1);

        // 6) Social profiles
        const { data: soc } = await supabase
          .from('social_profiles')
          .select('*')
          .eq('athlete_id', sessionUserId)
          .order('is_primary', { ascending: false })
          .order('sort_order', { ascending: true });

        // 7) Contacts verification
        const { data: cv } = await supabase
          .from('contacts_verification')
          .select('*')
          .eq('athlete_id', sessionUserId)
          .single();

        // 8) Awards & Recognitions
        const { data: aw } = await supabase
          .from('awards_recognitions')
          .select('*')
          .eq('athlete_id', sessionUserId)
          .order('season_start', { ascending: false })
          .order('date_awarded', { ascending: false })
          .order('id', { ascending: false });

        if (!mounted) return;

        // Prepara featured/intro/highlights/gallery
        const intro = (mi || []).find(r => r.category === CAT.INTRO) || null;
        const featured = {
          head: (mi || []).find(r => r.category === CAT.FEATURED_HEAD) || null,
          g1:   (mi || []).find(r => r.category === CAT.FEATURED_G1) || null,
          g2:   (mi || []).find(r => r.category === CAT.FEATURED_G2) || null,
        };
        const highlights = (mi || []).filter(r => r.category === CAT.HIGHLIGHT).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const gallery    = (mi || []).filter(r => r.category === CAT.GALLERY).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        setAthlete(a || null);
        setSportExp((se && se[0]) || null);
        setCareer(car || []);
        setMedia({ intro, featured, highlights, gallery, games });
        setPhysical((phy && phy[0]) || null);
        setSocials(soc || []);
        setContacts(cv || null);
        setAwards(aw || []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [sessionChecked, sessionUserId]);

  // ---- Hero media selection (priorità: intro video -> featured foto -> highlight -> monogramma)
  const hero = useMemo(() => {
    const { intro, featured, highlights } = media || {};
    const pick = intro || featured?.head || featured?.g1 || featured?.g2 || (highlights || [])[0] || null;
    return pick;
  }, [media]);

  // ---- Sub-nav + IntersectionObserver
  const sections = ['media', 'career', 'profile', 'physical', 'social', 'contacts', 'awards'];
  const [active, setActive] = useState('media');
  const refs = useRef(Object.fromEntries(sections.map(id => [id, null])));
  const setRef = (id) => (el) => { refs.current[id] = el; };
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: `-100px 0px -60% 0px`, threshold: [0.1, 0.25, 0.5, 0.75] }
    );
    sections.forEach(id => refs.current[id] && obs.observe(refs.current[id]));
    return () => obs.disconnect();
  }, [loading, isMobile]); // ricalibra dopo load

  const scrollTo = (id) => {
    const el = refs.current[id];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.pageYOffset - (isMobile ? TOKENS.stickyTopMobile : TOKENS.stickyTopDesktop) - 8;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  // ---- Helpers media (signed URL / thumbnails)
  const signed = async (path) => (path ? await getSigned(BUCKET_MEDIA, path) : '');
  const signedDoc = async (path) => (path ? await getSigned(BUCKET_DOCS, path) : '');

  // ---- Render
  if (!sessionChecked) return null;

  // Loader globale con scheletri
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#FFF' }}>
        <div style={{ width: '100%', height: isMobile ? '56vh' : 460, position: 'relative', background: '#111' }}>
          <Skeleton style={{ width: '100%', height: '100%', borderRadius: 0 }} />
        </div>
        <div style={{ maxWidth: TOKENS.maxW, margin: '0 auto', padding: 16 }}>
          <div style={{ height: 56 }} />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: TOKENS.gutter }}>
            <Skeleton style={{ height: 320 }} />
            <Skeleton style={{ height: 320 }} />
          </div>
        </div>
        <style jsx global>{`
          @keyframes skeleton { 0%{background-position: 100% 50%} 100%{background-position: 0 50%} }
        `}</style>
      </div>
    );
  }

  // --- Dati base per header/hero
  const fullName = athlete ? `${athlete.first_name || ''} ${athlete.last_name || ''}`.trim() : '';
  const dobISO = athlete?.date_of_birth ? toISODate(athlete.date_of_birth) : '';
  const age = calcAge(dobISO);
  const nat = athlete?.nationality || '';
  const mainRole = sportExp?.role || sportExp?.main_role || '';
  const team = sportExp?.team || sportExp?.team_name || '';
  const cat = sportExp?.category || '';
  const league = sportExp?.league || '';
  const metaLine = [team && `Attualmente: ${team}`, cat, league].filter(Boolean).join(' · ');

  // --- Quick facts fisico
  const qf = {
    height: physical?.height_cm || null,
    weight: physical?.weight_kg || null,
    wingspan: physical?.wingspan_cm || null,
    hand: physical?.dominant_hand || '',
    foot: physical?.dominant_foot || '',
  };

  // --- Contatti + verifiche
  const phone = athlete?.phone || contacts?.phone_number || '';
  const email = athlete?.email || ''; // se mappato nell'auth/user_metadata – opzionale
  const phoneVerified = !!contacts?.phone_verified;
  const idVerified = !!contacts?.id_verified;
  const residenceCity = contacts?.residence_city || '';
  const residenceCountry = contacts?.residence_country || '';

  // --- Featured/Gallery per Lightbox
  const galleryItems = (media.gallery || []).map(g => ({ url: g.poster_path || g.thumb_path || g.storage_path, alt: g.title || 'Foto' }));

  // --- Hero: prepara visualizzazione (poster/thumbnail + tipo)
  const heroIsVideo = !!(hero && (hero.storage_path && hero.mime_type?.startsWith('video/')) || (hero.external_url && (youTubeId(hero.external_url))));
  const [heroSrc, setHeroSrc] = useState('');
  const [heroPoster, setHeroPoster] = useState('');
  useEffect(() => {
    (async () => {
      if (!hero) { setHeroSrc(''); setHeroPoster(''); return; }
      // Se YouTube link
      if (hero.external_url && youTubeId(hero.external_url)) {
        const id = youTubeId(hero.external_url);
        setHeroSrc(`https://www.youtube.com/embed/${id}`);
        setHeroPoster(youTubeThumb(id));
        return;
      }
      // Se file su storage
      const m = hero.mime_type || '';
      const url = hero.storage_path ? await signed(hero.storage_path) : '';
      const poster = hero.poster_path ? await signed(hero.poster_path) : '';
      setHeroSrc(url);
      setHeroPoster(poster || (m.startsWith('video/') ? '' : url));
    })();
  }, [hero]);

  return (
    <div style={{ minHeight: '100vh', background: '#FFF' }}>
      {/* HERO full-bleed */}
      <div style={{ width: '100%', height: isMobile ? '60vh' : 460, position: 'relative', background: '#0B0B0B' }}>
        {/* Media */}
        {hero ? (
          heroIsVideo ? (
            heroSrc ? (
              <iframe
                title="Intro video"
                src={heroSrc}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#777' }}>
                <Video size={32} />
              </div>
            )
          ) : (
            <img
              src={heroPoster || heroSrc}
              alt={`${fullName} - hero`}
              loading="eager"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )
        ) : (
          // Fallback monogramma
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(120deg, #0EA5E9, #22D3EE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
          }}>
            <span style={{ fontSize: 72, fontWeight: 800 }}>
              {(fullName || 'A T').split(' ').map(s => s[0]?.toUpperCase()).slice(0,2).join('')}
            </span>
          </div>
        )}

        {/* Overlay gradient per leggibilità */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.75) 100%)'
        }} />

        {/* Testi sovrapposti */}
        <div style={{
          position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          width: '100%', maxWidth: TOKENS.maxW, padding: '0 16px', color: '#fff'
        }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 26 : 34, lineHeight: 1.15, fontWeight: 800 }}>{fullName || '—'}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {mainRole && <Chip label={mainRole} />}
            {team && <Chip label={team} />}
            {league && <Chip label={league} />}
            {nat && <Chip label={nat} />}
            {age != null && <Chip label={`${age} anni`} />}
          </div>
          {metaLine && <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.9)' }}>{metaLine}</div>}
        </div>
      </div>

      {/* SUB-NAV sticky */}
      <div style={{
        position: 'sticky',
        top: isMobile ? TOKENS.stickyTopMobile : TOKENS.stickyTopDesktop,
        background: '#FFF',
        zIndex: 50,
        borderBottom: `1px solid ${TOKENS.border}`,
        boxShadow: '0 1px 6px rgba(0,0,0,0.04)'
      }}>
        <div style={{
          maxWidth: TOKENS.maxW, margin: '0 auto', padding: '0 16px',
          height: 56, display: 'flex', alignItems: 'center', gap: 16, overflowX: 'auto'
        }}>
          {sections.map((id) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollTo(id); } }}
              style={{
                background: 'transparent', border: 'none', fontWeight: 700, fontSize: 14,
                padding: '8px 6px', cursor: 'pointer', whiteSpace: 'nowrap',
                borderBottom: active === id ? `2px solid #111827` : '2px solid transparent'
              }}
              aria-current={active === id ? 'page' : undefined}
            >
              {labelOf(id)}
            </button>
          ))}
        </div>
      </div>

      {/* CONTAINER */}
      <div style={{ maxWidth: TOKENS.maxW, margin: '0 auto', padding: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
            gap: TOKENS.gutter,
            alignItems: 'start'
          }}
        >
          {/* COLONNA A (70%): Media, Carriera, Profilo, Premi */}
          <div>
            {/* MEDIA */}
            <section id="media" ref={setRef('media')} style={{ scrollMarginTop: isMobile ? TOKENS.stickyTopMobile + 8 : TOKENS.stickyTopDesktop + 8 }}>
              <Card title="Media">
                {/* Highlights (carousel orizzontale, max 3 visibili su desktop) */}
                {media.highlights?.length ? (
                  <div>
                    <SectionHeading>Highlights</SectionHeading>
                    <div
                      role="list"
                      style={{
                        display: 'grid',
                        gridAutoFlow: 'column',
                        gridAutoColumns: isMobile ? '85%' : '33%',
                        gap: 12,
                        overflowX: 'auto',
                        scrollSnapType: 'x mandatory',
                        paddingBottom: 4
                      }}
                    >
                      {media.highlights.map((hl, i) => {
                        const ytid = youTubeId(hl.external_url);
                        const href = hl.external_url || null;
                        const itemTitle = hl.title || 'Highlight';
                        return (
                          <div key={hl.id || i} role="listitem" style={{ scrollSnapAlign: 'start', border: `1px solid ${TOKENS.border}`, borderRadius: 12, overflow: 'hidden' }}>
                            <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
                              {ytid ? (
                                <a
                                  href={href}
                                  target="_blank" rel="noreferrer"
                                  aria-label={`Guarda highlight: ${itemTitle}`}
                                >
                                  <img src={youTubeThumb(ytid)} alt={itemTitle} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  <Play
                                    aria-hidden
                                    style={{ position: 'absolute', inset: 0, margin: 'auto', opacity: 0.9, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}
                                    size={48}
                                    color="#fff"
                                  />
                                </a>
                              ) : hl.storage_path ? (
                                <video
                                  controls
                                  preload="none"
                                  poster={hl.poster_path || undefined}
                                  style={{ width: '100%', height: '100%', display: 'block' }}
                                  src=""
                                  // src firmato on-demand (lazy): firmiamo quando l’utente preme play
                                  onPlay={async (e) => { if (!e.currentTarget.src) e.currentTarget.src = await signed(hl.storage_path); }}
                                />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#777' }}>
                                  <Video size={28} />
                                </div>
                              )}
                            </div>
                            <div style={{ padding: 10 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{itemTitle}</div>
                              {hl.duration_sec ? (
                                <div style={{ fontSize: 12, color: TOKENS.textMuted }}>{Math.round(hl.duration_sec)}s</div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Featured photos */}
                {media.featured?.head || media.featured?.g1 || media.featured?.g2 ? (
                  <div style={{ marginTop: 18 }}>
                    <SectionHeading>Foto in evidenza</SectionHeading>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12 }}>
                      {[media.featured.head, media.featured.g1, media.featured.g2].filter(Boolean).map((it, i) => (
                        <FeaturedThumb
                          key={it.id || i}
                          item={it}
                          signed={signed}
                          onClick={async () => {
                            const url = it.poster_path || it.thumb_path || it.storage_path;
                            const final = url && url.includes('/') && !url.startsWith('http') ? await signed(url) : url;
                            const items = [{ url: final, alt: it.title || 'Foto' }];
                            setLightbox({ open: true, items, index: 0 });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Mini-gallery */}
                {media.gallery?.length ? (
                  <div style={{ marginTop: 18 }}>
                    <SectionHeading>Galleria</SectionHeading>
                    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                      {media.gallery.map((g, i) => (
                        <GalleryStripThumb
                          key={g.id || i}
                          item={g}
                          signed={signed}
                          onClick={async () => {
                            const ready = await Promise.all(
                              media.gallery.map(async (x) => {
                                const p = x.poster_path || x.thumb_path || x.storage_path;
                                const u = p && !/^https?:\/\//.test(p) ? await signed(p) : p;
                                return { url: u, alt: x.title || 'Foto' };
                              })
                            );
                            setLightbox({ open: true, items: ready, index: i });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Partite intere: accordion per stagione */}
                {media.games?.length ? (
                  <div style={{ marginTop: 18 }}>
                    <SectionHeading>Partite intere</SectionHeading>
                    <GamesAccordion games={media.games} signed={signed} />
                  </div>
                ) : null}
              </Card>
            </section>

            {/* CARRIERA */}
            <section id="career" ref={setRef('career')} style={{ scrollMarginTop: isMobile ? TOKENS.stickyTopMobile + 8 : TOKENS.stickyTopDesktop + 8, marginTop: TOKENS.gutter }}>
              <Card title="Carriera & Info sportive">
                {/* Blocco “Attuale” sintetico */}
                <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
                  <Row label="Sport" value={sportExp?.sport || '—'} />
                  <Row label="Team" value={team || '—'} />
                  <Row label="Categoria" value={cat || '—'} />
                  <Row label="Ruolo" value={mainRole || '—'} />
                  {sportExp?.secondary_role && <Row label="Secondario" value={sportExp.secondary_role} />}
                  {sportExp?.playing_style && <Row label="Stile di gioco" value={sportExp.playing_style} />}
                  <Row label="Seeking team" value={sportExp?.seeking_team ? 'Yes' : 'No'} />
                  <Row label="Contratto" value={humanContract(sportExp?.contract_status, sportExp?.contract_end_date)} />
                  {(sportExp?.agent_name || sportExp?.agency_name) && (
                    <Row label="Agente/Agenzia" value={[sportExp.agent_name, sportExp.agency_name].filter(Boolean).join(' · ')} />
                  )}
                  {Array.isArray(sportExp?.preferred_regions) && sportExp.preferred_regions.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {sportExp.preferred_regions.map((r, i) => <Chip key={i} label={r} muted />)}
                    </div>
                  )}
                </div>

                {/* Timeline stagioni (desc): ultime 2 aperte */}
                {career?.length ? (
                  <div style={{ marginTop: 16 }}>
                    {career.map((r, idx) => {
                      const open = idx < 2;
                      return (
                        <details key={r.id || idx} open={open} style={{
                          border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 0, overflow: 'hidden', marginBottom: 8,
                          transition: 'max-height 180ms ease'
                        }}>
                          <summary style={{
                            listStyle: 'none', cursor: 'pointer', padding: '10px 12px',
                            display: 'flex', alignItems: 'center', gap: 10
                          }}
                          onMouseDown={(e) => e.preventDefault()}
                          >
                            <span style={{ fontWeight: 700 }}>{formatSeason(r.season_start, r.season_end)}</span>
                            {r.sport && <Chip label={r.sport} muted small />}
                            {r.is_current && <Chip label="Current" muted small />}
                            <span style={{ marginLeft: 8 }}>{r.team_name || '—'}</span>
                            <ChevronRight size={16} style={{ marginLeft: 'auto' }} />
                          </summary>
                          <div style={{ padding: 12, borderTop: `1px solid ${TOKENS.border}`, background: '#FFF' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                              <Row label="Ruolo" value={r.role || '—'} />
                              <Row label="Categoria" value={r.category || '—'} />
                              {r.league && <Row label="Lega" value={r.league} />}
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                ) : null}
              </Card>
            </section>

            {/* PROFILO */}
            <section id="profile" ref={setRef('profile')} style={{ scrollMarginTop: isMobile ? TOKENS.stickyTopMobile + 8 : TOKENS.stickyTopDesktop + 8, marginTop: TOKENS.gutter }}>
              <Card title="Profilo">
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                  <Row label="Data di nascita" value={dobISO ? fmtDate(dobISO) : '—'} />
                  <Row label="Età" value={age != null ? `${age}` : '—'} />
                  <Row label="Nazionalità" value={nat || '—'} />
                  <Row label="Città di nascita" value={athlete?.birth_city || '—'} />
                  <Row label="Residenza" value={[residenceCity, residenceCountry].filter(Boolean).join(', ') || '—'} />
                  <Row label="Lingue" value={[athlete?.native_language, athlete?.additional_language].filter(Boolean).join(' · ') || '—'} />
                </div>
                {athlete?.bio && (
                  <div style={{ marginTop: 8, color: '#111827', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
                    {athlete.bio}
                  </div>
                )}
              </Card>
            </section>

            {/* PREMI */}
            <section id="awards" ref={setRef('awards')} style={{ scrollMarginTop: isMobile ? TOKENS.stickyTopMobile + 8 : TOKENS.stickyTopDesktop + 8, marginTop: TOKENS.gutter }}>
              <Card title="Premi & Riconoscimenti">
                {awards?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {awards.map((aw, i) => (
                      <div key={aw.id || i} style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12, background: '#FFF' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Award size={18} />
                          <div style={{ fontWeight: 700 }}>{aw.title || '—'}</div>
                          <div style={{ marginLeft: 'auto', fontSize: 12, color: TOKENS.textMuted }}>
                            {aw.season_start ? formatSeason(aw.season_start, aw.season_end) : (aw.date_awarded ? fmtDate(aw.date_awarded) : '')}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: '#111827', marginTop: 6, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
                          {aw.description || ''}
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {aw.awarding_entity && <Chip label={aw.awarding_entity} muted small />}
                          {aw.evidence_external_url && (
                            <a href={aw.evidence_external_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <ExternalLink size={16} /> <span>Evidence</span>
                            </a>
                          )}
                          {aw.evidence_file_path && (
                            <button
                              onClick={async () => {
                                const u = await signedDoc(aw.evidence_file_path);
                                if (u) window.open(u, '_blank', 'noopener,noreferrer');
                              }}
                              style={{ background: 'transparent', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, color: '#1976d2', cursor: 'pointer' }}
                            >
                              <ExternalLink size={16} /> Apri documento
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: TOKENS.textMuted }}>—</div>
                )}
              </Card>
            </section>
          </div>

          {/* COLONNA B (30%): Quick Facts Fisico, Social, Contatti */}
          <div>
            {/* FISICO */}
            <section id="physical" ref={setRef('physical')} style={{ scrollMarginTop: isMobile ? TOKENS.stickyTopMobile + 8 : TOKENS.stickyTopDesktop + 8 }}>
              <Card title="Fisico — Quick Facts">
                <FactsGrid facts={[
                  { label: 'Altezza', value: qf.height ? `${qf.height} cm` : '—' },
                  { label: 'Peso', value: qf.weight ? `${qf.weight} kg` : '—' },
                  { label: 'Apertura', value: qf.wingspan ? `${qf.wingspan} cm` : '—' },
                  { label: 'Mano dominante', value: qf.hand || '—' },
                  { label: 'Piede dominante', value: qf.foot || '—' },
                ]} />
                {/* Misure & Test: espandibile */}
                {physical ? <Measurements physical={physical} /> : null}
              </Card>
            </section>

            {/* SOCIAL */}
            <section id="social" ref={setRef('social')} style={{ scrollMarginTop: isMobile ? TOKENS.stickyTopMobile + 8 : TOKENS.stickyTopDesktop + 8, marginTop: TOKENS.gutter }}>
              <Card title="Social">
                {socials?.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                    {socials
                      .filter(s => !!s.profile_url)
                      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
                      .map((s, i) => (
                        <a
                          key={s.id || i}
                          href={s.profile_url}
                          target="_blank" rel="noreferrer"
                          style={{
                            border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none'
                          }}
                        >
                          <FiPlatform name={s.platform} />
                          <span style={{ fontWeight: 700 }}>{s.platform || 'Profile'}</span>
                        </a>
                      ))}
                  </div>
                ) : (
                  <div style={{ color: TOKENS.textMuted }}>—</div>
                )}
              </Card>
            </section>

            {/* CONTATTI (solo in questa preview privata) */}
            <section id="contacts" ref={setRef('contacts')} style={{ scrollMarginTop: isMobile ? TOKENS.stickyTopMobile + 8 : TOKENS.stickyTopDesktop + 8, marginTop: TOKENS.gutter }}>
              <Card title="Contatti">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Mail size={18} /> <span>{email || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Phone size={18} /> <span>{phone || '—'}</span>
                    {phoneVerified && <Badge type="ok" label="Phone verified" />}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldCheck size={18} /> <span>ID</span>
                    {idVerified ? <Badge type="ok" label="ID verified" /> : <Badge type="muted" label="Not verified" />}
                  </div>
                  {toWhatsAppLink(phone) && (
                    <a href={toWhatsAppLink(phone)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <LinkIcon size={16} /> Apri chat WhatsApp
                    </a>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MapPin size={18} /> <span>{[residenceCity, residenceCountry].filter(Boolean).join(', ') || '—'}</span>
                  </div>
                </div>
              </Card>
            </section>
          </div>
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightbox.open && (
        <Lightbox
          items={lightbox.items}
          index={lightbox.index}
          onClose={() => setLightbox({ open: false, items: [], index: 0 })}
          onPrev={() => setLightbox((p) => ({ ...p, index: p.index > 0 ? p.index - 1 : p.items.length - 1 }))}
          onNext={() => setLightbox((p) => ({ ...p, index: (p.index + 1) % p.items.length }))}
        />
      )}
    </div>
  );
}

// ---- Componenti UI minimi

function Card({ title, children }) {
  return (
    <div
      style={{
        border: `1px solid ${TOKENS.border}`,
        borderRadius: TOKENS.radiusCard,
        boxShadow: '0 6px 18px rgba(0,0,0,0.04)',
        background: '#FFF',
        padding: TOKENS.pad
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 800 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function SectionHeading({ children }) {
  return <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{children}</div>;
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
      <div style={{ color: TOKENS.textMuted, fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Chip({ label, muted = false, small = false }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: small ? '4px 8px' : '6px 10px',
        fontSize: small ? 12 : 13, fontWeight: 700,
        borderRadius: 999,
        background: muted ? '#F3F4F6' : 'rgba(255,255,255,0.15)',
        color: muted ? '#111827' : '#fff',
        border: muted ? `1px solid ${TOKENS.border}` : 'none'
      }}
    >
      {label}
    </span>
  );
}

function Badge({ type = 'ok', label }) {
  const styles = {
    ok:   { color: '#065F46', background: '#D1FAE5', border: '1px solid #10B981' },
    warn: { color: '#92400E', background: '#FEF3C7', border: '1px solid #F59E0B' },
    muted:{ color: '#374151', background: '#F3F4F6', border: `1px solid ${TOKENS.border}` },
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px',
      fontSize: 12, fontWeight: 700, borderRadius: 999, ...styles[type]
    }}>
      <Verified size={14} /> {label}
    </span>
  );
}

function FactsGrid({ facts }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {facts.map((f, i) => (
        <div key={i} style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 10, background: '#FFF' }}>
          <div style={{ fontSize: 12, color: TOKENS.textMuted }}>{f.label}</div>
          <div style={{ fontWeight: 700 }}>{f.value}</div>
        </div>
      ))}
    </div>
  );
}

function FeaturedThumb({ item, signed, onClick }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    (async () => {
      const p = item.poster_path || item.thumb_path || item.storage_path || '';
      const u = p && !/^https?:\/\//.test(p) ? await signed(p) : p;
      setSrc(u || '');
    })();
  }, [item, signed]);
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', aspectRatio: '4 / 3',
        border: `1px solid ${TOKENS.border}`, borderRadius: 12, overflow: 'hidden', padding: 0, cursor: 'pointer', background: '#F7F7F7'
      }}
      aria-label={item.title || 'Foto'}
    >
      {src ? (
        <img src={src} alt={item.title || 'Foto'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#777' }}>
          <ImageIcon size={24} />
        </div>
      )}
    </button>
  );
}

function GalleryStripThumb({ item, signed, onClick }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    (async () => {
      const p = item.thumb_path || item.poster_path || item.storage_path || '';
      const u = p && !/^https?:\/\//.test(p) ? await signed(p) : p;
      setSrc(u || '');
    })();
  }, [item, signed]);
  return (
    <button
      onClick={onClick}
      style={{ width: 160, aspectRatio: '3 / 2', border: `1px solid ${TOKENS.border}`, borderRadius: 12, overflow: 'hidden', padding: 0, cursor: 'pointer', background: '#F7F7F7' }}
      aria-label={item.title || 'Foto'}
    >
      {src ? (
        <img src={src} alt={item.title || 'Foto'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#777' }}>
          <ImageIcon size={20} />
        </div>
      )}
    </button>
  );
}

function GamesAccordion({ games, signed }) {
  // Raggruppa per stagione (meta.season), desc
  const bySeason = new Map();
  (games || []).forEach(g => {
    const s = g?.meta?.season || '—';
    if (!bySeason.has(s)) bySeason.set(s, []);
    bySeason.get(s).push(g);
  });
  const seasons = Array.from(bySeason.keys()).sort((a, b) => String(b).localeCompare(String(a)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {seasons.map((s, ix) => (
        <details key={s || ix} open={ix < 2} style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '10px 12px', fontWeight: 800 }} onMouseDown={(e) => e.preventDefault()}>
            {String(s)}
          </summary>
          <div style={{ borderTop: `1px solid ${TOKENS.border}` }}>
            {(bySeason.get(s) || []).map((g, i) => {
              const m = g.meta || {};
              const title = `${fmtDate(m.match_date)} · vs ${m.opponent || '—'} · ${m.competition || '—'}`;
              const href = g.item?.external_url || '';
              const storage = g.item?.storage_path || '';
              return (
                <div key={g.item?.id || i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '10px 12px', borderTop: i ? `1px solid ${TOKENS.zebra}` : 'none' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                  <div>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ExternalLink size={16} /> Guarda
                      </a>
                    ) : storage ? (
                      <button
                        onClick={async () => { const u = await signed(storage); if (u) window.open(u, '_blank', 'noopener,noreferrer'); }}
                        style={{ background: 'transparent', border: 'none', color: '#1976d2', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <ExternalLink size={16} /> Guarda
                      </button>
                    ) : (
                      <span style={{ color: TOKENS.textMuted }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

function FiPlatform({ name }) {
  const s = String(name || '').toLowerCase();
  if (s.includes('insta')) return <svg width="18" height="18" aria-hidden><circle cx="9" cy="9" r="8" fill="currentColor"/></svg>;
  if (s === 'x' || s.includes('twitter')) return <svg width="18" height="18" aria-hidden><path d="M2 16 16 2M6 2h10v10" stroke="currentColor" strokeWidth="2" fill="none"/></svg>;
  if (s.includes('youtube')) return <svg width="18" height="18" aria-hidden><rect x="2" y="5" width="14" height="8" rx="2" fill="currentColor"/><polygon points="8,7 12,9 8,11" fill="#fff"/></svg>;
  if (s.includes('tiktok')) return <svg width="18" height="18" aria-hidden><path d="M11 2c1 2 2 3 4 3v3c-2 0-3-1-4-2v5a5 5 0 1 1-3-5v3a2 2 0 1 0 2 2V2z" fill="currentColor"/></svg>;
  if (s.includes('facebook')) return <svg width="18" height="18" aria-hidden><path d="M10 6h2V3h-2c-1.7 0-3 1.3-3 3v2H5v3h2v6h3v-6h2l1-3h-3V6z" fill="currentColor"/></svg>;
  if (s.includes('linkedin')) return <svg width="18" height="18" aria-hidden><rect x="3" y="7" width="3" height="8" fill="currentColor"/><rect x="8" y="7" width="3" height="8" fill="currentColor"/><rect x="3" y="3" width="3" height="3" fill="currentColor"/><path d="M11 7c3 0 4 2 4 5v3h-3v-3c0-2-1-3-3-3h-1V7h3z" fill="currentColor"/></svg>;
  return <FiDot />;
}
function FiDot() { return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: '#111' }} aria-hidden />; }

function humanContract(status, end) {
  if (!status && !end) return '—';
  const map = { free_agent: 'Free agent', under_contract: 'Under contract', on_loan: 'On loan' };
  const s = status ? (map[status] || status) : '';
  const d = end ? ` · fino al ${fmtDate(end)}` : '';
  return `${s}${d}`;
}

function labelOf(id) {
  switch (id) {
    case 'media': return 'Media';
    case 'career': return 'Carriera';
    case 'profile': return 'Profilo';
    case 'physical': return 'Fisico';
    case 'social': return 'Social';
    case 'contacts': return 'Contatti';
    case 'awards': return 'Premi';
    default: return id;
  }
}

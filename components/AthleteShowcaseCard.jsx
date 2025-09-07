// components/AthleteShowcaseCard.jsx
// Solo lettura · Preview privata atleta · Layout 8/12 + 4/12 · Sticky sub‑nav con IntersectionObserver
// Media full-bleed Hero (Intro ▶︎ → Featured photo → ultimo Highlight → fallback monogramma)
// Dati letti direttamente dalle stesse tabelle usate dalle card esistenti (coerenza piena).
//
// Riferimenti interni (coerenza categorie/DB):
// - Categorie media: featured_headshot/featured_game1/featured_game2/intro/gallery/highlight/game  :contentReference[oaicite:10]{index=10}
// - Join meta partite: media_item + media_game_meta  
// - Schemi tabelle (campi chiave): media_item/media_game_meta/athlete/contacts_verification/physical_data/athlete_career 
// - Supabase client centralizzato  :contentReference[oaicite:13]{index=13}

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase as sb } from '../utils/supabaseClient';
import {
  Play, Film, Image as ImageIcon, ChevronRight, ChevronDown,
  Calendar, Award as AwardIcon, Medal, Phone, Mail, Globe, MapPin, User, Flag, ExternalLink,
  CheckCircle, ShieldCheck, Ruler, Scale, MoveHorizontal, Hand, Activity, X as XIcon, Youtube, Instagram, Facebook, Linkedin
} from 'lucide-react';

const supabase = sb;

// ---------- Costanti (categorie media) ----------
const CAT = {
  FEATURED_HEAD: 'featured_headshot',
  FEATURED_G1:   'featured_game1',
  FEATURED_G2:   'featured_game2',
  GALLERY:       'gallery',
  INTRO:         'intro',
  HIGHLIGHT:     'highlight',
  GAME:          'game',
}; // :contentReference[oaicite:14]{index=14}

const BUCKET_MEDIA = 'media';
const BUCKET_DOCS  = 'documents';

// ---------- Utility ----------
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  } catch { return String(iso); }
};
const formatYearSeason = (start, end) => {
  const s = start ? String(start) : '';
  const e = end ? String(end) : '';
  if (s && e) return `${s}/${String(e).length === 4 ? String(e).slice(2) : e}`;
  return s || '—';
}; // (coerente con SeasonAccordionItem) :contentReference[oaicite:15]{index=15}

const getAge = (yyyy_mm_dd) => {
  if (!yyyy_mm_dd) return null;
  const [y, m, d] = String(yyyy_mm_dd).split('-').map(Number);
  const birth = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const mo = now.getMonth() - birth.getMonth();
  if (mo < 0 || (mo === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

const onlyDigits = (v) => String(v || '').replace(/\D+/g, '');
const toE164Loose = (v) => {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s.startsWith('+')) return `+${onlyDigits(s)}`;
  // se non ha +, non forziamo prefisso; generiamo solo se sembra già internazionale
  return s.startsWith('00') ? `+${onlyDigits(s)}` : '';
};

const isHttpUrl = (u='') => /^https?:\/\//i.test(String(u));
const parseYouTubeId = (url) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null;
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/watch')) return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    }
  } catch {}
  return null;
};
const parseVimeoId = (url) => {
  const m = String(url||'').match(/vimeo\.com\/(\d+)/i);
  return m ? m[1] : null;
};
const buildEmbedUrl = (url) => {
  const yt = parseYouTubeId(url);
  if (yt) return `https://www.youtube.com/embed/${yt}?rel=0`;
  const vm = parseVimeoId(url);
  if (vm) return `https://player.vimeo.com/video/${vm}`;
  return url;
};

// Flag emoji (best-effort dal nome Paese: prende ultime 2 lettere se ISO-2 o fallback testo)
const flagFromCountry = (name='') => {
  const s = String(name).trim();
  if (!s) return '';
  const iso2 = /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : '';
  const mapByName = {
    italy: 'IT', italia: 'IT', italian: 'IT',
    france: 'FR', francia: 'FR', french: 'FR',
    spain: 'ES', spagna: 'ES',
    germany: 'DE', germania: 'DE',
    usa: 'US', 'united states': 'US', 'united states of america': 'US', 'stati uniti': 'US',
    uk: 'GB', 'united kingdom': 'GB', england: 'GB', 'regno unito': 'GB',
    portugal: 'PT', poland: 'PL', romania: 'RO', greece: 'GR',
  };
  const key = s.toLowerCase();
  const code = iso2 || mapByName[key] || '';
  if (!code) return '';
  const A = 0x1F1E6;
  const base = 'A'.charCodeAt(0);
  const chars = [...code].map(c => String.fromCodePoint(A + (c.charCodeAt(0) - base)));
  return chars.join('');
};

// Cache Signed URL 60s
function useSignedUrlCache(bucket) {
  const cacheRef = useRef(new Map());
  return useCallback(async (storagePath) => {
    if (!storagePath) return '';
    const k = `${bucket}:${storagePath}`;
    const hit = cacheRef.current.get(k);
    const now = Date.now();
    if (hit && hit.exp > now + 2000) return hit.url;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60);
    if (error) return '';
    const url = data?.signedUrl || '';
    cacheRef.current.set(k, { url, exp: now + 55_000 });
    return url;
  }, [bucket]);
}

// ---------- Stili (inline, coerenti token progetto) ----------
const styles = {
  container: { maxWidth: 1280, margin: '0 auto', padding: 16 },
  card: {
    borderRadius: 16, // 2xl
    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
    background: '#fff',
    overflow: 'hidden'
  },
  heroWrap: { position: 'relative', width: '100%', minHeight: 460, background: '#0b0b0b' },
  heroMedia: { width: '100%', height: '100%', display: 'block', objectFit: 'cover', aspectRatio: '16 / 9' },
  heroOverlay: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.8) 100%)'
  },
  heroContent: {
    position: 'absolute', left: 24, right: 24, bottom: 24, color: '#fff',
    display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 960
  },
  h1: { fontSize: 36, lineHeight: 1.1, fontWeight: 800, margin: 0 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999,
          background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(4px)' },
  meta: { fontSize: 14, opacity: 0.95 },

  // Sub‑nav
  subnav: {
    position: 'sticky', top: 88, // 80–96px sotto header
    zIndex: 5, background: '#fff', borderBottom: '1px solid #eee',
    display: 'flex', gap: 16, overflowX: 'auto', padding: '12px 16px'
  },
  subnavItem: (active) => ({
    padding: '6px 10px', borderRadius: 999, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
    borderBottom: active ? '2px solid #111' : '2px solid transparent',
    color: active ? '#111' : '#444', background: active ? 'rgba(39,227,218,0.12)' : 'transparent',
    cursor: 'pointer'
  }),

  // Grid generale
  grid: {
    display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24,
    padding: 20
  },
  columnA: { display: 'flex', flexDirection: 'column', gap: 24 },
  columnB: { display: 'flex', flexDirection: 'column', gap: 24 },

  section: { border: '1px solid #eee', borderRadius: 16, padding: 20, background: '#fff' },
  sectionTitleRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  h2: { fontSize: 22, lineHeight: 1.2, margin: 0, fontWeight: 800 },
  h3: { fontSize: 18, margin: '8px 0', fontWeight: 700 },
  small: { fontSize: 12, color: '#666' },

  // Media
  hlCarousel: { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(260px,1fr)', gap: 12, scrollSnapType: 'x mandatory', overflowX: 'auto', paddingBottom: 6 },
  hlCard: { scrollSnapAlign: 'start', border: '1px solid #eee', borderRadius: 14, overflow: 'hidden', background: '#fafafa' },
  mediaPoster: { width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' },
  mediaCaption: { padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },

  photosGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  photoThumb: { width: '100%', aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 12, display: 'block' },
  strip: { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(120px,140px)', gap: 8, overflowX: 'auto' },

  // Full matches
  acc: { borderTop: '1px solid #eee', marginTop: 8 },
  accItem: { border: '1px solid #eee', borderRadius: 12, marginBottom: 8, background: '#fff' },
  accSummary: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer' },
  accDetails: { padding: 12, borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 6 },

  // Quick facts fisico
  facts: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 },
  factItem: { display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, background: '#fafafa', border: '1px solid #eee' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: '#f3f4f6', fontSize: 13, fontWeight: 700 },

  // Tabelle misure
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' },
  tdLabel: { width: '50%', padding: '10px 12px', background: '#fafafa', borderTopLeftRadius: 10, borderBottomLeftRadius: 10, fontWeight: 700 },
  tdVal: { width: '50%', padding: '10px 12px', background: '#fff', borderTopRightRadius: 10, borderBottomRightRadius: 10, border: '1px solid #eee', borderLeft: 'none' },

  // Cards secondaria (Social, Contatti)
  row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  iconBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, border: '1px solid #eee', background: '#fff', cursor: 'pointer' },

  // Awards
  awardRow: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: 12, border: '1px solid #eee', borderRadius: 12, background: '#fff' },

  // Skeletons
  skBlock: { background: 'linear-gradient(90deg,#eee,#f5f5f5,#eee)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite', borderRadius: 12 },

  // Responsive
  '@media(max-width:1023px)': {}
};

// Inject keyframes shimmer
if (typeof document !== 'undefined' && !document.getElementById('shimmer-kf')) {
  const el = document.createElement('style');
  el.id = 'shimmer-kf';
  el.innerHTML = `@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`;
  document.head.appendChild(el);
}

// ---------- Component ----------
export default function AthleteShowcaseCard({ athleteId }) {
  const getSignedMedia = useSignedUrlCache(BUCKET_MEDIA);
  const getSignedDoc   = useSignedUrlCache(BUCKET_DOCS);

  // Stato base
  const [loading, setLoading] = useState(true);
  const [athlete, setAthlete] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [sports, setSports] = useState(null);      // ultima sports_experiences
  const [career, setCareer] = useState([]);        // athlete_career[]
  const [physical, setPhysical] = useState(null);  // ultima physical_data
  const [contacts, setContacts] = useState(null);  // contacts_verification
  const [social, setSocial] = useState([]);        // social_profiles
  const [awards, setAwards] = useState([]);        // awards_recognitions
  const [media, setMedia]   = useState({ featured:{}, intro:null, highlights:[], gallery:[], games:[] });

  // Sub‑nav attivo
  const [activeId, setActiveId] = useState('media');

  // Mini‑lightbox
  const [lightbox, setLightbox] = useState({ open:false, type:'', src:'', title:'' });

  // Load
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);

        // 1) Athlete
        const { data: a } = await supabase.from('athlete').select('*').eq('id', athleteId).single();

        // 2) Auth (email)
        const { data: { user } } = await supabase.auth.getUser();
        const email = user?.email || '';

        // 3) Sports current
        const selSports = `
          id, sport, role, team, previous_team, category, years_experience, seeking_team,
          secondary_role, playing_style, contract_status, contract_end_date, contract_notes,
          preferred_regions, trial_window, agent_name, agency_name, is_represented
        `;
        const { data: sp } = await supabase
          .from('sports_experiences')
          .select(selSports)
          .eq('athlete_id', athleteId)
          .order('id', { ascending: false })
          .limit(1);

        // 4) Career timeline
        const { data: car } = await supabase
          .from('athlete_career')
          .select('*')
          .eq('athlete_id', athleteId)
          .order('season_start', { ascending: false })
          .order('id', { ascending: false });

        // 5) Physical latest
        const { data: pd } = await supabase
          .from('physical_data')
          .select('*')
          .eq('athlete_id', athleteId)
          .order('id', { ascending: false })
          .limit(1);

        // 6) Contacts / verification
        const { data: cv } = await supabase
          .from('contacts_verification')
          .select('*')
          .eq('athlete_id', athleteId)
          .single();

        // 7) Social profiles
        const { data: so } = await supabase
          .from('social_profiles')
          .select('*')
          .eq('athlete_id', athleteId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });

        // 8) Awards
        const { data: aw } = await supabase
          .from('awards_recognitions')
          .select('*')
          .eq('athlete_id', athleteId)
          .order('season_start', { ascending: false })
          .order('date_awarded', { ascending: false })
          .order('id', { ascending: false });

        // 9) Media (tutti poi split per categoria)
        const { data: rows } = await supabase
          .from('media_item')
          .select('*')
          .eq('athlete_id', athleteId);

        // Map media
        const byCat = (c) => (rows || []).filter(r => (r.category || '') === c);
        const oneCat = (c) => (rows || []).find(r => (r.category || '') === c) || null;
        const featured = { head: oneCat(CAT.FEATURED_HEAD), g1: oneCat(CAT.FEATURED_G1), g2: oneCat(CAT.FEATURED_G2) };
        const intro    = oneCat(CAT.INTRO);
        const gallery  = byCat(CAT.GALLERY).sort((a,b) => (Number(a.sort_order||0) - Number(b.sort_order||0)));
        const highlights = byCat(CAT.HIGHLIGHT).sort((a,b) => (Number(a.sort_order||0) - Number(b.sort_order||0)));
        const gamesRows  = byCat(CAT.GAME);

        let games = [];
        if (gamesRows.length) {
          const ids = gamesRows.map(r => r.id);
          const { data: metas } = await supabase
            .from('media_game_meta')
            .select('*')
            .in('media_item_id', ids);
          const metaBy = new Map((metas || []).map(m => [m.media_item_id, m]));
          games = gamesRows.map(r => ({ item:r, meta: metaBy.get(r.id) || {} }))
                           .sort((a,b)=> String(b.meta?.match_date||'').localeCompare(String(a.meta?.match_date||'')));
        }

        // Evidence signed URLs su awards (documents bucket)
        const awWithDocs = await Promise.all((aw || []).map(async r => {
          let signed = '';
          if (r.evidence_file_path) {
            try { signed = await getSignedDoc(r.evidence_file_path); } catch {}
          }
          return { ...r, evidence_signed_url: signed };
        }));

        if (!mounted) return;
        setAthlete(a || null);
        setUserEmail(email);
        setSports((sp && sp[0]) || null);
        setCareer(car || []);
        setPhysical((pd && pd[0]) || null);
        setContacts(cv || null);
        setSocial(so || []);
        setAwards(awWithDocs || []);
        setMedia({ featured, intro, gallery, highlights, games });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [athleteId]);

  // ---- Hero selection (Intro ▶︎ → Featured → last HL → fallback) ----
  const hero = useMemo(() => {
    if (media.intro && (media.intro.storage_path || media.intro.thumbnail_path)) return { type:'intro', item: media.intro };
    if (media.featured.head) return { type:'image', item: media.featured.head };
    if (media.featured.g1)   return { type:'image', item: media.featured.g1 };
    if (media.featured.g2)   return { type:'image', item: media.featured.g2 };
    if (media.highlights && media.highlights.length) return { type:'highlight', item: media.highlights[0] };
    return { type:'fallback', item:null };
  }, [media]);

  // ---- IntersectionObserver per sub‑nav ----
  useEffect(() => {
    const ids = ['media','carriera','profilo','fisico','social','contatti','premi'];
    const els = ids.map(id => document.getElementById(`sec-${id}`)).filter(Boolean);
    if (!('IntersectionObserver' in window) || !els.length) return;

    const observer = new IntersectionObserver((entries) => {
      // Sezioni in viewport: scegli quella più vicina al top
      const vis = entries.filter(e => e.isIntersecting).sort((a,b)=> a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) {
        const id = vis[0].target.id.replace('sec-','');
        setActiveId(id);
      }
    }, { rootMargin: '-100px 0px -60% 0px', threshold: [0, 0.25, 0.5, 1] });

    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

  // ---- Helpers media (poster/src) ----
  const [heroSrc, setHeroSrc] = useState('');
  const [heroPoster, setHeroPoster] = useState('');
  useEffect(() => {
    (async () => {
      if (!hero) return;
      if (hero.type === 'image') {
        const src = hero.item?.storage_path ? await getSignedMedia(hero.item.storage_path) : (isHttpUrl(hero.item?.thumbnail_path) ? hero.item.thumbnail_path : '');
        setHeroSrc(src);
        setHeroPoster('');
      } else if (hero.type === 'intro' || hero.type === 'highlight') {
        const poster = hero.item?.thumbnail_path
          ? (isHttpUrl(hero.item.thumbnail_path) ? hero.item.thumbnail_path : await getSignedMedia(hero.item.thumbnail_path))
          : '';
        const src = hero.item?.storage_path ? await getSignedMedia(hero.item.storage_path) : '';
        setHeroSrc(src);
        setHeroPoster(poster);
      } else {
        setHeroSrc('');
        setHeroPoster('');
      }
    })();
  }, [hero]);

  // ---- “Attualmente:” (team · categoria · lega) ----
  const currentCar = useMemo(() => (career || []).find(c => c.is_current) || null, [career]);

  // ---- Missing summary (banner opzionale) ----
  const missing = useMemo(() => {
    const out = [];
    if (!media.intro && !media.featured.head && !media.highlights.length) out.push('Aggiungi un media di copertina (intro, featured o highlight).');
    if (!sports?.sport || !sports?.role || !sports?.category) out.push('Completa Sport · Ruolo · Categoria (Info sportive attuali).');
    if (!physical?.height_cm || !physical?.weight_kg) out.push('Completa altezza e peso (Fisico).');
    if (!(contacts?.phone_verified)) out.push('Verifica il telefono (Contatti).');
    return out;
  }, [media, sports, physical, contacts]);

  // ---- Social ordering (IG/YouTube/X, poi resto) ----
  const socialSorted = useMemo(() => {
    const rows = (social || []).filter(r => r?.profile_url);
    const rank = (p='') => {
      const s = String(p).toLowerCase();
      if (s.includes('instagram')) return 1;
      if (s.includes('youtube')) return 2;
      if (s.includes('x.com') || s.includes('twitter')) return 3;
      if (s.includes('tiktok')) return 4;
      if (s.includes('facebook')) return 5;
      if (s.includes('linkedin')) return 6;
      return 99;
    };
    return [...rows].sort((a,b) => rank(a.profile_url) - rank(b.profile_url));
  }, [social]);

  // ---- Helpers scroll to section ----
  const scrollTo = (id) => {
    const el = document.getElementById(`sec-${id}`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  // ---------- Render ----------
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ ...styles.heroWrap }}>
            <div style={{ ...styles.heroOverlay }} />
            <div style={{ position:'absolute', inset:0, padding:24 }}>
              <div style={{ ...styles.skBlock, height: 48, width: 320, position:'absolute', bottom: 80 }} />
              <div style={{ ...styles.skBlock, height: 16, width: 420, position:'absolute', bottom: 40 }} />
            </div>
          </div>
          <div style={styles.subnav}>
            {['Media','Carriera','Profilo','Fisico','Social','Contatti','Premi'].map((l,i)=>(
              <span key={i} style={styles.subnavItem(false)}>{l}</span>
            ))}
          </div>
          <div style={styles.grid}>
            <div style={styles.columnA}>
              <div style={{ ...styles.section, height: 220, ...styles.skBlock }} />
              <div style={{ ...styles.section, height: 220, ...styles.skBlock }} />
              <div style={{ ...styles.section, height: 220, ...styles.skBlock }} />
            </div>
            <div style={styles.columnB}>
              <div style={{ ...styles.section, height: 160, ...styles.skBlock }} />
              <div style={{ ...styles.section, height: 160, ...styles.skBlock }} />
              <div style={{ ...styles.section, height: 160, ...styles.skBlock }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const fullName = `${athlete?.first_name || ''} ${athlete?.last_name || ''}`.trim() || '—';
  const age = getAge(athlete?.date_of_birth);
  const natFlag = flagFromCountry(athlete?.nationality) || '';
  const roleChip = sports?.role || currentCar?.role || '';
  const teamChip = sports?.team || currentCar?.team_name || '';
  const leagueChip = currentCar?.league || '';
  const catChip = sports?.category || currentCar?.category || '';

  const heroIsFallback = hero.type === 'fallback';
  const initials = (fullName.split(' ').map(s=>s[0]).slice(0,2).join('') || 'A').toUpperCase();

  // Phone / email
  const phone = athlete?.phone || contacts?.phone_number || '';
  const phoneE164 = toE164Loose(phone);
  const waLink = phoneE164 ? `https://wa.me/${onlyDigits(phoneE164)}` : '';
  const okPhone = !!contacts?.phone_verified;
  const okID    = !!contacts?.id_verified;

  // HERO MEDIA CONTENT
  const renderHeroMedia = () => {
    if (heroIsFallback) {
      return (
        <div style={{ ...styles.heroWrap, background: 'linear-gradient(135deg,#27E3DA,#F7B84E)' }}>
          <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center' }}>
            <div style={{ width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'grid', placeItems:'center', color:'#fff', fontSize:42, fontWeight:800 }}>
              {initials}
            </div>
          </div>
          <div style={styles.heroOverlay} />
        </div>
      );
    }

    if (hero.type === 'image') {
      return (
        <div style={styles.heroWrap}>
          {heroSrc ? (
            <img alt="Hero" src={heroSrc} style={styles.heroMedia} loading="eager" fetchpriority="high" />
          ) : (
            <div style={{ ...styles.heroMedia, background:'#111' }} />
          )}
          <div style={styles.heroOverlay} />
        </div>
      );
    }

    // intro/highlight -> poster + play
    return (
      <div style={styles.heroWrap}>
        {heroPoster ? (
          <img alt="Hero poster" src={heroPoster} style={styles.heroMedia} loading="eager" fetchpriority="high" />
        ) : <div style={{ ...styles.heroMedia, background:'#000' }} />}
        <button
          type="button"
          aria-label="Play hero video"
          onClick={() => setLightbox({ open:true, type:'video', src: hero.item.external_url ? buildEmbedUrl(hero.item.external_url) : heroSrc, title: hero.item?.title || 'Video' })}
          style={{
            position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            display:'inline-flex', alignItems:'center', gap:8, padding:'10px 14px',
            borderRadius: 999, border:'none',
            background:'linear-gradient(90deg,#27E3DA,#F7B84E)', color:'#fff', fontWeight:800, cursor:'pointer'
          }}
        >
          <Play size={18}/> Play
        </button>
        <div style={styles.heroOverlay} />
      </div>
    );
  };

  // HIGHLIGHTS
  const renderHLCard = (it, idx) => {
    const poster = it.thumbnail_path || (parseYouTubeId(it.external_url) ? `https://img.youtube.com/vi/${parseYouTubeId(it.external_url)}/hqdefault.jpg` : '');
    const duration = typeof it.duration_seconds === 'number' && it.duration_seconds > 0 ? `${it.duration_seconds}s` : '';
    const title = it.title || `Highlight #${idx+1}`;

    const open = async () => {
      if (it.external_url) {
        setLightbox({ open:true, type:'video', src: buildEmbedUrl(it.external_url), title });
      } else if (it.storage_path) {
        const src = await getSignedMedia(it.storage_path);
        setLightbox({ open:true, type:'video', src, title });
      }
    };

    return (
      <div key={it.id} style={styles.hlCard}>
        {poster ? (
          <img alt={title} src={isHttpUrl(poster) ? poster : ''} style={styles.mediaPoster} loading="lazy" decoding="async" />
        ) : (
          <div style={{ ...styles.mediaPoster, background:'#111', display:'grid', placeItems:'center', color:'#eee' }}>
            <Film size={18}/> No poster
          </div>
        )}
        <div style={styles.mediaCaption}>
          <div style={{ display:'flex', flexDirection:'column' }}>
            <div style={{ fontWeight:700, fontSize:14, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</div>
            <div style={styles.small}>{duration}</div>
          </div>
          <button onClick={open} style={{ ...styles.iconBtn, background:'linear-gradient(90deg,#27E3DA,#F7B84E)', border:'none', color:'#fff' }}><Play size={18}/></button>
        </div>
      </div>
    );
  };

  // FEATURED PHOTOS
  const featuredPhotos = [media.featured.head, media.featured.g1, media.featured.g2].filter(Boolean);

  // FULL GAMES raggruppo per stagione
  const gamesBySeason = media.games.reduce((acc, g) => {
    const key = g.meta?.season || '—';
    acc[key] = acc[key] || [];
    acc[key].push(g);
    return acc;
  }, {});

  const [openGameSeasons, setOpenGameSeasons] = useState(()=> {
    const keys = Object.keys(gamesBySeason);
    // Apri l’ultima stagione
    return new Set(keys.slice(0,1));
  });

  const toggleSeason = (s) => {
    setOpenGameSeasons(prev => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s); else n.add(s);
      return n;
    });
  };

  // TIMELINE: ultime 2 aperte, resto collassato
  const [showAllSeasons, setShowAllSeasons] = useState(false);
  const orderedCareer = [...(career||[])].sort((a,b)=> (b.season_start - a.season_start) || (b.id - a.id));
  const visibleCareer = showAllSeasons ? orderedCareer : orderedCareer.slice(0, 2);

  // MISURE & TEST: tabella solo valori esistenti
  const physicalPairs = [];
  if (physical) {
    const add = (label, val, unit='') => { if (val !== '' && val !== null && val !== undefined) physicalPairs.push([label, `${val}${unit}`]); };
    add('Apertura (Wingspan)', physical.wingspan_cm, ' cm');
    add('Standing reach', physical.standing_reach_cm, ' cm');
    add('Body fat', physical.body_fat_percent, ' %');
    add('Sprint 10m', physical.sprint_10m_s, ' s');
    add('Sprint 20m', physical.sprint_20m_s, ' s');
    add('Pro agility 5-10-5', physical.pro_agility_5_10_5_s, ' s');
    add('Vertical jump (CMJ)', physical.vertical_jump_cmj_cm, ' cm');
    add('Standing long jump', physical.standing_long_jump_cm, ' cm');
    add('Grip L', physical.grip_strength_left_kg, ' kg');
    add('Grip R', physical.grip_strength_right_kg, ' kg');
    add('Sit & reach', physical.sit_and_reach_cm, ' cm');
    add('Plank hold', physical.plank_hold_s, ' s');
    add('Cooper 12-min', physical.cooper_12min_m, ' m');
  }

  // ---- JSX ----
  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* HERO */}
        <section aria-label="Hero media + overlay">
          {renderHeroMedia()}
          <div style={styles.heroContent}>
            <h1 style={styles.h1}>{fullName}</h1>
            <div style={styles.chips}>
              {roleChip && <span style={styles.chip}><User size={14}/>{roleChip}</span>}
              {teamChip && <span style={styles.chip}><Flag size={14}/>{teamChip}</span>}
              {leagueChip && <span style={styles.chip}><Medal size={14}/>{leagueChip}</span>}
              {(athlete?.nationality || natFlag) && <span style={styles.chip}>{natFlag || '🏳️'} {athlete?.nationality || ''}</span>}
              {typeof age === 'number' && <span style={styles.chip}><Calendar size={14}/>{age} anni</span>}
            </div>
            {(currentCar?.team_name || currentCar?.category || currentCar?.league) && (
              <div style={styles.meta}>
                Attualmente: {currentCar?.team_name || '—'} · {currentCar?.category || '—'} · {currentCar?.league || '—'}
              </div>
            )}
          </div>
        </section>

        {/* SUB-NAV STICKY */}
        <nav aria-label="Sezioni profilo" style={styles.subnav}>
          {[
            ['media','Media'], ['carriera','Carriera'], ['profilo','Profilo'],
            ['fisico','Fisico'], ['social','Social'], ['contatti','Contatti'], ['premi','Premi']
          ].map(([id,label]) => (
            <button key={id} type="button" onClick={()=>scrollTo(id)} style={styles.subnavItem(activeId===id)}>
              {label}
            </button>
          ))}
        </nav>

        {/* BANNER mancanze (opzionale) */}
        {!!missing.length && (
          <div style={{ padding: '12px 20px', borderTop:'1px solid #f5f5f5', borderBottom:'1px solid #f5f5f5', background:'#fff8e1' }}>
            <div style={{ fontWeight:700, marginBottom:6 }}>Riepilogo mancanze</div>
            <ul style={{ margin:0, paddingLeft: '1.2em' }}>
              {missing.map((m,i)=>(<li key={i} style={{ fontSize:14 }}>{m}</li>))}
            </ul>
          </div>
        )}

        {/* GRID PRINCIPALE */}
        <div style={styles.grid}>

          {/* COLONNA A (8/12) */}
          <div style={styles.columnA}>
            {/* MEDIA */}
            <section id="sec-media" aria-label="Media" style={styles.section}>
              <div style={styles.sectionTitleRow}><Film size={18}/><h2 style={styles.h2}>Media</h2></div>

              {/* Highlights */}
              {!!(media.highlights||[]).length && (
                <>
                  <h3 style={styles.h3}>Highlights</h3>
                  <div style={styles.hlCarousel}>
                    {media.highlights.map(renderHLCard)}
                  </div>
                </>
              )}

              {/* Featured photos */}
              {!!featuredPhotos.length && (
                <>
                  <h3 style={styles.h3}>Featured photos</h3>
                  <div style={styles.photosGrid}>
                    {featuredPhotos.map((ph, i)=>(
                      <AsyncImage
                        key={ph.id}
                        alt={`Featured #${i+1}`}
                        path={ph.storage_path || ph.thumbnail_path}
                        getSigned={getSignedMedia}
                        style={styles.photoThumb}
                        onClick={(src)=> setLightbox({ open:true, type:'image', src, title: ph.title || `Photo #${i+1}` })}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Mini‑gallery strip */}
              {!!(media.gallery||[]).length && (
                <>
                  <h3 style={styles.h3}>Mini‑gallery</h3>
                  <div style={styles.strip} aria-label="Mini-gallery">
                    {media.gallery.map((g,i)=>(
                      <AsyncImage
                        key={g.id}
                        alt={g.title || `Photo ${i+1}`}
                        path={g.storage_path || g.thumbnail_path}
                        getSigned={getSignedMedia}
                        style={{ width:'100%', aspectRatio:'1 / 1', objectFit:'cover', borderRadius:12, display:'block' }}
                        onClick={(src)=> setLightbox({ open:true, type:'image', src, title: g.title || `Photo ${i+1}` })}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Full matches */}
              {!!Object.keys(gamesBySeason).length && (
                <>
                  <h3 style={styles.h3}>Partite intere</h3>
                  <div className="matches-acc" style={styles.acc}>
                    {Object.keys(gamesBySeason).map((season) => {
                      const open = openGameSeasons.has(season);
                      return (
                        <div key={season} style={styles.accItem}>
                          <button type="button" onClick={()=>toggleSeason(season)} style={styles.accSummary} aria-expanded={open}>
                            <span style={{ display:'flex', alignItems:'center', gap:8, fontWeight:800 }}>
                              <Calendar size={16}/> {season}
                            </span>
                            {open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                          </button>
                          {open && (
                            <div style={styles.accDetails} role="region" aria-label={`Partite stagione ${season}`}>
                              {gamesBySeason[season].map(({ item, meta }) => (
                                <div key={item.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, padding:'6px 0', borderBottom:'1px dashed #eee' }}>
                                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                                    <span>{formatDate(meta?.match_date)} · vs {meta?.opponent || '—'} · {meta?.competition || '—'}</span>
                                  </div>
                                  <div>
                                    {item.external_url ? (
                                      <a href={item.external_url} target="_blank" rel="noreferrer" style={{ fontWeight:700, color:'#1976d2', display:'inline-flex', alignItems:'center', gap:6 }}>
                                        Guarda <ExternalLink size={16}/>
                                      </a>
                                    ) : <span style={{ color:'#666' }}>—</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* CARRIERA & INFO SPORTIVE */}
            <section id="sec-carriera" aria-label="Carriera & informazioni sportive" style={styles.section}>
              <div style={styles.sectionTitleRow}><Medal size={18}/><h2 style={styles.h2}>Carriera</h2></div>

              {/* Blocco Attuale */}
              <div style={{ border:'1px solid #eee', borderRadius:12, padding:12, marginBottom:12, background:'#fafafa', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <div style={{ fontWeight:700 }}>{sports?.sport || '—'} • {sports?.category || '—'}</div>
                  <div style={styles.small}>{sports?.team || '—'}{sports?.secondary_role ? ` · ${sports.secondary_role}` : ''}</div>
                  {sports?.playing_style && <div style={styles.small}>Playing style: {sports.playing_style}</div>}
                  {sports?.seeking_team && <div style={{ ...styles.pill, marginTop:8 }}>Seeking team</div>}
                </div>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    <span style={styles.pill}>
                      { sports?.contract_status
                        ? (sports.contract_status === 'free_agent' ? 'Free agent' :
                           sports.contract_status === 'under_contract' ? 'Under contract' :
                           sports.contract_status === 'on_loan' ? 'On loan' : sports.contract_status)
                        : '—' }
                    </span>
                    {sports?.contract_end_date && <span style={styles.pill}>Until {formatDate(sports.contract_end_date)}</span>}
                  </div>
                  {!!(sports?.preferred_regions||[]).length && (
                    <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                      {sports.preferred_regions.map((r,i)=>(<span key={i} style={styles.pill}>{r}</span>))}
                    </div>
                  )}
                  {sports?.trial_window && <div style={{ ...styles.small, textAlign:'right', marginTop:6 }}>
                    Trial window: {String(sports.trial_window)}
                  </div>}
                  {(sports?.is_represented || sports?.agent_name || sports?.agency_name) && (
                    <div style={{ ...styles.small, textAlign:'right', marginTop:6 }}>
                      Agente: {sports?.agent_name || '—'} · Agenzia: {sports?.agency_name || '—'}
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline stagioni */}
              <div role="list" aria-label="Timeline stagioni">
                {visibleCareer.map((row) => (
                  <div key={row.id} style={{ border:'1px solid #eee', borderRadius:12, padding:12, marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                      <div style={{ fontWeight:800 }}>{formatYearSeason(row.season_start, row.season_end)}</div>
                      {row.sport && <span style={{ ...styles.pill }}>{row.sport}</span>}
                      {row.is_current && <span style={{ ...styles.pill, background:'#dcfce7', border:'1px solid #86efac' }}>Current</span>}
                      <div style={{ fontWeight:700, marginLeft:'auto' }}>{row.team_name || '—'}</div>
                    </div>
                    <div style={{ marginTop:6, color:'#333' }}>
                      {row.role || '—'} · {row.category || '—'} {row.league ? `· ${row.league}` : ''}
                    </div>
                  </div>
                ))}
                {orderedCareer.length > 2 && !showAllSeasons && (
                  <div style={{ textAlign:'center', marginTop:8 }}>
                    <button type="button" onClick={()=>setShowAllSeasons(true)} style={{ ...styles.iconBtn, padding:'0 12px', height:36 }}>Mostra altre stagioni</button>
                  </div>
                )}
              </div>
            </section>

            {/* PROFILO */}
            <section id="sec-profilo" aria-label="Profilo" style={styles.section}>
              <div style={styles.sectionTitleRow}><User size={18}/><h2 style={styles.h2}>Profilo</h2></div>
              <div className="profile-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:12 }}>
                <div><div style={styles.small}>Data di nascita</div><div style={{ fontWeight:700 }}>{athlete?.date_of_birth ? formatDate(athlete.date_of_birth) : '—'}{typeof age==='number' ? ` · ${age} anni` : ''}</div></div>
                <div><div style={styles.small}>Nazionalità</div><div style={{ fontWeight:700 }}>{(natFlag ? `${natFlag} ` : '') + (athlete?.nationality || '—')}</div></div>
                <div><div style={styles.small}>Città di nascita</div><div style={{ fontWeight:700 }}>{athlete?.birth_city || '—'}</div></div>
                <div><div style={styles.small}>Residenza</div><div style={{ fontWeight:700 }}>{contacts?.residence_city || '—'}, {contacts?.residence_country || '—'}</div></div>
                <div><div style={styles.small}>Lingua madre</div><div style={{ fontWeight:700 }}>{athlete?.native_language || '—'}</div></div>
                <div><div style={styles.small}>Lingua aggiuntiva</div><div style={{ fontWeight:700 }}>{athlete?.additional_language || '—'}</div></div>
              </div>
            </section>

            {/* PREMI */}
            <section id="sec-premi" aria-label="Premi & Riconoscimenti" style={styles.section}>
              <div style={styles.sectionTitleRow}><AwardIcon size={18}/><h2 style={styles.h2}>Premi & Riconoscimenti</h2></div>
              {!awards.length ? (
                <div style={styles.small}>—</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {awards.map((r)=>(
                    <div key={r.id} style={styles.awardRow}>
                      <div>
                        <div style={{ fontWeight:800 }}>{r.title || '—'}</div>
                        <div style={styles.small}>{r.awarding_entity || '—'} {r.date_awarded ? `• ${formatDate(r.date_awarded)}` : ''} {r.season_start ? `• ${formatYearSeason(r.season_start, r.season_end)}` : ''}</div>
                        {r.description && <div style={{ marginTop:6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{r.description}</div>}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        {r.evidence_external_url && (
                          <a href={r.evidence_external_url} target="_blank" rel="noreferrer" style={{ fontWeight:700, color:'#1976d2', display:'inline-flex', alignItems:'center', gap:6 }}>
                            Apri link <ExternalLink size={16}/>
                          </a>
                        )}
                        {!r.evidence_external_url && r.evidence_signed_url && (
                          <a href={r.evidence_signed_url} target="_blank" rel="noreferrer" style={{ fontWeight:700, color:'#1976d2', display:'inline-flex', alignItems:'center', gap:6 }}>
                            Apri documento <ExternalLink size={16}/>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* COLONNA B (4/12) */}
          <div style={styles.columnB}>
            {/* FISICO (Quick Facts + Misure) */}
            <section id="sec-fisico" aria-label="Fisico" style={styles.section}>
              <div style={styles.sectionTitleRow}><Ruler size={18}/><h2 style={styles.h2}>Fisico</h2></div>

              <div style={styles.facts}>
                <div style={styles.factItem}><Ruler size={16}/><div><div style={styles.small}>Altezza</div><div style={{ fontWeight:800 }}>{physical?.height_cm ? `${physical.height_cm} cm` : '—'}</div></div></div>
                <div style={styles.factItem}><Scale size={16}/><div><div style={styles.small}>Peso</div><div style={{ fontWeight:800 }}>{physical?.weight_kg ? `${physical.weight_kg} kg` : '—'}</div></div></div>
                <div style={styles.factItem}><MoveHorizontal size={16}/><div><div style={styles.small}>Apertura</div><div style={{ fontWeight:800 }}>{physical?.wingspan_cm ? `${physical.wingspan_cm} cm` : '—'}</div></div></div>
                <div style={styles.factItem}><Hand size={16}/><div><div style={styles.small}>Mano dominante</div><div style={{ fontWeight:800 }}>{physical?.dominant_hand || '—'}</div></div></div>
                <div style={styles.factItem}><Footprints size={16}/><div><div style={styles.small}>Piede dominante</div><div style={{ fontWeight:800 }}>{physical?.dominant_foot || '—'}</div></div></div>
                <div style={styles.factItem}><Activity size={16}/><div><div style={styles.small}>Occhio dominante</div><div style={{ fontWeight:800 }}>{physical?.dominant_eye || '—'}</div></div></div>
              </div>

              {/* Misure & Test (espandibile) */}
              {!!physicalPairs.length && (
                <details style={{ marginTop:12 }}>
                  <summary style={{ cursor:'pointer', fontWeight:800 }}>Vedi tutte le misure</summary>
                  <div style={{ marginTop:10 }}>
                    <div style={{ ...styles.small, marginBottom:8 }}>Ultima rilevazione: {formatDate(physical?.physical_measured_at || physical?.performance_measured_at)}</div>
                    <table style={styles.table}>
                      <tbody>
                        {physicalPairs.map(([label, val], i) => (
                          <tr key={i}>
                            <td style={styles.tdLabel}>{label}</td>
                            <td style={styles.tdVal}>{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </section>

            {/* SOCIAL */}
            {!!socialSorted.length && (
              <section id="sec-social" aria-label="Social" style={styles.section}>
                <div style={styles.sectionTitleRow}><Globe size={18}/><h2 style={styles.h2}>Social</h2></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:8 }}>
                  {socialSorted.map((s)=>(
                    <a key={s.id} href={s.profile_url} target="_blank" rel="noreferrer"
                       style={{ border:'1px solid #eee', borderRadius:12, padding:10, display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
                      <PlatformIcon url={s.profile_url}/>
                      <div style={{ fontWeight:800, color:'#111', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {s.platform || 'Profile'}
                      </div>
                      <ExternalLink size={16} style={{ marginLeft:'auto', color:'#1976d2' }}/>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* CONTATTI (preview privata) */}
            <section id="sec-contatti" aria-label="Contatti" style={styles.section}>
              <div style={styles.sectionTitleRow}><Phone size={18}/><h2 style={styles.h2}>Contatti</h2></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:10 }}>
                <div style={styles.row}><Mail size={16}/><strong>{userEmail || '—'}</strong></div>
                <div style={styles.row}><Phone size={16}/><strong>{phone || '—'}</strong></div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ ...styles.pill, background: okPhone ? '#dcfce7' : '#f3f4f6', border:'1px solid #e5e7eb' }}>
                    <CheckCircle size={14}/> Phone {okPhone ? 'verified' : 'not verified'}
                  </span>
                  <span style={{ ...styles.pill, background: okID ? '#dcfce7' : '#f3f4f6', border:'1px solid #e5e7eb' }}>
                    <ShieldCheck size={14}/> ID {okID ? 'verified' : 'not verified'}
                  </span>
                </div>
                {waLink && (
                  <a href={waLink} target="_blank" rel="noreferrer"
                     style={{ fontWeight:700, color:'#1976d2', display:'inline-flex', alignItems:'center', gap:6 }}>
                    Apri chat WhatsApp <ExternalLink size={16}/>
                  </a>
                )}
                <div style={{ ...styles.small, marginTop:6 }}>
                  Residenza: {contacts?.residence_city || '—'}, {contacts?.residence_country || '—'}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* LIGHTBOX semplice */}
      {lightbox.open && (
        <div role="dialog" aria-modal="true" aria-label="Media viewer"
             style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:50, display:'grid', placeItems:'center', padding:16 }}
             onClick={()=>setLightbox({ open:false })}>
          <div style={{ width:'min(96vw,1200px)', maxHeight:'90vh' }} onClick={(e)=>e.stopPropagation()}>
            <div style={{ color:'#fff', fontWeight:800, marginBottom:8 }}>{lightbox.title}</div>
            {lightbox.type === 'image' ? (
              <img alt={lightbox.title} src={lightbox.src} style={{ width:'100%', height:'auto', borderRadius:12, display:'block' }}/>
            ) : (
              <div style={{ position:'relative', width:'100%', paddingTop:'56.25%' }}>
                <iframe
                  title={lightbox.title}
                  src={lightbox.src}
                  style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:0, borderRadius:12 }}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
            <div style={{ marginTop:10, display:'flex', justifyContent:'flex-end' }}>
              <button type="button" onClick={()=>setLightbox({ open:false })} style={{ ...styles.iconBtn, padding:'0 14px', height:40 }}>Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive: stack su <1024px */}
      <style>{`
        @media (max-width: 1023px) {
          .matches-acc {}
          .profile-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 1023px) {
          [style*="grid-template-columns: 2fr 1fr"] { grid-template-columns: 1fr; }
          [style*="position: sticky"] { top: 64px; } /* sticky più vicino su mobile */
          [style*="min-height: 460px"] { min-height: 56vh; }
          h1 { font-size: 26px !important; }
        }
      `}</style>
    </div>
  );
}

// ---- Support: immagine async con signed URL + onClick (lightbox) ----
function AsyncImage({ alt, path, getSigned, style, onClick }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    (async () => {
      if (!path) return;
      const url = isHttpUrl(path) ? path : await getSigned(path);
      setSrc(url || '');
    })();
  }, [path, getSigned]);
  return (
    <img alt={alt} src={src} loading="lazy" decoding="async" style={{ ...style, cursor: 'zoom-in' }} onClick={() => onClick?.(src)} />
  );
}

function PlatformIcon({ url }) {
  const u = String(url||'').toLowerCase();
  if (u.includes('instagram')) return <Instagram size={18}/>;
  if (u.includes('youtube')) return <Youtube size={18}/>;
  if (u.includes('x.com') || u.includes('twitter')) return <XIcon size={18}/>;
  if (u.includes('facebook')) return <Facebook size={18}/>;
  if (u.includes('linkedin')) return <Linkedin size={18}/>;
  return <Globe size={18}/>;
}

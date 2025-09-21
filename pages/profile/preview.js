// pages/profile/preview.js
// Standalone page (read-only) – no sub‑nav, compact hero with avatar,
// sections: Media · Sport (current) · Career · Profile · Physical · Social · Contacts · Awards.
// Supabase import: correct path from /pages/profile/*  -> '../../utils/supabaseClient'  ✅
import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase as sb } from '../../utils/supabaseClient';
import {
  Play, Film, ChevronRight, ChevronDown, ExternalLink,
  Calendar, Award as AwardIcon, Medal, Phone, Mail, Globe, User,
  CheckCircle, ShieldCheck, Ruler, Scale, MoveHorizontal, Hand, Footprints, Activity,
  Image, GalleryVertical, PlayCircle, Clapperboard, Video
} from 'lucide-react';

const supabase = sb;

/* ------------------------------ Constants ------------------------------ */
// Media categories (aligned with your MediaPanel)  ✅
const CAT = {
  FEATURED_HEAD: 'featured_headshot',
  FEATURED_G1:   'featured_game1',
  FEATURED_G2:   'featured_game2',
  GALLERY:       'gallery',
  INTRO:         'intro',
  HIGHLIGHT:     'highlight',
  GAME:          'game',
}; // (same keys used in MediaPanel)  :contentReference[oaicite:3]{index=3}

const BUCKET_MEDIA = 'media';
const BUCKET_DOCS  = 'documents';

// Simple cache for signed URL (no hook -> no #310)
const signedCache = new Map();
async function getSigned(bucket, path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const key = `${bucket}:${path}`;
  const hit = signedCache.get(key);
  const now = Date.now();
  if (hit && hit.exp > now + 2000) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error) return '';
  const url = data?.signedUrl || '';
  signedCache.set(key, { url, exp: now + 55_000 });
  return url;
}

/* ------------------------------ Helpers ------------------------------ */
const SUPABASE_LATERALITY = ['Left', 'Right', 'Ambidextrous', 'Unknown'];

const clamp = (n, a, b) => Math.min(Math.max(Number(n || 0), a), b);
const isHttp = (u='') => /^https?:\/\//i.test(String(u||''));
const fmtDate = (iso) => { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'2-digit'});} catch { return String(iso); } };
const fmtSeason = (start, end) => { const s=String(start||''); const e=String(end||''); return s && e ? `${s}/${(e.length===4?e.slice(2):e)}` : (s || '—'); }; // consistent with SeasonAccordionItem  :contentReference[oaicite:4]{index=4}
const calcAge = (dob) => { if(!dob) return null; const [y,m,d]=String(dob).split('-').map(Number); const b=new Date(y,(m||1)-1,d||1); if(Number.isNaN(b)) return null; const n=new Date(); let a=n.getFullYear()-b.getFullYear(); const mo=n.getMonth()-b.getMonth(); if(mo<0||(mo===0&&n.getDate()<b.getDate())) a--; return a; };
const initials = (name='') => (name.trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('')||'A').toUpperCase();
const flagFromCountry = (name='') => { const s=String(name).trim().toLowerCase(); const map={italy:'IT', italia:'IT', france:'FR', spain:'ES', germany:'DE', usa:'US', uk:'GB', romania:'RO', portugal:'PT', poland:'PL', greece:'GR'}; const code=/^[a-z]{2}$/.test(s)?s.toUpperCase():map[s]||''; if(!code) return ''; const A=0x1F1E6, base='A'.charCodeAt(0); return [...code].map(c=>String.fromCodePoint(A+(c.charCodeAt(0)-base))).join(''); };
const ytId=(url)=>{try{const u=new URL(String(url)); if(u.hostname.includes('youtu.be')) return u.pathname.slice(1); if(u.hostname.includes('youtube.com')){ if(u.pathname==='/watch') return u.searchParams.get('v'); if(u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2]; }}catch{} return null;};
const vmId=(url)=>{const m=String(url||'').match(/vimeo\.com\/(\d+)/i); return m?m[1]:null;};
const embedUrl=(url)=> ytId(url)?`https://www.youtube.com/embed/${ytId(url)}?rel=0` : (vmId(url)?`https://player.vimeo.com/video/${vmId(url)}`:url);
const contractText = (v) => v==='free_agent'?'Free agent': v==='under_contract'?'Under contract': v==='on_loan'?'On loan':'—';
const lateralityLabel = (value) => {
  const normalized = normalizeLateralityValue(value);
  if (!normalized) return '—';
  const labels = {
    Left: 'Left',
    Right: 'Right',
    Ambidextrous: 'Ambidextrous',
    Unknown: 'Unknown',
  };
  return labels[normalized] || normalized;
};

function normalizeLateralityValue(value) {
  const raw = (value ?? '').toString().trim();
  if (raw === '') return '';

  const direct = SUPABASE_LATERALITY.find((opt) => opt.toLowerCase() === raw.toLowerCase());
  if (direct) return direct;

  const lower = raw.toLowerCase();
  if (lower === 'l' || lower.startsWith('left')) return 'Left';
  if (lower === 'r' || lower.startsWith('right')) return 'Right';
  if (
    lower === 'ambi' ||
    lower.startsWith('ambi') ||
    lower === 'both' ||
    lower === 'either'
  ) {
    return 'Ambidextrous';
  }
  if (
    lower === 'unknown' ||
    lower === 'unk' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === 'none' ||
    lower === 'unspecified'
  ) {
    return 'Unknown';
  }

  return '';
}

/* ------------------------------ Page ------------------------------ */
export default function ProfilePreviewPage() {
  const router = useRouter();
  const athleteId = useMemo(() => router.query.id || router.query.athleteId || '', [router.query]);
  return (
    <>
      <Head><title>Profile preview</title></Head>
      <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
        {!athleteId ? (
          <div style={{ maxWidth: 960, margin: '40px auto', padding: '0 16px' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Missing athlete id</h1>
            <p>Open as <code>/profile/preview?id=&lt;athleteId&gt;</code>.</p>
          </div>
        ) : <PreviewCard athleteId={String(athleteId)} /> }
      </div>
    </>
  );
}

/* ------------------------------ Main card ------------------------------ */
function PreviewCard({ athleteId }) {
  const [loading, setLoading] = useState(true);

  const [athlete, setAthlete]   = useState(null);
  const [email, setEmail]       = useState('');
  const [sports, setSports]     = useState(null);   // current record (sports_experiences)
  const [career, setCareer]     = useState([]);     // athlete_career[]
  const [physical, setPhysical] = useState(null);   // physical_data (latest)
  const [contacts, setContacts] = useState(null);   // contacts_verification
  const [social, setSocial]     = useState([]);     // social_profiles[]
  const [awards, setAwards]     = useState([]);     // awards_recognitions[]
  const [media, setMedia]       = useState({ featured:{}, intro:null, highlights:[], gallery:[], games:[] });

  const [lightbox, setLightbox] = useState({ open:false, type:'', src:'', title:'' });

  // Load (client only)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);

        // Athlete + user email
        const { data: a } = await supabase.from('athlete').select('*').eq('id', athleteId).single();
        const { data: { user } } = await supabase.auth.getUser();

        // Current sport
        const { data: sp } = await supabase
          .from('sports_experiences')
          .select('id, sport, role, secondary_role, team, category, playing_style, seeking_team, contract_status, contract_end_date, preferred_regions, trial_window, agent_name, agency_name')
          .eq('athlete_id', athleteId)
          .order('id', { ascending:false })
          .limit(1);

        // Career (desc)  ✅
        const { data: car } = await supabase
          .from('athlete_career')
          .select('*')
          .eq('athlete_id', athleteId)
          .order('season_start', { ascending:false })
          .order('id', { ascending:false });

        // Latest physical data
        const { data: pd } = await supabase
          .from('physical_data').select('*')
          .eq('athlete_id', athleteId)
          .order('id', { ascending:false })
          .limit(1);

        // Contacts/verification
        const { data: cv } = await supabase
          .from('contacts_verification').select('*')
          .eq('athlete_id', athleteId).single();

        // Social
        const { data: so } = await supabase
          .from('social_profiles').select('*')
          .eq('athlete_id', athleteId)
          .order('sort_order', { ascending:true })
          .order('created_at', { ascending:true });

        // Awards (pre-sign document if present)
        const { data: aw } = await supabase
          .from('awards_recognitions').select('*')
          .eq('athlete_id', athleteId)
          .order('season_start', { ascending:false })
          .order('date_awarded', { ascending:false });

        const awSigned = await Promise.all((aw||[]).map(async r => ({
          ...r,
          evidence_signed_url: r.evidence_file_path ? (await getSigned(BUCKET_DOCS, r.evidence_file_path)) : ''
        })));

        // Media (same categories as MediaPanel)  ✅
        const { data: rows } = await supabase.from('media_item').select('*').eq('athlete_id', athleteId);
        const byCat = (c) => (rows||[]).filter(r => (r.category||'')===c);
        const one   = (c) => (rows||[]).find(r => (r.category||'')===c) || null;

        const featured = { head: one(CAT.FEATURED_HEAD), g1: one(CAT.FEATURED_G1), g2: one(CAT.FEATURED_G2) };
        const intro    = one(CAT.INTRO);
        const gallery  = byCat(CAT.GALLERY).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
        const highlights = byCat(CAT.HIGHLIGHT).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
        const gamesRows = byCat(CAT.GAME);

        // Game meta
        let games = [];
        if (gamesRows.length) {
          const ids = gamesRows.map(r => r.id);
          const { data: metas } = await supabase.from('media_game_meta').select('*').in('media_item_id', ids);
          const map = new Map((metas||[]).map(m => [m.media_item_id, m]));
          games = gamesRows.map(r => ({ item:r, meta: map.get(r.id)||{} }))
                           .sort((a,b)=> String(b.meta?.match_date||'').localeCompare(String(a.meta?.match_date||'')));
        }

        if (!alive) return;
        setAthlete(a || null);
        setEmail(user?.email || '');
        setSports((sp && sp[0]) || null);
        setCareer(car || []);
        setPhysical((pd && pd[0]) || null);
        setContacts(cv || null);
        setSocial(so || []);
        setAwards(awSigned || []);
        setMedia({ featured, intro, gallery, highlights, games });
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [athleteId]);

  /* --------------- Derived data --------------- */
  const fullName = `${athlete?.first_name||''} ${athlete?.last_name||''}`.trim() || '—';
  const age = calcAge(athlete?.date_of_birth);
  const natFlag = flagFromCountry(athlete?.nationality) || '';
  const completion = clamp(athlete?.completion_percentage, 0, 100);
  const currentSeason = (career||[]).find(c => c.is_current) || null;

  // Avatar: profile -> featured headshot -> initials
  const [avatarUrl, setAvatarUrl] = useState('');
  useEffect(() => { (async () => {
    const raw = athlete?.profile_picture_url || media.featured?.head?.storage_path || '';
    setAvatarUrl(raw ? (isHttp(raw) ? raw : await getSigned(BUCKET_MEDIA, raw)) : '');
  })(); }, [athlete?.profile_picture_url, media.featured?.head?.storage_path]);

  const socialSorted = useMemo(() => {
    const rows = (social||[]).filter(r => r?.profile_url);
    const rank = (u='') => { const s=String(u).toLowerCase();
      if (s.includes('instagram')) return 1; if (s.includes('youtube')) return 2;
      if (s.includes('x.com')||s.includes('twitter')) return 3; if (s.includes('tiktok')) return 4;
      if (s.includes('facebook')) return 5; if (s.includes('linkedin')) return 6; return 99; };
    return rows.sort((a,b)=>rank(a.profile_url)-rank(b.profile_url));
  }, [social]);

  /* --------------- Inline styles (consistent) --------------- */
  const S = {
    container:{ maxWidth:1280, margin:'0 auto', padding:16 },
    card:{ borderRadius:16, boxShadow:'0 8px 24px rgba(0,0,0,0.08)', background:'#fff', overflow:'hidden' },
    hero:{ display:'grid', gridTemplateColumns:'auto 1fr', gap:16, padding:16, alignItems:'center', borderBottom:'1px solid #eee' },
    avatar:{ width:96, height:96, borderRadius:'50%', objectFit:'cover', display:'block', border:'2px solid #fff', boxShadow:'0 2px 8px rgba(0,0,0,0.12)' },
    avatarFallback:{ width:96, height:96, borderRadius:'50%', display:'grid', placeItems:'center', background:'linear-gradient(135deg,#27E3DA,#F7B84E)', color:'#111', fontSize:28 },
    h1:{ fontSize:22, lineHeight:1.15, fontWeight:900, margin:0 },
    chips:{ display:'flex', gap:8, flexWrap:'wrap' },
    chip:{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:999, border:'1px solid #e5e7eb', background:'#fff', fontSize:12 },
    progressRow:{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:8, alignItems:'center', marginTop:2 },
    progressBar:{ height:8, borderRadius:999, background:'#eee', overflow:'hidden' },
    progressFill:{ height:'100%', background:'linear-gradient(90deg,#27E3DA,#F7B84E)' },
    progressPct:{ fontSize:12, color:'#666' },

    colA:{ display:'flex', flexDirection:'column', gap:24 },
    colB:{ display:'flex', flexDirection:'column', gap:24 },

    section:{ border:'1px solid #eee', borderRadius:16, padding:16, background:'#fff' },
    titleRow:{ display:'flex', alignItems:'center', gap:10, marginBottom:8 },
    h2:{ fontSize:18, lineHeight:1.2, margin:0, fontWeight:900 },
    h3:{ fontSize:14, margin:'10px 0 8px', fontWeight:800 },

    mediaCard:{ border:'1px solid #eee', borderRadius:16, padding:16, background:'#fff', marginTop:12 },

    hlCarousel:{ display:'grid', gridAutoFlow:'column', gridAutoColumns:'minmax(260px,1fr)', gap:12, scrollSnapType:'x mandatory', overflowX:'auto', paddingBottom:6 },
    photoThumb:{ width:'100%', aspectRatio:'3/2', objectFit:'cover', borderRadius:12, display:'block', cursor:'zoom-in' },
    strip:{ display:'grid', gridAutoFlow:'column', gridAutoColumns:'minmax(120px,140px)', gap:8, overflowX:'auto' },


    seasonCard:{ border:'1px solid #eee', borderRadius:12, padding:12, background:'#fff' },
    seasonHeader:{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
    seasonLeft:{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' },
    pill:{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:999, border:'1px solid #e5e7eb', background:'#fff', fontSize:12 },
    pillSport:{ background:'#eef6ff', borderColor:'#dbeafe' },
    pillCurrent:{ background:'#dcfce7', borderColor:'#86efac' },
    seasonBadge:{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 8px', fontSize:12 },
    seasonTeam:{ marginLeft:'auto' },
    seasonRow:{ marginTop:6, color:'#333' },


    row:{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
    badge:{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:999, border:'1px solid #e5e7eb', fontSize:12 },
    small:{ fontSize:12, color:'#666' },
    socialItem:{ border:'1px solid #eee', borderRadius:12, padding:10, display:'flex', alignItems:'center', gap:10, textDecoration:'none', background:'#fff' },

    empty:{ fontSize:12, color:'#666' },

    lightbox:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:50, display:'grid', placeItems:'center', padding:16 },
    lightboxInner:{ width:'min(90vw,400px)', maxHeight:'90vh' },
    btn:{ height:36, padding:'0 14px', borderRadius:8, border:'1px solid #eee', background:'#fff', cursor:'pointer' },
  };

  if (loading) {
    return (
      <div style={S.container}>
        <div style={S.card}>
          <div style={S.hero}>
            <div style={S.avatarFallback}>··</div>
            <div>
              <div style={{ height:18, width:220, background:'#eee', borderRadius:6, marginBottom:6 }}/>
              <div style={{ height:12, width:140, background:'#eee', borderRadius:6 }}/>
            </div>
          </div>
          <div style={{ padding:16 }}>Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.container}>
      <div style={S.card}>

          {/* Compact HERO */}
          <section style={S.hero} aria-label="Profile header">
          {avatarUrl
            ? <img src={avatarUrl} alt={`${fullName} avatar`} style={S.avatar}/>
            : <div style={S.avatarFallback}>{initials(fullName)}</div>
          }
          <div>
            <h1 style={S.h1}>{fullName}</h1>
            <div style={S.chips}>
              {(sports?.role || currentSeason?.role) && <span style={S.chip}><User size={14}/>{sports?.role || currentSeason?.role}</span>}
              {(athlete?.nationality || natFlag) && <span style={S.chip}>{natFlag || '🏳️'} {athlete?.nationality || ''}</span>}
              {typeof age==='number' && <span style={S.chip}><Calendar size={14}/>{age} y/o</span>}
            </div>
            <div style={S.progressRow}>
              <span style={{ fontSize:12, color:'#666' }}>Profile completion</span>
              <div style={S.progressBar}><div style={{ ...S.progressFill, width: `${completion}%` }}/></div>
              <span style={S.progressPct}>{completion}%</span>
            </div>
          </div>
        </section>

        {/* GRID */}
        <div className="mainGrid">
          {/* COL A */}
          <div style={S.colA}>

            {/* MEDIA */}
            <section style={S.section} aria-label="Media">
              <div style={S.titleRow}><Film size={18}/><h2 style={S.h2}>Media</h2></div>

              {/* Photo sections */}

                {/* Featured photos */}
                {[media.featured?.head, media.featured?.g1, media.featured?.g2].filter(Boolean).length ? (
                  <div style={S.mediaCard}>
                    <div style={S.titleRow}><Image size={16}/><h3 style={{ ...S.h3, margin:0 }}>Featured photos</h3></div>
                    <div className="photosGrid threeCol">
                      {[media.featured?.head, media.featured?.g1, media.featured?.g2].filter(Boolean).map((ph,i)=>(
                        <SignedImg key={ph.id} path={ph.storage_path || ph.thumbnail_path} style={S.photoThumb}
                                   alt={`Featured #${i+1}`} bucket={BUCKET_MEDIA}
                                   onClick={(src)=>setLightbox({ open:true, type:'image', src, title: ph.title || `Photo #${i+1}`})}/>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Gallery */}
                {!!(media.gallery||[]).length && (
                  <div style={S.mediaCard}>
                    <div style={S.titleRow}>
                      <GalleryVertical size={16}/>
                      <h3 style={{ ...S.h3, margin: 0 }}>Gallery</h3>
                    </div>
                    <div style={S.strip}>
                      {media.gallery.map((g,i)=>(
                        <SignedImg key={g.id} path={g.storage_path || g.thumbnail_path}
                                   bucket={BUCKET_MEDIA}
                                   style={{ width:'100%', aspectRatio:'1/1', objectFit:'cover', borderRadius:12, display:'block',cursor:'zoom-in' }}
                                   alt={g.title || `Photo ${i+1}`}
                                   onClick={(src)=>setLightbox({ open:true, type:'image', src, title: g.title || `Photo ${i+1}` })}/>
                      ))}
                    </div>
                  </div>
                )}

              {/* Video sections */}

                {/* Intro */}
                {media.intro && (
                  <div style={S.mediaCard}>
                    <div style={S.titleRow}><PlayCircle size={16}/><h3 style={{ ...S.h3, margin:0 }}>Intro</h3></div>
                    <IntroPlayer item={media.intro} />
                  </div>
                )}

                {/* Highlights */}
                {!!(media.highlights||[]).length && (
                  <div style={S.mediaCard}>
                    <div style={S.titleRow}><Clapperboard size={16}/><h3 style={{ ...S.h3, margin:0 }}>Highlights</h3></div>
                    <div style={S.hlCarousel}>
                      {media.highlights.map((it, idx) => (
                        <HLCard key={it.id} it={it} idx={idx} onOpen={(src,title)=>setLightbox({open:true,type:'video',src,title})}/>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full games */}
                {!!(media.games||[]).length && (
                  <div style={S.mediaCard}>
                    <div style={S.titleRow}><Video size={16}/><h3 style={{ ...S.h3, margin:0 }}>Full games</h3></div>
                    <GamesBlock games={media.games}/>
                  </div>
                )}
            </section>

            {/* SPORT (current) */}
            <section style={S.section} aria-label="Sport">
              <div style={S.titleRow}><Medal size={18}/><h2 style={S.h2}>Sport</h2></div>
              <div className="sportGrid twoCol">
                <Info label="Sport" value={sports?.sport || currentSeason?.sport || '—'}/>
                <Info label="Role" value={[sports?.role, sports?.secondary_role].filter(Boolean).join(' / ') || currentSeason?.role || '—'}/>
                <Info label="Team" value={sports?.team || currentSeason?.team_name || '—'}/>
                <Info label="Category" value={sports?.category || currentSeason?.category || '—'}/>
                {sports?.playing_style && <Info label="Playing style" value={sports.playing_style}/>}
                <Info label="Seeking team" value={sports?.seeking_team ? 'Yes' : '—'}/>
                <Info label="Contract" value={contractText(sports?.contract_status)}/>
                {sports?.contract_end_date && <Info label="Contract end" value={fmtDate(sports.contract_end_date)}/>}
                {(sports?.agent_name || sports?.agency_name) && <Info label="Agent / Agency" value={`${sports?.agent_name||'—'} · ${sports?.agency_name||'—'}`}/>}
                {!!(sports?.preferred_regions||[]).length && <Info label="Preferred regions" value={sports.preferred_regions.join(', ')}/>}
                {sports?.trial_window && <Info label="Trial window" value={String(sports.trial_window)}/>}
              </div>
            </section>

            {/* CAREER */}
            <section style={S.section} aria-label="Career">
              <div style={S.titleRow}><Calendar size={18}/><h2 style={S.h2}>Career</h2></div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(career||[]).map(row => (
                  <div key={row.id} style={S.seasonCard}>
                    <div style={S.seasonHeader}>
                      <div style={S.seasonLeft}>
                        <span style={S.seasonBadge}>{fmtSeason(row.season_start,row.season_end)}</span>
                        {row.sport && <span style={{ ...S.pill, ...S.pillSport }}>{row.sport}</span>}
                        {row.is_current && <span style={{ ...S.pill, ...S.pillCurrent }}>Current</span>}
                      </div>
                      <div style={S.seasonTeam}>{row.team_name || '—'}</div>
                    </div>
                    <div style={S.seasonRow}>{row.role || '—'} · {row.category || '—'} {row.league ? `· ${row.league}` : ''}</div>
                  </div>
                ))}
                {!(career||[]).length && <div style={S.empty}>—</div>}
              </div>
            </section>

            {/* PROFILE */}
            <section style={S.section} aria-label="Profile">
              <div style={S.titleRow}><User size={18}/><h2 style={S.h2}>Profile</h2></div>
              <div className="profileGrid twoCol">
                <Info label="Date of birth" value={`${athlete?.date_of_birth ? fmtDate(athlete.date_of_birth) : '—'}${typeof age==='number' ? ` · ${age} y/o` : ''}`}/>
                <Info label="Nationality" value={`${natFlag ? natFlag+' ' : ''}${athlete?.nationality || '—'}`}/>
                <Info label="Birth city" value={athlete?.birth_city || '—'}/>
                <Info label="Residence" value={`${contacts?.residence_city || '—'}, ${contacts?.residence_country || '—'}`}/>
                <Info label="Native language" value={athlete?.native_language || '—'}/>
                <Info label="Additional language" value={athlete?.additional_language || '—'}/>
              </div>
            </section>

            {/* AWARDS */}
            <section style={S.section} aria-label="Awards">
              <div style={S.titleRow}><AwardIcon size={18}/><h2 style={S.h2}>Awards</h2></div>
              {!(awards||[]).length ? <div style={S.empty}>—</div> : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {awards.map(r => <AwardCard key={r.id} r={r} />)}
                </div>
              )}
            </section>
          </div>

          {/* COL B */}
          <div style={S.colB}>

              {/* PHYSICAL */}
              <section style={S.section} aria-label="Physical data">
                <div style={S.titleRow}><Ruler size={18}/><h2 style={S.h2}>Physical data</h2></div>
              <div className="facts twoCol">
                <Fact label="Height" value={physical?.height_cm ? `${physical.height_cm} cm` : '—'} icon={<Ruler size={16}/>}/>
                <Fact label="Weight" value={physical?.weight_kg ? `${physical.weight_kg} kg` : '—'} icon={<Scale size={16}/>}/>
                <Fact label="Wingspan" value={physical?.wingspan_cm ? `${physical.wingspan_cm} cm` : '—'} icon={<MoveHorizontal size={16}/>}/>
                <Fact label="Dominant hand" value={lateralityLabel(physical?.dominant_hand)} icon={<Hand size={16}/>}/>
                <Fact label="Dominant foot" value={lateralityLabel(physical?.dominant_foot)} icon={<Footprints size={16}/>}/>
                <Fact label="Dominant eye"  value={lateralityLabel(physical?.dominant_eye)} icon={<Activity size={16}/>}/>
              </div>
              {renderMeasures(physical)}
            </section>

            {/* SOCIAL */}
            {!!socialSorted.length && (
              <section style={S.section} aria-label="Social">
                <div style={S.titleRow}><Globe size={18}/><h2 style={S.h2}>Social</h2></div>
                <div style={{ display:'grid', gap:8 }}>
                  {socialSorted.map(s => (
                    <a key={s.id} href={s.profile_url} target="_blank" rel="noreferrer" style={S.socialItem}>
                      <span style={{ color:'#111', overflow:'hidden', textOverflow:'ellipsis' }}>{s.platform || 'Profile'}</span>
                      <ExternalLink size={16} style={{ marginLeft:'auto', color:'#1976d2' }}/>
                    </a>
                  ))}
                </div>
              </section>
            )}

              {/* CONTACTS */}
              <section style={S.section} aria-label="Contacts">
              <div style={S.titleRow}><Phone size={18}/><h2 style={S.h2}>Contacts</h2></div>
              <div style={{ display:'grid', gap:10 }}>
              <div style={S.row}><Mail size={16}/>{email || '—'}</div>
              <div style={S.row}><Phone size={16}/>{athlete?.phone || contacts?.phone_number || '—'}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ ...S.badge, background: contacts?.phone_verified ? '#dcfce7' : '#f3f4f6' }}><CheckCircle size={14}/> Phone {contacts?.phone_verified ? 'verified' : 'not verified'}</span>
                  <span style={{ ...S.badge, background: contacts?.id_verified ? '#dcfce7' : '#f3f4f6' }}><ShieldCheck size={14}/> ID {contacts?.id_verified ? 'verified' : 'not verified'}</span>
                </div>
                <div style={S.small}>Residence: {contacts?.residence_city || '—'}, {contacts?.residence_country || '—'}</div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightbox.open && (
        <div role="dialog" aria-modal="true" aria-label="Media viewer" style={S.lightbox} onClick={()=>setLightbox({open:false})}>
          <div style={S.lightboxInner} onClick={(e)=>e.stopPropagation()}>
            <div style={{ color:'#fff', marginBottom:8 }}>{lightbox.title}</div>
            {lightbox.type === 'image' ? (
              <img alt={lightbox.title} src={lightbox.src} style={{ width:'100%', height:'auto', borderRadius:12, display:'block' }}/>
            ) : (
              <div style={{ position:'relative', width:'100%', paddingTop:'56.25%' }}>
                <iframe title={lightbox.title} src={lightbox.src} style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:0, borderRadius:12 }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
              </div>
            )}
            <div style={{ marginTop:10, display:'flex', justifyContent:'flex-end' }}>
                <button type="button" onClick={()=>setLightbox({ open:false })} style={S.btn}>Close</button>
            </div>
          </div>
        </div>
      )}

        {/* Minimal responsiveness */}
      <style jsx>{`
        .mainGrid {
          display: grid;
          gap: 24px;
          padding: 16px;
          grid-template-columns: 2fr 1fr;
        }
        .twoCol {
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr 1fr;
        }
        .threeCol {
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr 1fr 1fr;
        }
        .photosGrid img { width: 100%; }
        @media (max-width: 768px) {
          .mainGrid,
          .twoCol,
          .threeCol {
            grid-template-columns: 1fr;
          }
          .photosGrid {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 480px) {
          .photosGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------ Subcomponents ------------------------------ */
function Info({ label, value }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:8 }}>
      <div style={{ fontSize:12, color:'#666' }}>{label}</div>
      <div>{value || '—'}</div>
    </div>
  );
}
function Fact({ label, value, icon }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:10, borderRadius:12, background:'#fafafa', border:'1px solid #eee' }}>
      {icon}<div><div style={{ fontSize:12, color:'#666' }}>{label}</div><div>{value}</div></div>
    </div>
  );
}
function SignedImg({ path, bucket, alt, style, onClick }) {
  const [src, setSrc] = useState('');
  useEffect(() => { (async () => setSrc(path ? await getSigned(bucket, path) : '') )(); }, [path, bucket]);
  return <img alt={alt} src={src} loading="lazy" decoding="async" style={style} onClick={()=>onClick?.(src)} />;
}
function IntroPlayer({ item }) {
  const [src, setSrc] = useState(''); const [poster, setPoster] = useState('');
  useEffect(()=>{ (async()=> {
    setPoster(item?.thumbnail_path ? await getSigned(BUCKET_MEDIA, item.thumbnail_path) : '');
    setSrc(item?.storage_path ? await getSigned(BUCKET_MEDIA, item.storage_path) : '');
  })(); }, [item?.storage_path, item?.thumbnail_path]);
  if (!item) return null;
  if (item.external_url) {
    return (
        <div style={{ maxWidth: 360, margin:'0 auto' }}>
        <div style={{ position:'relative', width:'100%', paddingTop:'56.25%', borderRadius:12, overflow:'hidden', background:'#000', marginBottom: 10 }}>
          <iframe title={item.title||'Intro'} src={embedUrl(item.external_url)} style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:0 }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
        </div>
      </div>
    );
  }
  return (
      <div style={{ maxWidth: 360, margin:'0 auto' }}>
        <video controls preload="metadata" poster={poster||undefined} style={{ width:'100%', borderRadius:12, display:'block', background:'#000', marginBottom: 10 }} src={src||''}/>
      </div>
  );
}
function HLCard({ it, idx, onOpen }) {
  const [poster, setPoster] = useState(''); const [src, setSrc] = useState('');
  useEffect(()=>{ (async()=> {
    const thumb = it?.thumbnail_path ? await getSigned(BUCKET_MEDIA, it.thumbnail_path) : (ytId(it.external_url) ? `https://img.youtube.com/vi/${ytId(it.external_url)}/hqdefault.jpg` : '');
    setPoster(thumb||''); setSrc(it?.storage_path ? await getSigned(BUCKET_MEDIA, it.storage_path) : '');
  })(); }, [it?.thumbnail_path, it?.storage_path, it?.external_url]);
  const title = it.title || `Highlight #${idx+1}`;
  const open = () => onOpen(it.external_url ? embedUrl(it.external_url) : src, title);
  return (
    <div style={{ border:'1px solid #eee', borderRadius:14, overflow:'hidden', background:'#fafafa', scrollSnapAlign:'start' }}>
      {poster ? <img alt={title} src={poster} style={{ width:'100%', aspectRatio:'16/9', objectFit:'cover', display:'block' }}/> : <div style={{ width:'100%', aspectRatio:'16/9', display:'grid', placeItems:'center', background:'#111', color:'#eee' }}><Film size={18}/> No poster</div>}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:10 }}>
        <div style={{ fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:220 }}>{title}</div>
        <button type="button" onClick={open} style={{ height:32, padding:'0 12px', borderRadius:8, border:'none', background:'linear-gradient(90deg,#27E3DA,#F7B84E)', color:'#fff', cursor:'pointer' }}>
          <Play size={16}/>
        </button>
      </div>
    </div>
  );
}
function GamesBlock({ games }) {
  const bySeason = (games||[]).reduce((acc,g)=>{ const k=g.meta?.season||'—'; (acc[k]=acc[k]||[]).push(g); return acc; },{});
  const [open, setOpen] = useState(()=> new Set(Object.keys(bySeason).slice(0,1)));
  const toggle = (s) => setOpen(prev => { const n=new Set(prev); n.has(s)?n.delete(s):n.add(s); return n; });
  const Item = ({ item, meta }) => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, padding:'6px 0', borderBottom:'1px dashed #eee' }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <span>{fmtDate(meta?.match_date)} · vs {meta?.opponent || '—'} · {meta?.competition || '—'}</span>
      </div>
      <div>
        {item.external_url ? (
            <a href={item.external_url} target="_blank" rel="noreferrer" style={{ color:'#1976d2', display:'inline-flex', alignItems:'center', gap:6 }}>
              Watch <ExternalLink size={16}/>
            </a>
        ) : <span style={{ color:'#666' }}>—</span>}
      </div>
    </div>
  );
  return (
    <div>
      {Object.keys(bySeason).map(season => {
        const opened = open.has(season);
        return (
          <div key={season} style={{ border:'1px solid #eee', borderRadius:12, marginBottom:8, background:'#fff' }}>
            <button type="button" onClick={()=>toggle(season)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer' }} aria-expanded={opened}>
              <span style={{ display:'flex', alignItems:'center', gap:8 }}><Calendar size={16}/> {season}</span>
              {opened ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
            </button>
            {opened && <div style={{ padding:12, borderTop:'1px solid #eee' }}>{bySeason[season].map(({item,meta}) => <Item key={item.id} item={item} meta={meta}/>)}</div>}
          </div>
        );
      })}
    </div>
  );
}
function AwardCard({ r }) {
  const sub  = [r.awarding_entity||'—', r.season_start ? fmtSeason(r.season_start,r.season_end) : '', r.date_awarded ? fmtDate(r.date_awarded) : ''].filter(Boolean).join(' • ');
  return (
    <div style={{ border:'1px solid #eee', borderRadius:12, background:'#fff', padding:12, display:'grid', gridTemplateColumns:'1fr auto', gap:8, boxShadow:'0 1px 0 rgba(0,0,0,0.02)' }}>
      <div>
        <div>{r.title || '—'}</div>
        <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{sub}</div>
        {r.description && <div style={{ marginTop:6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{r.description}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {r.evidence_external_url && (
            <a href={r.evidence_external_url} target="_blank" rel="noreferrer" style={{ color:'#1976d2', display:'inline-flex', alignItems:'center', gap:6 }}>
              Open link <ExternalLink size={16}/>
            </a>
        )}
        {!r.evidence_external_url && r.evidence_signed_url && (
            <a href={r.evidence_signed_url} target="_blank" rel="noreferrer" style={{ color:'#1976d2', display:'inline-flex', alignItems:'center', gap:6 }}>
              Open document <ExternalLink size={16}/>
            </a>
        )}
      </div>
    </div>
  );
}
function renderMeasures(p){
  if(!p) return null;
  const rows = [];
  const add=(l,v,u='')=>{ if(v!==''&&v!=null) rows.push([l,`${v}${u}`]); };
  add('Wingspan',p.wingspan_cm,' cm'); add('Standing reach',p.standing_reach_cm,' cm'); add('Body fat',p.body_fat_percent,' %');
  add('Sprint 10m',p.sprint_10m_s,' s'); add('Sprint 20m',p.sprint_20m_s,' s'); add('Pro agility 5-10-5',p.pro_agility_5_10_5_s,' s');
  add('Vertical jump (CMJ)',p.vertical_jump_cmj_cm,' cm'); add('Standing long jump',p.standing_long_jump_cm,' cm');
  add('Grip L',p.grip_strength_left_kg,' kg'); add('Grip R',p.grip_strength_right_kg,' kg');
  add('Sit & reach',p.sit_and_reach_cm,' cm'); add('Plank hold',p.plank_hold_s,' s'); add('Cooper 12-min',p.cooper_12min_m,' m');
  if(!rows.length) return null;
  return (
    <details style={{ marginTop:12 }}>
        <summary style={{ cursor:'pointer' }}>View all measurements</summary>
      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>Last measurement: {fmtDate(p?.physical_measured_at || p?.performance_measured_at)}</div>
        <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:'0 8px' }}>
          <tbody>{rows.map(([l,v],i)=>(
            <tr key={i}>
              <td style={{ width:'50%', padding:'10px 12px', background:'#fafafa', borderTopLeftRadius:10, borderBottomLeftRadius:10 }}>{l}</td>
              <td style={{ width:'50%', padding:'10px 12px', background:'#fff', borderTopRightRadius:10, borderBottomRightRadius:10, border:'1px solid #eee', borderLeft:'none' }}>{v}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}

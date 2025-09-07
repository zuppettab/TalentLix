// components/AthleteShowcaseCard.jsx
// Preview PROFILO in sola lettura – senza sub‑nav, Hero compatto con avatar reale,
// sezioni: Media · Sport (attuale) · Carriera · Profilo · Fisico · Social · Contatti · Premi.
// Coerente con schema/tabelle e categorie Media già in uso nel progetto.
//
// Dipendenze: react, lucide-react, supabase client centralizzato.
// Supabase client: utils/supabaseClient.js  
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase as sb } from '../utils/supabaseClient';
import {
  Play, Film, Image as ImageIcon, ChevronRight, ChevronDown, ExternalLink,
  Calendar, Award as AwardIcon, Medal, Phone, Mail, Globe, MapPin, User, Flag,
  CheckCircle, ShieldCheck, Ruler, Scale, MoveHorizontal, Hand, Footprints, Activity
} from 'lucide-react';

const supabase = sb;

// ---------- CATEGORIE MEDIA (allineate a MediaPanel) ----------
const CAT = {
  FEATURED_HEAD: 'featured_headshot',
  FEATURED_G1:   'featured_game1',
  FEATURED_G2:   'featured_game2',
  GALLERY:       'gallery',
  INTRO:         'intro',
  HIGHLIGHT:     'highlight',
  GAME:          'game',
}; // :contentReference[oaicite:9]{index=9}

const BUCKET_MEDIA = 'media';
const BUCKET_DOCS  = 'documents';

// ---------- Utilità ----------
const isHttp = (u='') => /^https?:\/\//i.test(String(u));
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }); }
  catch { return String(iso); }
};
const fmtSeason = (start, end) => { // coerente con SeasonAccordionItem  
  const s = start ? String(start) : '';
  const e = end ? String(end) : '';
  if (s && e) return `${s}/${(String(e).length === 4 ? String(e).slice(2) : e)}`;
  return s || '—';
};
const calcAge = (dob) => {
  if (!dob) return null;
  const [y,m,d] = String(dob).split('-').map(Number);
  const birth = new Date(y, (m||1)-1, d||1);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear()-birth.getFullYear();
  const mo = now.getMonth()-birth.getMonth();
  if (mo<0 || (mo===0 && now.getDate()<birth.getDate())) age--;
  return age;
};
const initiali = (name='') => (name.trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('') || 'A').toUpperCase();

// flag (best-effort) da nationality (nome o ISO‑2)
const flagFromCountry = (name='') => {
  const s = String(name).trim();
  if (!s) return '';
  const iso2 = /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : '';
  const map = { italy:'IT', italia:'IT', italian:'IT', france:'FR', francia:'FR', spain:'ES', spagna:'ES', germany:'DE', germania:'DE', usa:'US', 'united states':'US', uk:'GB', 'united kingdom':'GB', romania:'RO', portugal:'PT', poland:'PL', greece:'GR' };
  const code = iso2 || map[s.toLowerCase()] || '';
  if (!code) return '';
  const A = 0x1F1E6; const base='A'.charCodeAt(0);
  return [...code].map(c => String.fromCodePoint(A + (c.charCodeAt(0)-base))).join('');
};

// Signed URL cache (per bucket specifico)
function useSignedUrlCache(bucket) {
  const ref = useRef(new Map());
  return async (path) => {
    if (!path) return '';
    const key = `${bucket}:${path}`;
    const hit = ref.current.get(key);
    const now = Date.now();
    if (hit && hit.exp > now + 2000) return hit.url;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error) return '';
    const url = data?.signedUrl || '';
    ref.current.set(key, { url, exp: now + 55_000 });
    return url;
  };
}
// Prova su più bucket (per avatar salvati altrove)
function useAnySignedUrl() {
  const media = useSignedUrlCache(BUCKET_MEDIA);
  const avatars = useSignedUrlCache('avatars');
  return async (path) => {
    if (!path) return '';
    const m = await media(path);
    if (m) return m;
    return await avatars(path); // tenta avatars se non è in media
  };
}

// Poster da provider
const ytId = (url) => { try {
  const u = new URL(String(url)); if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
  if (u.hostname.includes('youtube.com')) { if (u.pathname.startsWith('/watch')) return u.searchParams.get('v'); if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2]; }
} catch {} return null; };
const vmId = (url) => { const m = String(url||'').match(/vimeo\.com\/(\d+)/i); return m?m[1]:null; };
const embedUrl = (url) => ytId(url) ? `https://www.youtube.com/embed/${ytId(url)}?rel=0` : (vmId(url) ? `https://player.vimeo.com/video/${vmId(url)}` : url);

// ---------- Componente ----------
export default function AthleteShowcaseCard({ athleteId, athlete: athleteProp }) {
  const getSignedMedia = useSignedUrlCache(BUCKET_MEDIA);
  const getSignedDoc   = useSignedUrlCache(BUCKET_DOCS);
  const getAnySigned   = useAnySignedUrl();

  // Stato dati
  const [loading, setLoading] = useState(true);
  const [athlete, setAthlete] = useState(athleteProp || null);
  const [email, setEmail]     = useState('');
  const [sports, setSports]   = useState(null);   // sports_experiences (attuale)
  const [career, setCareer]   = useState([]);     // athlete_career[]
  const [physical, setPhysical] = useState(null); // physical_data (ultima)
  const [contacts, setContacts] = useState(null); // contacts_verification
  const [social, setSocial]     = useState([]);   // social_profiles[]
  const [awards, setAwards]     = useState([]);   // awards_recognitions[]
  const [media, setMedia]       = useState({ featured:{}, intro:null, highlights:[], gallery:[], games:[] });

  // Lightbox
  const [lightbox, setLightbox] = useState({ open:false, type:'', src:'', title:'' });

  // Load
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);

        // Athlete (se non passato)
        let a = athleteProp || null;
        if (!a) {
          const { data } = await supabase.from('athlete').select('*').eq('id', athleteId).single();
          a = data || null;
        }

        const { data: { user } } = await supabase.auth.getUser();
        const userEmail = user?.email || '';

        // Sports attuale
        const { data: sp } = await supabase
          .from('sports_experiences')
          .select(`
            id, sport, role, secondary_role, team, category, playing_style, seeking_team,
            contract_status, contract_end_date, preferred_regions, trial_window, agent_name, agency_name, is_represented
          `)
          .eq('athlete_id', a.id)
          .order('id', { ascending:false })
          .limit(1);

        // Carriera
        const { data: car } = await supabase
          .from('athlete_career')
          .select('*')
          .eq('athlete_id', a.id)
          .order('season_start', { ascending:false })
          .order('id', { ascending:false });

        // Physical (ultima)
        const { data: pd } = await supabase
          .from('physical_data')
          .select('*')
          .eq('athlete_id', a.id)
          .order('id', { ascending:false })
          .limit(1);

        // Contacts / Verification
        const { data: cv } = await supabase
          .from('contacts_verification')
          .select('*')
          .eq('athlete_id', a.id)
          .single();

        // Social
        const { data: so } = await supabase
          .from('social_profiles')
          .select('*')
          .eq('athlete_id', a.id)
          .order('sort_order', { ascending:true })
          .order('created_at', { ascending:true });

        // Awards
        const { data: aw } = await supabase
          .from('awards_recognitions')
          .select('*')
          .eq('athlete_id', a.id)
          .order('season_start', { ascending:false })
          .order('date_awarded', { ascending:false });

        // Media
        const { data: rows } = await supabase
          .from('media_item')
          .select('*')
          .eq('athlete_id', a.id);

        const byCat = (c) => (rows||[]).filter(r => (r.category||'')===c);
        const one   = (c) => (rows||[]).find(r => (r.category||'')===c) || null;
        const featured = { head: one(CAT.FEATURED_HEAD), g1: one(CAT.FEATURED_G1), g2: one(CAT.FEATURED_G2) };
        const intro    = one(CAT.INTRO);
        const gallery  = byCat(CAT.GALLERY).sort((a,b)=> (Number(a.sort_order||0)-Number(b.sort_order||0)));
        const highlights = byCat(CAT.HIGHLIGHT).sort((a,b)=> (Number(a.sort_order||0)-Number(b.sort_order||0)));
        const gamesRows = byCat(CAT.GAME);

        let games = [];
        if (gamesRows.length) {
          const ids = gamesRows.map(r => r.id);
          const { data: metas } = await supabase
            .from('media_game_meta')
            .select('*')
            .in('media_item_id', ids);
          const metaBy = new Map((metas||[]).map(m => [m.media_item_id, m]));
          games = gamesRows.map(r => ({ item:r, meta: metaBy.get(r.id)||{} }))
                           .sort((a,b)=> String(b.meta?.match_date||'').localeCompare(String(a.meta?.match_date||'')));
        }

        // Awards: pre‑firma eventuale documento
        const awSigned = await Promise.all((aw||[]).map(async r => {
          let signed = '';
          if (r.evidence_file_path) { try { signed = await getSignedDoc(r.evidence_file_path); } catch {} }
          return { ...r, evidence_signed_url: signed };
        }));

        if (!mounted) return;
        setAthlete(a);
        setEmail(userEmail);
        setSports((sp && sp[0]) || null);
        setCareer(car || []);
        setPhysical((pd && pd[0]) || null);
        setContacts(cv || null);
        setSocial(so || []);
        setAwards(awSigned || []);
        setMedia({ featured, intro, gallery, highlights, games });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [athleteId, athleteProp]);

  // Ordinamento social (IG, YouTube, X, poi resto)
  const socialSorted = useMemo(() => {
    const rows = (social||[]).filter(r => r?.profile_url);
    const rank = (u='') => {
      const s = String(u).toLowerCase();
      if (s.includes('instagram')) return 1;
      if (s.includes('youtube'))   return 2;
      if (s.includes('x.com') || s.includes('twitter')) return 3;
      if (s.includes('tiktok'))    return 4;
      if (s.includes('facebook'))  return 5;
      if (s.includes('linkedin'))  return 6;
      return 99;
    };
    return [...rows].sort((a,b)=> rank(a.profile_url)-rank(b.profile_url));
  }, [social]);

  // ====== RENDER ======
  const fullName = `${athlete?.first_name||''} ${athlete?.last_name||''}`.trim() || '—';
  const age = calcAge(athlete?.date_of_birth);
  const natFlag = flagFromCountry(athlete?.nationality) || '';
  const completion = clamp(Number(athlete?.completion_percentage||0), 0, 100);

  // Avatar: profile_picture_url → se path storage, firma; fallback featured.head → initials
  const [avatarUrl, setAvatarUrl] = useState('');
  useEffect(() => { (async () => {
    const raw = athlete?.profile_picture_url || media.featured?.head?.storage_path || '';
    if (!raw) { setAvatarUrl(''); return; }
    setAvatarUrl(isHttp(raw) ? raw : (await getAnySigned(raw)));
  })(); }, [athlete?.profile_picture_url, media.featured?.head?.storage_path]);

  // Featured posters (gallery small)
  const featuredPhotos = [media.featured?.head, media.featured?.g1, media.featured?.g2].filter(Boolean);

  // Stili (coerenti con look & feel)
  const styles = getStyles();

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          {/* Skeleton hero compatto */}
          <div style={styles.heroCompact}>
            <div style={styles.heroLeft}>
              <div style={styles.skelCircle}/>
              <div style={{ flex:1 }}/>
            </div>
            <div style={styles.heroRight}>
              <div style={styles.skelLine}/>
              <div style={{ ...styles.skelLine, width:'50%' }}/>
              <div style={{ ...styles.skelBar, width:'70%' }}/>
            </div>
          </div>
          {/* Skeleton due colonne */}
          <div style={styles.grid}>
            <div style={styles.colA}>
              <div style={{ ...styles.section, height: 220 }} className="sk"/>
              <div style={{ ...styles.section, height: 220 }} className="sk"/>
              <div style={{ ...styles.section, height: 220 }} className="sk"/>
            </div>
            <div style={styles.colB}>
              <div style={{ ...styles.section, height: 160 }} className="sk"/>
              <div style={{ ...styles.section, height: 160 }} className="sk"/>
              <div style={{ ...styles.section, height: 160 }} className="sk"/>
            </div>
          </div>
          <style>{`.sk{background:linear-gradient(90deg,#eee,#f5f5f5,#eee);animation:sh 1.2s infinite;background-size:200% 100%}@keyframes sh{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* HERO compatto */}
        <section aria-label="Header profilo" style={styles.heroCompact}>
          <div style={styles.heroLeft}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${fullName} avatar`} style={styles.avatar}/>
            ) : (
              <div style={styles.avatarFallback}>{initiali(fullName)}</div>
            )}
          </div>
          <div style={styles.heroRight}>
            <h1 style={styles.h1}>{fullName}</h1>
            <div style={styles.chips}>
              {(sports?.role || career.find(c=>c.is_current)?.role) && (
                <span style={styles.chip}><User size={14}/>{sports?.role || career.find(c=>c.is_current)?.role}</span>
              )}
              {(athlete?.nationality || natFlag) && (
                <span style={styles.chip}>{natFlag || '🏳️'} {athlete?.nationality || ''}</span>
              )}
              {typeof age==='number' && (<span style={styles.chip}><Calendar size={14}/>{age} y/o</span>)}
            </div>
            <div style={styles.progressRow}>
              <span style={styles.progressLabel}>Profile completion</span>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width:`${completion}%` }}/>
              </div>
              <span style={styles.progressPct}>{completion}%</span>
            </div>
          </div>
        </section>

        {/* GRID principale */}
        <div style={styles.grid}>

          {/* COLONNA A */}
          <div style={styles.colA}>

            {/* MEDIA */}
            <section aria-label="Media" style={styles.section}>
              <div style={styles.titleRow}><Film size={18}/><h2 style={styles.h2}>Media</h2></div>

              {/* Intro */}
              {media.intro && (
                <div style={{ marginBottom: 16 }}>
                  <IntroPlayer item={media.intro} getSigned={getSignedMedia}/>
                </div>
              )}

              {/* Highlights */}
              {!!(media.highlights||[]).length && (
                <>
                  <h3 style={styles.h3}>Highlights</h3>
                  <div style={styles.hlCarousel}>
                    {media.highlights.map((it, idx) => (
                      <HLCard key={it.id} it={it} idx={idx} getSigned={getSignedMedia} onOpen={(src,title)=>setLightbox({open:true,type:'video',src,title})}/>
                    ))}
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

              {/* Gallery (strip) */}
              {!!(media.gallery||[]).length && (
                <>
                  <h3 style={styles.h3}>Gallery</h3>
                  <div style={styles.strip}>
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

              {/* Full Games */}
              {!!(media.games||[]).length && (
                <>
                  <h3 style={styles.h3}>Full games</h3>
                  <GamesBlock games={media.games}/>
                </>
              )}
            </section>

            {/* SPORT (info attuali) */}
            <section aria-label="Info sportive attuali" style={styles.section}>
              <div style={styles.titleRow}><Medal size={18}/><h2 style={styles.h2}>Sport</h2></div>
              <div style={styles.sportGrid}>
                <InfoPair label="Sport" value={sports?.sport || career.find(c=>c.is_current)?.sport || '—'}/>
                <InfoPair label="Role"  value={[sports?.role, sports?.secondary_role].filter(Boolean).join(' / ') || career.find(c=>c.is_current)?.role || '—'}/>
                <InfoPair label="Team"  value={sports?.team || career.find(c=>c.is_current)?.team_name || '—'}/>
                <InfoPair label="Category" value={sports?.category || career.find(c=>c.is_current)?.category || '—'}/>
                {sports?.playing_style && <InfoPair label="Playing style" value={sports.playing_style}/>}
                <InfoPair label="Seeking team" value={sports?.seeking_team ? 'Yes' : '—'}/>
                <InfoPair label="Contract" value={sports?.contract_status ? niceContract(sports.contract_status) : '—'}/>
                {sports?.contract_end_date && <InfoPair label="Contract end" value={fmtDate(sports.contract_end_date)}/>}
                {(sports?.agent_name || sports?.agency_name) && <InfoPair label="Agent / Agency" value={`${sports?.agent_name||'—'} · ${sports?.agency_name||'—'}`}/>}
                {!!(sports?.preferred_regions||[]).length && <InfoPair label="Preferred regions" value={sports.preferred_regions.join(', ')}/>}
                {sports?.trial_window && <InfoPair label="Trial window" value={String(sports.trial_window)}/>}
              </div>
            </section>

            {/* CARRIERA */}
            <section aria-label="Carriera" style={styles.section}>
              <div style={styles.titleRow}><Calendar size={18}/><h2 style={styles.h2}>Carriera</h2></div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(career||[]).map(row => (
                  <div key={row.id} style={styles.seasonCard}>
                    <div style={styles.seasonHeader}>
                      <div style={styles.seasonLeft}>
                        <span style={styles.seasonBadge}>{fmtSeason(row.season_start, row.season_end)}</span>
                        {row.sport && <span style={{ ...styles.pill, ...styles.pillSport }}>{row.sport}</span>}
                        {row.is_current && <span style={{ ...styles.pill, ...styles.pillCurrent }}>Current</span>}
                      </div>
                      <div style={styles.seasonTeam}>{row.team_name || '—'}</div>
                    </div>
                    <div style={styles.seasonRow}>{row.role || '—'} · {row.category || '—'} {row.league ? `· ${row.league}` : ''}</div>
                  </div>
                ))}
                {!(career||[]).length && <div style={styles.emptyText}>—</div>}
              </div>
            </section>

            {/* PROFILO */}
            <section aria-label="Profilo" style={styles.section}>
              <div style={styles.titleRow}><User size={18}/><h2 style={styles.h2}>Profilo</h2></div>
              <div style={styles.profileGrid}>
                <InfoPair label="Date of birth" value={`${athlete?.date_of_birth ? fmtDate(athlete.date_of_birth) : '—'}${typeof age==='number' ? ` · ${age} y/o` : ''}`}/>
                <InfoPair label="Nationality" value={`${natFlag ? natFlag+' ' : ''}${athlete?.nationality || '—'}`}/>
                <InfoPair label="Birth city" value={athlete?.birth_city || '—'}/>
                <InfoPair label="Residence" value={`${contacts?.residence_city || '—'}, ${contacts?.residence_country || '—'}`}/>
                <InfoPair label="Native language" value={athlete?.native_language || '—'}/>
                <InfoPair label="Additional language" value={athlete?.additional_language || '—'}/>
              </div>
            </section>

            {/* PREMI */}
            <section aria-label="Premi & Riconoscimenti" style={styles.section}>
              <div style={styles.titleRow}><AwardIcon size={18}/><h2 style={styles.h2}>Awards</h2></div>
              {!(awards||[]).length ? (
                <div style={styles.emptyText}>—</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {awards.map((r)=>(
                    <AwardCard key={r.id} r={r}/>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* COLONNA B */}
          <div style={styles.colB}>

            {/* FISICO */}
            <section aria-label="Fisico" style={styles.section}>
              <div style={styles.titleRow}><Ruler size={18}/><h2 style={styles.h2}>Physical data</h2></div>
              <div style={styles.facts}>
                <Fact label="Height"  value={physical?.height_cm ? `${physical.height_cm} cm` : '—'} icon={<Ruler size={16}/>}/>
                <Fact label="Weight"  value={physical?.weight_kg ? `${physical.weight_kg} kg` : '—'} icon={<Scale size={16}/>}/>
                <Fact label="Wingspan" value={physical?.wingspan_cm ? `${physical.wingspan_cm} cm` : '—'} icon={<MoveHorizontal size={16}/>}/>
                <Fact label="Dominant hand" value={physical?.dominant_hand || '—'} icon={<Hand size={16}/>}/>
                <Fact label="Dominant foot" value={physical?.dominant_foot || '—'} icon={<Footprints size={16}/>}/>
                <Fact label="Dominant eye"  value={physical?.dominant_eye  || '—'} icon={<Activity size={16}/>}/>
              </div>
              {/* Misure estese (collassabili) */}
              {renderMeasures(physical)}
            </section>

            {/* SOCIAL */}
            {!!socialSorted.length && (
              <section aria-label="Social" style={styles.section}>
                <div style={styles.titleRow}><Globe size={18}/><h2 style={styles.h2}>Social</h2></div>
                <div style={{ display:'grid', gap:8 }}>
                  {socialSorted.map(s => (
                    <a key={s.id} href={s.profile_url} target="_blank" rel="noreferrer" style={styles.socialItem}>
                      <span style={{ fontWeight:800, color:'#111', overflow:'hidden', textOverflow:'ellipsis' }}>{s.platform || 'Profile'}</span>
                      <ExternalLink size={16} style={{ marginLeft:'auto', color:'#1976d2' }}/>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* CONTATTI */}
            <section aria-label="Contatti" style={styles.section}>
              <div style={styles.titleRow}><Phone size={18}/><h2 style={styles.h2}>Contacts</h2></div>
              <div style={{ display:'grid', gap:10 }}>
                <div style={styles.row}><Mail size={16}/><strong>{email || '—'}</strong></div>
                <div style={styles.row}><Phone size={16}/><strong>{athlete?.phone || contacts?.phone_number || '—'}</strong></div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ ...styles.badge, background: contacts?.phone_verified ? '#dcfce7' : '#f3f4f6' }}><CheckCircle size={14}/> Phone {contacts?.phone_verified ? 'verified' : 'not verified'}</span>
                  <span style={{ ...styles.badge, background: contacts?.id_verified ? '#dcfce7' : '#f3f4f6' }}><ShieldCheck size={14}/> ID {contacts?.id_verified ? 'verified' : 'not verified'}</span>
                </div>
                <div style={{ ...styles.small }}>
                  Residence: {contacts?.residence_city || '—'}, {contacts?.residence_country || '—'}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightbox.open && (
        <div role="dialog" aria-modal="true" aria-label="Media viewer"
             style={styles.lightbox} onClick={()=>setLightbox({open:false})}>
          <div style={styles.lightboxInner} onClick={(e)=>e.stopPropagation()}>
            <div style={{ color:'#fff', fontWeight:800, marginBottom:8 }}>{lightbox.title}</div>
            {lightbox.type === 'image' ? (
              <img alt={lightbox.title} src={lightbox.src} style={{ width:'100%', height:'auto', borderRadius:12, display:'block' }}/>
            ) : (
              <div style={{ position:'relative', width:'100%', paddingTop:'56.25%' }}>
                <iframe title={lightbox.title} src={lightbox.src} style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:0, borderRadius:12 }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
              </div>
            )}
            <div style={{ marginTop:10, display:'flex', justifyContent:'flex-end' }}>
              <button type="button" onClick={()=>setLightbox({ open:false })} style={styles.btn}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Sub‑components ----------
function InfoPair({ label, value }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:8 }}>
      <div style={{ fontSize:12, color:'#666' }}>{label}</div>
      <div style={{ fontWeight:700 }}>{value || '—'}</div>
    </div>
  );
}

function Fact({ label, value, icon }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:10, borderRadius:12, background:'#fafafa', border:'1px solid #eee' }}>
      {icon}<div><div style={{ fontSize:12, color:'#666' }}>{label}</div><div style={{ fontWeight:800 }}>{value}</div></div>
    </div>
  );
}

function IntroPlayer({ item, getSigned }) {
  const [src, setSrc] = useState(''); const [poster, setPoster] = useState('');
  useEffect(()=>{ (async()=> {
    setPoster(item?.thumbnail_path ? (isHttp(item.thumbnail_path) ? item.thumbnail_path : await getSigned(item.thumbnail_path)) : '');
    setSrc(item?.storage_path ? await getSigned(item.storage_path) : '');
  })(); }, [item?.storage_path, item?.thumbnail_path, getSigned]);
  if (!item) return null;
  if (item.external_url) {
    return (
      <div style={{ position:'relative', width:'100%', paddingTop:'56.25%', borderRadius:12, overflow:'hidden', background:'#000' }}>
        <iframe title={item.title||'Intro'} src={embedUrl(item.external_url)} style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:0 }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
      </div>
    );
  }
  return (
    <video controls preload="metadata" poster={poster||undefined} style={{ width:'100%', borderRadius:12, display:'block', background:'#000' }} src={src||''}/>
  );
}

function HLCard({ it, idx, getSigned, onOpen }) {
  const [poster, setPoster] = useState(''); const [src, setSrc] = useState('');
  useEffect(()=>{ (async()=> {
    const thumb = it?.thumbnail_path ? (isHttp(it.thumbnail_path) ? it.thumbnail_path : await getSigned(it.thumbnail_path)) : (ytId(it.external_url) ? `https://img.youtube.com/vi/${ytId(it.external_url)}/hqdefault.jpg` : '');
    setPoster(thumb||'');
    setSrc(it?.storage_path ? await getSigned(it.storage_path) : '');
  })(); }, [it?.thumbnail_path, it?.storage_path, it?.external_url, getSigned]);
  const title = it.title || `Highlight #${idx+1}`;
  const open = () => onOpen(it.external_url ? embedUrl(it.external_url) : src, title);
  return (
    <div style={{ border:'1px solid #eee', borderRadius:14, overflow:'hidden', background:'#fafafa', scrollSnapAlign:'start' }}>
      {poster ? <img alt={title} src={poster} style={{ width:'100%', aspectRatio:'16/9', objectFit:'cover', display:'block' }}/> : <div style={{ width:'100%', aspectRatio:'16/9', display:'grid', placeItems:'center', background:'#111', color:'#eee' }}><Film size={18}/> No poster</div>}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:10 }}>
        <div style={{ fontWeight:700, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:220 }}>{title}</div>
        <button type="button" onClick={open} style={{ height:32, padding:'0 12px', borderRadius:8, border:'none', background:'linear-gradient(90deg,#27E3DA,#F7B84E)', color:'#fff', fontWeight:700, cursor:'pointer' }}>
          <Play size={16}/>
        </button>
      </div>
    </div>
  );
}

function GamesBlock({ games }) {
  // raggruppo per stagione
  const bySeason = (games||[]).reduce((acc,g)=>{ const k=g.meta?.season||'—'; (acc[k]=acc[k]||[]).push(g); return acc; },{});
  const [open, setOpen] = useState(()=> new Set(Object.keys(bySeason).slice(0,1)));
  const toggle = (s) => setOpen(prev => { const n=new Set(prev); n.has(s)?n.delete(s):n.add(s); return n; });

  const styles = {
    accItem: { border:'1px solid #eee', borderRadius:12, marginBottom:8, background:'#fff' },
    sumBtn: { width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer' },
    details:{ padding:12, borderTop:'1px solid #eee', display:'flex', flexDirection:'column', gap:6 }
  };

  return (
    <div>
      {Object.keys(bySeason).map(season => {
        const isOpen = open.has(season);
        return (
          <div key={season} style={styles.accItem}>
            <button type="button" onClick={()=>toggle(season)} style={styles.sumBtn} aria-expanded={isOpen}>
              <span style={{ fontWeight:800, display:'flex', alignItems:'center', gap:8 }}><Calendar size={16}/> {season}</span>
              {isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
            </button>
            {isOpen && (
              <div style={styles.details}>
                {bySeason[season].map(({ item, meta }) => (
                  <div key={item.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, padding:'6px 0', borderBottom:'1px dashed #eee' }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <span>{fmtDate(meta?.match_date)} · vs {meta?.opponent || '—'} · {meta?.competition || '—'}</span>
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
  );
}

function AwardCard({ r }) {
  const row = r || {};
  const head = row.title || '—';
  const sub  = [row.awarding_entity||'—', row.season_start ? fmtSeason(row.season_start,row.season_end) : '', row.date_awarded ? fmtDate(row.date_awarded) : ''].filter(Boolean).join(' • ');
  return (
    <div style={{
      border:'1px solid #eee', borderRadius:12, background:'#fff',
      padding:12, display:'grid', gridTemplateColumns:'1fr auto', gap:8,
      boxShadow:'0 1px 0 rgba(0,0,0,0.02)'
    }}>
      <div>
        <div style={{ fontWeight:800 }}>{head}</div>
        <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{sub}</div>
        {row.description && (
          <div style={{ marginTop:6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
            {row.description}
          </div>
        )}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {row.evidence_external_url && (
          <a href={row.evidence_external_url} target="_blank" rel="noreferrer" style={{ fontWeight:700, color:'#1976d2', display:'inline-flex', alignItems:'center', gap:6 }}>
            Apri link <ExternalLink size={16}/>
          </a>
        )}
        {!row.evidence_external_url && row.evidence_signed_url && (
          <a href={row.evidence_signed_url} target="_blank" rel="noreferrer" style={{ fontWeight:700, color:'#1976d2', display:'inline-flex', alignItems:'center', gap:6 }}>
            Apri documento <ExternalLink size={16}/>
          </a>
        )}
      </div>
    </div>
  );
}

function AsyncImage({ alt, path, getSigned, style, onClick }) {
  const [src, setSrc] = useState('');
  useEffect(()=>{ (async()=> {
    const url = path ? (isHttp(path) ? path : await getSigned(path)) : '';
    setSrc(url||'');
  })(); }, [path, getSigned]);
  return <img alt={alt} src={src} loading="lazy" decoding="async" style={{ ...style, cursor:'zoom-in' }} onClick={()=>onClick?.(src)} />;
}

function niceContract(v) {
  if (!v) return '—';
  if (v === 'free_agent')     return 'Free agent';
  if (v === 'under_contract') return 'Under contract';
  if (v === 'on_loan')        return 'On loan';
  return v;
}

function getStyles() {
  return {
    container: { maxWidth: 1280, margin: '0 auto', padding: 16 },
    card: { borderRadius: 16, boxShadow:'0 8px 24px rgba(0,0,0,0.08)', background:'#fff', overflow:'hidden' },
    // HERO compatto
    heroCompact: { display:'grid', gridTemplateColumns:'auto 1fr', gap:16, padding:16, alignItems:'center', borderBottom:'1px solid #eee' },
    heroLeft: { display:'flex', alignItems:'center', gap:12 },
    avatar: { width:96, height:96, borderRadius:'50%', objectFit:'cover', display:'block', border:'2px solid #fff', boxShadow:'0 2px 8px rgba(0,0,0,0.12)' },
    avatarFallback: { width:96, height:96, borderRadius:'50%', display:'grid', placeItems:'center', background:'linear-gradient(135deg,#27E3DA,#F7B84E)', color:'#111', fontWeight:900, fontSize:28 },
    heroRight: { minHeight: 120, display:'flex', flexDirection:'column', gap:6 },
    h1: { fontSize: 26, lineHeight: 1.15, fontWeight: 900, margin: 0 },
    chips: { display:'flex', gap:8, flexWrap:'wrap' },
    chip: { display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:999, border:'1px solid #e5e7eb', background:'#fff', fontSize:13, fontWeight:700 },
    progressRow: { display:'grid', gridTemplateColumns:'auto 1fr auto', gap:8, alignItems:'center', marginTop:2 },
    progressLabel: { fontSize:12, color:'#666' },
    progressBar: { height:8, borderRadius:999, background:'#eee', overflow:'hidden' },
    progressFill: { height:'100%', background:'linear-gradient(90deg,#27E3DA,#F7B84E)' },
    progressPct: { fontSize:12, color:'#666' },

    // GRID
    grid: { display:'grid', gridTemplateColumns:'2fr 1fr', gap:24, padding:16 },
    colA: { display:'flex', flexDirection:'column', gap:24 },
    colB: { display:'flex', flexDirection:'column', gap:24 },

    section: { border:'1px solid #eee', borderRadius:16, padding:16, background:'#fff' },
    titleRow: { display:'flex', alignItems:'center', gap:10, marginBottom:8 },
    h2: { fontSize:20, lineHeight:1.2, margin:0, fontWeight:900 },
    h3: { fontSize:16, margin:'10px 0 8px', fontWeight:800 },

    // Media
    hlCarousel: { display:'grid', gridAutoFlow:'column', gridAutoColumns:'minmax(260px,1fr)', gap:12, scrollSnapType:'x mandatory', overflowX:'auto', paddingBottom:6 },
    photosGrid: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 },
    photoThumb: { width:'100%', aspectRatio:'3/2', objectFit:'cover', borderRadius:12, display:'block' },
    strip: { display:'grid', gridAutoFlow:'column', gridAutoColumns:'minmax(120px,140px)', gap:8, overflowX:'auto' },

    // Sport
    sportGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },

    // Carriera
    seasonCard: { border:'1px solid #eee', borderRadius:12, padding:12, background:'#fff' },
    seasonHeader: { display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
    seasonLeft: { display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' },
    seasonBadge: { fontWeight:800, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 8px', fontSize:12 },
    seasonTeam: { fontWeight:800, marginLeft:'auto' },
    seasonRow: { marginTop:6, color:'#333' },
    pill: { display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:999, border:'1px solid #e5e7eb', background:'#fff', fontSize:12, fontWeight:700 },
    pillSport: { background:'#eef6ff', borderColor:'#dbeafe' },
    pillCurrent: { background:'#dcfce7', borderColor:'#86efac' },

    // Profilo
    profileGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },

    // Fisico
    facts: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },

    // Social/Contacts
    row: { display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
    badge: { display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:999, border:'1px solid #e5e7eb', fontSize:13, fontWeight:700 },
    small: { fontSize:12, color:'#666' },
    socialItem: { border:'1px solid #eee', borderRadius:12, padding:10, display:'flex', alignItems:'center', gap:10, textDecoration:'none', background:'#fff' },

    emptyText: { fontSize:12, color:'#666' },

    // Lightbox
    lightbox: { position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:50, display:'grid', placeItems:'center', padding:16 },
    lightboxInner: { width:'min(96vw,1200px)', maxHeight:'90vh' },
    btn: { height:36, padding:'0 14px', borderRadius:8, border:'1px solid #eee', background:'#fff', cursor:'pointer', fontWeight:700 },

    // Responsive
    '@m': {}
  };
}

// ---------- Responsive CSS ----------
if (typeof document !== 'undefined' && !document.getElementById('showcase-resp-css')) {
  const el = document.createElement('style');
  el.id = 'showcase-resp-css';
  el.innerHTML = `
  @media (max-width: 1023px) {
    [style*="grid-template-columns:2fr 1fr"]{grid-template-columns:1fr}
    .photosGrid{grid-template-columns:1fr 1fr !important}
    .profileGrid{grid-template-columns:1fr !important}
    .facts{grid-template-columns:1fr 1fr !important}
    .sportGrid{grid-template-columns:1fr !important}
  }`;
  document.head.appendChild(el);
}

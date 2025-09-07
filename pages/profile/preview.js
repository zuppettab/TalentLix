// pages/profile/preview.js
// Pagina standalone "Profile Preview" (solo lettura) – Next.js (pages router)
// ✅ Import supabase con percorso corretto da /pages/profile/:  '../../utils/supabaseClient'
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase as sb } from '../../utils/supabaseClient'; // <-- FIX percorso (2 livelli)  :contentReference[oaicite:4]{index=4}
import {
  Play, Film, ChevronRight, ChevronDown, ExternalLink,
  Calendar, Award as AwardIcon, Medal, Phone, Mail, Globe, User,
  CheckCircle, ShieldCheck, Ruler, Scale, MoveHorizontal, Hand, Footprints, Activity
} from 'lucide-react';

const supabase = sb;

// ----- CATEGORIE MEDIA (allineate alla MediaPanel) -----  :contentReference[oaicite:5]{index=5}
const CAT = {
  FEATURED_HEAD: 'featured_headshot',
  FEATURED_G1:   'featured_game1',
  FEATURED_G2:   'featured_game2',
  GALLERY:       'gallery',
  INTRO:         'intro',
  HIGHLIGHT:     'highlight',
  GAME:          'game',
};

const BUCKET_MEDIA = 'media';
const BUCKET_DOCS  = 'documents';

// ---------- Utilità ----------
const isHttp = (u='') => /^https?:\/\//i.test(String(u));
const clamp = (n, a, b) => Math.min(Math.max(n, a), b);
const fmtDate = (iso) => { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'2-digit'});} catch {return String(iso);} };
const fmtSeason = (start, end) => { // coerente con SeasonAccordionItem  :contentReference[oaicite:6]{index=6}
  const s = start ? String(start) : ''; const e = end ? String(end) : '';
  return s && e ? `${s}/${(String(e).length===4 ? String(e).slice(2) : e)}` : (s || '—');
};
const calcAge = (dob) => { if(!dob) return null; const [y,m,d]=String(dob).split('-').map(Number);
  const birth=new Date(y,(m||1)-1,d||1); if(Number.isNaN(birth.getTime())) return null;
  const now=new Date(); let age=now.getFullYear()-birth.getFullYear();
  const mo=now.getMonth()-birth.getMonth(); if(mo<0||(mo===0&&now.getDate()<birth.getDate())) age--; return age; };
const initiali = (name='') => (name.trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('') || 'A').toUpperCase();
const flagFromCountry = (name='') => { const s=String(name).trim(); if(!s) return '';
  const iso2=/^[A-Za-z]{2}$/.test(s)?s.toUpperCase():''; const map={italy:'IT',italia:'IT',french:'FR',france:'FR',spain:'ES',spagna:'ES',germany:'DE',germania:'DE',usa:'US','united states':'US',uk:'GB','united kingdom':'GB',romania:'RO',portugal:'PT',poland:'PL',greece:'GR'};
  const code=iso2||map[s.toLowerCase()]||''; if(!code) return ''; const A=0x1F1E6, base='A'.charCodeAt(0);
  return [...code].map(c=>String.fromCodePoint(A+(c.charCodeAt(0)-base))).join(''); };

// Signed URL cache
function useSignedUrlCache(bucket) {
  const ref = useRef(new Map());
  return async (path) => {
    if (!path) return '';
    const k = `${bucket}:${path}`; const hit = ref.current.get(k); const now = Date.now();
    if (hit && hit.exp > now + 2000) return hit.url;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error) return '';
    const url = data?.signedUrl || ''; ref.current.set(k, { url, exp: now + 55_000 }); return url;
  };
}
function useAnySignedUrl() {
  const media = useSignedUrlCache(BUCKET_MEDIA);
  const avatars = useSignedUrlCache('avatars');
  return async (path) => {
    if (!path) return ''; const m = await media(path); if (m) return m; return await avatars(path);
  };
}
// provider -> embed
const ytId=(url)=>{try{const u=new URL(String(url));if(u.hostname.includes('youtu.be'))return u.pathname.slice(1);
  if(u.hostname.includes('youtube.com')){if(u.pathname.startsWith('/watch'))return u.searchParams.get('v'); if(u.pathname.startsWith('/shorts/'))return u.pathname.split('/')[2];}}catch{}return null;};
const vmId=(url)=>{const m=String(url||'').match(/vimeo\.com\/(\d+)/i);return m?m[1]:null;};
const embedUrl=(url)=> ytId(url)?`https://www.youtube.com/embed/${ytId(url)}?rel=0` : (vmId(url)?`https://player.vimeo.com/video/${vmId(url)}`:url);

// ---------- Pagina ----------
export default function ProfilePreviewPage() {
  const router = useRouter();
  const athleteId = router.query.id || router.query.athleteId;

  return (
    <>
      <Head><title>Profile preview</title></Head>
      {!athleteId ? (
        <div style={{ maxWidth: 960, margin: '40px auto', padding: '0 16px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Missing athlete id</h1>
          <p>Apri questa pagina come <code>/profile/preview?id=&lt;athleteId&gt;</code>.</p>
        </div>
      ) : (
        <AthletePreviewCard athleteId={String(athleteId)} />
      )}
    </>
  );
}

// ---------- Card preview (solo lettura) ----------
function AthletePreviewCard({ athleteId }) {
  const getSignedMedia = useSignedUrlCache(BUCKET_MEDIA);
  const getSignedDoc   = useSignedUrlCache(BUCKET_DOCS);
  const getAnySigned   = useAnySignedUrl();

  // Stato
  const [loading, setLoading]   = useState(true);
  const [athlete, setAthlete]   = useState(null);
  const [email, setEmail]       = useState('');
  const [sports, setSports]     = useState(null);
  const [career, setCareer]     = useState([]);
  const [physical, setPhysical] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [social, setSocial]     = useState([]);
  const [awards, setAwards]     = useState([]);
  const [media, setMedia]       = useState({ featured:{}, intro:null, highlights:[], gallery:[], games:[] });

  const [lightbox, setLightbox] = useState({ open:false, type:'', src:'', title:'' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);

        // Athlete + auth email
        const { data: a } = await supabase.from('athlete').select('*').eq('id', athleteId).single();
        const { data: { user } } = await supabase.auth.getUser();

        // Sports attuale
        const { data: sp } = await supabase
          .from('sports_experiences')
          .select(`
            id, sport, role, secondary_role, team, category, playing_style, seeking_team,
            contract_status, contract_end_date, preferred_regions, trial_window, agent_name, agency_name, is_represented
          `)
          .eq('athlete_id', athleteId)
          .order('id', { ascending:false })
          .limit(1);

        // Carriera (desc)  :contentReference[oaicite:7]{index=7}
        const { data: car } = await supabase
          .from('athlete_career')
          .select('*')
          .eq('athlete_id', athleteId)
          .order('season_start', { ascending:false })
          .order('id', { ascending:false });

        // Physical (ultima)
        const { data: pd } = await supabase
          .from('physical_data')
          .select('*')
          .eq('athlete_id', athleteId)
          .order('id', { ascending:false })
          .limit(1);

        // Contacts / Verification
        const { data: cv } = await supabase
          .from('contacts_verification')
          .select('*')
          .eq('athlete_id', athleteId)
          .single();

        // Social
        const { data: so } = await supabase
          .from('social_profiles')
          .select('*')
          .eq('athlete_id', athleteId)
          .order('sort_order', { ascending:true })
          .order('created_at', { ascending:true });

        // Awards
        const { data: aw } = await supabase
          .from('awards_recognitions')
          .select('*')
          .eq('athlete_id', athleteId)
          .order('season_start', { ascending:false })
          .order('date_awarded', { ascending:false });

        // Media (categorie allineate alla MediaPanel)  :contentReference[oaicite:8]{index=8}
        const { data: rows } = await supabase
          .from('media_item')
          .select('*')
          .eq('athlete_id', athleteId);

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

        // Awards: firma documento se presente
        const awSigned = await Promise.all((aw||[]).map(async r => {
          let signed = '';
          if (r.evidence_file_path) { try { signed = await getSignedDoc(r.evidence_file_path); } catch {} }
          return { ...r, evidence_signed_url: signed };
        }));

        if (!mounted) return;
        setAthlete(a || null);
        setEmail(user?.email || '');
        setSports((sp && sp[0]) || null);
        setCareer(car || []);
        setPhysical((pd && pd[0]) || null);
        setContacts(cv || null);
        setSocial(so || []);
        setAwards(awSigned || []);
        setMedia({ featured, intro, gallery, highlights, games });
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [athleteId]);

  const styles = getStyles();

  // ----- Skeleton -----
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.heroCompact}>
            <div style={styles.heroLeft}><div style={styles.skelCircle}/></div>
            <div style={styles.heroRight}>
              <div style={styles.skelLine}/><div style={{ ...styles.skelLine, width:'60%' }}/>
              <div style={{ ...styles.skelBar, width:'70%' }}/>
            </div>
          </div>
          <div style={styles.grid}>
            <div style={styles.colA}><div className="sk" style={{ ...styles.section, height: 220 }}/></div>
            <div style={styles.colB}><div className="sk" style={{ ...styles.section, height: 160 }}/></div>
          </div>
          <style>{`.sk{background:linear-gradient(90deg,#eee,#f5f5f5,#eee);animation:sh 1.2s infinite;background-size:200% 100%}@keyframes sh{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
        </div>
      </div>
    );
  }

  // ----- Dati e mapping -----
  const fullName = `${athlete?.first_name||''} ${athlete?.last_name||''}`.trim() || '—';
  const age = calcAge(athlete?.date_of_birth);
  const natFlag = flagFromCountry(athlete?.nationality) || '';
  const completion = clamp(Number(athlete?.completion_percentage||0), 0, 100);
  const currentSeason = (career||[]).find(c => c.is_current) || null;

  // Avatar: profile → featured headshot → iniziali
  const [avatarUrl, setAvatarUrl] = useState('');
  useEffect(() => { (async () => {
    const raw = athlete?.profile_picture_url || media.featured?.head?.storage_path || '';
    setAvatarUrl(raw ? (isHttp(raw) ? raw : await getAnySigned(raw)) : '');
  })(); }, [athlete?.profile_picture_url, media.featured?.head?.storage_path]);

  // Social ordinati
  const socialSorted = useMemo(() => {
    const rows = (social||[]).filter(r => r?.profile_url);
    const rank = (u='') => { const s=String(u).toLowerCase();
      if (s.includes('instagram')) return 1; if (s.includes('youtube')) return 2;
      if (s.includes('x.com')||s.includes('twitter')) return 3; if(s.includes('tiktok')) return 4;
      if (s.includes('facebook')) return 5; if (s.includes('linkedin')) return 6; return 99; };
    return [...rows].sort((a,b)=>rank(a.profile_url)-rank(b.profile_url));
  }, [social]);

  // Featured photos
  const featuredPhotos = [media.featured?.head, media.featured?.g1, media.featured?.g2].filter(Boolean);

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
              {(sports?.role || currentSeason?.role) && <span style={styles.chip}><User size={14}/>{sports?.role || currentSeason?.role}</span>}
              {(athlete?.nationality || natFlag) && <span style={styles.chip}>{natFlag || '🏳️'} {athlete?.nationality || ''}</span>}
              {typeof age==='number' && <span style={styles.chip}><Calendar size={14}/>{age} y/o</span>}
            </div>
            <div style={styles.progressRow}>
              <span style={styles.progressLabel}>Profile completion</span>
              <div style={styles.progressBar}><div style={{ ...styles.progressFill, width:`${completion}%` }}/></div>
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
              {media.intro && <IntroPlayer item={media.intro} getSigned={getSignedMedia}/>}

              {/* Highlights */}
              {!!(media.highlights||[]).length && (
                <>
                  <h3 style={styles.h3}>Highlights</h3>
                  <div style={styles.hlCarousel}>
                    {media.highlights.map((it, idx) => (
                      <HLCard key={it.id} it={it} idx={idx} getSigned={getSignedMedia}
                              onOpen={(src,title)=>setLightbox({open:true,type:'video',src,title})}/>
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
                      <AsyncImage key={ph.id} alt={`Featured #${i+1}`}
                                  path={ph.storage_path || ph.thumbnail_path}
                                  getSigned={getSignedMedia} style={styles.photoThumb}
                                  onClick={(src)=> setLightbox({ open:true, type:'image', src, title: ph.title || `Photo #${i+1}` })}/>
                    ))}
                  </div>
                </>
              )}

              {/* Gallery */}
              {!!(media.gallery||[]).length && (
                <>
                  <h3 style={styles.h3}>Gallery</h3>
                  <div style={styles.strip}>
                    {media.gallery.map((g,i)=>(
                      <AsyncImage key={g.id} alt={g.title || `Photo ${i+1}`}
                                  path={g.storage_path || g.thumbnail_path} getSigned={getSignedMedia}
                                  style={{ width:'100%', aspectRatio:'1/1', objectFit:'cover', borderRadius:12, display:'block' }}
                                  onClick={(src)=> setLightbox({ open:true, type:'image', src, title: g.title || `Photo ${i+1}` })}/>
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
                <InfoPair label="Sport" value={sports?.sport || currentSeason?.sport || '—'}/>
                <InfoPair label="Role"  value={[sports?.role, sports?.secondary_role].filter(Boolean).join(' / ') || currentSeason?.role || '—'}/>
                <InfoPair label="Team"  value={sports?.team || currentSeason?.team_name || '—'}/>
                <InfoPair label="Category" value={sports?.category || currentSeason?.category || '—'}/>
                {sports?.playing_style && <InfoPair label="Playing style" value={sports.playing_style}/>}
                <InfoPair label="Seeking team" value={sports?.seeking_team ? 'Yes' : '—'}/>
                <InfoPair label="Contract" value={niceContract(sports?.contract_status)}/>
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
                        <span style={styles.seasonBadge}>{fmtSeason(row.season_start,row.season_end)}</span>
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
              {!(awards||[]).length ? <div style={styles.emptyText}>—</div> : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {awards.map((r)=> <AwardCard key={r.id} r={r} /> )}
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
                <Fact label="Height" value={physical?.height_cm ? `${physical.height_cm} cm` : '—'} icon={<Ruler size={16}/>}/>
                <Fact label="Weight" value={physical?.weight_kg ? `${physical.weight_kg} kg` : '—'} icon={<Scale size={16}/>}/>
                <Fact label="Wingspan" value={physical?.wingspan_cm ? `${physical.wingspan_cm} cm` : '—'} icon={<MoveHorizontal size={16}/>}/>
                <Fact label="Dominant hand" value={physical?.dominant_hand || '—'} icon={<Hand size={16}/>}/>
                <Fact label="Dominant foot" value={physical?.dominant_foot || '—'} icon={<Footprints size={16}/>}/>
                <Fact label="Dominant eye"  value={physical?.dominant_eye  || '—'} icon={<Activity size={16}/>}/>
              </div>
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
                <div style={{ ...styles.small }}>Residence: {contacts?.residence_city || '—'}, {contacts?.residence_country || '—'}</div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightbox.open && (
        <div role="dialog" aria-modal="true" aria-label="Media viewer" style={styles.lightbox} onClick={()=>setLightbox({open:false})}>
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

// ---------- Subcomponents ----------
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
function AsyncImage({ alt, path, getSigned, style, onClick }) {
  const [src, setSrc] = useState('');
  useEffect(()=>{ (async()=> { const url = path ? (isHttp(path) ? path : await getSigned(path)) : ''; setSrc(url||''); })(); }, [path, getSigned]);
  return <img alt={alt} src={src} loading="lazy" decoding="async" style={{ ...style, cursor:'zoom-in' }} onClick={()=>onClick?.(src)} />;
}
function IntroPlayer({ item, getSigned }) {
  const [src, setSrc] = useState(''); const [poster, setPoster] = useState('');
  useEffect(()=>{ (async()=> { setPoster(item?.thumbnail_path ? (isHttp(item.thumbnail_path) ? item.thumbnail_path : await getSigned(item.thumbnail_path)) : ''); setSrc(item?.storage_path ? await getSigned(item.storage_path) : ''); })(); }, [item?.storage_path, item?.thumbnail_path, getSigned]);
  if (!item) return null;
  if (item.external_url) {
    return (
      <div style={{ position:'relative', width:'100%', paddingTop:'56.25%', borderRadius:12, overflow:'hidden', background:'#000', marginBottom: 10 }}>
        <iframe title={item.title||'Intro'} src={embedUrl(item.external_url)} style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:0 }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
      </div>
    );
  }
  return <video controls preload="metadata" poster={poster||undefined} style={{ width:'100%', borderRadius:12, display:'block', background:'#000', marginBottom: 10 }} src={src||''}/>;
}
function HLCard({ it, idx, getSigned, onOpen }) {
  const [poster, setPoster] = useState(''); const [src, setSrc] = useState('');
  useEffect(()=>{ (async()=> {
    const thumb = it?.thumbnail_path ? (isHttp(it.thumbnail_path) ? it.thumbnail_path : await getSigned(it.thumbnail_path)) : (ytId(it.external_url) ? `https://img.youtube.com/vi/${ytId(it.external_url)}/hqdefault.jpg` : '');
    setPoster(thumb||''); setSrc(it?.storage_path ? await getSigned(it.storage_path) : '');
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
  const bySeason = (games||[]).reduce((acc,g)=>{ const k=g.meta?.season||'—'; (acc[k]=acc[k]||[]).push(g); return acc; },{});
  const [open, setOpen] = useState(()=> new Set(Object.keys(bySeason).slice(0,1)));
  const toggle = (s) => setOpen(prev => { const n=new Set(prev); n.has(s)?n.delete(s):n.add(s); return n; });
  const s = {
    accItem: { border:'1px solid #eee', borderRadius:12, marginBottom:8, background:'#fff' },
    sumBtn:  { width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer' },
    details: { padding:12, borderTop:'1px solid #eee', display:'flex', flexDirection:'column', gap:6 },
  };
  return (
    <div>
      {Object.keys(bySeason).map(season => {
        const isOpen = open.has(season);
        return (
          <div key={season} style={s.accItem}>
            <button type="button" onClick={()=>toggle(season)} style={s.sumBtn} aria-expanded={isOpen}>
              <span style={{ fontWeight:800, display:'flex', alignItems:'center', gap:8 }}><Calendar size={16}/> {season}</span>
              {isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
            </button>
            {isOpen && (
              <div style={s.details}>
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
  const sub  = [r.awarding_entity||'—', r.season_start ? fmtSeason(r.season_start,r.season_end) : '', r.date_awarded ? fmtDate(r.date_awarded) : ''].filter(Boolean).join(' • ');
  return (
    <div style={{ border:'1px solid #eee', borderRadius:12, background:'#fff', padding:12, display:'grid', gridTemplateColumns:'1fr auto', gap:8, boxShadow:'0 1px 0 rgba(0,0,0,0.02)' }}>
      <div>
        <div style={{ fontWeight:800 }}>{r.title || '—'}</div>
        <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{sub}</div>
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
  );
}
function niceContract(v){ if(!v) return '—'; if(v==='free_agent')return 'Free agent'; if(v==='under_contract')return 'Under contract'; if(v==='on_loan')return 'On loan'; return v; }
function renderMeasures(physical){
  if(!physical) return null;
  const pairs = [];
  const add=(l,v,u='')=>{ if(v!==''&&v!=null) pairs.push([l,`${v}${u}`]); };
  add('Wingspan',physical.wingspan_cm,' cm'); add('Standing reach',physical.standing_reach_cm,' cm');
  add('Body fat',physical.body_fat_percent,' %'); add('Sprint 10m',physical.sprint_10m_s,' s');
  add('Sprint 20m',physical.sprint_20m_s,' s'); add('Pro agility 5-10-5',physical.pro_agility_5_10_5_s,' s');
  add('Vertical jump (CMJ)',physical.vertical_jump_cmj_cm,' cm'); add('Standing long jump',physical.standing_long_jump_cm,' cm');
  add('Grip L',physical.grip_strength_left_kg,' kg'); add('Grip R',physical.grip_strength_right_kg,' kg');
  add('Sit & reach',physical.sit_and_reach_cm,' cm'); add('Plank hold',physical.plank_hold_s,' s'); add('Cooper 12-min',physical.cooper_12min_m,' m');
  if(!pairs.length) return null;
  return (
    <details style={{ marginTop:12 }}>
      <summary style={{ cursor:'pointer', fontWeight:800 }}>Vedi tutte le misure</summary>
      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>Ultima rilevazione: {fmtDate(physical?.physical_measured_at || physical?.performance_measured_at)}</div>
        <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:'0 8px' }}>
          <tbody>{pairs.map(([l,v],i)=>(
            <tr key={i}>
              <td style={{ width:'50%', padding:'10px 12px', background:'#fafafa', borderTopLeftRadius:10, borderBottomLeftRadius:10, fontWeight:700 }}>{l}</td>
              <td style={{ width:'50%', padding:'10px 12px', background:'#fff', borderTopRightRadius:10, borderBottomRightRadius:10, border:'1px solid #eee', borderLeft:'none' }}>{v}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}

// ---------- Stili ----------
function getStyles(){
  return {
    container:{ maxWidth:1280, margin:'0 auto', padding:16 },
    card:{ borderRadius:16, boxShadow:'0 8px 24px rgba(0,0,0,0.08)', background:'#fff', overflow:'hidden' },
    heroCompact:{ display:'grid', gridTemplateColumns:'auto 1fr', gap:16, padding:16, alignItems:'center', borderBottom:'1px solid #eee' },
    heroLeft:{ display:'flex', alignItems:'center', gap:12 },
    avatar:{ width:96, height:96, borderRadius:'50%', objectFit:'cover', display:'block', border:'2px solid #fff', boxShadow:'0 2px 8px rgba(0,0,0,0.12)' },
    avatarFallback:{ width:96, height:96, borderRadius:'50%', display:'grid', placeItems:'center', background:'linear-gradient(135deg,#27E3DA,#F7B84E)', color:'#111', fontWeight:900, fontSize:28 },
    heroRight:{ minHeight:120, display:'flex', flexDirection:'column', gap:6 },
    h1:{ fontSize:26, lineHeight:1.15, fontWeight:900, margin:0 },
    chips:{ display:'flex', gap:8, flexWrap:'wrap' },
    chip:{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:999, border:'1px solid #e5e7eb', background:'#fff', fontSize:13, fontWeight:700 },
    progressRow:{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:8, alignItems:'center', marginTop:2 },
    progressLabel:{ fontSize:12, color:'#666' },
    progressBar:{ height:8, borderRadius:999, background:'#eee', overflow:'hidden' },
    progressFill:{ height:'100%', background:'linear-gradient(90deg,#27E3DA,#F7B84E)' },
    progressPct:{ fontSize:12, color:'#666' },

    grid:{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:24, padding:16 },
    colA:{ display:'flex', flexDirection:'column', gap:24 },
    colB:{ display:'flex', flexDirection:'column', gap:24 },

    section:{ border:'1px solid #eee', borderRadius:16, padding:16, background:'#fff' },
    titleRow:{ display:'flex', alignItems:'center', gap:10, marginBottom:8 },
    h2:{ fontSize:20, lineHeight:1.2, margin:0, fontWeight:900 },
    h3:{ fontSize:16, margin:'10px 0 8px', fontWeight:800 },

    hlCarousel:{ display:'grid', gridAutoFlow:'column', gridAutoColumns:'minmax(260px,1fr)', gap:12, scrollSnapType:'x mandatory', overflowX:'auto', paddingBottom:6 },
    photosGrid:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 },
    photoThumb:{ width:'100%', aspectRatio:'3/2', objectFit:'cover', borderRadius:12, display:'block' },
    strip:{ display:'grid', gridAutoFlow:'column', gridAutoColumns:'minmax(120px,140px)', gap:8, overflowX:'auto' },

    sportGrid:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },

    seasonCard:{ border:'1px solid #eee', borderRadius:12, padding:12, background:'#fff' },
    seasonHeader:{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
    seasonLeft:{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' },
    seasonBadge:{ fontWeight:800, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'2px 8px', fontSize:12 },
    seasonTeam:{ fontWeight:800, marginLeft:'auto' },
    seasonRow:{ marginTop:6, color:'#333' },
    pill:{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:999, border:'1px solid #e5e7eb', background:'#fff', fontSize:12, fontWeight:700 },
    pillSport:{ background:'#eef6ff', borderColor:'#dbeafe' },
    pillCurrent:{ background:'#dcfce7', borderColor:'#86efac' },

    profileGrid:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },

    facts:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },

    row:{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' },
    badge:{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:999, border:'1px solid #e5e7eb', fontSize:13, fontWeight:700 },
    small:{ fontSize:12, color:'#666' },
    socialItem:{ border:'1px solid #eee', borderRadius:12, padding:10, display:'flex', alignItems:'center', gap:10, textDecoration:'none', background:'#fff' },

    emptyText:{ fontSize:12, color:'#666' },

    lightbox:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:50, display:'grid', placeItems:'center', padding:16 },
    lightboxInner:{ width:'min(96vw,1200px)', maxHeight:'90vh' },
    btn:{ height:36, padding:'0 14px', borderRadius:8, border:'1px solid #eee', background:'#fff', cursor:'pointer', fontWeight:700 },
  };
}
// Responsive CSS (mobile: stack, niente overflow)
if (typeof document !== 'undefined' && !document.getElementById('showcase-resp-css')) {
  const el = document.createElement('style'); el.id='showcase-resp-css';
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

// pages/profile/full.js
// Standalone page (read-only) – no sub‑nav, compact hero with avatar,
// sections: Media · Sport (current) · Career · Profile · Physical · Social · Contacts · Awards.
// Supabase import: correct path from /pages/profile/*  -> '../../utils/supabaseClient'  ✅
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase as sb } from '../../utils/supabaseClient';
import { flagFromCountry } from '../../utils/flags';
import {
  Play, Film, ChevronRight, ChevronDown, ExternalLink,
  Calendar, Award as AwardIcon, Medal, Phone, Mail, Globe, User,
  CheckCircle, ShieldCheck, Ruler, Scale, MoveHorizontal, Hand, Footprints, Activity,
  Image, GalleryVertical, PlayCircle, Clapperboard, Video, ShoppingCart, MessageCircle, Unlock
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
const clamp = (n, a, b) => Math.min(Math.max(Number(n || 0), a), b);
const isHttp = (u='') => /^https?:\/\//i.test(String(u||''));
const fmtDate = (iso) => { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'2-digit'});} catch { return String(iso); } };
const fmtSeason = (start, end) => { const s=String(start||''); const e=String(end||''); return s && e ? `${s}/${(e.length===4?e.slice(2):e)}` : (s || '—'); }; // consistent with SeasonAccordionItem  :contentReference[oaicite:4]{index=4}
const calcAge = (dob) => { if(!dob) return null; const [y,m,d]=String(dob).split('-').map(Number); const b=new Date(y,(m||1)-1,d||1); if(Number.isNaN(b)) return null; const n=new Date(); let a=n.getFullYear()-b.getFullYear(); const mo=n.getMonth()-b.getMonth(); if(mo<0||(mo===0&&n.getDate()<b.getDate())) a--; return a; };
const initials = (name='') => (name.trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('')||'A').toUpperCase();
const ytId=(url)=>{try{const u=new URL(String(url)); if(u.hostname.includes('youtu.be')) return u.pathname.slice(1); if(u.hostname.includes('youtube.com')){ if(u.pathname==='/watch') return u.searchParams.get('v'); if(u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2]; }}catch{} return null;};
const vmId=(url)=>{const m=String(url||'').match(/vimeo\.com\/(\d+)/i); return m?m[1]:null;};
const embedUrl=(url)=> ytId(url)?`https://www.youtube.com/embed/${ytId(url)}?rel=0` : (vmId(url)?`https://player.vimeo.com/video/${vmId(url)}`:url);
const contractText = (v) => v==='free_agent'?'Free agent': v==='under_contract'?'Under contract': v==='on_loan'?'On loan':'—';
const formatCredits = (value) => {
  if (value == null) return '0.00';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return '0.00';
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
};

function useIsMobile(breakpointPx = 720) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width:${breakpointPx}px)`);
    const onChange = (event) => setIsMobile(event.matches);
    onChange(mq);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [breakpointPx]);

  return isMobile;
}

/* ------------------------------ Page ------------------------------ */
export default function ProfileFullPage() {
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

  const [authUser, setAuthUser] = useState(null);
  const [athlete, setAthlete]   = useState(null);
  const [sports, setSports]     = useState(null);   // current record (sports_experiences)
  const [career, setCareer]     = useState([]);     // athlete_career[]
  const [physical, setPhysical] = useState(null);   // physical_data (latest)
  const [contactMeta, setContactMeta] = useState(null);   // contacts_verification (non-sensitive)
  const [awards, setAwards]     = useState([]);     // awards_recognitions[]
  const [media, setMedia]       = useState({ featured:{}, intro:null, highlights:[], gallery:[], games:[] });

  const [contactsData, setContactsData] = useState(null); // RPC bundle (name + contact info)
  const [contactsLoading, setContactsLoading] = useState(true);
  const [operatorId, setOperatorId] = useState(null);
  const [opLoading, setOpLoading] = useState(true);
  const [tariff, setTariff] = useState(null);
  const [wallet, setWallet] = useState({
    id: null,
    balance_credits: null,
    updated_at: null,
    loading: true,
  });
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState({ message: '', reason: '' });
  const [unlockConfirm, setUnlockConfirm] = useState({ open: false, credits: 0 });

  const router = useRouter();
  const isMobile = useIsMobile(720);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [lightbox, setLightbox] = useState({ open:false, type:'', src:'', title:'' });

  // Load (client only)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);

        // Athlete core data (no direct contacts)
        const { data: a } = await supabase
          .from('athlete')
          .select(`
            id,
            gender,
            nationality,
            date_of_birth,
            profile_picture_url,
            completion_percentage,
            birth_city,
            native_language,
            additional_language
          `)
          .eq('id', athleteId)
          .maybeSingle();

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
          .from('contacts_verification')
          .select('residence_city, residence_country, phone_verified, id_verified')
          .eq('athlete_id', athleteId)
          .maybeSingle();

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
        setSports((sp && sp[0]) || null);
        setCareer(car || []);
        setPhysical((pd && pd[0]) || null);
        setContactMeta(cv || null);
        setAwards(awSigned || []);
        setMedia({ featured, intro, gallery, highlights, games });
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [athleteId]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        if (!supabase) {
          if (active) {
            setAuthUser(null);
            setOperatorId(null);
          }
          return;
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        const user = userData?.user || null;
        if (active) setAuthUser(user);

        if (userError) {
          throw userError;
        }

        if (!user?.id) {
          if (active) setOperatorId(null);
          return;
        }

        const { data: accountRows, error: accountError } = await supabase
          .from('op_account')
          .select('id, created_at')
          .eq('auth_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (accountError) {
          throw accountError;
        }

        const account = Array.isArray(accountRows) ? accountRows[0] : accountRows;
        if (active) setOperatorId(account?.id || null);
      } catch (err) {
        console.error('Unable to load operator session data', err);
        if (active) {
          setOperatorId(null);
        }
      } finally {
        if (active) setOpLoading(false);
      }
    })();

    (async () => {
      try {
        const { data } = await supabase.rpc('get_current_unlock_tariff');
        const row = Array.isArray(data) ? data[0] : data;
        if (active) setTariff(row && typeof row === 'object' ? row : null);
      } catch (err) {
        console.error('Unable to load unlock tariff', err);
        if (active) setTariff(null);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const fetchContactsAccess = useCallback(async () => {
    if (!athleteId || !operatorId) {
      if (!operatorId && !opLoading) {
        setContactsLoading(false);
        setContactsData(null);
      }
      return;
    }

    setContactsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || null;
      const response = await fetch(`/api/operator/athlete-contacts?athleteId=${encodeURIComponent(athleteId)}`, {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(payload?.error || 'Unable to load contact bundle.');
        if (payload?.code) error.code = payload.code;
        throw error;
      }
      setContactsData(payload || null);
    } catch (err) {
      console.error('Unable to load contact bundle', err);
      setContactsData(null);
    } finally {
      setContactsLoading(false);
    }
  }, [athleteId, operatorId, opLoading]);

  useEffect(() => {
    if (!athleteId) return;
    if (!operatorId) {
      if (!opLoading) {
        setContactsData(null);
        setContactsLoading(false);
      }
      return;
    }
    fetchContactsAccess();
  }, [athleteId, operatorId, opLoading, fetchContactsAccess]);

  const fetchWallet = useCallback(async ({ skipLoadingState = false } = {}) => {
    if (!isMountedRef.current) return;

    if (!operatorId) {
      setWallet({ id: null, balance_credits: null, updated_at: null, loading: false });
      return;
    }

    if (!skipLoadingState) {
      setWallet((prev) => ({ ...prev, loading: true }));
    }

    try {
      const { data: walletRow, error: walletError } = await supabase
        .from('op_wallet')
        .select('id:op_id, balance_credits, updated_at')
        .eq('op_id', operatorId)
        .maybeSingle();

      let resolvedRow = walletRow;

      if (walletError && walletError.code !== 'PGRST116') {
        throw walletError;
      }

      if (walletError && walletError.code === 'PGRST116') {
        const { data: walletRows, error: walletFallbackError } = await supabase
          .from('op_wallet')
          .select('id:op_id, balance_credits, updated_at')
          .eq('op_id', operatorId)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .limit(1);
        if (walletFallbackError) throw walletFallbackError;
        resolvedRow = Array.isArray(walletRows) ? walletRows[0] : walletRows || null;
      }

      if (!isMountedRef.current) return;

      const rawBalance = resolvedRow?.balance_credits;
      const numericBalance = typeof rawBalance === 'number'
        ? rawBalance
        : Number(rawBalance);

      setWallet({
        id: resolvedRow?.id || null,
        balance_credits: Number.isFinite(numericBalance) ? numericBalance : 0,
        updated_at: resolvedRow?.updated_at || null,
        loading: false,
      });
    } catch (err) {
      console.error('Unable to load wallet balance', err);
      if (!isMountedRef.current) return;
      setWallet((prev) => ({ ...prev, loading: false }));
    }
  }, [operatorId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const performUnlock = useCallback(async () => {
    if (!athleteId || !operatorId || unlocking) return;

    setUnlockConfirm({ open: false, credits: 0 });
    setUnlockError({ message: '', reason: '' });
    setUnlocking(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || null;

      const response = await fetch('/api/operator/unlock-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ athleteId }),
      });

      const payload = await response.json();

      if (!response.ok) {
        if (payload?.code === 'insufficient_credits') {
          setUnlockError({
            message: 'Crediti insufficienti. Vai al wallet per ricaricare e riprova.',
            reason: 'insufficient_credits',
          });
          return;
        }

        setUnlockError({ message: payload?.error || 'Errore durante lo sblocco.', reason: 'generic' });
        return;
      }

      await fetchContactsAccess();
      await fetchWallet({ skipLoadingState: true });
    } catch (err) {
      setUnlockError({ message: err.message || 'Errore durante lo sblocco.', reason: 'generic' });
    } finally {
      setUnlocking(false);
    }
  }, [athleteId, operatorId, unlocking, fetchContactsAccess, fetchWallet]);

  /* --------------- Derived data --------------- */
  const combinedName = `${contactsData?.first_name || ''} ${contactsData?.last_name || ''}`.trim();
  const effectiveName = combinedName || '—';
  const isUnlocked = !!contactsData?.unlocked;
  const unlockExpiresAt = contactsData?.expires_at || null;
  const parseCredits = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Number.isInteger(numeric) ? numeric : Math.round(numeric * 100) / 100;
  };
  const parseValidity = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.round(numeric));
  };
  const unlockCost = parseCredits(tariff?.credits_cost ?? tariff?.creditsCost ?? tariff?.credits);
  const unlockValidity = parseValidity(tariff?.validity_days ?? tariff?.validityDays ?? tariff?.validity);
  const avatarLabel = isUnlocked && effectiveName !== '—' ? effectiveName : 'Athlete';
  const age = calcAge(athlete?.date_of_birth);
  const natFlag = flagFromCountry(athlete?.nationality) || '';
  const completion = clamp(athlete?.completion_percentage, 0, 100);
  const currentSeason = (career||[]).find(c => c.is_current) || null;
  const residenceCity = contactMeta?.residence_city || '';
  const residenceCountry = contactMeta?.residence_country || '';
  const residenceDisplay = residenceCity || residenceCountry
    ? `${residenceCity || '—'}, ${residenceCountry || '—'}`
    : '—';
  const phoneVerified = !!contactMeta?.phone_verified;
  const idVerified = !!contactMeta?.id_verified;
  const contactEmail = contactsData?.email || '';
  const contactPhone = contactsData?.phone || '';

  const formatExpiry = useCallback((iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return String(iso);
    }
  }, []);

  const handleUnlockRequest = useCallback(() => {
    if (!athleteId || !operatorId || unlocking) return;

    if (typeof unlockCost === 'number' && Number.isFinite(unlockCost) && unlockCost > 0) {
      setUnlockConfirm({ open: true, credits: unlockCost });
      return;
    }

    performUnlock();
  }, [athleteId, operatorId, unlocking, unlockCost, performUnlock]);

  const handleCancelUnlock = useCallback(() => {
    setUnlockConfirm({ open: false, credits: 0 });
  }, []);

  const handleConfirmUnlock = useCallback(() => {
    performUnlock();
  }, [performUnlock]);

  // Avatar: profile -> featured headshot -> initials
  const [avatarUrl, setAvatarUrl] = useState('');
  useEffect(() => { (async () => {
    const raw = athlete?.profile_picture_url || media.featured?.head?.storage_path || '';
    setAvatarUrl(raw ? (isHttp(raw) ? raw : await getSigned(BUCKET_MEDIA, raw)) : '');
  })(); }, [athlete?.profile_picture_url, media.featured?.head?.storage_path]);

  const socialSorted = useMemo(() => {
    if (!contactsData?.unlocked) return [];
    const rows = Array.isArray(contactsData?.socials) ? contactsData.socials : [];
    const rank = (u='') => { const s=String(u).toLowerCase();
      if (s.includes('instagram')) return 1; if (s.includes('youtube')) return 2;
      if (s.includes('x.com')||s.includes('twitter')) return 3; if (s.includes('tiktok')) return 4;
      if (s.includes('facebook')) return 5; if (s.includes('linkedin')) return 6; return 99; };
    const normalized = rows
      .map((entry, idx) => {
        const url = entry?.url || entry?.profile_url || '';
        return {
          key: entry?.id || `${entry?.platform || 'social'}-${idx}`,
          platform: entry?.platform || 'Profile',
          url,
          handle: entry?.handle || '',
        };
      })
      .filter((entry) => entry.url);
    return normalized.sort((a, b) => rank(a.url) - rank(b.url));
  }, [contactsData]);

  const handleMessageClick = useCallback(() => {
    if (!isUnlocked) return;
    router.push({
      pathname: '/operator-dashboard',
      query: { section: 'messages', athleteId },
    });
  }, [isUnlocked, router, athleteId]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace('/login-operator');
  }, [router]);

  const renderProtected = (value, srLabel) => {
    if (isUnlocked) return value || '—';
    if (contactsLoading) return 'Loading…';
    const safe = value || '••••••';
    return (
      <>
        <span style={S.blur} aria-hidden="true">{safe}</span>
        <span style={S.srOnly}>{srLabel}</span>
      </>
    );
  };

  /* --------------- Inline styles (consistent) --------------- */
  const S = {
    page:{
      minHeight:'100vh',
      background:'#F6F7FB',
      color:'#0F172A',
      display:'flex',
      flexDirection:'column',
    },
    header:{
      display:'flex',
      alignItems:'center',
      justifyContent:'space-between',
      padding:'16px 24px',
      background:'#FFFFFF',
      borderBottom:'1px solid #E5E7EB',
      position:'sticky',
      top:0,
      zIndex:10,
      fontFamily:'Inter, sans-serif',
    },
    headerMobile:{ flexWrap:'wrap', rowGap:12 },
    headerLeft:{ display:'flex', alignItems:'center', gap:12, minWidth:0 },
    headerLeftMobile:{ flex:'1 1 100%' },
    logo:{ width:48, height:48, objectFit:'contain' },
    headerTitle:{ fontSize:18, fontWeight:700, margin:0, color:'#0F172A', lineHeight:1.2 },
    headerSubtitle:{ fontSize:13, color:'#4B5563', margin:'4px 0 0 0', lineHeight:1.3 },
    headerRight:{ display:'flex', alignItems:'center', gap:12, justifyContent:'flex-end', flexWrap:'wrap' },
    headerRightMobile:{ flex:'1 1 100%', justifyContent:'flex-end' },
    walletBadge:{
      display:'grid',
      gap:4,
      padding:'8px 14px',
      borderRadius:12,
      background:'linear-gradient(120deg, rgba(39,227,218,0.16), rgba(247,184,78,0.18))',
      border:'1px solid rgba(39,227,218,0.25)',
      minWidth:120,
      textAlign:'right',
      boxShadow:'0 12px 30px -18px rgba(39,227,218,0.5)',
    },
    walletBadgeLabel:{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:'#0F172A' },
    walletBadgeValue:{ fontSize:18, fontWeight:700, color:'#0F172A' },
    userEmail:{ fontSize:13, color:'#4B5563', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:180 },
    signOutBtn:{
      background:'linear-gradient(90deg, #27E3DA, #F7B84E)',
      border:'none',
      color:'#fff',
      fontWeight:600,
      padding:'10px 18px',
      borderRadius:999,
      cursor:'pointer',
    },
    container:{
      maxWidth:1280,
      margin:'0 auto',
      padding: isMobile ? '32px clamp(16px, 5vw, 56px)' : '40px clamp(16px, 5vw, 56px)',
      boxSizing:'border-box',
      display:'flex',
      justifyContent:'center',
    },
    card:{
      width:'100%',
      maxWidth:1040,
      borderRadius:16,
      boxShadow:'0 8px 24px rgba(0,0,0,0.08)',
      background:'#fff',
      overflow:'hidden'
    },
    hero:{
      display:'grid',
      gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr',
      gap: isMobile ? 20 : 16,
      padding: isMobile ? 20 : 16,
      alignItems:'center',
      justifyItems: isMobile ? 'center' : 'stretch',
      borderBottom:'1px solid #eee',
      textAlign: isMobile ? 'center' : 'left'
    },
    heroContent:{
      display:'flex',
      flexDirection:'column',
      gap:12,
      alignItems: isMobile ? 'center' : 'flex-start',
      textAlign: isMobile ? 'center' : 'left',
      width:'100%'
    },
    avatar:{ width:96, height:96, borderRadius:'50%', objectFit:'cover', display:'block', border:'2px solid #fff', boxShadow:'0 2px 8px rgba(0,0,0,0.12)' },
    avatarFallback:{ width:96, height:96, borderRadius:'50%', display:'grid', placeItems:'center', background:'linear-gradient(135deg,#27E3DA,#F7B84E)', color:'#111', fontSize:28 },
    h1:{ fontSize:22, lineHeight:1.15, fontWeight:900, margin:0, textAlign: isMobile ? 'center' : 'left' },
    chips:{ display:'flex', gap:8, flexWrap:'wrap', justifyContent: isMobile ? 'center' : 'flex-start' },
    chip:{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:999, border:'1px solid #e5e7eb', background:'#fff', fontSize:12 },
    progressRow:{
      display:'grid',
      gridTemplateColumns: isMobile ? 'auto' : 'auto 1fr auto',
      gap:8,
      alignItems:'center',
      justifyItems: isMobile ? 'center' : 'stretch',
      marginTop:2,
      textAlign: isMobile ? 'center' : 'left'
    },
    progressBar:{ height:8, borderRadius:999, background:'#eee', overflow:'hidden', width: isMobile ? '100%' : 'auto' },
    progressFill:{ height:'100%', background:'linear-gradient(90deg,#27E3DA,#F7B84E)' },
    progressPct:{ fontSize:12, color:'#666' },

    unlockRow:{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginTop:12, justifyContent: isMobile ? 'center' : 'flex-start' },
    unlockBtn:{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius:10, border:'1px solid #e5e7eb', background:'linear-gradient(120deg, rgba(39,227,218,0.25), rgba(247,184,78,0.25))', fontWeight:700, color:'#0f172a', cursor:'pointer', boxShadow:'0 12px 28px -18px rgba(15,23,42,0.45)' },
    unlockBtnDisabled:{ opacity:0.6, cursor:'not-allowed', boxShadow:'none' },
    unlockBadge:{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:999, background:'linear-gradient(120deg, rgba(134,239,172,0.45), rgba(22,163,74,0.35))', color:'#166534', fontWeight:700, fontSize:12 },
    unlockMeta:{ fontSize:12, color:'#475569', fontWeight:600, textAlign: isMobile ? 'center' : 'left' },
    unlockError:{ marginTop:8, display:'inline-flex', flexWrap:'wrap', gap:8, alignItems:'center', justifyContent: isMobile ? 'center' : 'flex-start', background:'rgba(250,204,21,0.15)', border:'1px solid rgba(250,204,21,0.35)', color:'#b45309', padding:'8px 12px', borderRadius:12, fontSize:12, fontWeight:600, textAlign: isMobile ? 'center' : 'left' },
    walletLink:{ color:'#0f172a', textDecoration:'underline' },
    messageBtn:{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, border:'1px solid #e5e7eb', background:'#fff', fontWeight:700, color:'#0f172a', cursor:'pointer', boxShadow:'0 10px 24px -18px rgba(15,23,42,0.32)' },
    blur:{ filter:'blur(7px)' },

    colA:{ display:'flex', flexDirection:'column', gap:24 },
    colB:{ display:'flex', flexDirection:'column', gap:24 },

    loaderContainer:{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, padding:48, textAlign:'center', minHeight:'calc(100vh - 32px)', width:'100%' },
    spinner:{ width:48, height:48, borderRadius:'50%', border:'4px solid #27E3DA', borderTopColor:'#F7B84E', animation:'profilePreviewSpin 1s linear infinite' },
    srOnly:{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 },

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

    modalOverlay:{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', zIndex:60, display:'grid', placeItems:'center', padding:24 },
    modalPanel:{ width:'min(420px, 92vw)', background:'#fff', borderRadius:20, boxShadow:'0 32px 80px -34px rgba(15,23,42,0.65)', padding:28, display:'grid', gap:18, fontFamily:'Inter, sans-serif' },
    modalIcon:{ width:56, height:56, borderRadius:999, background:'linear-gradient(135deg, rgba(39,227,218,0.18), rgba(247,184,78,0.18))', display:'grid', placeItems:'center', color:'#0F172A' },
    modalTitle:{ fontSize:18, fontWeight:800, margin:0, color:'#0F172A' },
    modalBody:{ fontSize:14, lineHeight:1.55, color:'#475569', margin:0 },
    modalHighlight:{ fontWeight:700, color:'#0F172A' },
    modalActions:{ display:'flex', justifyContent:'flex-end', gap:12, flexWrap:'wrap', marginTop:4 },
    modalSecondary:{ padding:'10px 18px', borderRadius:999, border:'1px solid rgba(148,163,184,0.4)', background:'#fff', color:'#0F172A', fontWeight:600, cursor:'pointer' },
    modalPrimary:{ padding:'10px 20px', borderRadius:999, border:'none', background:'linear-gradient(135deg, #27E3DA, #F7B84E)', color:'#0F172A', fontWeight:700, cursor:'pointer', boxShadow:'0 20px 45px -30px rgba(15,23,42,0.65)' },
    modalPrimaryDisabled:{ opacity:0.6, cursor:'not-allowed', boxShadow:'none' },
  };

  const mainCard = loading
    ? (
      <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={S.loaderContainer} role="status" aria-live="polite">
          <div style={S.spinner} aria-hidden="true" />
          <span style={S.srOnly}>Loading profile…</span>
        </div>
      </div>
    )
    : (
      <div style={S.card}>

        {/* Compact HERO */}
        <section style={S.hero} aria-label="Profile header">
          {avatarUrl
            ? <img src={avatarUrl} alt={`${avatarLabel} avatar`} style={S.avatar}/>
            : <div style={S.avatarFallback}>{initials(avatarLabel)}</div>
          }
          <div style={S.heroContent}>
            <h1 style={S.h1}>
              {contactsLoading ? (
                <span>Loading…</span>
              ) : isUnlocked ? (
                effectiveName
              ) : (
                <>
                  <span style={S.blur} aria-hidden="true">{effectiveName === '—' ? 'Restricted data' : effectiveName}</span>
                  <span style={S.srOnly}>Name hidden — unlock the profile to view it</span>
                </>
              )}
            </h1>
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

            <div style={S.unlockRow}>
              {isUnlocked ? (
                <div style={S.unlockBadge} role="status" aria-live="polite">
                  Unlocked ✓ — expires on {formatExpiry(unlockExpiresAt) || '—'}
                </div>
              ) : (
                <button
                  type="button"
                  style={{
                    ...S.unlockBtn,
                    ...((unlocking || contactsLoading || !operatorId || opLoading) ? S.unlockBtnDisabled : null),
                  }}
                  onClick={handleUnlockRequest}
                  disabled={unlocking || contactsLoading || !operatorId || opLoading}
                >
                  <ShoppingCart size={16} />
                  <span>
                    Unlock contacts — {unlockCost != null ? `${unlockCost} credits` : '—'}
                  </span>
                </button>
              )}

              <button
                type="button"
                style={{
                  ...S.messageBtn,
                  ...(isUnlocked ? null : S.unlockBtnDisabled),
                }}
                onClick={handleMessageClick}
                disabled={!isUnlocked}
                aria-disabled={!isUnlocked}
              >
                <MessageCircle size={16} />
                <span>Message</span>
              </button>
            </div>

            {unlockError.message && (
              <div style={S.unlockError} role="alert">
                <span>{unlockError.message}</span>
                {unlockError.reason === 'insufficient_credits' && (
                  <a href="/operator-dashboard?section=wallet" style={S.walletLink}>Vai al wallet</a>
                )}
              </div>
            )}
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
                <Info label="Residence" value={residenceDisplay}/>
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
                <Fact label="Dominant hand" value={physical?.dominant_hand || '—'} icon={<Hand size={16}/>}/>
                <Fact label="Dominant foot" value={physical?.dominant_foot || '—'} icon={<Footprints size={16}/>}/>
                <Fact label="Dominant eye"  value={physical?.dominant_eye  || '—'} icon={<Activity size={16}/>}/>
              </div>
              {renderMeasures(physical)}
            </section>

            {/* SOCIAL */}
            <section style={S.section} aria-label="Social">
              <div style={S.titleRow}><Globe size={18}/><h2 style={S.h2}>Social</h2></div>
              {contactsLoading ? (
                <div style={S.empty}>Loading…</div>
              ) : isUnlocked ? (
                socialSorted.length ? (
                  <div style={{ display:'grid', gap:8 }}>
                    {socialSorted.map(s => (
                      <a key={s.key} href={s.url} target="_blank" rel="noreferrer" style={S.socialItem}>
                        <span style={{ color:'#111', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {s.platform}
                          {s.handle ? ` · ${s.handle}` : ''}
                        </span>
                        <ExternalLink size={16} style={{ marginLeft:'auto', color:'#1976d2' }}/>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={S.empty}>—</div>
                )
              ) : (
                <div style={S.empty}>
                  <span style={S.blur} aria-hidden="true">Social profiles hidden</span>
                  <span style={S.srOnly}>Social profiles hidden — unlock to view them</span>
                </div>
              )}
            </section>

              {/* CONTACTS */}
              <section style={S.section} aria-label="Contacts">
              <div style={S.titleRow}><Phone size={18}/><h2 style={S.h2}>Contacts</h2></div>
              <div style={{ display:'grid', gap:10 }}>
                <div style={S.row}>
                  <Mail size={16}/>
                  {renderProtected(contactEmail, 'Email hidden — unlock to view it')}
                </div>
                <div style={S.row}>
                  <Phone size={16}/>
                  {renderProtected(contactPhone, 'Phone number hidden — unlock to view it')}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ ...S.badge, background: phoneVerified ? '#dcfce7' : '#f3f4f6' }}><CheckCircle size={14}/> Phone {phoneVerified ? 'verified' : 'not verified'}</span>
                  <span style={{ ...S.badge, background: idVerified ? '#dcfce7' : '#f3f4f6' }}><ShieldCheck size={14}/> ID {idVerified ? 'verified' : 'not verified'}</span>
                </div>
                <div style={S.small}>Residence: {residenceDisplay}</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );

  const headerStyle = { ...S.header, ...(isMobile ? S.headerMobile : null) };
  const headerLeftStyle = { ...S.headerLeft, ...(isMobile ? S.headerLeftMobile : null) };
  const headerRightStyle = { ...S.headerRight, ...(isMobile ? S.headerRightMobile : null) };
  const walletDisplay = wallet.loading ? '…' : formatCredits(wallet.balance_credits);
  const authEmail = authUser?.email || '—';

  return (
    <div style={S.page}>
      <header style={headerStyle}>
        <div style={headerLeftStyle}>
          <img src="/logo-talentlix.png" alt="TalentLix" style={S.logo} />
          <div>
            <div style={S.headerTitle}>Operator dashboard</div>
            <p style={S.headerSubtitle}>Manage your organisation and talent activities.</p>
          </div>
        </div>
        <div style={headerRightStyle}>
          <div style={S.walletBadge}>
            <span style={S.walletBadgeLabel}>Wallet credits</span>
            <span style={S.walletBadgeValue} aria-live="polite">{walletDisplay}</span>
          </div>
          <span style={S.userEmail}>{authEmail}</span>
          <button type="button" style={S.signOutBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <div style={S.container}>
        {mainCard}
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

      {unlockConfirm.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlock-confirm-title"
          aria-describedby="unlock-confirm-desc"
          style={S.modalOverlay}
          onClick={handleCancelUnlock}
        >
          <div style={S.modalPanel} onClick={(event) => event.stopPropagation()}>
            <div style={S.modalIcon} aria-hidden="true">
              <Unlock size={24} />
            </div>
            <div>
              <h2 id="unlock-confirm-title" style={S.modalTitle}>Unlock contacts</h2>
              <p id="unlock-confirm-desc" style={S.modalBody}>
                Unlocking this talent&apos;s contacts will deduct
                {' '}<strong style={S.modalHighlight}>{formatCredits(unlockConfirm.credits)} credits</strong>{' '}
                from your wallet. Do you want to continue?
              </p>
            </div>
            <div style={S.modalActions}>
              <button type="button" style={S.modalSecondary} onClick={handleCancelUnlock}>
                Cancel
              </button>
              <button
                type="button"
                style={{
                  ...S.modalPrimary,
                  ...(unlocking ? S.modalPrimaryDisabled : null),
                }}
                onClick={handleConfirmUnlock}
                disabled={unlocking}
              >
                Confirm purchase
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Minimal responsiveness */}
      <style jsx>{`
        @keyframes profilePreviewSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .mainGrid {
          display: grid;
          gap: 24px;
          padding: clamp(16px, 4vw, 32px);
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
        <div style={{ width:'100%', maxWidth: 520, margin:'0 auto' }}>
        <div style={{ position:'relative', width:'100%', paddingTop:'56.25%', borderRadius:12, overflow:'hidden', background:'#000', marginBottom: 10 }}>
          <iframe title={item.title||'Intro'} src={embedUrl(item.external_url)} style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:0 }} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
        </div>
      </div>
    );
  }
  return (
      <div style={{ width:'100%', maxWidth: 520, margin:'0 auto' }}>
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

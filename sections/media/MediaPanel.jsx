// sections/media/MediaPanel.jsx
// Card "Media" — TalentLix
// UI e UX allineate a Personal/Contacts/Sports: stessa Save Bar, stessi token, stesso comportamento.
// Requisiti/limiti implementati come da schema definitivo fornito dall'utente.
//
// Dipendenze già presenti nel progetto (come in SportInfoPanel):
// - react, next
// - supabase client centralizzato in utils/supabaseClient
// - react-select/creatable (per i tag)
// Non usa librerie DnD esterne: drag&drop HTML5 semplice per Gallery/Highlights.

import { useEffect, useMemo, useRef, useState } from 'react';
import CreatableSelect from 'react-select/creatable';
import { supabase as sb } from '../../utils/supabaseClient';

const supabase = sb;

// ------------------------------ COSTANTI & LIMITI ------------------------------
const BUCKET = 'media';

// CAP rigidi
const CAP = {
  FEATURED: 3,
  GALLERY: 6,
  HIGHLIGHTS: 3,
  GAMES: 10,
};

// Categorie (vincolo logico lato UI: 1 record per featured_* e intro)
const CAT = {
  FEATURED_HEAD: 'featured_headshot',
  FEATURED_G1:   'featured_game1',
  FEATURED_G2:   'featured_game2',
  GALLERY:       'gallery',
  INTRO:         'intro',
  HIGHLIGHT:     'highlight',
  GAME:          'game',
};

// Limiti qualitativi definitivi
const LIM = {
  PHOTO_MAX_MB: 25,
  INTRO_MAX_MB: 800,
  INTRO_MAX_SEC: 120,
  HL_MAX_MB: 2000,    // 2.0 GB in MB
  HL_MAX_SEC: 300,    // 5 min
  MAX_DIM_PX: 4096,   // check "≤4K": dimensione massima lato lungo
};

// File type consentiti
const IMG_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VID_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

// ------------------------------ HELPER: stile coerente (copy token) ------------------------------
// Stili uniformi (coerenti con SportInfoPanel/ContactsPanel e Linee guida Save)
const styles = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 },
  gridMobile: { gridTemplateColumns: '1fr' },
  sectionTitle: { fontSize: 16, fontWeight: 700, margin: '6px 0 2px' },
  subnote: { fontSize: 12, color: '#666', marginBottom: 6 },

  field: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  fieldRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  label: { fontSize: 13, fontWeight: 600 },
  input: {
    width: '100%',
    height: 42,
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF'
  },
  textarea: {
    minHeight: 70,
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF'
  },
  error: { fontSize: 12, color: '#b00' },

  // Bottoni piccoli / principali (coerenti)
  smallBtn: {
    height: 32, padding: '0 12px', borderRadius: 8,
    border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer', fontWeight: 600
  },
  smallBtnPrimary: {
    height: 32, padding: '0 12px', borderRadius: 8,
    border: 'none', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff', cursor: 'pointer', fontWeight: 600
  },
  linkBtn: {
    background: 'transparent', border: 'none', padding: 0, color: '#1976d2',
    cursor: 'pointer', fontWeight: 600
  },

  // Pulsanti Add disabilitati a cap
  smallBtnDisabled: {
    height: 32, padding: '0 12px', borderRadius: 8,
    background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed', fontWeight: 600
  },

  // Card contenitore sezioni
  box: { gridColumn: '1 / -1', border: '1px solid #EEE', borderRadius: 10, background: '#FFF', padding: 12 },
  boxGrid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  boxGridMobile: { gridTemplateColumns: '1fr' },
  gameForm: { display: 'grid', gridTemplateColumns: '150px 1fr', columnGap: 16, rowGap: 12 },

  // Featured 3 slot
  featuredWrap: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  featuredSlot: {
    border: '1px solid #EEE', borderRadius: 10, padding: 10,
    display: 'flex', flexDirection: 'column', gap: 8, background: '#FFF'
  },
  featuredPreview: {
    width: '100%',
    maxWidth: 200,
    aspectRatio: '4 / 3',
    background: '#F7F7F7',
    border: '1px solid #EEE',
    borderRadius: 10,
    objectFit: 'cover',
    margin: '0 auto'
  },

  // Player video
  mediaPreview: {
    width: '100%',
    maxWidth: 320,
    aspectRatio: '16 / 9',
    background: '#000',
    border: '1px solid #EEE',
    borderRadius: 10,
    objectFit: 'cover',
    overflow: 'hidden',
    display: 'block',
    margin: '0 auto'
  },
  videoRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },

  // Liste
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { border: '1px solid #EEE', borderRadius: 10, padding: 10, background: '#FFF' },
  itemHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemTitle: { fontWeight: 700, fontSize: 14 },
  itemMeta: { fontSize: 12, color: '#666' },

  // Gallery table
  galleryTableWrap: { overflowX: 'auto', border: '1px solid #EEE', borderRadius: 10, background: '#FFF' },
  galleryTable: { width: '100%', borderCollapse: 'separate', borderSpacing: 0 },
  galleryTh: { textAlign: 'left', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE', whiteSpace: 'nowrap' },
  galleryThRight: { textAlign: 'right', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE' },
  galleryTd: { fontSize: 14, padding: '10px 12px', borderBottom: '1px solid #F5F5F5', verticalAlign: 'top' },
  galleryThumbCell: { width: 80, textAlign: 'center' },
  galleryTitleCell: { width: '20%', minWidth: 160 },
  galleryCaptionCell: { width: '30%', minWidth: 240 },
  galleryTagsCell: { width: '30%', minWidth: 200 },
  galleryActionCell: { textAlign: 'right', whiteSpace: 'nowrap' },

  // Table (games)
  tableWrap: { overflowX: 'auto', border: '1px solid #EEE', borderRadius: 10, background: '#FFF' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0 },
  th: { textAlign: 'left', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE', whiteSpace: 'nowrap' },
  thRight: { textAlign: 'right', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE' },
  thMobile: { padding: '12px 20px', minWidth: 180 },
  td: { fontSize: 14, padding: '10px 12px', borderBottom: '1px solid #F5F5F5', verticalAlign: 'top' },
  tdMobile: { padding: '12px 20px', minWidth: 180 },

  // Mobile accordion (games)
  gameCard: { border: '1px solid #EEE', borderRadius: 12, marginBottom: 8, background: '#FFF' },
  gameSummary: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px', background: 'transparent', border: 'none', textAlign: 'left',
    cursor: 'pointer', minHeight: 56,
  },
  gameDate: { fontSize: 16, fontWeight: 600, color: '#111827' },
  gameText: {
    flex: 1, fontSize: 14, color: '#111827', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 8,
  },
  gameChevron: { width: 16, height: 16, transition: 'transform 0.2s', flexShrink: 0 },
  gameDetails: { padding: 12, borderTop: '1px solid #EEE', display: 'flex', flexDirection: 'column', gap: 8 },
  gameActions: { display: 'flex', gap: 8, marginTop: 8 },

  // Drag handle + area drop
  draggable: { cursor: 'grab' },
  droptarget: { outline: '2px dashed rgba(39,227,218,0.5)' },

  // Save Bar (immutabile)
  saveBar: {
    gridColumn: '1 / -1',
    display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12,
    justifyContent: 'flex-end', flexWrap: 'nowrap'
  },
  saveBtn: { height: 38, padding: '0 16px', borderRadius: 8, fontWeight: 600, border: 'none' },
  saveBtnEnabled: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', cursor: 'pointer' },
  saveBtnDisabled: { background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed' },
  statusTextOK: { marginLeft: 10, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', color: '#2E7D32' },
  statusTextERR:{ marginLeft: 10, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', color: '#b00' },
};

// ------------------------------ UTILS ------------------------------
const nowTs = () => Date.now();
const bytesToMB = (b) => Math.round((Number(b || 0) / (1024 * 1024)) * 10) / 10;
const isImageFile = (f) => IMG_TYPES.has(f?.type || '');
const isVideoFile = (f) => VID_TYPES.has(f?.type || '');
const getExt = (name = '') => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
const isHttpUrl = (u = '') => /^https?:\/\//i.test(String(u || ''));

// Provider link parsing
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
  if (!url) return null;
  // Match vimeo.com/<id>  (id numerico); gestione base
  const m = String(url).match(/vimeo\.com\/(\d+)/i);
  return m ? m[1] : null;
};
const detectPlatform = (url) => {
  const s = String(url || '').toLowerCase();
  if (s.includes('youtu.be') || s.includes('youtube.com')) return 'youtube';
  if (s.includes('vimeo.com')) return 'vimeo';
  return '';
};
const youTubeThumb = (id) => id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';

// Signed URL cache (60s)
const useSignedUrlCache = () => {
  const cacheRef = useRef(new Map()); // key -> { url, exp }
  const get = async (storagePath) => {
    if (!storagePath) return '';
    const now = Date.now();
    const hit = cacheRef.current.get(storagePath);
    if (hit && hit.exp > now + 2000) return hit.url;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error) return '';
    const url = data?.signedUrl || '';
    cacheRef.current.set(storagePath, { url, exp: now + 55_000 });
    return url;
  };
  return get;
};

// Carica dimensioni foto
const readImageDims = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    URL.revokeObjectURL(url);
    resolve({ width: w, height: h });
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: null, height: null }); };
  img.src = url;
});

// Carica meta video + (opzionale) thumbnail client-side al sec 1
const readVideoMetaAndThumb = ({ file, captureThumb = true, targetLongSide = 1280 }) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    v.onloadedmetadata = async () => {
      const duration = Math.round(v.duration || 0);
      const width = v.videoWidth || null;
      const height = v.videoHeight || null;

      // Clip al secondo 1 per catturare poster
      const doCapture = async () => {
        try {
          v.currentTime = Math.min(1, (duration || 1) * 0.1);
        } catch {
          finalize(null);
        }
      };

      const finalize = (blob) => {
        URL.revokeObjectURL(url);
        resolve({ duration, width, height, thumbBlob: blob || null });
      };

      if (!captureThumb) return finalize(null);

      v.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = (width && height)
            ? (width >= height ? targetLongSide / width : targetLongSide / height)
            : 1;
          canvas.width = Math.round((width || 1280) * scale);
          canvas.height = Math.round((height || 720) * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => finalize(blob), 'image/jpeg', 0.8);
        } catch {
          finalize(null);
        }
      };
      // Avvia capture
      doCapture();
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve({ duration: 0, width: null, height: null, thumbBlob: null }); };
  });

// Upload Blob in storage
const uploadBlob = async (path, blob) => {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true });
  if (error) throw error;
  return path;
};

// Rimozione sicura storage (ignora errori)
const removeStorageIfAny = async (path) => {
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch {}
};

// Comandi DB
const TBL_MEDIA = 'media_item';
const TBL_GAME_META = 'media_game_meta';

// Ordinamento helper
const sortByOrder = (a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
const sortGamesDesc = (a, b) => {
  const da = a?.game?.match_date || '';
  const db = b?.game?.match_date || '';
  return db.localeCompare(da);
};

// ------------------------------ COMPONENTE ------------------------------
export default function MediaPanel({ athlete, onSaved, isMobile }) {
  const getSignedUrl = useSignedUrlCache();

  // ---------------- STATE BASE ----------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState({ type: '', msg: '' });
  const [dirty, setDirty]     = useState(false);

  // Data snapshot (per confronto)
  const [snapshot, setSnapshot] = useState({
    featured: { head: null, g1: null, g2: null }, // media_item
    intro: null,                                   // media_item
    gallery: [],                                   // media_item[]
    highlights: [],                                // media_item[] (upload o link)
    games: []                                      // [{ item: media_item, game: meta }]
  });

  // Working state (editabile)
  const [featured, setFeatured]     = useState({ head: null, g1: null, g2: null });
  const [intro, setIntro]           = useState(null);
  const [gallery, setGallery]       = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [games, setGames]           = useState([]);
  const [openGameId, setOpenGameId] = useState(null);

  // UI stati locali (add forms)
  const headInputRef = useRef(null);
  const g1InputRef   = useRef(null);
  const g2InputRef   = useRef(null);
  const galleryInputRef = useRef(null);
  const introInputRef   = useRef(null);
  const hlUploadInputRef = useRef(null);

  const [addLinkHL, setAddLinkHL] = useState({ url: '', err: '' });
  const [addGame, setAddGame] = useState({
    url: '', match_date: '', opponent: '', competition: '', season: '', team_level: '', err: ''
  });

  // Drag&Drop stato
  const [drag, setDrag] = useState({ type: '', from: -1, to: -1 });

  // ---------------- INIT LOAD ----------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!athlete?.id) return;
      setLoading(true);
      try {
        // carica tutti i media dell'atleta
        const { data: rows, error } = await supabase
          .from(TBL_MEDIA)
          .select('*')
          .eq('athlete_id', athlete.id);
        if (error) throw error;

        const byCat = (c) => (rows || []).filter(r => (r.category || '') === c);
        const oneCat = (c) => (rows || []).find(r => (r.category || '') === c) || null;

        const head = oneCat(CAT.FEATURED_HEAD);
        const g1   = oneCat(CAT.FEATURED_G1);
        const g2   = oneCat(CAT.FEATURED_G2);
        const introRow = oneCat(CAT.INTRO);

        const gal = byCat(CAT.GALLERY).sort(sortByOrder);
        const hls = byCat(CAT.HIGHLIGHT).sort(sortByOrder);

        const gamesRows = byCat(CAT.GAME) || [];
        let gm = [];
        if (gamesRows.length) {
          const ids = gamesRows.map(r => r.id);
          const { data: metas, error: e2 } = await supabase
            .from(TBL_GAME_META)
            .select('*')
            .in('media_item_id', ids);
          if (e2) throw e2;
          const metaBy = new Map((metas || []).map(m => [m.media_item_id, m]));
          gm = gamesRows.map(r => ({ item: r, game: metaBy.get(r.id) || {} }))
                        .sort(sortGamesDesc);
        }

        const snap = {
          featured: { head, g1, g2 },
          intro: introRow,
          gallery: gal,
          highlights: hls,
          games: gm
        };

        if (!mounted) return;
        setSnapshot(snap);
        setFeatured({ head, g1, g2 });
        setIntro(introRow);
        setGallery(gal);
        setHighlights(hls);
        setGames(gm);
        setDirty(false);
        setStatus(s => s); // non resettiamo per coerenza con linee guida
      } catch (e) {
        console.error(e);
        if (mounted) setStatus({ type: 'error', msg: 'Load failed' });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [athlete?.id]);

  // ---------------- VALIDAZIONI PRE-CHECK ----------------
  const checkPhoto = (file) => {
    if (!isImageFile(file)) return `Invalid format. Allow JPG/PNG/WEBP.`;
    const mb = bytesToMB(file.size);
    if (mb > LIM.PHOTO_MAX_MB) return `File too large (${mb}MB). Max ${LIM.PHOTO_MAX_MB}MB.`;
    return '';
  };
  const checkVideo = (file, kind) => {
    if (!isVideoFile(file)) return `Invalid format. Allow MP4/MOV/WEBM.`;
    const mb = bytesToMB(file.size);
    if (kind === 'intro' && mb > LIM.INTRO_MAX_MB) return `File too large (${mb}MB). Max ${LIM.INTRO_MAX_MB}MB.`;
    if (kind === 'highlight' && mb > LIM.HL_MAX_MB) return `File too large (${mb}MB). Max ${LIM.HL_MAX_MB}MB.`;
    return '';
  };
  const checkVideoMeta = ({ duration, width, height }, kind) => {
    if (!duration || duration <= 0) return 'Corrupted video or missing metadata.';
    if (kind === 'intro' && duration > LIM.INTRO_MAX_SEC) return `Duration ${duration}s exceeds ${LIM.INTRO_MAX_SEC}s (Intro).`;
    if (kind === 'highlight' && duration > LIM.HL_MAX_SEC) return `Duration ${duration}s exceeds ${LIM.HL_MAX_SEC}s (Highlight).`;
    const maxSide = Math.max(Number(width || 0), Number(height || 0));
    if (maxSide && maxSide > LIM.MAX_DIM_PX) return `Resolution too high (${width}×${height}). Limit ≤ 4K.`;
    return '';
  };

  // ---------------- HELPERS PATH ----------------
  const pathPhotoFeatured = (slot) =>
    `athletes/${athlete.id}/photos/featured/${slot}-${nowTs()}.jpg`;
  const pathPhotoGallery = (originalName) => {
    const ext = getExt(originalName) || 'jpg';
    return `athletes/${athlete.id}/photos/gallery/${nowTs()}-${sanitizeName(originalName)}.${ext}`;
  };
  const pathVideoIntro = (originalName) => {
    const ext = getExt(originalName) || 'mp4';
    return `athletes/${athlete.id}/videos/intro/${nowTs()}-${sanitizeName(originalName)}.${ext}`;
  };
  const pathVideoHighlight = (originalName) => {
    const ext = getExt(originalName) || 'mp4';
    return `athletes/${athlete.id}/videos/highlights/${nowTs()}-${sanitizeName(originalName)}.${ext}`;
  };
  const pathVideoThumb = () =>
    `athletes/${athlete.id}/videos/thumbs/${nowTs()}.jpg`;

  const sanitizeName = (s = '') =>
    String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  // ---------------- FEATURED PHOTOS (Upload/Replace/Remove) ----------------
  const onPickFeatured = async (e, slotKey) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const err = checkPhoto(file);
    if (err) { alert(err); return; }

    try {
      // leggi dimensioni
      const { width, height } = await readImageDims(file);

      // carica file
      const path = pathPhotoFeatured(slotKey);
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;

      const cat =
        slotKey === 'head' ? CAT.FEATURED_HEAD :
        slotKey === 'g1'   ? CAT.FEATURED_G1   : CAT.FEATURED_G2;

      const prev = featured[slotKey];

      // upsert singolo record per category
      if (prev?.id) {
        // replace: rimuovi file precedente se upload locale
        if (prev.storage_path) await removeStorageIfAny(prev.storage_path);
        const { data, error: e2 } = await supabase
          .from(TBL_MEDIA)
          .update({
            type: 'photo',
            category: cat,
            storage_path: path,
            external_url: null,
            file_size_bytes: file.size,
            width, height,
            uploaded_at: new Date().toISOString(),
          })
          .eq('id', prev.id)
          .select()
          .single();
        if (e2) throw e2;
        setFeatured((p) => ({ ...p, [slotKey]: data }));
      } else {
        const { data, error: e3 } = await supabase
          .from(TBL_MEDIA)
          .insert([{
            athlete_id: athlete.id,
            type: 'photo',
            category: cat,
            storage_path: path,
            file_size_bytes: file.size,
            width, height,
            uploaded_at: new Date().toISOString(),
          }])
          .select()
          .single();
        if (e3) throw e3;
        setFeatured((p) => ({ ...p, [slotKey]: data }));
      }
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e4) {
      console.error(e4);
      setStatus({ type: 'error', msg: 'Upload failed' });
    } finally {
      // reset input per poter ricaricare stesso file
      e.target.value = '';
    }
  };

  const onRemoveFeatured = async (slotKey) => {
    const prev = featured[slotKey];
    if (!prev) return;
    const ok = window.confirm('Remove this featured photo?');
    if (!ok) return;
    try {
      if (prev.storage_path) await removeStorageIfAny(prev.storage_path);
      await supabase.from(TBL_MEDIA).delete().eq('id', prev.id);
      setFeatured((p) => ({ ...p, [slotKey]: null }));
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Delete failed' });
    }
  };

  // ---------------- INTRO VIDEO (Upload/Replace/Remove) ----------------
  const onPickIntro = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // pre-check di base
    const err = checkVideo(file, 'intro');
    if (err) { alert(err); return; }

    try {
      // metadati & poster
      const meta = await readVideoMetaAndThumb({ file, captureThumb: true, targetLongSide: 1280 });
      const metaErr = checkVideoMeta(meta, 'intro');
      if (metaErr) { alert(metaErr); return; }

      // upload poster (se generata)
      let thumbPath = null;
      if (meta.thumbBlob) {
        thumbPath = pathVideoThumb();
        await uploadBlob(thumbPath, meta.thumbBlob);
      }

      // upload video
      const vPath = pathVideoIntro(file.name);
      const { error } = await supabase.storage.from(BUCKET).upload(vPath, file, { upsert: true });
      if (error) throw error;

      if (intro?.id) {
        // replace
        if (intro.storage_path) await removeStorageIfAny(intro.storage_path);
        if (intro.thumbnail_path && !isHttpUrl(intro.thumbnail_path)) await removeStorageIfAny(intro.thumbnail_path);
        const { data, error: e2 } = await supabase
          .from(TBL_MEDIA)
          .update({
            type: 'video',
            category: CAT.INTRO,
            storage_path: vPath,
            external_url: null,
            duration_seconds: meta.duration,
            width: meta.width, height: meta.height,
            file_size_bytes: file.size,
            thumbnail_path: thumbPath,
            uploaded_at: new Date().toISOString(),
          })
          .eq('id', intro.id)
          .select()
          .single();
        if (e2) throw e2;
        setIntro(data);
      } else {
        const { data, error: e3 } = await supabase
          .from(TBL_MEDIA)
          .insert([{
            athlete_id: athlete.id,
            type: 'video',
            category: CAT.INTRO,
            storage_path: vPath,
            duration_seconds: meta.duration,
            width: meta.width, height: meta.height,
            file_size_bytes: file.size,
            thumbnail_path: thumbPath,
            uploaded_at: new Date().toISOString(),
          }])
          .select()
          .single();
        if (e3) throw e3;
        setIntro(data);
      }

      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e4) {
      console.error(e4);
      setStatus({ type: 'error', msg: 'Upload failed' });
    } finally {
      e.target.value = '';
    }
  };

  const onRemoveIntro = async () => {
    if (!intro) return;
    const ok = window.confirm('Remove intro video?');
    if (!ok) return;
    try {
      if (intro.storage_path) await removeStorageIfAny(intro.storage_path);
      if (intro.thumbnail_path && !isHttpUrl(intro.thumbnail_path)) await removeStorageIfAny(intro.thumbnail_path);
      await supabase.from(TBL_MEDIA).delete().eq('id', intro.id);
      setIntro(null);
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Delete failed' });
    }
  };

  // ---------------- HIGHLIGHTS ----------------
  // Add Upload
  const onPickHLUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (highlights.length >= CAP.HIGHLIGHTS) {
      alert('Limit reached: replace or remove an existing highlight.');
      e.target.value = ''; return;
    }

    const err = checkVideo(file, 'highlight');
    if (err) { alert(err); e.target.value=''; return; }

    try {
      const meta = await readVideoMetaAndThumb({ file, captureThumb: true, targetLongSide: 1280 });
      const metaErr = checkVideoMeta(meta, 'highlight');
      if (metaErr) { alert(metaErr); e.target.value=''; return; }

      let thumbPath = null;
      if (meta.thumbBlob) { thumbPath = pathVideoThumb(); await uploadBlob(thumbPath, meta.thumbBlob); }

      const vPath = pathVideoHighlight(file.name);
      const { error } = await supabase.storage.from(BUCKET).upload(vPath, file, { upsert: true });
      if (error) throw error;

      const nextOrder = highlights.length ? Math.max(...highlights.map(i => Number(i.sort_order||0))) + 1 : 0;

      const { data, error: e3 } = await supabase
        .from(TBL_MEDIA)
        .insert([{
          athlete_id: athlete.id,
          type: 'video',
          category: CAT.HIGHLIGHT,
          storage_path: vPath,
          duration_seconds: meta.duration,
          width: meta.width, height: meta.height,
          file_size_bytes: file.size,
          thumbnail_path: thumbPath,
          sort_order: nextOrder,
          uploaded_at: new Date().toISOString(),
        }])
        .select()
        .single();
      if (e3) throw e3;

      const list = [...highlights, data].sort(sortByOrder);
      setHighlights(list);
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e4) {
      console.error(e4);
      setStatus({ type: 'error', msg: 'Upload failed' });
    } finally {
      e.target.value = '';
    }
  };

  // Add Link (YouTube/Vimeo)
  const onAddHLLink = async () => {
    if (highlights.length >= CAP.HIGHLIGHTS) {
      setAddLinkHL((p) => ({ ...p, err: 'Limit reached: replace or remove.' }));
      return;
    }
    const url = (addLinkHL.url || '').trim();
    const plat = detectPlatform(url);
    if (!plat) { setAddLinkHL((p) => ({ ...p, err: 'Invalid URL (YouTube/Vimeo).' })); return; }

    try {
      let thumb = '';
      if (plat === 'youtube') {
        const id = parseYouTubeId(url);
        if (id) thumb = youTubeThumb(id); // assoluto, consentito in thumbnail_path
      }
      const nextOrder = highlights.length ? Math.max(...highlights.map(i => Number(i.sort_order||0))) + 1 : 0;

      const { data, error } = await supabase
        .from(TBL_MEDIA)
        .insert([{
          athlete_id: athlete.id,
          type: 'video',
          category: CAT.HIGHLIGHT,
          external_url: url,
          source_platform: plat,
          thumbnail_path: thumb || null, // può essere assoluto
          sort_order: nextOrder,
          uploaded_at: new Date().toISOString(),
        }])
        .select()
        .single();
      if (error) throw error;

      setHighlights((p) => [...p, data].sort(sortByOrder));
      setAddLinkHL({ url: '', err: '' });
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setAddLinkHL((p) => ({ ...p, err: 'Add failed' }));
    }
  };

  const onDeleteHL = async (id, storage_path, thumbnail_path) => {
    const ok = window.confirm('Delete this highlight?');
    if (!ok) return;
    try {
      if (storage_path) await removeStorageIfAny(storage_path);
      if (thumbnail_path && !isHttpUrl(thumbnail_path)) await removeStorageIfAny(thumbnail_path);
      await supabase.from(TBL_MEDIA).delete().eq('id', id);
      setHighlights((p) => p.filter(i => i.id !== id).map((i, idx) => ({ ...i, sort_order: idx })));
      setDirty(true); // riordino implicito
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e); setStatus({ type: 'error', msg: 'Delete failed' });
    }
  };

  const onReplaceHLUpload = async (item, file) => {
    const err = checkVideo(file, 'highlight');
    if (err) { alert(err); return; }
    try {
      const meta = await readVideoMetaAndThumb({ file, captureThumb: true, targetLongSide: 1280 });
      const metaErr = checkVideoMeta(meta, 'highlight');
      if (metaErr) { alert(metaErr); return; }

      let thumbPath = item.thumbnail_path && !isHttpUrl(item.thumbnail_path) ? item.thumbnail_path : null;
      if (meta.thumbBlob) {
        if (thumbPath) await removeStorageIfAny(thumbPath);
        thumbPath = pathVideoThumb();
        await uploadBlob(thumbPath, meta.thumbBlob);
      }

      const vPath = pathVideoHighlight(file.name);
      const { error } = await supabase.storage.from(BUCKET).upload(vPath, file, { upsert: true });
      if (error) throw error;

      if (item.storage_path) await removeStorageIfAny(item.storage_path);

      const { data, error: e2 } = await supabase
        .from(TBL_MEDIA)
        .update({
          storage_path: vPath,
          external_url: null,
          source_platform: null,
          duration_seconds: meta.duration,
          width: meta.width, height: meta.height,
          file_size_bytes: file.size,
          thumbnail_path: thumbPath,
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .select()
        .single();
      if (e2) throw e2;

      setHighlights((p) => p.map(x => x.id === item.id ? data : x).sort(sortByOrder));
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Replace failed' });
    }
  };

  const onReplaceHLLink = async (item, url) => {
    const plat = detectPlatform(url);
    if (!plat) { alert('Invalid URL (YouTube/Vimeo).'); return; }
    try {
      // se aveva storage, rimuovi
      if (item.storage_path) await removeStorageIfAny(item.storage_path);
      // se aveva thumb interna e NON http, rimuovi (manteniamo solo thumbs provider o nuove)
      if (item.thumbnail_path && !isHttpUrl(item.thumbnail_path)) await removeStorageIfAny(item.thumbnail_path);

      let thumb = '';
      if (plat === 'youtube') {
        const id = parseYouTubeId(url);
        if (id) thumb = youTubeThumb(id);
      }
      const { data, error } = await supabase
        .from(TBL_MEDIA)
        .update({
          storage_path: null,
          external_url: url,
          source_platform: plat,
          duration_seconds: null,
          width: null, height: null,
          file_size_bytes: null,
          thumbnail_path: thumb || null,
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .select()
        .single();
      if (error) throw error;
      setHighlights((p) => p.map(x => x.id === item.id ? data : x).sort(sortByOrder));
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Replace failed' });
    }
  };

  // Edit campi testuali (title/caption/tags) — si salvano con Save Bar
  const editHLField = (id, key, val) => {
    setHighlights((p) => p.map(i => i.id === id ? { ...i, [key]: val } : i));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  // Drag&Drop Highlights
  const onDragStartHL = (idx) => setDrag({ type: 'hl', from: idx, to: idx });
  const onDragOverHL  = (e, idx) => { e.preventDefault(); setDrag((d) => d.type==='hl' ? { ...d, to: idx } : d); };
  const onDropHL      = () => {
    if (drag.type !== 'hl') return;
    const { from, to } = drag;
    if (from === to || from < 0 || to < 0) { setDrag({ type: '', from: -1, to: -1 }); return; }
    const arr = [...highlights];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    // aggiorna sort_order in memoria
    const arr2 = arr.map((it, i) => ({ ...it, sort_order: i }));
    setHighlights(arr2);
    setDrag({ type: '', from: -1, to: -1 });
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  // ---------------- GALLERY ----------------
  const onPickGallery = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const room = CAP.GALLERY - gallery.length;
    const accepted = files.slice(0, Math.max(0, room));
    if (!accepted.length) {
      alert('Limit reached: replace or remove from the Gallery to upload more items.');
      e.target.value=''; return;
    }

    try {
      for (const file of accepted) {
        const err = checkPhoto(file);
        if (err) { alert(`"${file.name}": ${err}`); continue; }

        const dims = await readImageDims(file);
        const p = pathPhotoGallery(file.name);
        const { error } = await supabase.storage.from(BUCKET).upload(p, file, { upsert: true });
        if (error) throw error;

        const nextOrder = gallery.length
          ? Math.max(...gallery.map(i => Number(i.sort_order||0))) + 1
          : 0;

        const { data, error: e2 } = await supabase
          .from(TBL_MEDIA)
          .insert([{
            athlete_id: athlete.id,
            type: 'photo',
            category: CAT.GALLERY,
            storage_path: p,
            file_size_bytes: file.size,
            width: dims.width, height: dims.height,
            sort_order: nextOrder,
            uploaded_at: new Date().toISOString(),
          }])
          .select()
          .single();
        if (e2) throw e2;

        setGallery((g) => [...g, data].sort(sortByOrder));
      }
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e3) {
      console.error(e3);
      setStatus({ type: 'error', msg: 'Upload failed' });
    } finally {
      e.target.value = '';
    }
  };

  const editGalleryField = (id, key, val) => {
    setGallery((p) => p.map(i => i.id === id ? { ...i, [key]: val } : i));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  const onSaveGalleryRow = async (id) => {
    const row = gallery.find(i => i.id === id);
    if (!row) return;
    try {
      const payload = {
        title: row.title || null,
        caption: row.caption || null,
        tags: Array.isArray(row.tags)
          ? row.tags
          : (row.tags ? String(row.tags).split(',').map(s => s.trim()).filter(Boolean) : []),
      };
      const { error } = await supabase.from(TBL_MEDIA).update(payload).eq('id', id);
      if (error) throw error;
      const newSnapshotGallery = snapshot.gallery.some(g => g.id === id)
        ? snapshot.gallery.map(g => (g.id === id ? { ...row } : g))
        : [...snapshot.gallery, { ...row }];
      setSnapshot(prev => ({ ...prev, gallery: newSnapshotGallery }));
      const galleryDirty = gallery.some(g => {
        const snap = newSnapshotGallery.find(s => s.id === g.id);
        if (!snap) return true;
        const tagsA = Array.isArray(g.tags) ? g.tags.join(',') : '';
        const tagsB = Array.isArray(snap.tags) ? snap.tags.join(',') : '';
        return (g.title || '') !== (snap.title || '') ||
               (g.caption || '') !== (snap.caption || '') ||
               tagsA !== tagsB ||
               Number(g.sort_order || 0) !== Number(snap.sort_order || 0);
      });
      const highlightsDirty = JSON.stringify(highlights) !== JSON.stringify(snapshot.highlights);
      setDirty(galleryDirty || highlightsDirty);
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed' });
    }
  };

  const onDeleteGallery = async (id, storage_path) => {
    const ok = window.confirm('Remove this photo from Gallery?');
    if (!ok) return;
    try {
      if (storage_path) await removeStorageIfAny(storage_path);
      await supabase.from(TBL_MEDIA).delete().eq('id', id);
      setGallery((p) => p.filter(i => i.id !== id).map((i, idx) => ({ ...i, sort_order: idx })));
      setDirty(true);
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Delete failed' });
    }
  };

  // Drag&Drop Gallery
  const onDragStartGal = (idx) => setDrag({ type: 'gal', from: idx, to: idx });
  const onDragOverGal  = (e, idx) => { e.preventDefault(); setDrag((d) => d.type==='gal' ? { ...d, to: idx } : d); };
  const onDropGal      = () => {
    if (drag.type !== 'gal') return;
    const { from, to } = drag;
    if (from === to || from < 0 || to < 0) { setDrag({ type: '', from: -1, to: -1 }); return; }
    const arr = [...gallery];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    const arr2 = arr.map((it, i) => ({ ...it, sort_order: i }));
    setGallery(arr2);
    setDrag({ type: '', from: -1, to: -1 });
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  // ---------------- GAMES (solo link + metadati) ----------------
  const onAddGame = async () => {
    if (games.length >= CAP.GAMES) {
      setAddGame((p) => ({ ...p, err: 'Limit reached: replace or remove.' }));
      return;
    }
    const url = (addGame.url || '').trim();
    const plat = detectPlatform(url);
    if (!plat) { setAddGame((p) => ({ ...p, err: 'Invalid URL (YouTube/Vimeo).' })); return; }

    const req = ['match_date','opponent','competition','season','team_level'];
    for (const k of req) {
      if (!String(addGame[k] || '').trim()) {
        setAddGame((p) => ({ ...p, err: 'Fill in all required fields for the game.' }));
        return;
      }
    }

    try {
      const { data: item, error } = await supabase
        .from(TBL_MEDIA)
        .insert([{
          athlete_id: athlete.id,
          type: 'video',
          category: CAT.GAME,
          external_url: url,
          source_platform: plat,
          uploaded_at: new Date().toISOString(),
        }])
        .select()
        .single();
      if (error) throw error;

      const { error: e2 } = await supabase
        .from(TBL_GAME_META)
        .insert([{
          media_item_id: item.id,
          match_date: addGame.match_date,
          opponent: addGame.opponent,
          competition: addGame.competition,
          season: addGame.season,
          team_level: addGame.team_level,
        }]);
      if (e2) throw e2;

      setGames((p) => [{ item, game: {
        media_item_id: item.id,
        match_date: addGame.match_date,
        opponent: addGame.opponent,
        competition: addGame.competition,
        season: addGame.season,
        team_level: addGame.team_level,
      }}, ...p].sort(sortGamesDesc));
      setAddGame({ url: '', match_date: '', opponent: '', competition: '', season: '', team_level: '', err: '' });
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setAddGame((p) => ({ ...p, err: 'Add failed' }));
    }
  };

  const onEditGameField = (media_item_id, key, val) => {
    setGames((p) => p.map(g => g.item.id === media_item_id ? { ...g, game: { ...g.game, [key]: val } } : g));
    // Edit dei giochi salva subito (come richiesto), quindi andiamo diretti a DB
  };

  const onSaveGameRow = async (media_item_id) => {
    const row = games.find(g => g.item.id === media_item_id);
    if (!row) return;
    const req = ['match_date','opponent','competition','season','team_level'];
    for (const k of req) {
      if (!String(row.game[k] || '').trim()) {
        alert('Fill in all required fields for the game.');
        return;
      }
    }
    try {
      const { error } = await supabase
        .from(TBL_GAME_META)
        .update({
          match_date: row.game.match_date,
          opponent: row.game.opponent,
          competition: row.game.competition,
          season: row.game.season,
          team_level: row.game.team_level,
        })
        .eq('media_item_id', media_item_id);
      if (error) throw error;
      // ordine automatico per data: ri-ordina la lista
      setGames((p) => [...p].sort(sortGamesDesc));
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed' });
    }
  };

  const onDeleteGame = async (media_item_id) => {
    const ok = window.confirm('Delete this game link?');
    if (!ok) return;
    try {
      await supabase.from(TBL_GAME_META).delete().eq('media_item_id', media_item_id);
      await supabase.from(TBL_MEDIA).delete().eq('id', media_item_id);
      setGames((p) => p.filter(g => g.item.id !== media_item_id));
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Delete failed' });
    }
  };

  const toggleGame = (id) => {
    setOpenGameId((p) => (p === id ? null : id));
  };

  // ---------------- SAVE BAR (solo testi/ordinamenti Gallery & HL) ----------------
  const hasDirty = dirty;
  const isSaveDisabled = saving || !hasDirty;

  const onSave = async () => {
    if (isSaveDisabled) return;
    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      // Persisti campi testuali e sort degli highlights
      for (const it of highlights) {
        const payload = {
          title: (it.title || null),
          caption: (it.caption || null),
          tags: Array.isArray(it.tags) ? it.tags : (it.tags ? String(it.tags).split(',').map(s => s.trim()).filter(Boolean) : []),
          sort_order: Number(it.sort_order || 0),
        };
        const { error } = await supabase.from(TBL_MEDIA).update(payload).eq('id', it.id);
        if (error) throw error;
      }

      // Persisti testi e sort della gallery
      for (const it of gallery) {
        const payload = {
          title: (it.title || null),
          caption: (it.caption || null),
          tags: Array.isArray(it.tags) ? it.tags : (it.tags ? String(it.tags).split(',').map(s => s.trim()).filter(Boolean) : []),
          sort_order: Number(it.sort_order || 0),
        };
        const { error } = await supabase.from(TBL_MEDIA).update(payload).eq('id', it.id);
        if (error) throw error;
      }

      // snapshot & fine
      setSnapshot((prev) => ({ ...prev, highlights: [...highlights], gallery: [...gallery] }));
      setDirty(false);
      setStatus({ type: 'success', msg: 'Saved ✓' });

      // callback parent (coerente con altre card)
      if (onSaved) {
        const { data: fresh } = await supabase.from('athlete').select('*').eq('id', athlete.id).single();
        onSaved(fresh || null);
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  // ---------------- RENDER ----------------
  if (loading) return <div style={{ padding: 8, color: '#666' }}>Loading…</div>;

  const saveBtnStyle = isSaveDisabled
    ? { ...styles.saveBtn, ...styles.saveBtnDisabled }
    : { ...styles.saveBtn, ...styles.saveBtnEnabled };

  // Pulsanti Add disabilitati a cap
  const addGalDisabled = gallery.length >= CAP.GALLERY;
  const addHLDisabled  = highlights.length >= CAP.HIGHLIGHTS;
  const addGameDisabled= games.length >= CAP.GAMES;

  // helper per poster (thumbnail_path può essere storage path o assoluto http)
  const usePoster = async (thumbPath) => {
    if (!thumbPath) return '';
    if (isHttpUrl(thumbPath)) return thumbPath;
    return await getSignedUrl(thumbPath);
  };

  // Featured preview signed URL
  const useImageSigned = async (storage_path) => storage_path ? await getSignedUrl(storage_path) : '';

  // ---------------- UI ----------------
  return (
    <div style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : null) }}>
      {/* FEATURED PHOTOS */}
      <div style={styles.box}>
        <div style={styles.sectionTitle}>Featured Photos (3)</div>
        <div style={styles.subnote}>Headshot, In game #1, In game #2 — large preview; Replace/Remove.</div>
        <div style={{ ...styles.featuredWrap, ...(isMobile ? { gridTemplateColumns: '1fr' } : null) }}>
          {/* Headshot */}
          <div style={styles.featuredSlot}>
            <div style={styles.label}>Headshot</div>
            <FeaturedPreview imgPath={featured.head?.storage_path} getSigned={useImageSigned} />
            <div style={styles.fieldRow}>
              <input type="file" accept="image/*" ref={headInputRef} onChange={(e) => onPickFeatured(e, 'head')} style={{ display: 'none' }}/>
              <button type="button" onClick={() => headInputRef.current?.click()} style={styles.smallBtnPrimary}>Upload / Replace</button>
              {featured.head && (
                <button type="button" onClick={() => onRemoveFeatured('head')} style={{ ...styles.smallBtn, color: '#b00', borderColor: '#E0E0E0' }}>Remove</button>
              )}
            </div>
          </div>

          {/* Game #1 */}
          <div style={styles.featuredSlot}>
            <div style={styles.label}>In game #1</div>
            <FeaturedPreview imgPath={featured.g1?.storage_path} getSigned={useImageSigned} />
            <div style={styles.fieldRow}>
              <input type="file" accept="image/*" ref={g1InputRef} onChange={(e) => onPickFeatured(e, 'g1')} style={{ display: 'none' }}/>
              <button type="button" onClick={() => g1InputRef.current?.click()} style={styles.smallBtnPrimary}>Upload / Replace</button>
              {featured.g1 && (
                <button type="button" onClick={() => onRemoveFeatured('g1')} style={{ ...styles.smallBtn, color: '#b00', borderColor: '#E0E0E0' }}>Remove</button>
              )}
            </div>
          </div>

          {/* Game #2 */}
          <div style={styles.featuredSlot}>
            <div style={styles.label}>In game #2</div>
            <FeaturedPreview imgPath={featured.g2?.storage_path} getSigned={useImageSigned} />
            <div style={styles.fieldRow}>
              <input type="file" accept="image/*" ref={g2InputRef} onChange={(e) => onPickFeatured(e, 'g2')} style={{ display: 'none' }}/>
              <button type="button" onClick={() => g2InputRef.current?.click()} style={styles.smallBtnPrimary}>Upload / Replace</button>
              {featured.g2 && (
                <button type="button" onClick={() => onRemoveFeatured('g2')} style={{ ...styles.smallBtn, color: '#b00', borderColor: '#E0E0E0' }}>Remove</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* INTRO VIDEO */}
      <div style={styles.box}>
        <div style={styles.sectionTitle}>Video Intro (1)</div>
        <div style={styles.subnote}>≤ 120s, ≤ 4K, ≤ 800MB. MP4/MOV/WEBM. Inline player, poster generated.</div>
        <div style={styles.videoRow}>
          {intro ? (
            <VideoPlayer item={intro} getSigned={getSignedUrl} usePoster={usePoster} />
          ) : (
            <div style={{ fontSize: 12, color: '#666' }}>No videos uploaded.</div>
          )}
        </div>
        <div style={{ ...styles.fieldRow, marginTop: 8 }}>
          <input type="file" accept="video/mp4,video/quicktime,video/webm" ref={introInputRef} onChange={onPickIntro} style={{ display: 'none' }}/>
          <button type="button" onClick={() => introInputRef.current?.click()} style={styles.smallBtnPrimary}>{intro ? 'Replace' : 'Upload video'}</button>
          {intro && (
            <button type="button" onClick={onRemoveIntro} style={{ ...styles.smallBtn, color: '#b00', borderColor: '#E0E0E0' }}>Remove</button>
          )}
        </div>
      </div>

      {/* HIGHLIGHTS */}
      <div style={styles.box}>
        <div style={styles.sectionTitle}>Highlights (max 3 — upload or link)</div>
        <div style={styles.subnote}>Poster/thumbnail always present; drag & drop to sort; edit title/caption/tags; inline player.
          {addHLDisabled && <strong style={{ color: '#b00' }}> Limit reached: replace or remove.</strong>}
        </div>

        {/* Azioni add */}
        <div style={styles.fieldRow}>
          <input type="file" accept="video/mp4,video/quicktime,video/webm" ref={hlUploadInputRef} onChange={onPickHLUpload} style={{ display: 'none' }}/>
          <button type="button" onClick={() => !addHLDisabled && hlUploadInputRef.current?.click()}
                  style={addHLDisabled ? styles.smallBtnDisabled : styles.smallBtnPrimary}
                  disabled={addHLDisabled}>
            + Add Upload
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="Paste YouTube/Vimeo URL…"
              value={addLinkHL.url}
              onChange={(e) => { setAddLinkHL({ url: e.target.value, err: '' }); }}
              disabled={addHLDisabled}
              style={{ ...styles.input, minWidth: 260, ...(addHLDisabled ? { background: '#F7F7F7', color: '#999' } : null) }}
            />
            <button type="button" onClick={onAddHLLink}
                    style={addHLDisabled ? styles.smallBtnDisabled : styles.smallBtnPrimary}
                    disabled={addHLDisabled}>
              + Add Link
            </button>
          </div>
        </div>
        {addLinkHL.err && <div style={styles.error}>{addLinkHL.err}</div>}

        {/* Lista HL con DnD */}
        <div style={styles.list}>
          {highlights.map((it, idx) => (
            <div key={it.id}
                 draggable
                 onDragStart={() => onDragStartHL(idx)}
                 onDragOver={(e) => onDragOverHL(e, idx)}
                 onDrop={onDropHL}
                 style={{
                   ...styles.item,
                   ...(drag.type==='hl' && drag.to === idx ? styles.droptarget : null),
                   ...(drag.type==='hl' ? styles.draggable : null)
                 }}>
              <div style={styles.itemHeader}>
                <div>
                  <div style={styles.itemTitle}>Highlight #{idx + 1}</div>
                  <div style={styles.itemMeta}>
                    {it.external_url ? `Link • ${it.source_platform || '—'}` : `Upload • ${(bytesToMB(it.file_size_bytes)||0)}MB`}
                    {typeof it.duration_seconds === 'number' ? ` • ${it.duration_seconds}s` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!it.external_url ? (
                    <>
                      <input type="file" accept="video/mp4,video/quicktime,video/webm"
                             onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplaceHLUpload(it, f); e.target.value=''; }}
                             style={{ display: 'none' }} id={`repl-hl-${it.id}`} />
                      <label htmlFor={`repl-hl-${it.id}`} style={{ ...styles.smallBtn, cursor: 'pointer' }}>Replace</label>
                    </>
                  ) : (
                    <button type="button" style={styles.smallBtn}
                            onClick={() => {
                              const url = prompt('Nuovo URL YouTube/Vimeo', it.external_url || '');
                              if (url) onReplaceHLLink(it, url);
                            }}>
                      Replace link
                    </button>
                  )}
                  <button type="button" style={{ ...styles.smallBtn, color: '#b00', borderColor: '#E0E0E0' }}
                          onClick={() => onDeleteHL(it.id, it.storage_path, it.thumbnail_path)}>
                    Delete
                  </button>
                </div>
              </div>

              {/* Poster + Player inline */}
              <HLPlayer item={it} getSigned={getSignedUrl} usePoster={usePoster} />

              {/* Campi testuali (salvati con Save Bar) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                <div>
                  <label style={styles.label}>Title</label>
                  <input value={it.title || ''} onChange={(e) => editHLField(it.id, 'title', e.target.value)} style={styles.input}/>
                </div>
                <div>
                  <label style={styles.label}>Caption</label>
                  <input value={it.caption || ''} onChange={(e) => editHLField(it.id, 'caption', e.target.value)} style={styles.input}/>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={styles.label}>Tags</label>
                <CreatableSelect
                  isMulti
                  placeholder="Add tag…"
                  value={(Array.isArray(it.tags) ? it.tags : []).map(t => ({ value: t, label: t }))}
                  onChange={(opts) => editHLField(it.id, 'tags', (Array.isArray(opts) ? opts.map(o => o.value) : []))}
                  styles={{
                    container: (b) => ({ ...b, width:'100%' }),
                    control: (b) => ({ ...b, minHeight: 42, borderRadius: 10, borderColor: '#E0E0E0', boxShadow: 'none' }),
                    valueContainer: (b) => ({ ...b, padding: '0 10px' }),
                    indicatorsContainer: (b) => ({ ...b, paddingRight: 8 }),
                    menu: (b) => ({ ...b, zIndex: 10 }),
                  }}
                />
              </div>
            </div>
          ))}
          {highlights.length === 0 && (
            <div style={{ fontSize: 12, color: '#666' }}>No highlights.</div>
          )}
        </div>
      </div>

      {/* PHOTO GALLERY */}
      <div style={styles.box}>
        <div style={styles.sectionTitle}>Photo Gallery (max 6)</div>
        <div style={styles.subnote}>Manage items, no preview. Drag & drop to sort.
          {addGalDisabled && <strong style={{ color: '#b00' }}> Limit reached: replace or remove.</strong>}
        </div>

        <div style={styles.fieldRow}>
          <input type="file" accept="image/*" multiple ref={galleryInputRef} onChange={onPickGallery} style={{ display: 'none' }}/>
          <button type="button" onClick={() => !addGalDisabled && galleryInputRef.current?.click()}
                  style={addGalDisabled ? styles.smallBtnDisabled : styles.smallBtnPrimary}
                  disabled={addGalDisabled}>
            + Add photo
          </button>
        </div>

        <div style={styles.galleryTableWrap}>
          <table style={styles.galleryTable}>
            <thead>
              <tr>
                <th style={{ ...styles.galleryTh, ...styles.galleryThumbCell }}>Photo</th>
                <th style={{ ...styles.galleryTh, ...styles.galleryTitleCell }}>Title</th>
                <th style={{ ...styles.galleryTh, ...styles.galleryCaptionCell }}>Caption</th>
                <th style={{ ...styles.galleryTh, ...styles.galleryTagsCell }}>Tags</th>
                <th style={styles.galleryThRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {gallery.length > 0 && gallery.map((it, idx) => (
                <tr key={it.id}
                    draggable
                    onDragStart={() => onDragStartGal(idx)}
                    onDragOver={(e) => onDragOverGal(e, idx)}
                    onDrop={onDropGal}
                    style={{
                      ...(drag.type==='gal' && drag.to === idx ? styles.droptarget : null),
                      ...(drag.type==='gal' ? styles.draggable : null)
                    }}>
                  <td style={{ ...styles.galleryTd, ...styles.galleryThumbCell }}>
                    <GalleryIconLink item={it} getSigned={getSignedUrl} />
                  </td>
                  <td style={{ ...styles.galleryTd, ...styles.galleryTitleCell }}>
                    <input value={it.title || ''} onChange={(e) => editGalleryField(it.id, 'title', e.target.value)} style={styles.input}/>
                  </td>
                  <td style={{ ...styles.galleryTd, ...styles.galleryCaptionCell }}>
                    <input value={it.caption || ''} onChange={(e) => editGalleryField(it.id, 'caption', e.target.value)} style={styles.input}/>
                  </td>
                  <td style={{ ...styles.galleryTd, ...styles.galleryTagsCell }}>
                    <CreatableSelect
                      isMulti
                      placeholder="Add tag…"
                      value={(Array.isArray(it.tags) ? it.tags : []).map(t => ({ value: t, label: t }))}
                      onChange={(opts) => editGalleryField(it.id, 'tags', (Array.isArray(opts) ? opts.map(o => o.value) : []))}
                      styles={{
                        container: (b) => ({ ...b, width:'100%' }),
                        control: (b) => ({ ...b, minHeight: 42, borderRadius: 10, borderColor: '#E0E0E0', boxShadow: 'none' }),
                        valueContainer: (b) => ({ ...b, padding: '0 10px' }),
                        indicatorsContainer: (b) => ({ ...b, paddingRight: 8 }),
                        menu: (b) => ({ ...b, zIndex: 10 }),
                      }}
                    />
                  </td>
                  <td style={{ ...styles.galleryTd, ...styles.galleryActionCell }}>
                    <button type="button" style={styles.linkBtn} onClick={() => onSaveGalleryRow(it.id)}>Save</button>
                    <span style={{ margin: '0 6px' }}>|</span>
                    <button type="button" style={{ ...styles.linkBtn, color: '#b00' }} onClick={() => onDeleteGallery(it.id, it.storage_path)}>Delete</button>
                  </td>
                </tr>
              ))}
              {gallery.length === 0 && (
                <tr>
                  <td style={styles.galleryTd} colSpan={5}>
                    <span style={{ fontSize: 12, color: '#666' }}>No photos in gallery.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FULL MATCHES (GAMES) */}
      <div style={styles.box}>
        <div style={styles.sectionTitle}>Full Games (max 10 — external links only)</div>
        <div style={styles.subnote}>Automatically sorted by match date (<code>match_date</code>) descending.</div>

        <div style={{ ...styles.gameForm, ...(isMobile ? styles.boxGridMobile : null), marginBottom: 8 }}>
          <label style={styles.label}>URL (YouTube/Vimeo) *</label>
          <input value={addGame.url} onChange={(e) => setAddGame((p) => ({ ...p, url: e.target.value, err: '' }))}
                 style={styles.input} placeholder="Paste URL…" disabled={addGameDisabled}/>

          <label style={styles.label}>Match date *</label>
          <input type="date" value={addGame.match_date} onChange={(e) => setAddGame((p) => ({ ...p, match_date: e.target.value, err: '' }))}
                 style={styles.input} disabled={addGameDisabled}/>

          <label style={styles.label}>Opponent *</label>
          <input value={addGame.opponent} onChange={(e) => setAddGame((p) => ({ ...p, opponent: e.target.value, err: '' }))}
                 style={styles.input} disabled={addGameDisabled}/>

          <label style={styles.label}>Competition *</label>
          <input value={addGame.competition} onChange={(e) => setAddGame((p) => ({ ...p, competition: e.target.value, err: '' }))}
                 style={styles.input} disabled={addGameDisabled}/>

          <label style={styles.label}>Season *</label>
          <input value={addGame.season} onChange={(e) => setAddGame((p) => ({ ...p, season: e.target.value, err: '' }))}
                 style={styles.input} placeholder="e.g. 2024/25" disabled={addGameDisabled}/>

          <label style={styles.label}>Team level *</label>
          <input value={addGame.team_level} onChange={(e) => setAddGame((p) => ({ ...p, team_level: e.target.value, err: '' }))}
                 style={styles.input} placeholder="e.g. U17 Elite" disabled={addGameDisabled}/>
        </div>

        <div style={{ ...styles.fieldRow, marginBottom: 16 }}>
          <button type="button" onClick={onAddGame}
                  style={addGameDisabled ? styles.smallBtnDisabled : styles.smallBtnPrimary}
                  disabled={addGameDisabled}>
            + Add match
          </button>
          {addGame.err && <div style={styles.error}>{addGame.err}</div>}
          {addGameDisabled && <div style={{ color: '#b00', fontSize: 12 }}>Limit reached: replace or remove.</div>}
        </div>

        {!isMobile ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Match Date</th>
                  <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Opponent</th>
                  <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Competition</th>
                  <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Season</th>
                  <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Team Level</th>
                  <th style={{ ...styles.thRight, ...(isMobile ? styles.thMobile : null) }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {games.map(({ item, game }) => (
                  <tr key={item.id}>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      <input
                        type="date"
                        value={game.match_date || ''}
                        onChange={(e) => onEditGameField(item.id, 'match_date', e.target.value)}
                        style={styles.input}
                      />
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      <input
                        value={game.opponent || ''}
                        onChange={(e) => onEditGameField(item.id, 'opponent', e.target.value)}
                        style={styles.input}
                      />
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      <input
                        value={game.competition || ''}
                        onChange={(e) => onEditGameField(item.id, 'competition', e.target.value)}
                        style={styles.input}
                      />
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      <input
                        value={game.season || ''}
                        onChange={(e) => onEditGameField(item.id, 'season', e.target.value)}
                        style={styles.input}
                      />
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      <input
                        value={game.team_level || ''}
                        onChange={(e) => onEditGameField(item.id, 'team_level', e.target.value)}
                        style={styles.input}
                      />
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null), textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <a href={item.external_url || '#'} target="_blank" rel="noreferrer" style={styles.linkBtn}>Open</a>
                      <span style={{ margin: '0 6px' }}>|</span>
                      <button type="button" style={styles.linkBtn} onClick={() => onSaveGameRow(item.id)}>Save</button>
                      <span style={{ margin: '0 6px' }}>|</span>
                      <button
                        type="button"
                        style={{ ...styles.linkBtn, color: '#b00' }}
                        onClick={() => onDeleteGame(item.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {games.length === 0 && (
                  <tr>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }} colSpan={6}>
                      <div style={{ fontSize: 12, color: '#666' }}>No matches added.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            {games.map(({ item, game }) => (
              <GameAccordionItem
                key={item.id}
                item={item}
                game={game}
                isOpen={openGameId === item.id}
                onToggle={() => toggleGame(item.id)}
                onEditGameField={onEditGameField}
                onSaveGameRow={onSaveGameRow}
                onDeleteGame={onDeleteGame}
              />
            ))}
            {games.length === 0 && (
              <div style={{ fontSize: 12, color: '#666' }}>No matches added.</div>
            )}
          </div>
        )}
      </div>

      {/* SAVE BAR — testi/ordinamenti (Gallery/Highlights) */}
      <div style={styles.saveBar}>
        <button type="button" disabled={isSaveDisabled} onClick={onSave} style={saveBtnStyle} aria-disabled={isSaveDisabled}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status.msg && (
          <span role="status" aria-live="polite" style={status.type === 'error' ? styles.statusTextERR : styles.statusTextOK}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------- SUB-COMPONENTS ----------------
function GameAccordionItem({ item, game, isOpen, onToggle, onEditGameField, onSaveGameRow, onDeleteGame }) {
  const summaryId = `game-summary-${item.id}`;
  const regionId = `game-region-${item.id}`;

  return (
    <div style={styles.gameCard}>
      <button
        type="button"
        style={styles.gameSummary}
        onClick={onToggle}
        id={summaryId}
        aria-controls={regionId}
        aria-expanded={isOpen}
      >
        <span style={styles.gameDate}>{game.match_date || '—'}</span>
        <span style={styles.gameText}>{game.opponent || '—'}</span>
        <span style={{ ...styles.gameChevron, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
      </button>

      {isOpen && (
        <div id={regionId} role="region" aria-labelledby={summaryId} style={styles.gameDetails}>
          <div style={styles.field}>
            <label style={styles.label}>Match date *</label>
            <input
              type="date"
              value={game.match_date || ''}
              onChange={(e) => onEditGameField(item.id, 'match_date', e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Opponent *</label>
            <input
              value={game.opponent || ''}
              onChange={(e) => onEditGameField(item.id, 'opponent', e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Competition *</label>
            <input
              value={game.competition || ''}
              onChange={(e) => onEditGameField(item.id, 'competition', e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Season *</label>
            <input
              value={game.season || ''}
              onChange={(e) => onEditGameField(item.id, 'season', e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Team level *</label>
            <input
              value={game.team_level || ''}
              onChange={(e) => onEditGameField(item.id, 'team_level', e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.gameActions}>
            <a href={item.external_url || '#'} target="_blank" rel="noreferrer" style={styles.linkBtn}>
              Open
            </a>
            <button type="button" style={styles.smallBtnPrimary} onClick={() => onSaveGameRow(item.id)}>
              Save
            </button>
            <button
              type="button"
              style={{ ...styles.smallBtn, color: '#b00', borderColor: '#E0E0E0' }}
              onClick={() => onDeleteGame(item.id)}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GalleryIconLink({ item, getSigned }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    (async () => {
      const u = item?.external_url || (item?.storage_path ? await getSigned(item.storage_path) : '');
      setUrl(u);
    })();
  }, [item?.storage_path, item?.external_url]);
  if (!url) return <span role="img" aria-label="image" style={{ fontSize: 24 }}>🖼️</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>
      <img
        src={url}
        alt={item?.title || 'Image'}
        style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }}
      />
    </a>
  );
}

function FeaturedPreview({ imgPath, getSigned }) {
  const [url, setUrl] = useState('');
  useEffect(() => { (async () => setUrl(await getSigned(imgPath || '')))(); }, [imgPath]);
  if (!imgPath) return <div style={{ ...styles.featuredPreview, display:'flex', alignItems:'center', justifyContent:'center', color:'#999', fontSize:12 }}>No image</div>;
  return <img alt="Featured" src={url || ''} style={styles.featuredPreview} />;
}

function VideoPlayer({ item, getSigned, usePoster }) {
  const [src, setSrc] = useState('');
  const [poster, setPoster] = useState('');
  useEffect(() => {
    (async () => {
      setPoster(await usePoster(item.thumbnail_path || ''));
      setSrc(item.storage_path ? await getSigned(item.storage_path) : '');
    })();
  }, [item?.storage_path, item?.thumbnail_path]);

  if (!item?.storage_path) return <div style={{ fontSize: 12, color: '#666' }}>—</div>;

  return (
    <video
      key={item.id}
      controls
      preload="metadata"
      poster={poster || undefined}
      style={styles.mediaPreview}
      src={src || ''}
    />
  );
}

function HLPlayer({ item, getSigned, usePoster }) {
  const [src, setSrc] = useState('');
  const [poster, setPoster] = useState('');
  const [showEmbed, setShowEmbed] = useState(false);

  useEffect(() => {
    (async () => {
      setPoster(await usePoster(item.thumbnail_path || ''));
      setSrc(item.storage_path ? await getSigned(item.storage_path) : '');
    })();
  }, [item?.storage_path, item?.thumbnail_path]);

  if (item.external_url) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
        {!showEmbed ? (
          <>
            {poster ? <img alt="Poster" src={poster} style={styles.mediaPreview} /> : <div style={styles.mediaPreview} />}
            <button type="button" style={styles.smallBtnPrimary} onClick={() => setShowEmbed(true)}>
              Play
            </button>
          </>
        ) : (
          <div style={styles.mediaPreview}>
            <iframe
              title="Highlight"
              src={buildEmbedUrl(item.external_url)}
              style={{ width: '100%', height: '100%', border: '0', display: 'block' }}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </div>
    );
  }

  // Upload locale
  return (
    <div style={{ marginTop: 6 }}>
      <video
        key={item.id}
        controls
        preload="metadata"
        poster={poster || undefined}
        style={styles.mediaPreview}
        src={src || ''}
      />
    </div>
  );
}

function buildEmbedUrl(url) {
  const ytId = parseYouTubeId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}?rel=0`;
  const vimeoId = parseVimeoId(url);
  if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}`;
  return url; // fallback
}

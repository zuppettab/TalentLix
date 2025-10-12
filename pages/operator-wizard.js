import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Select from 'react-select';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import countries from '../utils/countries';

/** =========================
 *  CONFIG
 *  ========================= */
const PRIVACY_POLICY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_POLICY_VERSION || '2024-01-01';
const COOLDOWN_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_RESEND_COOLDOWN || 60);
const OTP_TTL_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_OTP_TTL || 600);

const WIZARD = { NOT_STARTED:'NOT_STARTED', IN_PROGRESS:'IN_PROGRESS', SUBMITTED:'SUBMITTED', COMPLETED:'COMPLETED' };
const OP_DOCS_BUCKET = 'op_assets';
const OP_LOGO_BUCKET = 'op_assets';
const analyzeWebsiteValue = (raw) => {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return { isValid: true, normalized: null, error: '' };
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol');
    }
    return { isValid: true, normalized: parsed.toString(), error: '' };
  } catch (err) {
    return { isValid: false, normalized: null, error: 'Invalid website URL. Please use a valid domain (e.g. https://example.com).' };
  }
};
const deriveStoragePathFromPublicUrl = (publicUrl, bucket) => {
  if (!publicUrl || !bucket) return '';
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return '';
  return publicUrl.substring(idx + marker.length);
};
const FONT_SIZES = {
  title: '1.5rem',
  sectionHeading: '1rem',
  body: '0.95rem',
  small: '0.8rem',
  tiny: '0.75rem',
};
const VERIF_STATE = {
  NOT_STARTED:'NOT_STARTED',
  IN_REVIEW:'IN_REVIEW',
  VERIFIED:'VERIFIED',
  REJECTED:'REJECTED',
  NEEDS_MORE_INFO:'NEEDS_MORE_INFO'
};

const DOC_LABEL_DEFAULT = {
  ID:'Identity document',
  LICENSE:'Professional license or authorization',
  REGISTRATION:'Business/club registration document',
  AFFILIATION:'Federation affiliation proof',
  TAX:'Tax/VAT identification',
  REFERENCE:'Reference letter',
  PROOF_OF_ADDRESS:'Proof of address'
};

const DOC_LABEL_BY_TYPE = {
  club: {
    REGISTRATION: 'Registration document (company/association register, or equivalent)',
    AFFILIATION: 'Official federation affiliation proof (certificate or public registry extract)',
    ID: 'Government ID of an authorized club representative',
    TAX: 'Tax/VAT code (optional; format as used in your country)',
  },
  agent: {
    LICENSE: 'Agent license/authorization issued by the competent sports body',
    ID: 'Government ID of the agent or the agency’s legal representative',
    TAX: 'Tax/VAT code (optional; format as used in your country)',
  }
};

const getDocLabel = (docType, operatorType) => {
  const typeKey = operatorType || '';
  return DOC_LABEL_BY_TYPE[typeKey]?.[docType] || DOC_LABEL_DEFAULT[docType] || docType;
};

/** =========================
 *  HELPERS
 *  ========================= */
const toNullable = (s) => {
  if (s == null) return null;
  const t = String(s).trim();
  return t ? t : null;
};
const digitsOnly = (value) => (value ? String(value).replace(/\D/g, '') : '');
const normalizeCountryCode = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const m = countries.find((c) => c.label.toLowerCase() === raw.toLowerCase());
  return m ? m.value : null;
};
const matchesConditions = (rule, profile) => {
  const cond = rule?.conditions || null;
  if (!cond) return true;
  const country = profile?.country || null;
  if (Array.isArray(cond.country)) {
    if (!country) return false;
    return cond.country.map((x) => String(x).toUpperCase()).includes(String(country).toUpperCase());
  }
  return true;
};

/** =========================
 *  MAIN PAGE
 *  ========================= */
export default function OperatorWizard() {
  const router = useRouter();

  // UI State (coerente con wizard atleti)
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [docCleanupMessage, setDocCleanupMessage] = useState('');

  // Session & Account
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null);         // {id, type_id, wizard_status}
  const opId = account?.id || null;

  // Cataloghi
  const [opTypes, setOpTypes] = useState([]);           // [{id,code,name}]
  const [selectedTypeCode, setSelectedTypeCode] = useState(''); // 'agent'|'club'
  const selectedTypeRow = opTypes.find(t => t.code === selectedTypeCode) || null;

  // Step
  const [step, setStep] = useState(1);
  const hasInitializedStep = useRef(false);
  const restartHandledRef = useRef(false);
  const previousTypeRef = useRef('');
  const makeStorageKey = useCallback((id) => (id ? `operator_wizard_step:${id}` : null), []);
  const stepStorageKey = useMemo(
    () => makeStorageKey(user?.id || null),
    [makeStorageKey, user?.id]
  );

  const readStoredStep = useCallback(() => {
    if (typeof window === 'undefined' || !stepStorageKey) return null;
    try {
      const raw = window.localStorage.getItem(stepStorageKey);
      if (!raw) return null;
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (err) {
      console.warn('Failed to read operator wizard step from storage', err);
      return null;
    }
  }, [stepStorageKey]);

  const writeStoredStep = useCallback((value, idOverride = null) => {
    if (typeof window === 'undefined') return;
    const key = idOverride != null ? makeStorageKey(idOverride) : stepStorageKey;
    if (!key) return;
    try {
      if (value == null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, String(value));
      }
    } catch (err) {
      console.warn('Failed to persist operator wizard step', err);
    }
  }, [makeStorageKey, stepStorageKey]);

  useEffect(() => {
    if (!router.isReady) return;
    if (restartHandledRef.current) return;

    const rawParam = router.query?.restart;
    const values = Array.isArray(rawParam) ? rawParam : [rawParam];
    const shouldRestart = values.some((value) => {
      if (!value) return false;
      const normalized = String(value).trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    });

    if (!shouldRestart) return;

    restartHandledRef.current = true;
    hasInitializedStep.current = true;
    setStep(1);
    writeStoredStep(1);

    const nextQuery = { ...router.query };
    delete nextQuery.restart;
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [router, writeStoredStep]);

  // STEP 1 — Anagrafica
  const [profile, setProfile] = useState({
    legal_name:'', trade_name:'', website:'', logo_url:'',
    address1:'', address2:'', city:'', state_region:'', postal_code:'', country:''
  });

  // STEP 2 — Contatti & OTP
  const [contact, setContact] = useState({
    email_primary:'', email_billing:'', phone_e164:'', phone_verified_at:null
  });
  const [logoStoragePath, setLogoStoragePath] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const logoObjectUrlRef = useRef(null);
  const logoPreviewRequestRef = useRef(0);
  const cleanupLogoObjectUrl = useCallback(() => {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
  }, []);
  const resolveLogoPreviewUrl = useCallback(async (rawValue) => {
    const requestId = ++logoPreviewRequestRef.current;
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) {
      cleanupLogoObjectUrl();
      if (logoPreviewRequestRef.current === requestId) setLogoPreviewUrl('');
      return;
    }

    const isHttpUrl = /^https?:\/\//i.test(value);
    const resolvedPath = deriveStoragePathFromPublicUrl(value, OP_LOGO_BUCKET) || value;
    const normalizedPath = resolvedPath.startsWith(`${OP_LOGO_BUCKET}/`)
      ? resolvedPath.slice(OP_LOGO_BUCKET.length + 1)
      : resolvedPath.replace(/^\/+/, '');

    if (!supabase || !supabase.storage) {
      if (isHttpUrl && logoPreviewRequestRef.current === requestId) {
        cleanupLogoObjectUrl();
        setLogoPreviewUrl(value);
      }
      return;
    }

    if (!normalizedPath) {
      if (isHttpUrl && logoPreviewRequestRef.current === requestId) {
        cleanupLogoObjectUrl();
        setLogoPreviewUrl(value);
      }
      return;
    }

    if (isHttpUrl && normalizedPath === value) {
      cleanupLogoObjectUrl();
      if (logoPreviewRequestRef.current === requestId) setLogoPreviewUrl(value);
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from(OP_LOGO_BUCKET)
        .createSignedUrl(normalizedPath, 300);

      if (logoPreviewRequestRef.current !== requestId) return;

      if (error) throw error;

      const signedUrl = data?.signedUrl || '';
      if (signedUrl) {
        cleanupLogoObjectUrl();
        setLogoPreviewUrl(signedUrl);
      } else if (isHttpUrl) {
        cleanupLogoObjectUrl();
        setLogoPreviewUrl(value);
      } else {
        setLogoPreviewUrl('');
      }
    } catch (err) {
      console.warn('Failed to resolve operator logo preview', err);
      if (logoPreviewRequestRef.current !== requestId) return;
      if (isHttpUrl) {
        cleanupLogoObjectUrl();
        setLogoPreviewUrl(value);
      } else {
        setLogoPreviewUrl('');
      }
    }
  }, [cleanupLogoObjectUrl]);
  useEffect(() => {
    resolveLogoPreviewUrl(profile.logo_url);
  }, [profile.logo_url, resolveLogoPreviewUrl]);
  useEffect(() => () => {
    cleanupLogoObjectUrl();
  }, [cleanupLogoObjectUrl]);
  const normalizedPhone = (contact.phone_e164 || '').replace(/\s+/g, '');
  const parsedPhone = useMemo(() => parsePhoneNumberFromString(normalizedPhone), [normalizedPhone]);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpMsg, setOtpMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const isPhoneVerified = !!contact.phone_verified_at;

  const countryDisplayName = useMemo(() => {
    const raw = profile.country ? String(profile.country).trim() : '';
    if (!raw) return '';
    const match = countries.find((c) => c.value === raw || c.label?.toLowerCase() === raw.toLowerCase());
    if (match) {
      if (match.value && match.label && match.value !== match.label) {
        return `${match.label} (${match.value})`;
      }
      return match.label || match.value;
    }
    return raw;
  }, [profile.country]);

  const websiteSummary = useMemo(() => {
    if (!profile.website) return '';
    const analysis = analyzeWebsiteValue(profile.website);
    if (analysis?.normalized) return analysis.normalized;
    return String(profile.website).trim();
  }, [profile.website]);

  const phoneVerificationLabel = useMemo(() => {
    if (!contact.phone_verified_at) return 'Pending';
    try {
      const iso = new Date(contact.phone_verified_at).toISOString();
      return `Verified on ${iso}`;
    } catch (err) {
      return 'Verified';
    }
  }, [contact.phone_verified_at]);

  // STEP 3 — Regole dinamiche + Upload
  const [docRules, setDocRules] = useState([]);  // [{doc_type,is_required,conditions}]
  const [docRulesLoaded, setDocRulesLoaded] = useState(false);
  const [verifReq, setVerifReq] = useState(null);// {id,state,...}
  const [documents, setDocuments] = useState({}); // { [doc_type]: {file_key,file_hash,...} }

  // STEP 4 — Privacy
  const [gdprHtml, setGdprHtml] = useState('');
  const [hasScrolled, setHasScrolled] = useState(false);
  const [privacy, setPrivacy] = useState({ accepted:false });

  useEffect(() => {
    let isActive = true;
    fetch('/gdpr_policy_en.html')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load GDPR policy: ${res.status}`);
        return res.text();
      })
      .then((html) => {
        if (isActive) setGdprHtml(html);
      })
      .catch((err) => {
        console.error('Failed to load GDPR policy', err);
      });
    return () => {
      isActive = false;
    };
  }, []);

  /** -------------------------
   * LOAD iniziale (stile atleti)
   * ------------------------- */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login-operator');
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { router.replace('/login-operator'); return; }
        setUser(u);

        const { data: types } = await supabase.from('op_type').select('id,code,name,active').eq('active',true).order('name');
        setOpTypes(types || []);

        const { data: acc } = await supabase
          .from('op_account')
          .select(`
            id, auth_user_id, type_id, wizard_status,
            op_profile:op_profile(*),
            op_contact:op_contact(*),
            op_verification_request:op_verification_request(id, state, reason, submitted_at,
              op_verification_document:op_verification_document(*)
            ),
            op_privacy_consent:op_privacy_consent(policy_version, accepted_at)
          `)
          .eq('auth_user_id', u.id)
          .maybeSingle();

        if (acc) {
          setAccount({ id: acc.id, type_id: acc.type_id, wizard_status: acc.wizard_status });

          const typeRow = (types || []).find(t => t.id === acc.type_id);
          if (typeRow) setSelectedTypeCode(typeRow.code);

          const prof = Array.isArray(acc.op_profile) ? acc.op_profile[0] : acc.op_profile;
          if (prof) {
            setProfile({
              legal_name: prof.legal_name || '',
              trade_name: prof.trade_name || '',
              website: prof.website || '',
              logo_url: prof.logo_url || '',
              address1: prof.address1 || '',
              address2: prof.address2 || '',
              city: prof.city || '',
              state_region: prof.state_region || '',
              postal_code: prof.postal_code || '',
              country: prof.country || ''
            });
            setLogoStoragePath(deriveStoragePathFromPublicUrl(prof.logo_url || '', OP_LOGO_BUCKET));
          } else {
            setLogoStoragePath('');
          }

          const c = Array.isArray(acc.op_contact) ? acc.op_contact[0] : acc.op_contact;
          if (c) setContact({
            email_primary: c.email_primary || (u.email || ''), email_billing: c.email_billing || '',
            phone_e164: c.phone_e164 || '', phone_verified_at: c.phone_verified_at || null
          });
          else setContact(prev => ({ ...prev, email_primary: u.email || '' }));

          const vr = Array.isArray(acc.op_verification_request) ? acc.op_verification_request[0] : acc.op_verification_request;
          if (vr) {
            setVerifReq({ id: vr.id, state: vr.state, reason: vr.reason, submitted_at: vr.submitted_at });
            const docs = Array.isArray(vr.op_verification_document) ? vr.op_verification_document : (vr.op_verification_document ? [vr.op_verification_document] : []);
            const mapped = {};
            for (const d of docs) mapped[d.doc_type] = {
              doc_type:d.doc_type, file_key:d.file_key, file_hash:d.file_hash, mime_type:d.mime_type, file_size:d.file_size, expires_at:d.expires_at
            };
            setDocuments(mapped);
          }

          const cons = Array.isArray(acc.op_privacy_consent) ? acc.op_privacy_consent[0] : acc.op_privacy_consent;
          if (cons?.accepted_at) setPrivacy({ accepted:true });

          const normalizedWizardStatus = acc?.wizard_status ? String(acc.wizard_status).trim().toUpperCase() : '';
          const normalizedReviewState = vr?.state ? String(vr.state).trim().toUpperCase() : '';

          if (normalizedReviewState === VERIF_STATE.VERIFIED || normalizedWizardStatus === WIZARD.COMPLETED) {
            writeStoredStep(null, u?.id || null);
            router.replace('/operator-dashboard');
            return;
          }

          if (normalizedWizardStatus === WIZARD.SUBMITTED || normalizedReviewState === VERIF_STATE.IN_REVIEW) {
            writeStoredStep(null, u?.id || null);
            router.replace('/operator-in-review');
            return;
          }
        } else {
          // nuovo operatore: Email primaria precompilata dalla sessione
          setContact(prev => ({ ...prev, email_primary: u.email || '' }));
        }
      } catch (e) {
        console.error(e);
        setErrorMessage(e?.message || 'Load error');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  // Carica regole documentali al cambio tipo
  useEffect(() => {
    const loadRules = async () => {
      setDocRulesLoaded(false);
      try {
        const typeRow = selectedTypeRow || (opTypes || []).find(t => t.id === account?.type_id);
        if (!typeRow) { setDocRules([]); setDocRulesLoaded(true); return; }
        const { data: rules } = await supabase
          .from('op_type_required_doc')
          .select('doc_type,is_required,conditions')
          .eq('type_id', typeRow.id)
          .order('is_required', { ascending:false })
          .order('doc_type', { ascending:true });
        setDocRules(rules || []);
        setDocRulesLoaded(true);
      } catch (e) {
        console.error('Doc rules error', e);
        setDocRules([]);
        setDocRulesLoaded(true);
      }
    };
    loadRules();
  }, [selectedTypeCode, account?.type_id, opTypes]);


  // OTP timers (stile atleti)
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);
  useEffect(() => {
    if (expiresIn <= 0) return;
    const id = setInterval(() => setExpiresIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [expiresIn]);

  useEffect(() => {
    let isMounted = true;
    const syncPhoneVerification = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!isMounted || !authUser) return;

        const authPhone = authUser.phone ? `+${String(authUser.phone).replace(/^\+?/, '')}` : '';

        if (!contact.phone_e164 && authPhone) {
          if (!isMounted) return;
          setContact((prev) => {
            if (prev.phone_e164) return prev;
            return { ...prev, phone_e164: authPhone };
          });
          return;
        }

        if (!contact.phone_e164 || !authPhone) return;

        const sameNumber = digitsOnly(contact.phone_e164) === digitsOnly(authPhone);
        if (!sameNumber) return;

        const confirmed = !!authUser.phone_confirmed_at;
        const phoneIdVerified = Array.isArray(authUser.identities)
          && authUser.identities.some((id) =>
            id?.provider === 'phone'
            && (id?.identity_data?.phone_verified === true || id?.identity_data?.phone_verified === 'true')
          );

        if (!(confirmed || phoneIdVerified)) return;

        const verifiedAt = contact.phone_verified_at || authUser.phone_confirmed_at || new Date().toISOString();

        if (!contact.phone_verified_at && isMounted) {
          setContact((prev) => (prev.phone_verified_at ? prev : { ...prev, phone_verified_at: verifiedAt }));
        }

        if (isMounted) {
          setOtpMsg((prev) => (prev === 'Phone already verified ✔' ? prev : 'Phone already verified ✔'));
          setOtpSent(false);
          setCooldown(0);
          setExpiresIn(0);
          setOtpCode('');
        }

        if (opId && !contact.phone_verified_at) {
          await supabase.from('op_contact').upsert([
            {
              op_id: opId,
              email_primary: contact.email_primary || (user?.email ?? ''),
              email_billing: toNullable(contact.email_billing),
              phone_e164: contact.phone_e164 || null,
              phone_verified_at: verifiedAt,
            },
          ], { onConflict: 'op_id' });
        }
      } catch (err) {
        console.error('Auto phone verification sync failed', err);
      }
    };

    syncPhoneVerification();

    return () => {
      isMounted = false;
    };
  }, [contact.phone_e164, contact.phone_verified_at, opId, user?.email]);

  /** -------------------------
   *  PERSISTENCE
   * ------------------------- */
  const updateWizardStatus = async (status) => {
    if (!opId) return;
    await supabase.from('op_account').update({ wizard_status: status }).eq('id', opId);
    setAccount((prev) => prev ? { ...prev, wizard_status: status } : prev);
  };

  const ensureAccount = useCallback(async () => {
    if (opId && account) return account;
    const typeRow = opTypes.find(t => t.code === selectedTypeCode);
    if (!user || !typeRow) throw new Error('Missing operator type or session.');
    const { data: inserted, error } = await supabase
      .from('op_account')
      .insert([{ auth_user_id: user.id, type_id: typeRow.id, wizard_status: WIZARD.IN_PROGRESS }])
      .select('id,type_id,wizard_status')
      .single();
    if (error) throw error;
    setAccount(inserted);
    return inserted;
  }, [account, opId, opTypes, selectedTypeCode, user]);

  // Save STEP 1
  const saveStep1 = async () => {
    const acc = await ensureAccount();
    const typeRow = opTypes.find(t => t.code === selectedTypeCode);
    if (!typeRow) throw new Error('Operator type is required.');
    if (acc.type_id !== typeRow.id) {
      await supabase.from('op_account').update({ type_id: typeRow.id }).eq('id', acc.id);
      setAccount(prev => prev ? { ...prev, type_id:typeRow.id } : prev);
    }
    const payload = {
      op_id: acc.id,
      legal_name: profile.legal_name,
      trade_name: toNullable(profile.trade_name),
      website: toNullable(profile.website),
      address1: profile.address1,
      address2: toNullable(profile.address2),
      city: profile.city,
      state_region: toNullable(profile.state_region),
      postal_code: profile.postal_code,
      country: normalizeCountryCode(profile.country),
      logo_url: toNullable(profile.logo_url),
    };
    const { error } = await supabase.from('op_profile').upsert([payload], { onConflict:'op_id' });
    if (error) throw error;
    await updateWizardStatus(WIZARD.IN_PROGRESS);
  };

  // Save STEP 2
  const saveStep2 = async () => {
    const acc = await ensureAccount();
    const websiteMeta = analyzeWebsiteValue(profile.website);
    const payload = {
      op_id: acc.id,
      email_primary: contact.email_primary || (user?.email ?? ''),
      email_billing: toNullable(contact.email_billing),
      phone_e164: contact.phone_e164 || null,
      phone_verified_at: contact.phone_verified_at || null,
    };
    const { error } = await supabase.from('op_contact').upsert([payload], { onConflict:'op_id' });
    if (error) throw error;

    const profilePayload = {
      op_id: acc.id,
      legal_name: profile.legal_name,
      trade_name: toNullable(profile.trade_name),
      website: websiteMeta.isValid ? websiteMeta.normalized : null,
      address1: profile.address1,
      address2: toNullable(profile.address2),
      city: profile.city,
      state_region: toNullable(profile.state_region),
      postal_code: profile.postal_code,
      country: normalizeCountryCode(profile.country),
      logo_url: toNullable(profile.logo_url),
    };
    const { error: profileErr } = await supabase.from('op_profile').upsert([profilePayload], { onConflict:'op_id' });
    if (profileErr) throw profileErr;

    if (websiteMeta.isValid) {
      setProfile((prev) => ({ ...prev, website: websiteMeta.normalized || '' }));
    }
    await updateWizardStatus(WIZARD.IN_PROGRESS);
  };

  // Ensure/Open verification request
  const ensureOpenRequest = useCallback(async () => {
    const acc = await ensureAccount();
    const { data: openReq, error } = await supabase
      .from('op_verification_request')
      .select('id,state,reason,submitted_at,op_verification_document:op_verification_document(*)')
      .eq('op_id', acc.id)
      .in('state', [VERIF_STATE.NOT_STARTED, VERIF_STATE.NEEDS_MORE_INFO])
      .order('created_at', { ascending:false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;

    if (openReq) {
      setVerifReq({ id: openReq.id, state: openReq.state, reason: openReq.reason, submitted_at: openReq.submitted_at });
      const docs = Array.isArray(openReq.op_verification_document)
        ? openReq.op_verification_document
        : (openReq.op_verification_document ? [openReq.op_verification_document] : []);
      const mapped = {};
      for (const d of docs) {
        mapped[d.doc_type] = {
          doc_type: d.doc_type,
          file_key: d.file_key,
          file_hash: d.file_hash,
          mime_type: d.mime_type,
          file_size: d.file_size,
          expires_at: d.expires_at,
        };
      }
      setDocuments(mapped);
      return { id: openReq.id, state: openReq.state, account_id: acc.id };
    }

    let previousDocs = [];
    try {
      const { data: latestRequest, error: latestErr } = await supabase
        .from('op_verification_request')
        .select('id,op_verification_document:op_verification_document(*)')
        .eq('op_id', acc.id)
        .order('created_at', { ascending:false })
        .limit(1)
        .maybeSingle();

      if (!latestErr && latestRequest) {
        const docsArray = Array.isArray(latestRequest.op_verification_document)
          ? latestRequest.op_verification_document
          : (latestRequest.op_verification_document ? [latestRequest.op_verification_document] : []);
        previousDocs = docsArray
          .filter(Boolean)
          .map((doc) => ({
            doc_type: doc.doc_type,
            file_key: doc.file_key,
            file_hash: doc.file_hash,
            mime_type: doc.mime_type,
            file_size: doc.file_size,
            expires_at: doc.expires_at || null,
          }));
      }
    } catch (latestErr) {
      console.warn('Unable to inspect previous operator verification request', latestErr);
    }

    const { data: created, error: insertErr } = await supabase
      .from('op_verification_request')
      .insert([{ op_id: acc.id, state: VERIF_STATE.NOT_STARTED }])
      .select('id,state,reason,submitted_at')
      .single();
    if (insertErr) throw insertErr;

    setVerifReq({
      id: created.id,
      state: created.state,
      reason: created.reason,
      submitted_at: created.submitted_at,
    });

    if (previousDocs.length > 0) {
      try {
        const payloads = previousDocs.map((doc) => ({
          verification_id: created.id,
          ...doc,
        }));
        const { data: clonedDocs, error: cloneErr } = await supabase
          .from('op_verification_document')
          .insert(payloads)
          .select('verification_id,doc_type,file_key,file_hash,mime_type,file_size,expires_at');

        if (cloneErr) throw cloneErr;

        const normalizedDocs = Array.isArray(clonedDocs)
          ? clonedDocs
          : (clonedDocs ? [clonedDocs] : []);

        const mapped = {};
        for (const doc of normalizedDocs) {
          mapped[doc.doc_type] = {
            doc_type: doc.doc_type,
            file_key: doc.file_key,
            file_hash: doc.file_hash,
            mime_type: doc.mime_type,
            file_size: doc.file_size,
            expires_at: doc.expires_at,
          };
        }

        setDocuments(mapped);
        setDocCleanupMessage('Previously uploaded documents have been restored. Please review them before resubmitting.');
      } catch (cloneErr) {
        console.error('Failed to restore previous operator documents', cloneErr);
        setDocuments({});
        setDocCleanupMessage('We could not restore your previous documents automatically. Please review them and upload again.');
      }
    } else {
      setDocuments({});
      setDocCleanupMessage('');
    }

    return { id: created.id, state: created.state, account_id: acc.id };
  }, [ensureAccount]);

  // Save STEP 3 (solo “ensure” + stato)
  const saveStep3 = async () => {
    await ensureOpenRequest();
    await updateWizardStatus(WIZARD.IN_PROGRESS);
  };

  useEffect(() => {
    if (step !== 3) return;
    ensureOpenRequest().catch((err) => {
      console.error('Failed to prepare verification request', err);
      setErrorMessage(err?.message || 'Unable to prepare verification request');
    });
  }, [step, ensureOpenRequest]);

  // Submit (STEP 4)
  const submitAll = async () => {
    const acc = await ensureAccount();
    const nowIso = new Date().toISOString();
    // insert privacy (storico)
    const { error: cErr } = await supabase.from('op_privacy_consent')
      .insert([{ op_id: acc.id, policy_version: PRIVACY_POLICY_VERSION, accepted:true, accepted_at: nowIso }]);
    if (cErr) throw cErr;
    const req = await ensureOpenRequest();
    const { error: rErr } = await supabase.from('op_verification_request')
      .update({ state: VERIF_STATE.IN_REVIEW, submitted_at: nowIso })
      .eq('id', req.id);
    if (rErr) throw rErr;
    await updateWizardStatus(WIZARD.SUBMITTED);
    router.replace('/operator-in-review');
  };

  const goBackOneStep = useCallback(() => {
    setStep((current) => {
      if (typeof current !== 'number' || current <= 1) return current;
      return current - 1;
    });
  }, []);

  const handleStepCircleSelect = useCallback((targetStep) => {
    setStep((current) => {
      if (typeof current !== 'number') return current;
      const normalized = Math.min(4, Math.max(1, targetStep));
      if (normalized >= current) return current;
      return normalized;
    });
  }, []);

  /** -------------------------
   *  OTP handlers (stile atleti)
   * ------------------------- */
  const ensureSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    return !!session && !error;
  };
  const sendCode = async () => {
    try {
      if (cooldown > 0) { setOtpMsg(`Please wait ${cooldown}s before requesting a new code.`); return; }
      if (!(await ensureSession())) { setOtpMsg('Session expired. Please sign in again.'); return; }
      if (!contact.phone_e164) { setOtpMsg('Enter a phone number first.'); return; }
      const { error } = await supabase.auth.updateUser({ phone: contact.phone_e164 });
      if (error) { setOtpMsg(`Failed to request OTP: ${error.message}`); return; }
      setOtpSent(true);
      setCooldown(COOLDOWN_SECONDS);
      setExpiresIn(OTP_TTL_SECONDS);
      setOtpMsg('OTP requested. Check your SMS.');
    } catch (e) { setOtpMsg(`Send error: ${e?.message || String(e)}`); }
  };
  const verifyCode = async () => {
    try {
      if (expiresIn <= 0) { setOtpMsg('The code has expired. Please request a new one.'); return; }
      if (!otpCode) { setOtpMsg('Enter the code.'); return; }
      const { error } = await supabase.auth.verifyOtp({ phone: contact.phone_e164, token: otpCode, type:'phone_change' });
      if (error) { setOtpMsg(`Verification failed${error.status ? ` [${error.status}]` : ''}: ${error.message}`); return; }
      const verifiedAt = new Date().toISOString();
      setContact((p) => ({ ...p, phone_verified_at: verifiedAt }));
      setOtpMsg('Phone verified ✔');
      setOtpCode('');
      setOtpSent(false);
      setCooldown(0);
      setExpiresIn(0);
      if (opId) {
        await supabase.from('op_contact').upsert([{
          op_id: opId,
          email_primary: contact.email_primary || (user?.email ?? ''),
          email_billing: toNullable(contact.email_billing),
          phone_e164: contact.phone_e164 || null,
          phone_verified_at: verifiedAt,
        }], { onConflict:'op_id' });
      }
    } catch (e) { setOtpMsg(`Verification error: ${e?.message || String(e)}`); }
  };

  /** -------------------------
   *  LOGO UPLOAD (stile wizard atleta)
   * ------------------------- */
  const handleLogoUpload = async (file) => {
    if (!file) return;
    const previousPreviewUrl = logoPreviewUrl;
    const previousWasObjectUrl = !!logoObjectUrlRef.current;
    cleanupLogoObjectUrl();
    const tempPreviewUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = tempPreviewUrl;
    setLogoPreviewUrl(tempPreviewUrl);
    try {
      setErrorMessage('');
      const acc = await ensureAccount();
      const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
      const timestamp = Date.now();
      const path = `op/${acc.id}/logo/logo-${timestamp}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(OP_LOGO_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });
      if (uploadError) throw uploadError;

      if (logoStoragePath && logoStoragePath !== path) {
        const { error: cleanupError } = await supabase.storage
          .from(OP_LOGO_BUCKET)
          .remove([logoStoragePath]);
        if (cleanupError) console.warn('Previous logo cleanup failed', cleanupError);
      }

      const { data } = supabase.storage.from(OP_LOGO_BUCKET).getPublicUrl(path);
      const publicUrl = data?.publicUrl || '';
      setProfile((prev) => ({ ...prev, logo_url: publicUrl || path }));
      setLogoStoragePath(path);
      await resolveLogoPreviewUrl(publicUrl || path);
    } catch (e) {
      console.error('Logo upload failed', e);
      setErrorMessage(e?.message ? `Logo upload failed: ${e.message}` : 'Logo upload failed');
      cleanupLogoObjectUrl();
      if (previousPreviewUrl && !previousWasObjectUrl) {
        setLogoPreviewUrl(previousPreviewUrl);
      } else {
        await resolveLogoPreviewUrl(profile.logo_url);
      }
    }
  };

  const handleLogoRemove = async () => {
    try {
      setErrorMessage('');
      const path = logoStoragePath || deriveStoragePathFromPublicUrl(profile.logo_url || '', OP_LOGO_BUCKET);
      if (path) {
        const { error: removeError } = await supabase.storage
          .from(OP_LOGO_BUCKET)
          .remove([path]);
        if (removeError) throw removeError;
      }
      setProfile((prev) => ({ ...prev, logo_url: '' }));
      setLogoStoragePath('');
      await resolveLogoPreviewUrl('');
    } catch (e) {
      console.error('Logo removal failed', e);
      setErrorMessage(e?.message ? `Logo removal failed: ${e.message}` : 'Logo removal failed');
    }
  };

  /** -------------------------
   *  UPLOAD DOCS (stile upload atleti)
   * ------------------------- */
  const handleUpload = async (file, docType) => {
    if (!file) return;
    let key;
    try {
      setErrorMessage('');
      setDocCleanupMessage('');
      const previous = documents[docType];
      const acc = await ensureAccount();
      const req = await ensureOpenRequest();
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      const originalName = file.name || `${docType}.pdf`;
      const safeName = originalName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_.-]/g, '_');
      const timestamp = Date.now();
      const folder = `op/${acc.id}/${docType}`;
      key = `${folder}/${req.id}-${timestamp}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(OP_DOCS_BUCKET)
        .upload(key, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      const payload = {
        verification_id: req.id,
        doc_type: docType,
        file_key: key,
        file_hash: fileHash,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
      };

      const { error: deleteError } = await supabase
        .from('op_verification_document')
        .delete()
        .match({ verification_id: req.id, doc_type: docType });
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from('op_verification_document')
        .insert([payload]);
      if (insertError) throw insertError;

      setDocuments((prev) => ({ ...prev, [docType]: { ...payload } }));

      if (previous?.file_key && previous.file_key !== key) {
        const { error: removeErr } = await supabase.storage
          .from(OP_DOCS_BUCKET)
          .remove([previous.file_key]);
        if (removeErr) console.warn('Previous file cleanup failed', removeErr);
      }
    } catch (e) {
      console.error('Upload error', e);
      setErrorMessage(e?.message ? `Upload failed: ${e.message}` : 'Upload failed');
      if (key) {
        const { error: cleanupErr } = await supabase.storage
          .from(OP_DOCS_BUCKET)
          .remove([key]);
        if (cleanupErr) console.warn('Failed to cleanup uploaded file after error', cleanupErr);
      }
    }
  };

  const handleRemove = async (docType) => {
    try {
      setErrorMessage('');
      setDocCleanupMessage('');
      const current = documents[docType];
      const req = await ensureOpenRequest();
      if (!req?.id) return;
      const { error: delErr } = await supabase
        .from('op_verification_document')
        .delete()
        .match({ verification_id: req.id, doc_type: docType });
      if (delErr) throw delErr;
      if (current?.file_key) {
        const { error: removeErr } = await supabase.storage
          .from(OP_DOCS_BUCKET)
          .remove([current.file_key]);
        if (removeErr) console.warn('Storage remove failed', removeErr);
      }
      setDocuments((prev) => {
        const clone = { ...prev };
        delete clone[docType];
        return clone;
      });
    } catch (e) {
      console.error('Remove error', e);
      setErrorMessage(e?.message ? `Remove failed: ${e.message}` : 'Remove failed');
    }
  };

  const cleanupDocumentsForTypeChange = useCallback(
    async ({ allowedDocTypes, nextTypeLabel }) => {
      setDocCleanupMessage('');
      const allowedSet =
        allowedDocTypes instanceof Set
          ? allowedDocTypes
          : new Set(Array.isArray(allowedDocTypes) ? allowedDocTypes : []);
      const staleEntries = Object.entries(documents).filter(([docType]) => !allowedSet.has(docType));
      if (staleEntries.length === 0) return;

      try {
        const req = await ensureOpenRequest();
        if (!req?.id) return;

        const docTypesToRemove = staleEntries.map(([docType]) => docType);
        const fileKeysToRemove = staleEntries
          .map(([, doc]) => doc?.file_key)
          .filter((key) => !!key);

        const { error: deleteErr } = await supabase
          .from('op_verification_document')
          .delete()
          .eq('verification_id', req.id)
          .in('doc_type', docTypesToRemove);
        if (deleteErr) throw deleteErr;

        if (fileKeysToRemove.length > 0) {
          const { error: storageErr } = await supabase.storage
            .from(OP_DOCS_BUCKET)
            .remove(fileKeysToRemove);
          if (storageErr) console.warn('Storage cleanup warning', storageErr);
        }

        setDocuments((prev) => {
          const clone = { ...prev };
          for (const docType of docTypesToRemove) delete clone[docType];
          return clone;
        });

        const docCount = docTypesToRemove.length;
        const docCountLabel = docCount === 1 ? 'One document' : `${docCount} documents`;
        const profileLabel = nextTypeLabel ? `${nextTypeLabel} profile` : 'selected operator type';
        setDocCleanupMessage(
          `${docCountLabel} ${docCount === 1 ? 'has' : 'have'} been cleared because you switched operator type. Please upload the documents required for the ${profileLabel}.`
        );
      } catch (err) {
        console.error('Automatic document cleanup failed', err);
        setErrorMessage(
          err?.message ? `Automatic document cleanup failed: ${err.message}` : 'Automatic document cleanup failed'
        );
      }
    },
    [documents, ensureOpenRequest]
  );

  const renderDocSection = (title, rules, badgeLabel) => {
    if (!rules || rules.length === 0) return null;
    const badgePalette = badgeLabel === 'Required'
      ? { bg:'#e7f5ff', border:'#a5d8ff', color:'#1c7ed6' }
      : { bg:'#f1f3f5', border:'#dee2e6', color:'#495057' };
    const statusUploaded = { bg:'#d3f9d8', border:'#b2f2bb', color:'#2f9e44' };
    const statusPending = { bg:'#fff4e6', border:'#ffd8a8', color:'#d9480f' };
    const statusBase = {
      display:'inline-flex',
      alignItems:'center',
      borderRadius:999,
      padding:'4px 10px',
      fontSize: FONT_SIZES.small,
      fontWeight:600,
      border:'1px solid transparent'
    };
    const dropzoneStyle = {
      border:'2px dashed #74c0fc',
      borderRadius:12,
      padding:'18px',
      background:'#f8f9fa',
      display:'grid',
      gap:6,
      justifyItems:'start',
      cursor:'pointer'
    };
    const replaceButtonStyle = {
      display:'inline-flex',
      alignItems:'center',
      gap:6,
      padding:'8px 14px',
      borderRadius:8,
      border:'1px solid #4dabf7',
      background:'#4dabf7',
      color:'#fff',
      fontWeight:600,
      cursor:'pointer'
    };
    const removeButtonStyle = {
      border:'1px solid #dee2e6',
      background:'#fff',
      color:'#c92a2a',
      fontWeight:600,
      borderRadius:8,
      padding:'8px 14px',
      cursor:'pointer'
    };

    return (
      <section key={badgeLabel} style={{ display:'grid', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ fontSize: FONT_SIZES.sectionHeading, fontWeight:700, color:'#212529' }}>{title}</div>
          <span
            style={{
              borderRadius:999,
              padding:'4px 10px',
              fontSize: FONT_SIZES.small,
              fontWeight:600,
              background:badgePalette.bg,
              border:`1px solid ${badgePalette.border}`,
              color:badgePalette.color
            }}
          >
            {badgeLabel}
          </span>
        </div>

        <div style={{ display:'grid', gap:12 }}>
          {rules.map((rule) => {
            const docType = rule.doc_type;
            const label = getDocLabel(docType, selectedTypeCode);
            const doc = documents[docType];
            const hasDoc = !!doc;
            const statusPalette = hasDoc ? statusUploaded : statusPending;
            const inputId = `doc-upload-${docType}`;
            const fileName = doc?.file_key ? doc.file_key.split('/').pop() : '';
            const fileSize = doc?.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : '—';

            return (
              <div
                key={docType}
                style={{
                  border:'1px solid #e9ecef',
                  borderRadius:12,
                  padding:16,
                  background:'#fff',
                  display:'grid',
                  gap:12
                }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                  <div
                    style={{
                      fontWeight:700,
                      color:'#212529',
                      fontSize: FONT_SIZES.body,
                      flex:1,
                      minWidth:0,
                      wordBreak:'break-word',
                      overflowWrap:'anywhere'
                    }}
                  >
                    {label}
                  </div>
                  <span
                    style={{
                      ...statusBase,
                      background:statusPalette.bg,
                      border:`1px solid ${statusPalette.border}`,
                      color:statusPalette.color
                    }}
                  >
                    {hasDoc ? 'Uploaded' : 'Pending'}
                  </span>
                </div>

                {!hasDoc ? (
                  <label htmlFor={inputId} style={dropzoneStyle}>
                    <span style={{ fontWeight:600, color:'#1864ab', fontSize: FONT_SIZES.body }}>Select a file</span>
                    <span style={{ fontSize: FONT_SIZES.small, color:'#495057' }}>PDF, JPG or PNG</span>
                  </label>
                ) : (
                  <div style={{ display:'grid', gap:12, color:'#495057' }}>
                    <div style={{ display:'grid', gap:4 }}>
                      <span style={{ fontSize: FONT_SIZES.small, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:'#868e96' }}>
                        Uploaded file
                      </span>
                      <span
                        style={{
                          fontSize: FONT_SIZES.body,
                          fontWeight:600,
                          color:'#212529',
                          wordBreak:'break-word',
                          overflowWrap:'anywhere'
                        }}
                      >
                        {fileName || 'Uploaded document'}
                      </span>
                    </div>

                    <div style={{ display:'flex', flexWrap:'wrap', gap:16, fontSize: FONT_SIZES.small }}>
                      <div><strong style={{ color:'#212529' }}>Size:</strong> {fileSize}</div>
                    </div>

                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                      <label htmlFor={inputId} style={replaceButtonStyle}>Replace file</label>
                      <button type="button" onClick={() => handleRemove(docType)} style={removeButtonStyle}>Remove</button>
                    </div>
                  </div>
                )}

                <input
                  id={inputId}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  style={{ display:'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await handleUpload(file, docType);
                    e.target.value = '';
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  /** -------------------------
   *  VALIDATIONS (stile atleti)
   * ------------------------- */
  const isValidStep1 =
    !!selectedTypeCode &&
    !!profile.legal_name &&
    !!profile.address1 && !!profile.city && !!profile.postal_code &&
    !!normalizeCountryCode(profile.country);

  const nationalLength = parsedPhone?.nationalNumber ? String(parsedPhone.nationalNumber).length : 0;
  const isValidPhone = !!parsedPhone && parsedPhone.isValid() && nationalLength >= 10;
  const websiteValidation = useMemo(() => analyzeWebsiteValue(profile.website), [profile.website]);
  const isWebsiteValid = websiteValidation.isValid;
  const isValidStep2 =
    !!contact.email_primary &&
    isValidPhone &&
    !!contact.phone_verified_at &&
    isWebsiteValid;

  const activeDocRules = useMemo(
    () => docRules.filter((r) => matchesConditions(r, { country: normalizeCountryCode(profile.country) })),
    [docRules, profile.country]
  );
  const requiredRules = useMemo(
    () => activeDocRules.filter((r) => r.is_required),
    [activeDocRules]
  );
  const optionalRules = useMemo(
    () => activeDocRules.filter((r) => !r.is_required),
    [activeDocRules]
  );
  useEffect(() => {
    if (!docRulesLoaded) return;

    const currentType = selectedTypeCode || '';
    const previousType = previousTypeRef.current || '';

    if (!currentType) {
      if (previousType) {
        cleanupDocumentsForTypeChange({
          allowedDocTypes: new Set(),
          nextTypeLabel: '',
        });
      } else {
        setDocCleanupMessage('');
      }
      previousTypeRef.current = currentType;
      return;
    }

    if (previousType && previousType !== currentType) {
      const allowedDocTypes = new Set(activeDocRules.map((rule) => rule.doc_type));
      cleanupDocumentsForTypeChange({
        allowedDocTypes,
        nextTypeLabel: selectedTypeRow?.name || currentType,
      });
    } else if (!previousType) {
      setDocCleanupMessage('');
    }

    previousTypeRef.current = currentType;
  }, [
    selectedTypeCode,
    docRulesLoaded,
    activeDocRules,
    cleanupDocumentsForTypeChange,
    selectedTypeRow?.name,
  ]);
  const requiredDocTypes = requiredRules.map((r) => r.doc_type);
  const isValidStep3 = docRulesLoaded && requiredDocTypes.every((dt) => !!documents[dt]);

  const operatorName = useMemo(() => {
    const base = profile.trade_name || profile.legal_name;
    return base ? base.trim() : 'Operator profile';
  }, [profile.trade_name, profile.legal_name]);

  const operatorInitials = useMemo(() => {
    const name = operatorName || '';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'OP';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }, [operatorName]);

  const heroAvatarSize = 108;
  const reviewCardStyle = {
    background:'#fff',
    border:'1px solid #eee',
    borderRadius:12,
    padding:16,
    boxShadow:'0 6px 14px rgba(0,0,0,0.04)',
    textAlign:'left',
  };
  const reviewCardTitleStyle = {
    fontWeight:800,
    marginBottom:8,
    fontSize: FONT_SIZES.sectionHeading,
    color:'#212529',
  };

  useEffect(() => {
    if (loading || !docRulesLoaded) return;
    if (hasInitializedStep.current) return;

    let computedStep = 4;
    if (!isValidStep1) computedStep = 1;
    else if (!isValidStep2) computedStep = 2;
    else if (!isValidStep3) computedStep = 3;
    else if (!privacy.accepted) computedStep = 4;

    const storedStep = readStoredStep();
    if (storedStep != null) {
      const normalizedStored = Math.min(4, Math.max(1, storedStep));
      computedStep = Math.min(normalizedStored, computedStep);
    }

    setStep(computedStep);
    hasInitializedStep.current = true;
  }, [
    loading,
    isValidStep1,
    isValidStep2,
    isValidStep3,
    privacy.accepted,
    docRules,
    documents,
    profile,
    contact,
    selectedTypeCode,
    docRulesLoaded,
    readStoredStep,
  ]);

  useEffect(() => {
    if (!hasInitializedStep.current) return;
    if (typeof step !== 'number') {
      writeStoredStep(null);
      return;
    }
    writeStoredStep(Math.min(4, Math.max(1, step)));
  }, [step, writeStoredStep]);

  /** -------------------------
   *  RENDER
   * ------------------------- */
  if (loading) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <div style={styles.userMenuContainer}>
              <div style={styles.menuIcon} onClick={() => setMenuOpen(!menuOpen)}>⋮</div>
            </div>
            <div style={styles.loaderContainer} role="status" aria-live="polite">
              <div style={styles.spinner} aria-hidden="true" />
              <span style={styles.srOnly}>Loading…</span>
            </div>
            <style jsx>{`@keyframes profileSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
          </div>
        </div>
      </div>
    );
  }

  const progressStep = typeof step === 'number' ? step : 4;

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          {/* MENU UTENTE (stile atleti) */}
          <div style={styles.userMenuContainer}>
            <div style={styles.menuIcon} onClick={() => setMenuOpen(!menuOpen)}>⋮</div>
            {menuOpen && (
              <div style={styles.dropdown}>
                <div style={styles.dropdownUser}>👤 {user?.email}</div>
                <button onClick={handleLogout} style={styles.dropdownButton}>Logout</button>
              </div>
            )}
          </div>

          <div className="tlx-card" style={{ ...styles.card, maxWidth: step === 4 ? '960px' : '450px' }}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <div style={styles.progressBar}><div style={{ ...styles.progressFill, width: `${(progressStep/4)*100}%` }} /></div>
            <div style={styles.steps}>
              {[1,2,3,4].map((s) => {
                const isCurrent = step === s;
                const isPast = typeof step === 'number' && s < step;
                return (
                  <div
                    key={s}
                    role="button"
                    tabIndex={isPast ? 0 : -1}
                    aria-disabled={!isPast}
                    aria-current={isCurrent ? 'step' : undefined}
                    aria-label={`Step ${s}`}
                    onClick={() => { if (isPast) handleStepCircleSelect(s); }}
                    onKeyDown={(event) => {
                      if (!isPast) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleStepCircleSelect(s);
                      }
                    }}
                    style={{
                      ...styles.stepCircle,
                      background: isCurrent ? '#27E3DA' : '#E0E0E0',
                      cursor: isPast ? 'pointer' : 'default',
                      opacity: isPast ? 0.85 : 1,
                    }}
                  >
                    {s}
                  </div>
                );
              })}
            </div>

            {docCleanupMessage && <p style={styles.info}>{docCleanupMessage}</p>}
            {errorMessage && <p style={styles.error}>{errorMessage}</p>}

            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity:0, x:50 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-50 }} transition={{ duration:0.4 }}>
                {/* STEP 1 — campi con LABEL DENTRO (placeholder), stile atleti */}
                {step === 1 && (
                  <>
                    <h2 style={styles.title}>Step 1 · Entity & Details</h2>
                    <div style={styles.formGroup}>
                      <Select
                        placeholder="Select operator type (Agent / Club)"
                        options={(opTypes || []).map(t => ({ value:t.code, label:t.name }))}
                        value={selectedTypeCode ? { value:selectedTypeCode, label:(opTypes.find(t => t.code === selectedTypeCode)?.name || selectedTypeCode) } : null}
                        onChange={(opt) => setSelectedTypeCode(opt?.value || '')}
                        styles={{ control:(base)=>({ ...base, padding:'2px', borderRadius:'8px', borderColor:'#ccc' }) }}
                      />
                      <input style={styles.input} placeholder={selectedTypeCode==='club' ? 'Legal name (company/club)' : 'Full legal name'}
                             value={profile.legal_name} onChange={(e)=> setProfile({ ...profile, legal_name:e.target.value })}/>
                      <input style={styles.input} placeholder="Address line 1" value={profile.address1}
                             onChange={(e)=> setProfile({ ...profile, address1:e.target.value })}/>
                      <input style={styles.input} placeholder="Address line 2 (optional)" value={profile.address2}
                             onChange={(e)=> setProfile({ ...profile, address2:e.target.value })}/>
                      <input style={styles.input} placeholder="City" value={profile.city}
                             onChange={(e)=> setProfile({ ...profile, city:e.target.value })}/>
                      <input style={styles.input} placeholder="State/Province (optional)" value={profile.state_region}
                             onChange={(e)=> setProfile({ ...profile, state_region:e.target.value })}/>
                      <input style={styles.input} placeholder="Postal / ZIP code" value={profile.postal_code}
                             onChange={(e)=> setProfile({ ...profile, postal_code:e.target.value })}/>
                      <Select
                        placeholder="Start typing Country"
                        options={countries}
                        value={countries.find(opt => opt.value === profile.country) || null}
                        onChange={(sel)=> setProfile({ ...profile, country: sel?.value || '' })}
                        filterOption={(option, input) => input.length >= 2 && option.label.toLowerCase().includes(input.toLowerCase())}
                        styles={{ control:(base)=>({ ...base, padding:'2px', borderRadius:'8px', borderColor:'#ccc' }) }}
                      />

                      <div style={styles.buttonRow}>
                        <button
                          type="button"
                          style={{ ...styles.secondaryButtonDisabled, flex: 1 }}
                          disabled
                        >
                          ⬅️ Previous
                        </button>
                        <button
                          style={isValidStep1 ? { ...styles.button, flex: 1 } : { ...styles.buttonDisabled, flex: 1 }}
                          onClick={async () => { try { if (!isValidStep1) return; await saveStep1(); setStep(2); } catch (e) { setErrorMessage(e.message); } }}
                          disabled={!isValidStep1}
                        >
                          Next ➡️
                        </button>
                      </div>
                      {!isValidStep1 && (
                        <ul style={styles.errList}>
                          {!selectedTypeCode && <li>Operator type missing</li>}
                          {!profile.legal_name && <li>Legal name missing</li>}
                          {!profile.address1 && <li>Address line 1 missing</li>}
                          {!profile.city && <li>City missing</li>}
                          {!profile.postal_code && <li>Postal/ZIP missing</li>}
                          {!normalizeCountryCode(profile.country) && <li>Country missing</li>}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                {/* STEP 2 — stile atleti: PhoneInput, OTP, errori inline */}
                {step === 2 && (
                  <>
                    <h2 style={styles.title}>Step 2 · Contacts, branding & verification</h2>
                    <div style={styles.formGroup}>
                      <input
                        style={{ ...styles.input, background:'#f8f9fa', cursor:'not-allowed' }}
                        type="email"
                        placeholder="Primary email"
                        value={contact.email_primary}
                        readOnly
                        aria-readonly="true"
                        title="Primary email is linked to your account"
                      />
                      <input style={styles.input} type="email" placeholder="Billing email (optional)"
                             value={contact.email_billing} onChange={(e)=> setContact({ ...contact, email_billing:e.target.value })}/>

                      <input
                        style={styles.input}
                        placeholder={selectedTypeCode==='club' ? 'Public name (optional)' : 'Professional name (optional)'}
                        value={profile.trade_name}
                        onChange={(e)=> setProfile({ ...profile, trade_name:e.target.value })}
                      />
                      <div style={{ display:'grid', gap:'4px' }}>
                        <input
                          style={{
                            ...styles.input,
                            border: (!isWebsiteValid && profile.website) ? '1px solid #f03e3e' : '1px solid #ccc',
                          }}
                          placeholder="Website (optional)"
                          value={profile.website}
                          onChange={(e)=> setProfile({ ...profile, website:e.target.value })}
                          onBlur={() => {
                            const meta = analyzeWebsiteValue(profile.website);
                            if (meta.isValid && meta.normalized) {
                              setProfile((prev) => ({ ...prev, website: meta.normalized }));
                            }
                          }}
                        />
                        {!isWebsiteValid && profile.website && (
                          <span style={{ color:'#c92a2a', fontSize: FONT_SIZES.small, textAlign:'left' }}>{websiteValidation.error}</span>
                        )}
                      </div>

                      <div style={{ display:'grid', gap:8, textAlign:'left' }}>
                        <span style={{ fontWeight:600 }}>Logo (optional)</span>
                        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                          <label
                            htmlFor="operator-logo-upload"
                            style={{
                              background:'linear-gradient(90deg, #27E3DA, #F7B84E)',
                              color:'#fff',
                              border:'none',
                              borderRadius:'8px',
                              padding:'0.6rem 1rem',
                              cursor:'pointer',
                              fontWeight:'bold'
                            }}
                          >
                            Choose file
                          </label>
                          <input
                            id="operator-logo-upload"
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                            style={{ display:'none' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) await handleLogoUpload(file);
                              if (e.target) e.target.value = '';
                            }}
                          />
                          <span style={{ fontSize: FONT_SIZES.small, color:'#495057' }}>PNG, JPG or SVG. Recommended square ratio.</span>
                        </div>
                        {logoPreviewUrl ? (
                          <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                            <img
                              src={logoPreviewUrl}
                              alt="Operator logo preview"
                              style={{ width:80, height:80, borderRadius:12, objectFit:'cover', border:'1px solid #dee2e6' }}
                            />
                            <button
                              type="button"
                              onClick={handleLogoRemove}
                              style={{
                                background:'#fff',
                                border:'1px solid #ced4da',
                                borderRadius:'8px',
                                padding:'0.5rem 0.9rem',
                                cursor:'pointer',
                                fontWeight:600,
                                color:'#c92a2a'
                              }}
                            >
                              Remove logo
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <PhoneInput
                        countryCodeEditable={false}
                        country={undefined}
                        value={contact.phone_e164 ? contact.phone_e164.replace(/^\+/, '') : ''}
                        onChange={(value) => {
                          const digits = digitsOnly(value);
                          const e164 = digits ? `+${digits}` : '';
                          const prevDigits = digitsOnly(contact.phone_e164);
                          setContact((prev) => {
                            if (digitsOnly(prev.phone_e164) === digits) return prev;
                            return { ...prev, phone_e164: e164, phone_verified_at: null };
                          });
                          if (prevDigits !== digits) {
                            setOtpMsg('');
                            setOtpSent(false);
                            setCooldown(0);
                            setExpiresIn(0);
                            setOtpCode('');
                          }
                        }}
                        enableSearch={true}
                        placeholder="Mobile phone number"
                        inputStyle={{ width:'100%', height:'48px', fontSize: FONT_SIZES.sectionHeading, borderRadius:'8px', paddingLeft:'48px', border:'1px solid #ccc', boxSizing:'border-box' }}
                        buttonStyle={{ border:'none', background:'none' }}
                        containerStyle={{ width:'100%' }}
                        dropdownStyle={{ borderRadius:'8px', zIndex:1000 }}
                      />

                      {/* OTP UI (stile atleti) */}
                      {!isPhoneVerified ? (
                        <div style={{ display:'grid', gap:'8px' }}>
                          <button
                            type="button"
                            onClick={sendCode}
                            disabled={!isValidPhone || cooldown > 0}
                            style={{
                              background: (!isValidPhone || cooldown > 0) ? '#ccc' : 'linear-gradient(90deg, #27E3DA, #F7B84E)',
                              color:'#fff', border:'none', padding:'0.6rem', borderRadius:'8px',
                              cursor:(!isValidPhone || cooldown > 0) ? 'not-allowed' : 'pointer', fontWeight:'bold'
                            }}
                          >
                            {otpSent ? 'Resend code' : 'Send code'}
                          </button>
                          <div style={{ marginTop:'6px', fontSize: FONT_SIZES.small, color:'#555', textAlign:'left' }}>
                            {cooldown > 0 ? <span>Resend in {fmtSecs(cooldown)}</span> : (otpSent && <span>You can resend now</span>)}
                            {expiresIn > 0 && <span style={{ marginLeft:8 }}>• Code expires in {fmtSecs(expiresIn)}</span>}
                          </div>

                          {otpSent && (
                            <div style={{ display:'flex', gap:'8px' }}>
                              <input type="text" inputMode="numeric" pattern="\d*" maxLength={6}
                                     placeholder="Enter 6-digit code" value={otpCode}
                                     onChange={(e)=> setOtpCode(e.target.value.replace(/\D/g,''))}
                                     style={{ ...styles.input, flex:1 }} />
                              <button
                                type="button"
                                onClick={verifyCode}
                                disabled={otpCode.length !== 6}
                                style={{
                                  background: otpCode.length === 6 ? 'linear-gradient(90deg, #27E3DA, #F7B84E)' : '#ccc',
                                  color:'#fff', border:'none', padding:'0.6rem 0.8rem', borderRadius:'8px',
                                  cursor: otpCode.length === 6 ? 'pointer' : 'not-allowed', fontWeight:'bold', whiteSpace:'nowrap'
                                }}
                              >
                                Confirm
                              </button>
                            </div>
                          )}
                          {otpMsg && (<div style={{ fontSize: FONT_SIZES.body, color:'#444' }}>{otpMsg}</div>)}
                        </div>
                      ) : (
                        <div style={{
                          display:'grid',
                          gap:'8px',
                          padding:'12px',
                          background:'#e8f9f6',
                          borderRadius:'8px',
                          color:'#145c4d',
                          fontWeight:600,
                          textAlign:'left'
                        }}>
                          <span>✅ Phone number verified.</span>
                          {otpMsg && (<div style={{ fontSize: FONT_SIZES.body, color:'#145c4d', fontWeight:500 }}>{otpMsg}</div>)}
                        </div>
                      )}

                      <div style={styles.buttonRow}>
                        <button
                          type="button"
                          style={{ ...styles.secondaryButton, flex: 1 }}
                          onClick={goBackOneStep}
                        >
                          ⬅️ Previous
                        </button>
                        <button
                          style={isValidStep2 ? { ...styles.button, flex: 1 } : { ...styles.buttonDisabled, flex: 1 }}
                          onClick={async () => { try { if (!isValidStep2) return; await saveStep2(); setStep(3); } catch (e) { setErrorMessage(e.message); } }}
                          disabled={!isValidStep2}
                        >
                          Next ➡️
                        </button>
                      </div>
                      {!isValidStep2 && (
                        <ul style={styles.errList}>
                          {!contact.email_primary && <li>Primary email missing</li>}
                          {!isWebsiteValid && profile.website && <li>Website URL invalid</li>}
                          {!isValidPhone && <li>Invalid phone number</li>}
                          {!contact.phone_verified_at && <li>Phone not verified</li>}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                {/* STEP 3 — Upload documenti dinamici (stile upload atleti) */}
                {step === 3 && (
                  <>
                    <h2 style={styles.title}>Step 3 · Verification documents</h2>
                    <div style={styles.formGroup}>
                      {!docRulesLoaded && <p style={{ textAlign:'left' }}>Loading document requirements…</p>}
                      {docRulesLoaded && activeDocRules.length === 0 && (
                        <p style={{ textAlign:'left' }}>No documents are required for the current configuration.</p>
                      )}

                      {docRulesLoaded && activeDocRules.length > 0 && (
                        <div style={{ display:'grid', gap:16, textAlign:'left' }}>
                          <div style={{ fontSize: FONT_SIZES.body, color:'#495057' }}>
                            Upload clear scans of the documents listed below. Accepted formats: PDF, JPG, PNG.
                          </div>

                          {renderDocSection('Required documents', requiredRules, 'Required')}
                          {optionalRules.length > 0 && renderDocSection('Optional documents', optionalRules, 'Optional')}
                        </div>
                      )}

                    <div style={styles.buttonRow}>
                      <button
                        type="button"
                        style={{ ...styles.secondaryButton, flex: 1 }}
                        onClick={goBackOneStep}
                      >
                        ⬅️ Previous
                      </button>
                      <button
                        style={isValidStep3 ? { ...styles.button, flex: 1 } : { ...styles.buttonDisabled, flex: 1 }}
                        onClick={async () => { try { if (!isValidStep3) return; await saveStep3(); setStep(4); } catch (e) { setErrorMessage(e.message); } }}
                        disabled={!isValidStep3}
                      >
                        Next ➡️
                      </button>
                    </div>
                      {!isValidStep3 && (
                        <ul style={styles.errList}>
                          {requiredDocTypes.filter((dt) => !documents[dt]).map((dt) => (
                            <li key={dt}>{getDocLabel(dt, selectedTypeCode)} missing</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                {/* STEP 4 — Privacy (stile atleti con scroll-to-enable) */}
                {step === 4 && (
                  <>
                    <h2 style={styles.title}>Step 4 · Review & Submission</h2>

                    {/* HERO */}
                    <div
                      className="tlx-hero"
                      style={{
                        display:'flex',
                        gap:20,
                        alignItems:'center',
                        flexWrap:'wrap',
                        textAlign:'left',
                        marginBottom:24,
                      }}
                    >
                      <div
                        aria-hidden
                        style={{
                          width:heroAvatarSize,
                          height:heroAvatarSize,
                          borderRadius:16,
                          background: logoPreviewUrl ? '#FFFFFF' : 'linear-gradient(135deg, #27E3DA, #3F8CFF)',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'center',
                          color: logoPreviewUrl ? '#111' : '#fff',
                          fontSize:32,
                          fontWeight:800,
                          boxShadow:'0 6px 14px rgba(0,0,0,0.08)',
                          overflow:'hidden',
                          border: logoPreviewUrl ? '1px solid #E9ECEF' : 'none'
                        }}
                      >
                        {logoPreviewUrl ? (
                          <img
                            src={logoPreviewUrl}
                            alt={`${operatorName || 'Operator'} logo`}
                            style={{ width:'100%', height:'100%', objectFit:'contain' }}
                          />
                        ) : (
                          operatorInitials
                        )}
                      </div>
                      <div style={{ flex:1, minWidth:240 }}>
                        <div style={{ fontSize: FONT_SIZES.title, fontWeight:800 }}>{operatorName}</div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
                          {selectedTypeRow?.name && <span style={chipStyle}>{selectedTypeRow.name}</span>}
                          {verifReq?.state && (
                            <span style={{ ...chipStyle, background:'#EDF2FF', borderColor:'#BAC8FF', color:'#364FC7' }}>
                              Status: {verifReq.state.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* GRID RIEPILOGO */}
                    <div
                      className="tlx-review-grid"
                      style={{
                        display:'grid',
                        gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',
                        gap:16,
                        width:'100%',
                        marginBottom:24,
                      }}
                    >
                      <div style={reviewCardStyle}>
                        <div style={reviewCardTitleStyle}>Company profile</div>
                        <div style={{ display:'grid', rowGap:8 }}>
                          <Row label="Legal name" value={profile.legal_name} />
                          <Row label="Trade name" value={profile.trade_name} />
                          <Row
                            label="Website"
                            value={websiteSummary ? (
                              <a
                                href={websiteSummary}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color:'#1C7ED6', textDecoration:'underline', fontSize: FONT_SIZES.small }}
                              >
                                {websiteSummary}
                              </a>
                            ) : ''}
                          />
                          <Row
                            label="Logo"
                            value={profile.logo_url ? (
                              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                                <span style={logoPreviewThumbStyle}>
                                  <img
                                    src={logoPreviewUrl || profile.logo_url}
                                    alt={`${operatorName || 'Operator'} logo preview`}
                                    style={{ width:'100%', height:'100%', objectFit:'contain' }}
                                  />
                                </span>
                                <a
                                  href={logoPreviewUrl || profile.logo_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color:'#1C7ED6', textDecoration:'underline', fontSize: FONT_SIZES.small }}
                                >
                                  Open logo
                                </a>
                              </div>
                            ) : ''}
                          />
                          <Row label="Address line 1" value={profile.address1} />
                          <Row label="Address line 2" value={profile.address2} />
                          <Row label="City" value={profile.city} />
                          <Row label="State / Region" value={profile.state_region} />
                          <Row label="Postal code" value={profile.postal_code} />
                          <Row label="Country" value={countryDisplayName} />
                        </div>
                      </div>

                      <div style={reviewCardStyle}>
                        <div style={reviewCardTitleStyle}>Contacts</div>
                        <div style={{ display:'grid', rowGap:8 }}>
                          <Row label="Primary email" value={contact.email_primary} />
                          <Row label="Billing email" value={contact.email_billing} />
                          <Row label="Phone" value={contact.phone_e164} />
                          <Row label="Phone verification" value={phoneVerificationLabel} />
                        </div>
                      </div>

                      <div style={reviewCardStyle}>
                        <div style={reviewCardTitleStyle}>Document status</div>
                        <div style={{ display:'grid', rowGap:8 }}>
                          {activeDocRules.length === 0 && (
                            <span style={{ color:'#555', fontSize: FONT_SIZES.body }}>No documents are required for this operator type.</span>
                          )}
                          {activeDocRules.map((rule) => {
                            const doc = documents[rule.doc_type];
                            const label = getDocLabel(rule.doc_type, selectedTypeCode);
                            const statusChip = doc
                              ? { ...chipStyle, background:'#D3F9D8', borderColor:'#8CE99A', color:'#2B8A3E' }
                              : rule.is_required
                                ? { ...chipStyle, background:'#FFE3E3', borderColor:'#FFA8A8', color:'#C92A2A' }
                                : { ...chipStyle, background:'#FFF4E6', borderColor:'#FFD8A8', color:'#D9480F' };
                            const statusLabel = doc ? 'Uploaded' : rule.is_required ? 'Missing' : 'Optional';
                            return (
                              <div key={rule.doc_type} style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                                <span style={{ fontWeight:600, color:'#444', fontSize: FONT_SIZES.body }}>{label}</span>
                                <span style={statusChip}>{statusLabel}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div
                      className="gdpr-box"
                      style={styles.gdprBox}
                      onScroll={(e) => {
                        const t = e.target;
                        if (t.scrollTop + t.clientHeight >= t.scrollHeight - 5) setHasScrolled(true);
                      }}
                      dangerouslySetInnerHTML={{ __html: gdprHtml }}
                    />

                    <label style={{ display:'block', marginTop:12 }}>
                      <input
                        type="checkbox"
                        disabled={!hasScrolled}
                        checked={!!privacy.accepted}
                        onChange={(e) => setPrivacy((prev) => ({ ...prev, accepted:e.target.checked }))}
                      />{' '}
                      I have read and agree to the GDPR Compliance Policy (v{PRIVACY_POLICY_VERSION})
                    </label>
                    <div style={{ ...styles.buttonRow, marginTop: 8 }}>
                      <button
                        type="button"
                        style={{ ...styles.secondaryButton, flex: 1 }}
                        onClick={goBackOneStep}
                      >
                        ⬅️ Previous
                      </button>
                      <button
                        style={privacy.accepted ? { ...styles.button, flex: 1 } : { ...styles.buttonDisabled, flex: 1 }}
                        onClick={async () => {
                          try {
                            if (!privacy.accepted) return;
                            await submitAll();
                          } catch (e) {
                            setErrorMessage(e.message);
                          }
                        }}
                        disabled={!privacy.accepted}
                      >
                        Submit for review
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/** =========================
 *  UTIL UI (stile atleti)
 *  ========================= */
const fmtSecs = (secs) => {
  const m = Math.floor(secs / 60); const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const Row = ({ label, value }) => {
  const displayValue = value == null || value === '' ? '—' : value;
  return (
    <div style={{ display:'flex', gap:6, alignItems:'flex-start', flexWrap:'wrap' }}>
      <span style={{ color:'#777', minWidth:120, fontSize: FONT_SIZES.small }}>{label}</span>
      <div
        style={{
          fontWeight:600,
          wordBreak:'break-word',
          overflowWrap:'anywhere',
          fontSize: FONT_SIZES.body,
          display:'flex',
          alignItems:'center',
          gap:8,
          flexWrap:'wrap'
        }}
      >
        {displayValue}
      </div>
    </div>
  );
};

const chipStyle = {
  background:'#F1F3F5',
  border:'1px solid #E9ECEF',
  borderRadius:999,
  padding:'4px 10px',
  fontSize: FONT_SIZES.small,
  fontWeight:700,
};

const logoPreviewThumbStyle = {
  width:56,
  height:56,
  borderRadius:12,
  border:'1px solid #E9ECEF',
  background:'#FFFFFF',
  display:'inline-flex',
  alignItems:'center',
  justifyContent:'center',
  overflow:'hidden',
};

const styles = {
  userMenuContainer:{ position:'absolute', top:'20px', right:'20px', zIndex:20 },
  menuIcon:{ background:'#27E3DA', color:'#fff', width:35, height:35, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', cursor:'pointer', boxShadow:'0 2px 6px rgba(0,0,0,0.2)' },
  dropdown:{ position:'absolute', top:45, right:0, background:'#FFF', border:'1px solid #E0E0E0', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.1)', minWidth:180, zIndex:100, padding:'0.5rem' },
  dropdownUser:{ padding:'0.5rem', fontSize: FONT_SIZES.body, color:'#555', borderBottom:'1px solid #eee', marginBottom:'0.5rem' },
  dropdownButton:{ background:'#DD5555', color:'#FFF', border:'none', padding:'0.5rem', width:'100%', borderRadius:'6px', cursor:'pointer' },

  background:{ backgroundImage:"url('/BackG.png')", backgroundSize:'cover', backgroundPosition:'center', backgroundRepeat:'no-repeat', width:'100%', minHeight:'100vh', position:'relative' },
  overlay:{ backgroundColor:'rgba(255,255,255,0.7)', width:'100%', minHeight:'100%', position:'static', zIndex:1 },
  container:{ minHeight:'100vh', display:'flex', justifyContent:'center', alignItems:'center', fontFamily:'Inter, sans-serif', position:'relative' },
  card:{ width:'100%', maxWidth:'450px', background:'rgba(248, 249, 250, 0.95)', padding:'2rem', borderRadius:'16px', boxShadow:'0 6px 20px rgba(0,0,0,0.08)', textAlign:'center', zIndex:2 },
  logo:{ width:80, marginBottom:'1rem' },
  progressBar:{ background:'#E0E0E0', height:8, borderRadius:8, marginBottom:'1rem' },
  progressFill:{ background:'linear-gradient(90deg, #27E3DA, #F7B84E)', height:'100%', borderRadius:8 },
  steps:{ display:'flex', justifyContent:'center', gap:'0.5rem', marginBottom:'1.5rem' },
  stepCircle:{ width:30, height:30, borderRadius:'50%', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold' },
  title:{ fontSize: FONT_SIZES.title, marginBottom:'1rem' },
  formGroup:{ display:'flex', flexDirection:'column', gap:'1rem', width:'100%' },
  input:{ width:'100%', padding:'0.8rem', borderRadius:'8px', border:'1px solid #ccc', boxSizing:'border-box' },
  button:{ background:'linear-gradient(90deg, #27E3DA, #F7B84E)', color:'#fff', border:'none', padding:'0.8rem', borderRadius:'8px', cursor:'pointer', width:'100%', fontWeight:'bold' },
  buttonDisabled:{ background:'#ccc', color:'#fff', border:'none', padding:'0.8rem', borderRadius:'8px', width:'100%', cursor:'not-allowed' },
  buttonRow:{ display:'flex', gap:'0.75rem', width:'100%', marginTop:'0.5rem' },
  secondaryButton:{ background:'#fff', color:'#27E3DA', border:'2px solid #27E3DA', padding:'0.8rem', borderRadius:'8px', cursor:'pointer', width:'100%', fontWeight:'bold' },
  secondaryButtonDisabled:{ background:'#f1f3f5', color:'#999', border:'2px solid #ced4da', padding:'0.8rem', borderRadius:'8px', width:'100%', cursor:'not-allowed', fontWeight:'bold' },
  info:{
    background:'#e7f5ff',
    border:'1px solid #a5d8ff',
    color:'#0b7285',
    fontSize: FONT_SIZES.body,
    padding:'0.75rem 1rem',
    borderRadius:8,
    textAlign:'left',
    marginBottom:'1rem'
  },
  error:{ color:'red', fontSize: FONT_SIZES.body, marginBottom:'1rem' },
  errList:{ color:'#b00', fontSize: FONT_SIZES.small, textAlign:'left', marginTop:'6px', paddingLeft:'18px' },

  loaderContainer:{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, padding:48, textAlign:'center', minHeight:'calc(100vh - 32px)', width:'100%' },
  spinner:{ width:48, height:48, borderRadius:'50%', border:'4px solid #27E3DA', borderTopColor:'#F7B84E', animation:'profileSpin 1s linear infinite' },
  srOnly:{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 },

  gdprBox:{ border:'1px solid #ccc', borderRadius:8, padding:12, maxHeight:200, overflowY:'auto', background:'#fafafa', fontSize: FONT_SIZES.small, textAlign:'left' },
};

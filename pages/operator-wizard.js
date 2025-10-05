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
const VERIF_STATE = { NOT_STARTED:'NOT_STARTED', IN_REVIEW:'IN_REVIEW', VERIFIED:'VERIFIED', REJECTED:'REJECTED', NEEDS_MORE_INFO:'NEEDS_MORE_INFO' };
const DOC_LABEL = {
  ID:'Identity document', LICENSE:'Professional license', REGISTRATION:'Business/club registration',
  AFFILIATION:'Federation affiliation', TAX:'Tax/VAT registration', REFERENCE:'Reference letter',
  PROOF_OF_ADDRESS:'Proof of address'
};

/** =========================
 *  HELPERS
 *  ========================= */
const toNullable = (s) => {
  if (s == null) return null;
  const t = String(s).trim();
  return t ? t : null;
};
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

  // STEP 1 — Anagrafica
  const [profile, setProfile] = useState({
    legal_name:'', trade_name:'', website:'',
    address1:'', address2:'', city:'', state_region:'', postal_code:'', country:''
  });

  // STEP 2 — Contatti & OTP
  const [contact, setContact] = useState({
    email_primary:'', email_billing:'', phone_e164:'', phone_verified_at:null
  });
  const normalizedPhone = (contact.phone_e164 || '').replace(/\s+/g, '');
  const parsedPhone = useMemo(() => parsePhoneNumberFromString(normalizedPhone), [normalizedPhone]);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpMsg, setOtpMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const isPhoneVerified = !!contact.phone_verified_at;

  // STEP 3 — Regole dinamiche + Upload
  const [docRules, setDocRules] = useState([]);  // [{doc_type,is_required,conditions}]
  const [docRulesLoaded, setDocRulesLoaded] = useState(false);
  const [verifReq, setVerifReq] = useState(null);// {id,state,...}
  const [documents, setDocuments] = useState({}); // { [doc_type]: {file_key,file_hash,...} }

  // STEP 4 — Privacy
  const [gdprHtml, setGdprHtml] = useState('');
  const [hasScrolled, setHasScrolled] = useState(false);
  const [privacy, setPrivacy] = useState({ accepted:false, marketing_optin:false });

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
            op_privacy_consent:op_privacy_consent(policy_version, accepted_at, marketing_optin)
          `)
          .eq('auth_user_id', u.id)
          .maybeSingle();

        if (acc) {
          setAccount({ id: acc.id, type_id: acc.type_id, wizard_status: acc.wizard_status });

          const typeRow = (types || []).find(t => t.id === acc.type_id);
          if (typeRow) setSelectedTypeCode(typeRow.code);

          const prof = Array.isArray(acc.op_profile) ? acc.op_profile[0] : acc.op_profile;
          if (prof) setProfile({
            legal_name: prof.legal_name || '', trade_name: prof.trade_name || '', website: prof.website || '',
            address1: prof.address1 || '', address2: prof.address2 || '', city: prof.city || '',
            state_region: prof.state_region || '', postal_code: prof.postal_code || '', country: prof.country || ''
          });

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
          if (cons?.accepted_at) setPrivacy({ accepted:true, marketing_optin: !!cons.marketing_optin });

          if (acc.wizard_status === WIZARD.SUBMITTED || acc.wizard_status === WIZARD.COMPLETED) {
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
          .eq('type_id', typeRow.id);
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

  /** -------------------------
   *  PERSISTENCE
   * ------------------------- */
  const updateWizardStatus = async (status) => {
    if (!opId) return;
    await supabase.from('op_account').update({ wizard_status: status }).eq('id', opId);
    setAccount((prev) => prev ? { ...prev, wizard_status: status } : prev);
  };

  const ensureAccount = async () => {
    if (opId) return account;
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
  };

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
      trade_name: profile.trade_name,
      website: toNullable(profile.website),
      address1: profile.address1,
      address2: toNullable(profile.address2),
      city: profile.city,
      state_region: toNullable(profile.state_region),
      postal_code: profile.postal_code,
      country: normalizeCountryCode(profile.country),
    };
    const { error } = await supabase.from('op_profile').upsert([payload], { onConflict:'op_id' });
    if (error) throw error;
    await updateWizardStatus(WIZARD.IN_PROGRESS);
  };

  // Save STEP 2
  const saveStep2 = async () => {
    const acc = await ensureAccount();
    const payload = {
      op_id: acc.id,
      email_primary: contact.email_primary || (user?.email ?? ''),
      email_billing: toNullable(contact.email_billing),
      phone_e164: contact.phone_e164 || null,
      phone_verified_at: contact.phone_verified_at || null,
    };
    const { error } = await supabase.from('op_contact').upsert([payload], { onConflict:'op_id' });
    if (error) throw error;
    await updateWizardStatus(WIZARD.IN_PROGRESS);
  };

  // Ensure/Open verification request
  const ensureOpenRequest = useCallback(async () => {
    const accId = opId || (await ensureAccount()).id;
    const { data: openReq } = await supabase
      .from('op_verification_request')
      .select('id,state,reason,submitted_at')
      .eq('op_id', accId)
      .in('state', [VERIF_STATE.NOT_STARTED, VERIF_STATE.IN_REVIEW, VERIF_STATE.NEEDS_MORE_INFO])
      .order('created_at', { ascending:false })
      .limit(1)
      .maybeSingle();
    if (openReq) { setVerifReq(openReq); return openReq; }

    const { data: created, error } = await supabase
      .from('op_verification_request')
      .insert([{ op_id: accId, state: VERIF_STATE.NOT_STARTED }])
      .select('id,state,reason,submitted_at')
      .single();
    if (error) throw error;
    setVerifReq(created);
    return created;
  }, [opId, ensureAccount]);

  // Save STEP 3 (solo “ensure” + stato)
  const saveStep3 = async () => {
    await ensureOpenRequest();
    await updateWizardStatus(WIZARD.IN_PROGRESS);
  };

  // Submit (STEP 4)
  const submitAll = async () => {
    const acc = await ensureAccount();
    const nowIso = new Date().toISOString();
    // insert privacy (storico)
    const { error: cErr } = await supabase.from('op_privacy_consent')
      .insert([{ op_id: acc.id, policy_version: PRIVACY_POLICY_VERSION, accepted:true, accepted_at: nowIso, marketing_optin: !!privacy.marketing_optin }]);
    if (cErr) throw cErr;
    const req = await ensureOpenRequest();
    const { error: rErr } = await supabase.from('op_verification_request')
      .update({ state: VERIF_STATE.IN_REVIEW, submitted_at: nowIso })
      .eq('id', req.id);
    if (rErr) throw rErr;
    await updateWizardStatus(WIZARD.SUBMITTED);
    router.replace('/operator-in-review');
  };

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
   *  UPLOAD DOCS (stile upload atleti)
   * ------------------------- */
  const handleUpload = async (file, docType) => {
    if (!file) return;
    try {
      const req = await ensureOpenRequest();
      const ab = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', ab);
      const hashArr = Array.from(new Uint8Array(hashBuf));
      const fileHash = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const key = `operators/${opId || 'new'}/${docType}-${Date.now()}.${ext}`;

      // bucket privato dedicato agli operatori
      const { error: upErr } = await supabase.storage.from('op_assets').upload(key, file, { cacheControl:'3600', upsert:false });
      if (upErr) throw upErr;

      // upsert manuale (no unique (verification_id, doc_type) in schema)
      const { data: existing } = await supabase
        .from('op_verification_document').select('id')
        .eq('verification_id', req.id).eq('doc_type', docType).maybeSingle();

      if (existing?.id) {
        const { error: updErr } = await supabase
          .from('op_verification_document')
          .update({ file_key:key, file_hash:fileHash, mime_type:file.type || 'application/octet-stream', file_size:file.size })
          .eq('id', existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from('op_verification_document')
          .insert([{ verification_id:req.id, doc_type:docType, file_key:key, file_hash:fileHash, mime_type:file.type || 'application/octet-stream', file_size:file.size }]);
        if (insErr) throw insErr;
      }

      setDocuments((prev) => ({ ...prev, [docType]: { doc_type:docType, file_key:key, file_hash:fileHash, mime_type:file.type, file_size:file.size } }));
    } catch (e) {
      console.error(e);
      setErrorMessage('Upload failed');
    }
  };

  const handleRemove = async (docType) => {
    try {
      const req = await ensureOpenRequest();
      const current = documents[docType];
      await supabase.from('op_verification_document').delete().match({ verification_id:req.id, doc_type:docType });
      if (current?.file_key) await supabase.storage.from('op_assets').remove([current.file_key]);
      setDocuments((prev) => { const c = { ...prev }; delete c[docType]; return c; });
    } catch (e) {
      console.error(e);
      setErrorMessage('Remove failed');
    }
  };

  /** -------------------------
   *  VALIDATIONS (stile atleti)
   * ------------------------- */
  const isValidStep1 =
    !!selectedTypeCode &&
    !!profile.legal_name && !!profile.trade_name &&
    !!profile.address1 && !!profile.city && !!profile.postal_code &&
    !!normalizeCountryCode(profile.country);

  const nationalLength = parsedPhone?.nationalNumber ? String(parsedPhone.nationalNumber).length : 0;
  const isValidPhone = !!parsedPhone && parsedPhone.isValid() && nationalLength >= 10;
  const isValidStep2 = !!contact.email_primary && isValidPhone && !!contact.phone_verified_at;

  const activeDocRules = docRules.filter((r) => matchesConditions(r, { country: normalizeCountryCode(profile.country) }));
  const requiredDocTypes = activeDocRules.filter((r) => r.is_required).map((r) => r.doc_type);
  const isValidStep3 = requiredDocTypes.every((dt) => !!documents[dt]);

  useEffect(() => {
    if (loading || !docRulesLoaded) return;
    if (hasInitializedStep.current) return;

    let nextStep = 4;
    if (!isValidStep1) nextStep = 1;
    else if (!isValidStep2) nextStep = 2;
    else if (!isValidStep3) nextStep = 3;
    else if (!privacy.accepted) nextStep = 4;

    setStep(nextStep);
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
  ]);

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
            <div style={styles.progressBar}><div style={{ ...styles.progressFill, width: `${(step/4)*100}%` }} /></div>
            <div style={styles.steps}>
              {[1,2,3,4].map((s) => (
                <div key={s} style={{ ...styles.stepCircle, background: step === s ? '#27E3DA' : '#E0E0E0' }}>{s}</div>
              ))}
            </div>

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
                      <input style={styles.input} placeholder={selectedTypeCode==='club' ? 'Public name' : 'Professional name (if different)'}
                             value={profile.trade_name} onChange={(e)=> setProfile({ ...profile, trade_name:e.target.value })}/>
                      <input style={styles.input} placeholder="Website (optional)" value={profile.website}
                             onChange={(e)=> setProfile({ ...profile, website:e.target.value })}/>
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

                      <button
                        style={isValidStep1 ? styles.button : styles.buttonDisabled}
                        onClick={async () => { try { if (!isValidStep1) return; await saveStep1(); setStep(2); } catch (e) { setErrorMessage(e.message); } }}
                        disabled={!isValidStep1}
                      >
                        Next ➡️
                      </button>
                      {!isValidStep1 && (
                        <ul style={styles.errList}>
                          {!selectedTypeCode && <li>Operator type missing</li>}
                          {!profile.legal_name && <li>Legal name missing</li>}
                          {!profile.trade_name && <li>Public/Professional name missing</li>}
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
                    <h2 style={styles.title}>Step 2 · Contacts & Phone verification</h2>
                    <div style={styles.formGroup}>
                      <input style={styles.input} type="email" placeholder="Primary email"
                             value={contact.email_primary} onChange={(e)=> setContact({ ...contact, email_primary:e.target.value })}/>
                      <input style={styles.input} type="email" placeholder="Billing email (optional)"
                             value={contact.email_billing} onChange={(e)=> setContact({ ...contact, email_billing:e.target.value })}/>

                      <PhoneInput
                        countryCodeEditable={false}
                        country={undefined}
                        value={contact.phone_e164 ? contact.phone_e164.replace(/^\+/, '') : ''}
                        onChange={(value) => {
                          const digits = (value || '').replace(/\D/g, '');
                          const e164 = digits ? `+${digits}` : '';
                          setContact((prev) => ({ ...prev, phone_e164:e164, phone_verified_at:null }));
                        }}
                        enableSearch={true}
                        placeholder="Mobile phone number"
                        inputStyle={{ width:'100%', height:'48px', fontSize:'16px', borderRadius:'8px', paddingLeft:'48px', border:'1px solid #ccc', boxSizing:'border-box' }}
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
                          <div style={{ marginTop:'6px', fontSize:'12px', color:'#555', textAlign:'left' }}>
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
                          {otpMsg && (<div style={{ fontSize:'0.9rem', color:'#444' }}>{otpMsg}</div>)}
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
                          {otpMsg && (<div style={{ fontSize:'0.9rem', color:'#145c4d', fontWeight:500 }}>{otpMsg}</div>)}
                        </div>
                      )}

                      <button
                        style={isValidStep2 ? styles.button : styles.buttonDisabled}
                        onClick={async () => { try { if (!isValidStep2) return; await saveStep2(); setStep(3); } catch (e) { setErrorMessage(e.message); } }}
                        disabled={!isValidStep2}
                      >
                        Next ➡️
                      </button>
                      {!isValidStep2 && (
                        <ul style={styles.errList}>
                          {!contact.email_primary && <li>Primary email missing</li>}
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
                      {activeDocRules.length === 0 && <p>No documents are required for the current configuration.</p>}
                      {activeDocRules.map((r) => {
                        const doc = documents[r.doc_type];
                        const label = DOC_LABEL[r.doc_type] || r.doc_type;
                        return (
                          <div key={r.doc_type} style={{ textAlign:'left', border:'1px solid #eee', borderRadius:12, padding:12, background:'#fff' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                              <div style={{ fontWeight:800 }}>{label}{r.is_required ? '' : ' · Optional'}</div>
                              {doc && (
                                <button
                                  type="button"
                                  onClick={() => handleRemove(r.doc_type)}
                                  style={{
                                    background:'rgba(255,255,255,0.9)', border:'1px solid #ccc', borderRadius:'50%',
                                    width:28, height:28, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0
                                  }}
                                  aria-label={`Remove ${label}`}
                                  title="Remove file"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="11" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                  </svg>
                                </button>
                              )}
                            </div>

                            {!doc ? (
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <label
                                  htmlFor={`file_${r.doc_type}`}
                                  style={{
                                    background:'linear-gradient(90deg, #27E3DA, #F7B84E)', color:'#fff', border:'none',
                                    borderRadius:'8px', padding:'0.5rem 1rem', cursor:'pointer', fontWeight:'bold'
                                  }}
                                >
                                  Choose file
                                </label>
                                <input
                                  id={`file_${r.doc_type}`}
                                  type="file"
                                  accept="image/*,application/pdf"
                                  style={{ display:'none' }}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    await handleUpload(file, r.doc_type);
                                    e.target.value = '';
                                  }}
                                />
                              </div>
                            ) : (
                              <div style={{ fontSize:12, color:'#555', wordBreak:'break-all', marginTop:6 }}>
                                <div><strong>Storage key:</strong> {doc.file_key}</div>
                                <div><strong>Hash:</strong> {doc.file_hash}</div>
                                <div><strong>MIME:</strong> {doc.mime_type || ''}</div>
                                <div><strong>Size:</strong> {(doc.file_size ? (doc.file_size/1024).toFixed(1) : '0.0')} KB</div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <button
                        style={isValidStep3 ? styles.button : styles.buttonDisabled}
                        onClick={async () => { try { if (!isValidStep3) return; await saveStep3(); setStep(4); } catch (e) { setErrorMessage(e.message); } }}
                        disabled={!isValidStep3}
                      >
                        Next ➡️
                      </button>
                      {!isValidStep3 && (
                        <ul style={styles.errList}>
                          {requiredDocTypes.filter((dt) => !documents[dt]).map((dt) => (
                            <li key={dt}>{DOC_LABEL[dt] || dt} missing</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                {/* STEP 4 — Privacy (stile atleti con scroll-to-enable) */}
                {step === 4 && (
                  <>
                    <h2 style={styles.title}>Step 4 · Privacy & Submission</h2>
                    <div className="gdpr-box"
                      style={styles.gdprBox}
                      onScroll={(e) => {
                        const t = e.target;
                        if (t.scrollTop + t.clientHeight >= t.scrollHeight - 5) setHasScrolled(true);
                      }}
                      dangerouslySetInnerHTML={{ __html: gdprHtml }}
                    />
                    <label style={{ display:'block', marginTop:12 }}>
                      <input type="checkbox" disabled={!hasScrolled} checked={!!privacy.accepted}
                             onChange={(e)=> setPrivacy(prev => ({ ...prev, accepted:e.target.checked }))} />{' '}
                      I have read and agree to the GDPR Compliance Policy (v{PRIVACY_POLICY_VERSION})
                    </label>
                    <label style={{ display:'block', marginTop:12 }}>
                      <input type="checkbox" checked={!!privacy.marketing_optin}
                             onChange={(e)=> setPrivacy(prev => ({ ...prev, marketing_optin:e.target.checked }))} />{' '}
                      I agree to receive TalentLix updates
                    </label>

                    <button
                      style={privacy.accepted ? { ...styles.button, marginTop:8 } : { ...styles.buttonDisabled, marginTop:8 }}
                      onClick={async () => { try { if (!privacy.accepted) return; await submitAll(); } catch (e) { setErrorMessage(e.message); } }}
                      disabled={!privacy.accepted}
                    >
                      Submit for review
                    </button>
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

const styles = {
  userMenuContainer:{ position:'absolute', top:'20px', right:'20px', zIndex:20 },
  menuIcon:{ background:'#27E3DA', color:'#fff', width:35, height:35, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', cursor:'pointer', boxShadow:'0 2px 6px rgba(0,0,0,0.2)' },
  dropdown:{ position:'absolute', top:45, right:0, background:'#FFF', border:'1px solid #E0E0E0', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.1)', minWidth:180, zIndex:100, padding:'0.5rem' },
  dropdownUser:{ padding:'0.5rem', fontSize:'0.9rem', color:'#555', borderBottom:'1px solid #eee', marginBottom:'0.5rem' },
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
  title:{ fontSize:'1.5rem', marginBottom:'1rem' },
  formGroup:{ display:'flex', flexDirection:'column', gap:'1rem', width:'100%' },
  input:{ width:'100%', padding:'0.8rem', borderRadius:'8px', border:'1px solid #ccc', boxSizing:'border-box' },
  button:{ background:'linear-gradient(90deg, #27E3DA, #F7B84E)', color:'#fff', border:'none', padding:'0.8rem', borderRadius:'8px', cursor:'pointer', width:'100%', fontWeight:'bold' },
  buttonDisabled:{ background:'#ccc', color:'#fff', border:'none', padding:'0.8rem', borderRadius:'8px', width:'100%', cursor:'not-allowed' },
  error:{ color:'red', fontSize:'0.9rem', marginBottom:'1rem' },
  errList:{ color:'#b00', fontSize:'12px', textAlign:'left', marginTop:'6px', paddingLeft:'18px' },

  loaderContainer:{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, padding:48, textAlign:'center', minHeight:'calc(100vh - 32px)', width:'100%' },
  spinner:{ width:48, height:48, borderRadius:'50%', border:'4px solid #27E3DA', borderTopColor:'#F7B84E', animation:'profileSpin 1s linear infinite' },
  srOnly:{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 },

  gdprBox:{ border:'1px solid #ccc', borderRadius:8, padding:12, maxHeight:200, overflowY:'auto', background:'#fafafa', fontSize:12, textAlign:'left' },
};

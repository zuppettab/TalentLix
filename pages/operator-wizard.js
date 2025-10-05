import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Select from 'react-select';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { supabase } from '../utils/supabaseClient';

// ------------------------------
// Costanti di configurazione
// ------------------------------
const PRIVACY_POLICY_VERSION = process.env.NEXT_PUBLIC_PRIVACY_POLICY_VERSION || '2024-01-01';
const COOLDOWN_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_RESEND_COOLDOWN || 60);  // resend OTP cooldown
const OTP_TTL_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_OTP_TTL || 600);          // OTP scadenza (sec)

// Tipi stato ammessi da DB (per chiarezza nell'UI)
const WIZARD = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  COMPLETED: 'COMPLETED',
};

const VERIF_STATE = {
  NOT_STARTED: 'NOT_STARTED',
  IN_REVIEW: 'IN_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  NEEDS_MORE_INFO: 'NEEDS_MORE_INFO',
};

// Doc types (enum DB) → label UI
const DOC_LABEL = {
  ID: 'Identity document',
  LICENSE: 'Professional license',
  REGISTRATION: 'Business/club registration',
  AFFILIATION: 'Federation affiliation',
  TAX: 'Tax/VAT registration',
  REFERENCE: 'Reference letter',
  PROOF_OF_ADDRESS: 'Proof of address',
};

// Country (ISO-3166 alpha‑2) min set; puoi sostituire con lista completa del tuo progetto
const COUNTRIES = [
  { value: 'IT', label: 'Italy' },
  { value: 'ES', label: 'Spain' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Germany' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
];

const SAVE_STYLES = {
  saveBar: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8, justifyContent: 'flex-end', flexWrap: 'nowrap' },
  saveBtnBase: { height: 38, padding: '0 16px', borderRadius: 8, fontWeight: 600, border: 'none' },
  saveBtnEnabled: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', cursor: 'pointer' },
  saveBtnDisabled: { background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed' },
  statusText: { marginLeft: 10, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' },
  statusOK: { color: '#2E7D32' },  // verde success
  statusERR: { color: '#b00' }     // rosso errore
};

// ------------------------------
// SaveBar (conforme linee guida)
// ------------------------------
function SaveBar({ saving, isSaveDisabled, status, onSubmit }) {
  const btnStyle = isSaveDisabled
    ? { ...SAVE_STYLES.saveBtnBase, ...SAVE_STYLES.saveBtnDisabled }
    : { ...SAVE_STYLES.saveBtnBase, ...SAVE_STYLES.saveBtnEnabled };

  return (
    <div style={SAVE_STYLES.saveBar}>
      <button
        type="button"
        disabled={isSaveDisabled}
        onClick={(e) => { e.preventDefault(); if (!isSaveDisabled) onSubmit?.(); }}
        style={btnStyle}
        aria-disabled={isSaveDisabled}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>

      {status?.msg && (
        <span role="status" aria-live="polite" style={{
          ...SAVE_STYLES.statusText,
          ...(status.type === 'error' ? SAVE_STYLES.statusERR : SAVE_STYLES.statusOK)
        }}>
          {status.msg}
        </span>
      )}
    </div>
  );
}

// ------------------------------
// Helper
// ------------------------------
const toNullable = (s) => {
  if (s == null) return null;
  const t = String(s).trim();
  return t ? t : null;
};

// Converte qualsiasi input (code o label) in ISO‑2 uppercase. Salva SEMPRE ISO‑2 a DB.
const normalizeCountryCode = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // se è già un codice valido
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  // match su label
  const match = COUNTRIES.find((c) => c.label.toLowerCase() === raw.toLowerCase());
  return match ? match.value : null;
};

// Applica conditions (JSON) del rule a un profilo (oggi supporta country; estendibile)
const matchesConditions = (rule, profile) => {
  const cond = rule?.conditions || null;
  if (!cond) return true;
  const country = profile?.country || null;
  if (Array.isArray(cond.country)) {
    if (!country) return false;
    return cond.country.map((x) => String(x).toUpperCase()).includes(String(country).toUpperCase());
  }
  // altre condizioni future...
  return true;
};

// ------------------------------
// Pagina Wizard Operatore
// ------------------------------
export default function OperatorWizard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  // sessione
  const [user, setUser] = useState(null);
  // account operatore
  const [account, setAccount] = useState(null);
  const opId = account?.id || null;

  // catalogo tipi
  const [opTypes, setOpTypes] = useState([]);     // [{id, code, name}]
  const [selectedTypeCode, setSelectedTypeCode] = useState(''); // 'agent' | 'club'
  const selectedType = opTypes.find(t => t.code === selectedTypeCode) || null;

  // Step, progress
  const [step, setStep] = useState(1);

  // Form Step1
  const [profile, setProfile] = useState({
    legal_name: '', trade_name: '',
    website: '', address1: '', address2: '',
    city: '', state_region: '', postal_code: '',
    country: '' // UI value ISO‑2
  });
  const [s1Saving, setS1Saving] = useState(false);
  const [s1Status, setS1Status] = useState({ type: '', msg: '' });
  const [s1Dirty, setS1Dirty] = useState(false);

  // Form Step2
  const [contact, setContact] = useState({
    email_primary: '', email_billing: '',
    phone_e164: '', phone_verified_at: null
  });
  const [s2Saving, setS2Saving] = useState(false);
  const [s2Status, setS2Status] = useState({ type: '', msg: '' });
  const [s2Dirty, setS2Dirty] = useState(false);

  // OTP
  const normalizedPhone = (contact.phone_e164 || '').replace(/\s+/g, '');
  const parsedPhone = useMemo(() => parsePhoneNumberFromString(normalizedPhone), [normalizedPhone]);
  const [otpSent, setOtpSent] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [otpCode, setOtpCode] = useState('');

  // Step3: regole dinamiche + upload
  const [docRules, setDocRules] = useState([]); // [{doc_type,is_required,conditions}]
  const [verifReq, setVerifReq] = useState(null); // {id, state, ...}
  const [documents, setDocuments] = useState({}); // { [doc_type]: { file_key,... } }
  const [s3Saving, setS3Saving] = useState(false);
  const [s3Status, setS3Status] = useState({ type: '', msg: '' });
  const [s3Dirty, setS3Dirty] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState('');

  // Step4: privacy
  const [privacy, setPrivacy] = useState({ accepted: false, marketing_optin: false });
  const [s4Submitting, setS4Submitting] = useState(false);
  const [s4Status, setS4Status] = useState({ type: '', msg: '' });

  // styles
  const styles = getStyles(step);

  // ------------------------------
  // Load iniziale: sessione, account, profilo, contatti, richiesta/verifica, consensi
  // ------------------------------
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // 1) sessione
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) {
          router.replace('/login-operator');
          return;
        }
        setUser(u);

        // 2) tipi operatore attivi (catalogo)
        const { data: typeRows } = await supabase.from('op_type').select('id, code, name, active').eq('active', true).order('name');
        setOpTypes(typeRows || []);

        // 3) account (potrebbe non esistere ancora, lo creeremo allo step 1)
        const { data: acc } = await supabase
          .from('op_account')
          .select(`
            id, auth_user_id, type_id, wizard_status,
            op_type:op_type!inner(id, code, name),
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
          setAccount({
            id: acc.id,
            wizard_status: acc.wizard_status,
            type_id: acc.type_id,
          });
          // tipo selezionato (da catalogo)
          const t = (typeRows || []).find(x => x.id === acc.type_id);
          if (t) setSelectedTypeCode(t.code);

          // profile
          const prof = Array.isArray(acc.op_profile) ? acc.op_profile[0] : acc.op_profile;
          if (prof) {
            setProfile({
              legal_name: prof.legal_name || '',
              trade_name: prof.trade_name || '',
              website: prof.website || '',
              address1: prof.address1 || '',
              address2: prof.address2 || '',
              city: prof.city || '',
              state_region: prof.state_region || '',
              postal_code: prof.postal_code || '',
              country: prof.country || '' // già ISO‑2 in DB
            });
          }

          // contact
          const c = Array.isArray(acc.op_contact) ? acc.op_contact[0] : acc.op_contact;
          if (c) {
            setContact({
              email_primary: c.email_primary || (u.email || ''),
              email_billing: c.email_billing || '',
              phone_e164: c.phone_e164 || '',
              phone_verified_at: c.phone_verified_at || null
            });
          } else {
            setContact((prev) => ({ ...prev, email_primary: u.email || '' }));
          }

          // verif request + docs
          const vr = Array.isArray(acc.op_verification_request) ? acc.op_verification_request[0] : acc.op_verification_request;
          if (vr) {
            setVerifReq({ id: vr.id, state: vr.state, reason: vr.reason, submitted_at: vr.submitted_at });
            const docs = Array.isArray(vr.op_verification_document) ? vr.op_verification_document : (vr.op_verification_document ? [vr.op_verification_document] : []);
            const mapped = {};
            for (const d of docs) {
              mapped[d.doc_type] = {
                doc_type: d.doc_type, file_key: d.file_key, file_hash: d.file_hash,
                mime_type: d.mime_type, file_size: d.file_size, expires_at: d.expires_at
              };
            }
            setDocuments(mapped);
          }

          // privacy già accettata (ultima riga nella select)
          const cons = Array.isArray(acc.op_privacy_consent) ? acc.op_privacy_consent[0] : acc.op_privacy_consent;
          if (cons?.accepted_at) {
            setPrivacy({ accepted: true, marketing_optin: !!cons.marketing_optin });
          }

          // step: se SUBMITTED/COMPLETED → redirect a stato review
          if (acc.wizard_status === WIZARD.SUBMITTED || acc.wizard_status === WIZARD.COMPLETED) {
            router.replace('/operator-in-review');
            return;
          }
        } else {
          // Account non esiste: partiamo da Step 1 e lo creiamo al Save dello step 1
          setContact((prev) => ({ ...prev, email_primary: u.email || '' }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  // Carica le regole documentali quando conosciamo il type_id (da account o dal select Step1)
  useEffect(() => {
    const loadDocRules = async () => {
      try {
        const typeRow = selectedType || (opTypes || []).find(t => t.id === account?.type_id);
        if (!typeRow) { setDocRules([]); return; }
        const { data: rules } = await supabase
          .from('op_type_required_doc')
          .select('doc_type, is_required, conditions')
          .eq('type_id', typeRow.id);
        setDocRules(rules || []);
      } catch (e) {
        console.error('Failed to load document rules', e);
        setDocRules([]);
      }
    };
    loadDocRules();
  }, [selectedTypeCode, account?.type_id, opTypes]);

  // countdown resend + expiry timer OTP
  useEffect(() => {
    let t1, t2;
    if (cooldown > 0) t1 = setInterval(() => setCooldown((v) => (v > 0 ? v - 1 : 0)), 1000);
    if (otpSent && expiresIn > 0) t2 = setInterval(() => setExpiresIn((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => { if (t1) clearInterval(t1); if (t2) clearInterval(t2); };
  }, [cooldown, otpSent, expiresIn]);

  // ------------------------------
  // Salvataggi per step
  // ------------------------------
  const updateWizardStatus = async (status) => {
    if (!opId) return;
    await supabase.from('op_account').update({ wizard_status: status }).eq('id', opId);
    setAccount((prev) => prev ? { ...prev, wizard_status: status } : prev);
  };

  const ensureAccount = async () => {
    if (opId) return account;
    // occorre il tipo selezionato per creare l'account (type_id NOT NULL)
    const typeRow = opTypes.find(t => t.code === selectedTypeCode);
    if (!user || !typeRow) throw new Error('Missing operator type or session.');

    const { data: inserted, error } = await supabase
      .from('op_account')
      .insert([{ auth_user_id: user.id, type_id: typeRow.id, wizard_status: WIZARD.IN_PROGRESS }])
      .select('id, type_id, wizard_status')
      .single();
    if (error) throw error;
    setAccount(inserted);
    return inserted;
  };

  // STEP 1 — save
  const saveStep1 = async () => {
    try {
      setS1Saving(true); setS1Status({ type: '', msg: '' });
      const acc = await ensureAccount(); // crea se manca

      // Se il tipo è cambiato rispetto all'account, aggiorna type_id e ricarica rules
      const typeRow = opTypes.find(t => t.code === selectedTypeCode);
      if (!typeRow) throw new Error('Operator type is required.');
      if (acc.type_id !== typeRow.id) {
        await supabase.from('op_account').update({ type_id: typeRow.id }).eq('id', acc.id);
        setAccount((prev) => prev ? { ...prev, type_id: typeRow.id } : prev);
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
        postal_code: profile.postal_code, // richiesto lato UI
        country: normalizeCountryCode(profile.country), // **ISO‑2** a DB
      };

      const { error } = await supabase.from('op_profile').upsert([payload], { onConflict: 'op_id' });
      if (error) throw error;

      await updateWizardStatus(WIZARD.IN_PROGRESS);
      setS1Status({ type: 'success', msg: 'Saved ✓' });
      setS1Dirty(false);
    } catch (e) {
      console.error(e);
      setS1Status({ type: 'error', msg: 'Save failed' });
      setS1Dirty(true);
    } finally {
      setS1Saving(false);
    }
  };

  // STEP 2 — save (contatti)
  const saveStep2 = async () => {
    try {
      setS2Saving(true); setS2Status({ type: '', msg: '' });
      const acc = await ensureAccount();
      const payload = {
        op_id: acc.id,
        email_primary: contact.email_primary || (user?.email ?? ''),
        email_billing: toNullable(contact.email_billing),
        phone_e164: contact.phone_e164 || null,
        phone_verified_at: contact.phone_verified_at || null,
      };
      const { error } = await supabase.from('op_contact').upsert([payload], { onConflict: 'op_id' });
      if (error) throw error;

      await updateWizardStatus(WIZARD.IN_PROGRESS);
      setS2Status({ type: 'success', msg: 'Saved ✓' });
      setS2Dirty(false);
    } catch (e) {
      console.error(e);
      setS2Status({ type: 'error', msg: 'Save failed' });
      setS2Dirty(true);
    } finally {
      setS2Saving(false);
    }
  };

  // STEP 3 — ensure open verification request
  const ensureOpenRequest = useCallback(async () => {
    const accId = opId || (await ensureAccount()).id;
    // cerca richiesta "aperta"
    const { data: openReq } = await supabase
      .from('op_verification_request')
      .select('id, state, reason, submitted_at')
      .eq('op_id', accId)
      .in('state', [VERIF_STATE.NOT_STARTED, VERIF_STATE.IN_REVIEW, VERIF_STATE.NEEDS_MORE_INFO])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openReq) { setVerifReq(openReq); return openReq; }

    // crea una nuova richiesta NOT_STARTED
    const { data: created, error } = await supabase
      .from('op_verification_request')
      .insert([{ op_id: accId, state: VERIF_STATE.NOT_STARTED }])
      .select('id, state, reason, submitted_at')
      .single();
    if (error) throw error;
    setVerifReq(created);
    return created;
  }, [opId, ensureAccount]);

  // STEP 3 — save note (facoltativo)
  const saveStep3 = async () => {
    try {
      setS3Saving(true); setS3Status({ type: '', msg: '' });
      await ensureOpenRequest(); // si limita a garantire l'esistenza della richiesta
      await updateWizardStatus(WIZARD.IN_PROGRESS);
      setS3Status({ type: 'success', msg: 'Saved ✓' });
      setS3Dirty(false);
    } catch (e) {
      console.error(e);
      setS3Status({ type: 'error', msg: 'Save failed' });
      setS3Dirty(true);
    } finally {
      setS3Saving(false);
    }
  };

  // STEP 4 — submit (privacy INSERT + richiesta → IN_REVIEW + wizard → SUBMITTED)
  const submitAll = async () => {
    try {
      setS4Submitting(true); setS4Status({ type: '', msg: '' });
      const acc = await ensureAccount();
      const nowIso = new Date().toISOString();

      // 1) INSERT privacy (storico, no upsert)
      const { error: cErr } = await supabase
        .from('op_privacy_consent')
        .insert([{ op_id: acc.id, policy_version: PRIVACY_POLICY_VERSION, accepted: true, accepted_at: nowIso, marketing_optin: !!privacy.marketing_optin }]);
      if (cErr) throw cErr;

      // 2) ensure richiesta e portala IN_REVIEW
      const req = await ensureOpenRequest();
      const { error: rErr } = await supabase
        .from('op_verification_request')
        .update({ state: VERIF_STATE.IN_REVIEW, submitted_at: nowIso })
        .eq('id', req.id);
      if (rErr) throw rErr;

      // 3) wizard → SUBMITTED
      await updateWizardStatus(WIZARD.SUBMITTED);

      // redirect
      router.replace('/operator-in-review');
    } catch (e) {
      console.error(e);
      setS4Status({ type: 'error', msg: 'Submit failed' });
      setS4Submitting(false);
    }
  };

  // ------------------------------
  // OTP handlers (Step 2)
  // ------------------------------
  const ensureSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    return !!session && !error;
  };

  const sendCode = async () => {
    try {
      if (cooldown > 0) { setOtpMsg(`Please wait ${cooldown}s.`); return; }
      if (!(await ensureSession())) { setOtpMsg('Session expired. Sign in again.'); return; }
      if (!contact.phone_e164) { setOtpMsg('Enter a phone number first.'); return; }
      const { error } = await supabase.auth.updateUser({ phone: contact.phone_e164 });
      if (error) throw error;
      setOtpMsg('OTP sent. Check your SMS.');
      setOtpSent(true);
      setCooldown(COOLDOWN_SECONDS);
      setExpiresIn(OTP_TTL_SECONDS);
    } catch (e) {
      setOtpMsg(e?.message || 'Failed to send OTP');
    }
  };

  const verifyCode = async () => {
    try {
      if (expiresIn <= 0) { setOtpMsg('Code expired. Request a new one.'); return; }
      if (!otpCode) { setOtpMsg('Enter the code.'); return; }
      const { error } = await supabase.auth.verifyOtp({
        phone: contact.phone_e164,
        token: otpCode,
        type: 'phone_change',
      });
      if (error) throw error;
      const verifiedAt = new Date().toISOString();
      setContact((prev) => ({ ...prev, phone_verified_at: verifiedAt }));
      setOtpMsg('Phone verified ✔');
      setOtpCode('');

      // persisti immediatamente la verifica
      if (opId) {
        await supabase.from('op_contact').upsert([{
          op_id: opId,
          email_primary: contact.email_primary || (user?.email ?? ''),
          email_billing: toNullable(contact.email_billing),
          phone_e164: contact.phone_e164 || null,
          phone_verified_at: verifiedAt,
        }], { onConflict: 'op_id' });
      }
    } catch (e) {
      setOtpMsg(`Verification failed: ${e?.message || 'Error'}`);
    }
  };

  // ------------------------------
  // Upload/Rimozione documenti (Step 3)
  // ------------------------------
  const handleUpload = async (file, docType) => {
    if (!file) return;
    try {
      setUploadingDoc(docType);
      const req = await ensureOpenRequest();
      // calcolo hash SHA-256 via Web Crypto
      const ab = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', ab);
      const hashArr = Array.from(new Uint8Array(hashBuf));
      const fileHash = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const fileKey = `operators/${opId || 'new'}/${docType}-${Date.now()}.${ext}`;

      // upload al bucket "op_assets" (privato)
      const { error: upErr } = await supabase.storage.from('op_assets').upload(fileKey, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;

      // INSERT/UPDATE senza onConflict (lo schema non espone UNIQUE su (verification_id,doc_type))
      // 1) esiste già?
      const { data: existing } = await supabase
        .from('op_verification_document')
        .select('id')
        .eq('verification_id', req.id)
        .eq('doc_type', docType)
        .maybeSingle();

      if (existing?.id) {
        const { error: updErr } = await supabase
          .from('op_verification_document')
          .update({
            file_key: fileKey, file_hash: fileHash,
            mime_type: file.type || 'application/octet-stream',
            file_size: file.size
          })
          .eq('id', existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from('op_verification_document')
          .insert([{
            verification_id: req.id,
            doc_type: docType,
            file_key: fileKey,
            file_hash: fileHash,
            mime_type: file.type || 'application/octet-stream',
            file_size: file.size
          }]);
        if (insErr) throw insErr;
      }

      // aggiorna stato UI
      setDocuments((prev) => ({
        ...prev,
        [docType]: { doc_type: docType, file_key: fileKey, file_hash: fileHash, mime_type: file.type, file_size: file.size }
      }));
      setS3Dirty(true);
      setS3Status({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setS3Status({ type: 'error', msg: 'Upload failed' });
    } finally {
      setUploadingDoc('');
    }
  };

  const handleRemove = async (docType) => {
    try {
      setUploadingDoc(docType);
      const req = await ensureOpenRequest();
      const current = documents[docType];
      // elimina DB
      await supabase.from('op_verification_document').delete().match({ verification_id: req.id, doc_type: docType });
      // elimina storage
      if (current?.file_key) await supabase.storage.from('op_assets').remove([current.file_key]);
      // aggiorna UI
      setDocuments((prev) => {
        const copy = { ...prev }; delete copy[docType]; return copy;
      });
      setS3Dirty(true);
      setS3Status({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setS3Status({ type: 'error', msg: 'Remove failed' });
    } finally {
      setUploadingDoc('');
    }
  };

  // ------------------------------
  // Validazioni / gating step
  // ------------------------------
  const isValidStep1 = !!selectedTypeCode
    && !!profile.legal_name && !!profile.trade_name
    && !!profile.address1 && !!profile.city
    && !!profile.postal_code && !!normalizeCountryCode(profile.country);

  const nationalLength = parsedPhone?.nationalNumber ? String(parsedPhone.nationalNumber).length : 0;
  const isValidPhone = !!parsedPhone && parsedPhone.isValid() && nationalLength >= 10;

  const isValidStep2 = !!contact.email_primary && isValidPhone && !!contact.phone_verified_at;

  // document pack filtrato per condizioni attive (profile.country)
  const activeDocRules = docRules.filter((r) => matchesConditions(r, { country: normalizeCountryCode(profile.country) }));
  const requiredDocTypes = activeDocRules.filter((r) => r.is_required).map((r) => r.doc_type);
  const isValidStep3 = requiredDocTypes.every((dt) => !!documents[dt]);

  const canSubmit = privacy.accepted;

  // ------------------------------
  // UI rendering
  // ------------------------------
  if (loading) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <div style={styles.card}><p>Loading operator wizard…</p></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={{ ...styles.card, maxWidth: step === 4 ? '960px' : '560px' }}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <Progress step={step} />
            {/* STEP SWITCH */}
            {step === 1 && (
              <>
                <h2 style={styles.title}>Step 1 · Entity type & details</h2>

                {/* Tipo Operatore */}
                <label style={styles.label}>Operator type</label>
                <Select
                  placeholder="Select type"
                  options={(opTypes || []).map(t => ({ value: t.code, label: t.name }))}
                  value={selectedTypeCode ? { value: selectedTypeCode, label: (opTypes.find(t => t.code === selectedTypeCode)?.name || selectedTypeCode) } : null}
                  onChange={(opt) => { setSelectedTypeCode(opt?.value || ''); setS1Dirty(true); setS1Status({ type: '', msg: '' }); }}
                />

                {/* Labels adattive per Agent/Club */}
                <label style={styles.label}>{selectedTypeCode === 'club' ? 'Legal name (company/club)' : 'Full legal name'}</label>
                <input style={styles.input} value={profile.legal_name}
                       onChange={(e) => { setProfile({ ...profile, legal_name: e.target.value }); setS1Dirty(true); if (s1Status.type) setS1Status({ type: '', msg: '' }); }} />

                <label style={styles.label}>{selectedTypeCode === 'club' ? 'Public name' : 'Professional name (if different)'}</label>
                <input style={styles.input} value={profile.trade_name}
                       onChange={(e) => { setProfile({ ...profile, trade_name: e.target.value }); setS1Dirty(true); if (s1Status.type) setS1Status({ type: '', msg: '' }); }} />

                <label style={styles.label}>Website (optional)</label>
                <input style={styles.input} value={profile.website}
                       onChange={(e) => { setProfile({ ...profile, website: e.target.value }); setS1Dirty(true); if (s1Status.type) setS1Status({ type: '', msg: '' }); }} />

                <label style={styles.label}>Address</label>
                <input style={styles.input} placeholder="Address line 1" value={profile.address1}
                       onChange={(e) => { setProfile({ ...profile, address1: e.target.value }); setS1Dirty(true); if (s1Status.type) setS1Status({ type: '', msg: '' }); }} />
                <input style={styles.input} placeholder="Address line 2 (optional)" value={profile.address2}
                       onChange={(e) => { setProfile({ ...profile, address2: e.target.value }); setS1Dirty(true); if (s1Status.type) setS1Status({ type: '', msg: '' }); }} />

                <div style={styles.cols}>
                  <div>
                    <label style={styles.label}>City</label>
                    <input style={styles.input} value={profile.city}
                           onChange={(e) => { setProfile({ ...profile, city: e.target.value }); setS1Dirty(true); if (s1Status.type) setS1Status({ type: '', msg: '' }); }} />
                  </div>
                  <div>
                    <label style={styles.label}>State/Province (optional)</label>
                    <input style={styles.input} value={profile.state_region}
                           onChange={(e) => { setProfile({ ...profile, state_region: e.target.value }); setS1Dirty(true); if (s1Status.type) setS1Status({ type: '', msg: '' }); }} />
                  </div>
                </div>

                <div style={styles.cols}>
                  <div>
                    <label style={styles.label}>Postal / ZIP code</label>
                    <input style={styles.input} value={profile.postal_code}
                           onChange={(e) => { setProfile({ ...profile, postal_code: e.target.value }); setS1Dirty(true); if (s1Status.type) setS1Status({ type: '', msg: '' }); }} />
                  </div>
                  <div>
                    <label style={styles.label}>Country</label>
                    <Select
                      placeholder="Start typing country"
                      options={COUNTRIES}
                      value={COUNTRIES.find((c) => c.value === profile.country) || null}
                      onChange={(opt) => { setProfile({ ...profile, country: opt?.value || '' }); setS1Dirty(true); if (s1Status.type) setS1Status({ type: '', msg: '' }); }}
                      filterOption={(option, input) => input.length >= 2 && option.label.toLowerCase().includes(input.toLowerCase())}
                    />
                  </div>
                </div>

                <SaveBar saving={s1Saving} isSaveDisabled={!s1Dirty || !isValidStep1} status={s1Status} onSubmit={saveStep1} />
                <button style={isValidStep1 ? styles.primaryBtn : styles.primaryBtnDisabled} disabled={!isValidStep1}
                        onClick={async () => { await saveStep1(); if (isValidStep1) setStep(2); }}>
                  Next ➜
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h2 style={styles.title}>Step 2 · Contacts & phone verification</h2>

                <label style={styles.label}>Primary email</label>
                <input style={styles.input} type="email" value={contact.email_primary}
                       onChange={(e) => { setContact({ ...contact, email_primary: e.target.value }); setS2Dirty(true); if (s2Status.type) setS2Status({ type: '', msg: '' }); }} />

                <label style={styles.label}>Billing email (optional)</label>
                <input style={styles.input} type="email" value={contact.email_billing}
                       onChange={(e) => { setContact({ ...contact, email_billing: e.target.value }); setS2Dirty(true); if (s2Status.type) setS2Status({ type: '', msg: '' }); }} />

                <label style={styles.label}>Phone (E.164)</label>
                <PhoneInput
                  country={parsedPhone?.country?.toLowerCase() || 'it'}
                  value={contact.phone_e164}
                  onChange={(value) => {
                    const formatted = value.startsWith('+') ? value : `+${value}`;
                    setContact({ ...contact, phone_e164: formatted, phone_verified_at: null });
                    setS2Dirty(true);
                    if (s2Status.type) setS2Status({ type: '', msg: '' });
                  }}
                  inputStyle={{ width: '100%' }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" style={styles.secondaryBtn} onClick={sendCode}>
                    {cooldown > 0 ? `Resend (${cooldown}s)` : 'Send code'}
                  </button>
                  <input style={{ ...styles.input, width: 140 }} placeholder="OTP" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} />
                  <button type="button" style={styles.secondaryBtn} onClick={verifyCode}>Verify</button>
                </div>
                {otpMsg && <p style={{ fontSize: 12, color: otpMsg.includes('✔') ? '#2E7D32' : '#B00020', textAlign: 'left' }}>{otpMsg}</p>}

                <SaveBar saving={s2Saving} isSaveDisabled={!s2Dirty || !isValidStep2} status={s2Status} onSubmit={saveStep2} />
                <button style={isValidStep2 ? styles.primaryBtn : styles.primaryBtnDisabled} disabled={!isValidStep2}
                        onClick={async () => { await saveStep2(); if (isValidStep2) setStep(3); }}>
                  Next ➜
                </button>
              </>
            )}

            {step === 3 && (
              <>
                <h2 style={styles.title}>Step 3 · Verification documents</h2>

                {activeDocRules.length === 0 && (
                  <p>No documents are required for the current configuration.</p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {activeDocRules.map((r) => {
                    const doc = documents[r.doc_type];
                    const label = DOC_LABEL[r.doc_type] || r.doc_type;
                    return (
                      <div key={r.doc_type} style={{ textAlign: 'left' }}>
                        <p style={{ fontWeight: 600, marginBottom: 8 }}>
                          {label}{r.is_required ? '' : ' · Optional'}
                        </p>

                        {doc ? (
                          <div style={{ fontSize: 12, color: '#555', wordBreak: 'break-all' }}>
                            <div><strong>Storage key:</strong> {doc.file_key}</div>
                            <div><strong>Hash:</strong> {doc.file_hash}</div>
                            <div><strong>MIME:</strong> {doc.mime_type || ''}</div>
                            <div><strong>Size:</strong> {(doc.file_size ? (doc.file_size / 1024).toFixed(1) : '0.0')} KB</div>
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                              <button type="button" style={styles.secondaryBtn} disabled={uploadingDoc === r.doc_type} onClick={() => handleRemove(r.doc_type)}>
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <input type="file" accept="image/*,application/pdf" disabled={uploadingDoc === r.doc_type}
                                 onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, r.doc_type); e.target.value=''; }} />
                        )}
                      </div>
                    );
                  })}
                </div>

                <SaveBar saving={s3Saving} isSaveDisabled={!s3Dirty} status={s3Status} onSubmit={saveStep3} />
                <button style={isValidStep3 ? styles.primaryBtn : styles.primaryBtnDisabled} disabled={!isValidStep3}
                        onClick={async () => { await saveStep3(); if (isValidStep3) setStep(4); }}>
                  Next ➜
                </button>

                {!isValidStep3 && (
                  <ul style={{ marginTop: 8, color: '#B00020', textAlign: 'left' }}>
                    {requiredDocTypes.filter((dt) => !documents[dt]).map((dt) => (
                      <li key={dt}>{DOC_LABEL[dt] || dt} missing</li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {step === 4 && (
              <>
                <h2 style={styles.title}>Step 4 · Privacy & submission</h2>
                <div style={{ ...styles.formGroup, textAlign: 'left' }}>
                  <div style={styles.gdprBox}>
                    <p><strong>GDPR policy — version {PRIVACY_POLICY_VERSION}</strong></p>
                    <p>Please review our privacy policy. By submitting you accept the processing of your data for verification purposes.</p>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={privacy.accepted} onChange={(e) => setPrivacy({ ...privacy, accepted: e.target.checked })} />
                    I have read and accept the GDPR policy
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={privacy.marketing_optin} onChange={(e) => setPrivacy({ ...privacy, marketing_optin: e.target.checked })} />
                    I agree to receive TalentLix updates and communications
                  </label>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                    <button style={canSubmit && !s4Submitting ? styles.primaryBtn : styles.primaryBtnDisabled}
                            disabled={!canSubmit || s4Submitting}
                            onClick={submitAll}>
                      {s4Submitting ? 'Submitting…' : 'Submit for review'}
                    </button>
                    {s4Status.msg && (
                      <span role="status" aria-live="polite" style={{ fontWeight: 600, color: s4Status.type === 'error' ? '#b00' : '#2E7D32', whiteSpace: 'nowrap' }}>
                        {s4Status.msg}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------
// UI subcomponenti & stili
// ------------------------------
function Progress({ step }) {
  const width = `${(step / 4) * 100}%`;
  return (
    <>
      <div style={{ background: '#E0E0E0', height: 8, borderRadius: 8, marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', height: '100%', borderRadius: 8, width }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
        {[1,2,3,4].map((s) => (
          <div key={s} style={{
            width: 28, height: 28, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 'bold', background: step === s ? '#27E3DA' : '#E0E0E0'
          }}>{s}</div>
        ))}
      </div>
    </>
  );
}

function getStyles(step) {
  return {
    background: {
      backgroundImage: "url('/BackG.png')",
      backgroundPosition: 'center',
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    },
    overlay: { background: 'rgba(0,0,0,0.55)', width: '100%', minHeight: '100%' },
    container: {
      minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center',
      fontFamily: 'Inter, sans-serif', position: 'relative'
    },
    card: {
      width: '100%', maxWidth: step === 4 ? '960px' : '560px',
      background: 'rgba(248, 249, 250, 0.95)', padding: '2rem', borderRadius: 16,
      boxShadow: '0 6px 20px rgba(0,0,0,0.08)', textAlign: 'center'
    },
    logo: { width: 80, marginBottom: 16 },
    title: { fontSize: '1.5rem', marginBottom: '1rem' },
    label: { display: 'block', textAlign: 'left', fontWeight: 600, marginTop: 8, marginBottom: 6 },
    input: { width: '100%', padding: '0.8rem', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' },
    cols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', width: '100%' },
    primaryBtn: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', border: 'none', padding: '0.8rem', borderRadius: 8, cursor: 'pointer', width: '100%', fontWeight: 'bold', marginTop: 8 },
    primaryBtnDisabled: { background: '#ccc', color: '#fff', border: 'none', padding: '0.8rem', borderRadius: 8, width: '100%', cursor: 'not-allowed', marginTop: 8 },
    secondaryBtn: { background: '#fff', border: '1px solid #27E3DA', color: '#027373', padding: '0.6rem 1rem', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
    gdprBox: { maxHeight: 260, overflowY: 'auto', padding: '1rem', border: '1px solid #ccc', borderRadius: 8, background: '#fff', marginBottom: 8 },
  };
}

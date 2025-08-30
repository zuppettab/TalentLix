
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Select from 'react-select';
import countries from '../utils/countries';
import 'react-phone-input-2/lib/style.css';
import PhoneInput from 'react-phone-input-2';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import sports from '../utils/sports';

export default function Wizard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const [formData, setFormData] = useState({
  first_name: '',
  last_name: '',
  date_of_birth: '',
  gender: '',
  nationality: '',
  birth_city: '',
  native_language: 'English',
  additional_language: '',
  profile_picture_url: '',
  phone: '',
  residence_city: '',
  residence_country: '',
  // —— STEP 3
  sport: '',
  main_role: '',
  team_name: '',           // facoltativo
  previous_team: '',       // NUOVO (facoltativo)
  years_experience: '',    // NUOVO (0–60) — mostrato solo dopo scelta sport
  category: '',
  seeking_team: false,     // NUOVO (checkbox)
  // ——
  profile_published: false,
});

  const loadLatestExperience = async (athleteId, base = {}) => {
    const { data: expRows, error: expErr } = await supabase
      .from('sports_experiences')
      .select('sport, role, team, previous_team, category, years_experience, seeking_team')
      .eq('athlete_id', athleteId)
      .order('id', { ascending: false })
      .limit(1);

    if (!expErr && Array.isArray(expRows) && expRows.length > 0) {
      const exp = expRows[0];
      return {
        ...base,
        sport: exp?.sport || '',
        main_role: exp?.role || '',
        team_name: exp?.team || '',
        previous_team: exp?.previous_team || '',
        category: exp?.category || '',
        years_experience: exp?.years_experience ?? '',
        seeking_team: exp?.seeking_team ?? false,
      };
    }

    return {
      ...base,
      sport: '',
      main_role: '',
      team_name: '',
      previous_team: '',
      category: '',
      years_experience: '',
      seeking_team: false,
    };
  };

// Fetch user and athlete data
useEffect(() => {
  const initWizard = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setUser(user);

    // 1) Carica ATHLETE
    const { data: athleteData } = await supabase
      .from('athlete')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!athleteData) {
      setStep(1);
      setLoading(false);
      return;
    }

    // Se già completato (>=40) esci come prima
    if (athleteData.completion_percentage >= 40) {
      setAthlete(athleteData);
      setStep(null);
      setLoading(false);
      return;
    }

    // 2) Base form: merge ATHLETE (seeking_team ignorato)
    setAthlete(athleteData);
    const { seeking_team: _ignored, ...athleteWithoutFlag } = athleteData || {};
    let nextForm = { ...formData, ...athleteWithoutFlag, seeking_team: false };
    
    // Carica anche RESIDENCE da contacts_verification
    const { data: cvRow } = await supabase
      .from('contacts_verification')
      .select('residence_city, residence_country')
      .eq('athlete_id', user.id)
      .single();
    
    if (cvRow) {
      nextForm = {
        ...nextForm,
        residence_city: cvRow.residence_city || '',
        residence_country: cvRow.residence_country || ''
      };
    }

    // 3) Idrata anche l’ULTIMA sports_experiences (Step 3)
    nextForm = await loadLatestExperience(user.id, nextForm);

    setFormData(nextForm);
    setStep(athleteData.current_step || 1);
    setLoading(false);
  };

  initWizard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [router]);

useEffect(() => {
  const refreshStep3 = async () => {
    if (step === 3 && user?.id) {
      const updated = await loadLatestExperience(user.id, formData);
      setFormData(updated);
    }
  };
  refreshStep3();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [step]);


  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

      // Helper: verifica se il numero in formData.phone risulta verificato
    const digitsOnly = (v) => (v ? String(v).replace(/\D/g, '') : '');
    
    const isPhoneVerifiedForCurrentNumber = async () => {
      // 1) guarda la tabella applicativa
      const { data: cvRows } = await supabase
        .from('contacts_verification')
        .select('phone_number, phone_verified')
        .eq('athlete_id', user.id)
        .limit(1);
    
      const cv = Array.isArray(cvRows) && cvRows[0];
      if (cv?.phone_verified === true &&
          digitsOnly(cv.phone_number) &&
          digitsOnly(formData.phone) &&
          digitsOnly(cv.phone_number) === digitsOnly(formData.phone)) {
        return true;
      }
    
      // 2) guarda Supabase Auth (phone confermato + stesso numero)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const authPhone = authUser?.phone ? `+${String(authUser.phone).replace(/^\+?/, '')}` : '';
      if (digitsOnly(authPhone) === digitsOnly(formData.phone) &&
          !!authUser?.phone_confirmed_at) {
        return true;
      }
    
      // 3) guarda il profilo athlete (numero già committato)
      if (digitsOnly(athlete?.phone) === digitsOnly(formData.phone)) {
        return true;
      }
    
      return false;
    };

        const saveStep = async (nextStep) => {
        setErrorMessage('');
        try {
          if (step === 1) {
            // 1) Converti dd/mm/yyyy -> yyyy-mm-dd (ISO) per il DB
            const rawDob = formData.date_of_birth || '';
            const isoDob = rawDob.includes('-')
              ? rawDob
              : (() => {
                  const [dd, mm, yyyy] = rawDob.split('/');
                  return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
                })();
      
            // 2) Upsert athlete con ISO
            const { error } = await supabase.from('athlete').upsert([{
              id: user.id,
              first_name: formData.first_name,
              last_name: formData.last_name,
              date_of_birth: isoDob,                  // <- ISO al DB
              gender: formData.gender,
              nationality: formData.nationality,
              birth_city: formData.birth_city,
              native_language: formData.native_language,
              profile_picture_url: formData.profile_picture_url,
              current_step: nextStep,
              completion_percentage: calcCompletion(nextStep),
            }]);
            if (error) throw error;
      
            // 3) Flag minori di 14 anni (usa isoDob nello stesso scope)
            const birthDate = new Date(isoDob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
      
            if (age < 14) {
              const { error: ageError } = await supabase
                .from('athlete')
                .update({ needs_parental_authorization: true })
                .eq('id', user.id);
              if (ageError) throw ageError;
            }
      
            } else if (step === 2) {
              // Aggiorna dati contatto Step 2 — NON toccare phone se non verified
            // Aggiorna tabella athlete (solo lingue, foto, step)
            const { error: athleteError } = await supabase
              .from('athlete')
              .update({
                native_language: formData.native_language,
                additional_language: formData.additional_language,
                profile_picture_url: formData.profile_picture_url,
                current_step: nextStep,
                completion_percentage: calcCompletion(nextStep),
              })
              .eq('id', user.id);
            
            if (athleteError) throw athleteError;
            
            // Aggiorna/crea riga in contacts_verification (residenza)
            const { error: cvError } = await supabase
              .from('contacts_verification')
              .upsert({
                athlete_id: user.id,
                residence_city: formData.residence_city,
                residence_country: formData.residence_country
              }, { onConflict: 'athlete_id' });
            
            if (cvError) throw cvError;

            
          const digits = (v) => (v ? String(v).replace(/\D/g, '') : '');
          const currentDbPhone = athlete?.phone || '';
          
          // Se è cambiato ed è verificato → aggiorna solo il telefono
          if (digits(formData.phone) !== digits(currentDbPhone) && await isPhoneVerifiedForCurrentNumber()) {
            const { error: phoneErr } = await supabase
              .from('athlete')
              .update({ phone: formData.phone })
              .eq('id', user.id);
            if (phoneErr) throw phoneErr;
          }
          // Se non è cambiato o non è verificato → non fare nulla
          

      
          } else if (step === 3) {
            // Insert esperienza sportiva (con previous_team + years_experience) + avanzamento
            const years =
              formData.years_experience === '' || formData.years_experience == null
                ? null
                : Math.max(0, Math.min(60, parseInt(formData.years_experience, 10)));
          
            const { error } = await supabase.from('sports_experiences').insert([{
              athlete_id: user.id,
              sport: formData.sport,
              role: formData.main_role,
              team: formData.team_name || null,      // facoltativo
              previous_team: formData.previous_team || null, // NUOVO
              category: formData.category,
              years_experience: years,               // NUOVO (0–60 o NULL)
              seeking_team: !!formData.seeking_team,
            }]);
            if (error) throw error;

            const { error: upErr } = await supabase.from('athlete').update({
              current_step: nextStep,
              completion_percentage: calcCompletion(nextStep),
            }).eq('id', user.id);
            if (upErr) throw upErr;
          }

      
          setStep(nextStep);
        } catch (err) {
          console.error(err);
          setErrorMessage(`Error: ${err.message}`);
        }
      };

  const finalizeProfile = async () => {
    const { error } = await supabase.from('athlete')
      .update({
        completion_percentage: 40,
        current_step: null,
        profile_published: formData.profile_published,
      })
      .eq('id', user.id);
    if (!error) router.push('/dashboard');
  };
  
const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push('/login');
};

  const calcCompletion = (nextStep) => {
    switch (nextStep) {
      case 2: return 10;
      case 3: return 20;
      case 4: return 30;
      default: return 40;
    }
  };

  if (loading) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
        {/* 🔵 MENU UTENTE IN ALTO A DESTRA */}
            <div style={styles.userMenuContainer}>
              <div style={styles.menuIcon} onClick={() => setMenuOpen(!menuOpen)}>⋮</div>
              {menuOpen && (
                <div style={styles.dropdown}>
                  <div style={styles.dropdownUser}>👤 {user?.email}</div>
                  <button onClick={handleLogout} style={styles.dropdownButton}>Logout</button>
                </div>
              )}
            </div>
            <p style={styles.loading}>Loading Wizard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === null) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            {/* 🔵 MENU UTENTE IN ALTO A DESTRA */}
                <div style={styles.userMenuContainer}>
                  <div style={styles.menuIcon} onClick={() => setMenuOpen(!menuOpen)}>⋮</div>
                  {menuOpen && (
                    <div style={styles.dropdown}>
                      <div style={styles.dropdownUser}>👤 {user?.email}</div>
                      <button onClick={handleLogout} style={styles.dropdownButton}>Logout</button>
                    </div>
                  )}
                </div>
            <div style={styles.card}>
              <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
              <h2>✅ Your profile is already complete</h2>
              <p>You can go back to your Dashboard.</p>
              <button style={styles.button} onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          {/* 🔵 MENU UTENTE IN ALTO A DESTRA */}
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
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${(step / 4) * 100}%` }} />
            </div>
            <div style={styles.steps}>
              {[1, 2, 3, 4].map((s) => (
                <div key={s} style={{ ...styles.stepCircle, background: step === s ? '#27E3DA' : '#E0E0E0' }}>
                  {s}
                </div>
              ))}
            </div>

            {errorMessage && <p style={styles.error}>{errorMessage}</p>}

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.4 }}
              >
                {step === 1 && (
                    <Step1
                      formData={formData}
                      setFormData={setFormData}
                      handleChange={handleChange}
                      saveStep={() => saveStep(2)}
                    />
                  )}
                {step === 2 && (
                    <Step2
                      user={user}
                      formData={formData}
                      setFormData={setFormData}
                      handleChange={handleChange}
                      saveStep={() => saveStep(3)}
                    />
                )}
                {step === 3 && <Step3 formData={formData} setFormData={setFormData} handleChange={handleChange} saveStep={() => saveStep(4)} />}
                {step === 4 && <Step4 formData={formData} setFormData={setFormData} finalize={finalizeProfile} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/* STEP 1 */
const Step1 = ({ formData, setFormData, handleChange, saveStep }) => {
  // calendario & limiti età
const dobRef = useRef(null);
const today = new Date();
const maxDateObj = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate()); // massimo: 10 anni fa
const minDateObj = new Date(today.getFullYear() - 60, today.getMonth(), today.getDate()); // minimo: 60 anni fa
const toISO = (d) => d.toISOString().slice(0, 10);

// se il valore in formData fosse nel vecchio formato dd/mm/yyyy, converti a ISO una volta
useEffect(() => {
        if (formData.date_of_birth && formData.date_of_birth.includes('/')) {
          const [dd, mm, yyyy] = formData.date_of_birth.split('/');
          const iso = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
          setFormData({ ...formData, date_of_birth: iso });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

  const [countryInput, setCountryInput] = useState('');
            // Validazione data di nascita dd/mm/yyyy + età 10–60
// Validazione data di nascita (accetta ISO yyyy-mm-dd o dd/mm/yyyy) + età 10–60
    const parseDob = (str) => {
      if (!str) return null;
      let yyyy, mm, dd;
    
      if (str.includes('-')) {
        // ISO: yyyy-mm-dd (prodotto da <input type="date">)
        [yyyy, mm, dd] = str.split('-').map((v) => parseInt(v, 10));
      } else {
        // Legacy: dd/mm/yyyy
        const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) return null;
        dd = parseInt(m[1], 10);
        mm = parseInt(m[2], 10);
        yyyy = parseInt(m[3], 10);
      }
    
      const d = new Date(yyyy, (mm - 1), dd);
      if (d.getFullYear() !== yyyy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) return null;
      return d;
    };
  const ageBetween10and60 = (d) => {
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age >= 10 && age <= 60;
  };
  const validDob = (() => {
    const d = parseDob(formData.date_of_birth);
    return !!d && ageBetween10and60(d);
  })();
  
  const isValid = formData.first_name &&
                  formData.last_name &&
                  validDob &&
                  formData.gender &&
                  formData.nationality &&
                  formData.birth_city;
  return (
    <>
      <h2 style={styles.title}>👤 Step 1</h2>
      <div style={styles.formGroup}>
        <input style={styles.input} name="first_name" placeholder="First Name" value={formData.first_name} onChange={handleChange} />
        <input style={styles.input} name="last_name" placeholder="Last Name" value={formData.last_name} onChange={handleChange} />
         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <style jsx global>{`
            /* Chrome/Edge/Safari (WebKit/Blink): nasconde l'icona nativa del datepicker */
            input[type="date"]::-webkit-calendar-picker-indicator { display: none; }
            /* Rimuove lo stile nativo dove possibile */
            input[type="date"] { -webkit-appearance: none; appearance: none; }
          `}</style>
            <input
              ref={dobRef}
              style={styles.input}
              type="date"
              name="date_of_birth"
              placeholder="Date of Birth"
              value={formData.date_of_birth || ''}
              min={toISO(minDateObj)}  // limita a 60 anni fa
              max={toISO(maxDateObj)}  // limita a 10 anni fa
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
            />
            {/* tastino calendario esplicito */}
            <button
              type="button"
              onClick={() => {
                // apre il datepicker nei browser che supportano showPicker(); fallback: focus
                if (dobRef.current?.showPicker) dobRef.current.showPicker();
                else dobRef.current?.focus();
              }}
              style={styles.calendarBtn}
              aria-label="Open calendar"
              title="Open calendar"
            >
              📅
            </button>
          </div>


        <select style={styles.input} name="gender" value={formData.gender} onChange={handleChange}>
          <option value="">Select Gender</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
       <Select
          name="nationality"
          placeholder="Start typing Country of birth"
          options={countries}
          value={countries.find(opt => opt.value === formData.nationality) || null}
          onChange={(selected) =>
            setFormData({ ...formData, nationality: selected?.value || '' })
          }
          onInputChange={(inputValue) => {
            setCountryInput(inputValue);
          }}
          filterOption={(option, inputValue) =>
            inputValue.length >= 2 &&
            option.label.toLowerCase().includes(inputValue.toLowerCase())
          }
          styles={{
            control: (base) => ({
              ...base,
              padding: '2px',
              borderRadius: '8px',
              borderColor: '#ccc',
            }),
          }}
        />
        <input
            style={styles.input}
            name="birth_city"
            placeholder="City of Birth"
            value={formData.birth_city}
            onChange={handleChange}
          />
        <button style={isValid ? styles.button : styles.buttonDisabled} onClick={saveStep} disabled={!isValid}>Next ➡️</button>
        {!isValid && (
          <ul style={{ color:'#b00', fontSize:'12px', textAlign:'left', marginTop:'6px', paddingLeft:'18px' }}>
            {!formData.first_name && <li>First Name missing</li>}
            {!formData.last_name && <li>Last Name missing</li>}
            {!validDob && <li>Date of Birth invalid or out of range (10–60y)</li>}
            {!formData.gender && <li>Gender missing</li>}
            {!formData.nationality && <li>Nationality missing</li>}
            {!formData.birth_city && <li>City of Birth missing</li>}
          </ul>
        )}
   
      </div>
    </>
  );
};

/* STEP 2 */
const Step2 = ({ user, formData, setFormData, handleChange, saveStep }) => {
  // ── State
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');

  // ⏱️ Countdown resend & TTL codice
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const COOLDOWN_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_RESEND_COOLDOWN || 60);
  const OTP_TTL_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_OTP_TTL || 600);
  
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
  
  const fmtSecs = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };


  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
  
      const authPhone = authUser?.phone ? `+${String(authUser.phone).replace(/^\+?/, '')}` : '';
      if (!formData.phone && authPhone) {
        setFormData(prev => ({ ...prev, phone: authPhone }));
      }
      const sameNumber =
        formData.phone &&
        authPhone &&
        formData.phone.replace(/\D/g, '') === authPhone.replace(/\D/g, '');
  
      const confirmed = !!authUser?.phone_confirmed_at;
  
      const phoneIdVerified =
        Array.isArray(authUser?.identities) &&
        authUser.identities.some(id =>
          id?.provider === 'phone' &&
          (id?.identity_data?.phone_verified === true || id?.identity_data?.phone_verified === 'true')
        );
  
      // ✅ Auto-verify ONLY if: same number + confirmed + phone identity verified
      // 🔎 App-level verification (contacts_verification)
          const { data: cvRows } = await supabase
            .from('contacts_verification')
            .select('phone_number, phone_verified')
            .eq('athlete_id', authUser.id)
            .limit(1);
          
          const cv = Array.isArray(cvRows) && cvRows[0];
          const digits = (v) => (v ? String(v).replace(/\D/g, '') : '');
          const cvOk =
            cv?.phone_verified === true &&
            formData.phone &&
            cv?.phone_number &&
            digits(formData.phone) === digits(cv.phone_number);
          
          // Se risulta verified a livello applicativo, allinea subito la UI e termina qui
          if (cvOk && !phoneVerified) {
            setPhoneVerified(true);
            setOtpMessage('Phone already verified ✔');
            setOtpSent(false);
            return;
          }

     if (sameNumber && (confirmed || phoneIdVerified) && !phoneVerified) {
        setPhoneVerified(true);
        setOtpMessage('Phone already verified ✔');
        setOtpSent(false);
        await supabase
          .from('contacts_verification')
          .upsert(
            { athlete_id: user.id, phone_number: formData.phone, phone_verified: true },
            { onConflict: 'athlete_id' }
          );
        return;
      }
  
      // If user changed the number, go back to not verified
      if (!sameNumber && phoneVerified) {
        setPhoneVerified(false);
        setOtpMessage('');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, formData.phone]);


  
  // ── Helper: controlla sessione valida (se scade, updateUser fallisce)
  const ensureSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      setOtpMessage('Session expired. Please sign in again.');
      return false;
    }
    return true;
  };

  // ── Invio OTP per AGGANCIARE il telefono all’utente loggato (phone_change)
    const sendCode = async () => {
      try {
        // Se siamo in cooldown, non inviare
        if (cooldown > 0) {
          setOtpMessage(`Please wait ${cooldown}s before requesting a new code.`);
          return;
        }
    
        setOtpMessage('');
        if (!(await ensureSession())) return;
    
        // Richiesta OTP via Supabase (phone_change)
        const { data, error } = await supabase.auth.updateUser({ phone: formData.phone });
        if (error) {
          setOtpMessage(`Failed to request OTP: ${error.message}`);
          return;
        }

    // Avvia countdown e ttl locali (coerenti con env)
    setOtpSent(true);
    setCooldown(COOLDOWN_SECONDS);
    setExpiresIn(OTP_TTL_SECONDS);
    setOtpMessage('OTP requested. Check your SMS.');
  } catch (e) {
    setOtpMessage(`Send error: ${e?.message || String(e)}`);
  }
};



  // ── Conferma OTP (phone_change)
  const confirmCode = async () => {
    try {
          if (expiresIn <= 0) {
          setOtpMessage('The code has expired. Please request a new one.');
          return;
        }
      
      const started = Date.now();
      const { data, error } = await supabase.auth.verifyOtp({
        phone: formData.phone,
        token: otpCode,
        type: 'phone_change',
      });

      if (error) {
        setOtpMessage(`Verification failed${error.status ? ` [${error.status}]` : ''}: ${error.message}`);
        return;
      }

      setPhoneVerified(true);
      setOtpMessage('Phone verified ✔');
      await supabase
        .from('athlete')
        .update({ phone: formData.phone })
        .eq('id', user.id);

      // Stato “affidabilità contatto” nel tuo schema applicativo
      const { error: dbError } = await supabase
        .from('contacts_verification')
        .upsert(
          { athlete_id: user.id, phone_number: formData.phone, phone_verified: true },
          { onConflict: 'athlete_id' }
        );
      if (dbError) setOtpMessage(prev => `${prev} (DB warn: ${dbError.message})`);
    } catch (e) {
      setOtpMessage(`Verification error: ${e?.message || String(e)}`);
    }
  };

  // ── VALIDAZIONE telefono (E.164, mobile/fixed_line_or_mobile, >=10 cifre nazionali)
  const normalizedPhone = (formData.phone || '').replace(/\s+/g, '');
  const parsed = parsePhoneNumberFromString(normalizedPhone);
  const nationalLen = parsed?.nationalNumber ? String(parsed.nationalNumber).length : 0;
    // ✅ Basta che il numero sia valido in E.164; togliamo il gate sul "tipo" (MOBILE/FIXED_LINE_OR_MOBILE)
    // perché per molti numeri libphonenumber non restituisce un type affidabile
    const isValidPhone = !!parsed && parsed.isValid() && nationalLen >= 10;

  const isValid =
    isValidPhone &&
    phoneVerified &&
    !!formData.residence_city &&
    !!formData.residence_country &&
    !!formData.profile_picture_url &&
    !!formData.native_language;

  return (
    <>
      <h2 style={styles.title}>👤 Step 2</h2>
      <div style={styles.formGroup}>
        {/* City of Residence */}
        <input
          style={styles.input}
          name="residence_city"
          placeholder="City of Residence"
          value={formData.residence_city}
          onChange={handleChange}
        />
          {/* Country of Residence */}
          <div style={{ width: '100%' }}>
            <Select
              name="residence_country"
              placeholder="Start typing Country of Residence"
              options={countries}
              value={countries.find(opt => opt.value === formData.residence_country) || null}
              onChange={(selected) =>
                setFormData(prev => ({ ...prev, residence_country: selected?.value || '' }))
              }
              filterOption={(option, inputValue) =>
                inputValue.length >= 2 &&
                option.label.toLowerCase().includes(inputValue.toLowerCase())
              }
              styles={{
                control: (base) => ({
                  ...base,
                  padding: '2px',
                  borderRadius: '8px',
                  borderColor: '#ccc',
                }),
              }}
            />
          </div>

        {/* Native Language */}
        <input
          style={styles.input}
          name="native_language"
          placeholder="Native Language"
          value={formData.native_language}
          onChange={handleChange}
        />
        {/* Additional Language */}
        <input
          style={styles.input}
          name="additional_language"
          placeholder="Additional Language"
          value={formData.additional_language}
          onChange={handleChange}
        />

        {/* Phone Number */}
        <div style={{ width: '100%' }}>
          <PhoneInput
            countryCodeEditable={false}
            country={undefined}
            value={formData.phone ? formData.phone.replace(/^\+/, '') : ''}
            onChange={(value) => {
              const digits = (value || '').replace(/\D/g, '');
              const e164 = digits ? `+${digits}` : '';
              setFormData((prev) => ({ ...prev, phone: e164 }));
            }}
            enableSearch={true}
            placeholder="Mobile phone number"
            inputStyle={{
              width: '100%',
              height: '48px',
              fontSize: '16px',
              borderRadius: '8px',
              paddingLeft: '48px',
              border: '1px solid #ccc',
              boxSizing: 'border-box'
            }}
            buttonStyle={{ border: 'none', background: 'none' }}
            containerStyle={{ width: '100%' }}
            dropdownStyle={{ borderRadius: '8px', zIndex: 1000 }}
          />
        </div>

        {/* OTP UI */}
        {!phoneVerified && (
          <div style={{ display: 'grid', gap: '8px' }}>
          <button
            type="button"
            onClick={sendCode}
            disabled={!isValidPhone || cooldown > 0}
            style={{
              background: (!isValidPhone || cooldown > 0) ? '#ccc' : 'linear-gradient(90deg, #27E3DA, #F7B84E)',
              color: '#fff',
              border: 'none',
              padding: '0.6rem',
              borderRadius: '8px',
              cursor: (!isValidPhone || cooldown > 0) ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {otpSent ? 'Resend code' : 'Send code'}
          </button>
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#555', textAlign: 'left' }}>
            {cooldown > 0 ? (
              <span>Resend in {fmtSecs(cooldown)}</span>
            ) : (
              otpSent && <span>You can resend now</span>
            )}
            {expiresIn > 0 && (
              <span style={{ marginLeft: 8 }}>• Code expires in {fmtSecs(expiresIn)}</span>
            )}
          </div>

            {otpSent && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  style={{ ...styles.input, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={confirmCode}
                  disabled={otpCode.length !== 6}
                  style={{
                    background: otpCode.length === 6 ? 'linear-gradient(90deg, #27E3DA, #F7B84E)' : '#ccc',
                    color: '#fff',
                    border: 'none',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '8px',
                    cursor: otpCode.length === 6 ? 'pointer' : 'not-allowed',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Confirm
                </button>
              </div>
            )}

            {otpMessage && (
              <div style={{ fontSize: '0.9rem', color: '#444' }}>{otpMessage}</div>
            )}
          </div>
        )}

        {phoneVerified && (
          <div style={{ textAlign: 'left', color: 'green', fontWeight: 600 }}>
            Phone verified ✔
          </div>
        )}

        {/* Upload immagine */}
        <label style={{ textAlign: 'left', fontWeight: 'bold' }}>Upload Profile Picture</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label
            htmlFor="profileFile"
            style={{
              background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Choose file
          </label>
          <input
            id="profileFile"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !user?.id) return;

              const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
              const ts = Date.now();
              const filePath = `${user.id}/Profile-${ts}.${ext}`;

              const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { cacheControl: '3600', upsert: false });

              if (uploadError) {
                console.error('Upload error:', uploadError.message);
                return;
              }

              const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
              const publicUrl = data?.publicUrl || '';
              setFormData((prev) => ({ ...prev, profile_picture_url: publicUrl }));
            }}
          />
        </div>

        {formData.profile_picture_url && (
          <div style={{ position: 'relative', width: '50%', marginTop: '10px' }}>
            {/* Header con pulsante X fuori dall’immagine */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, profile_picture_url: '' }))}
                style={{
                  background: 'rgba(255,255,255,0.9)',
                  border: '1px solid #ccc',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
                aria-label="Remove picture"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="black"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="11" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                </svg>
              </button>
            </div>
        
            {/* Immagine sotto */}
            <img
              src={formData.profile_picture_url}
              alt="Preview"
              style={{ width: '100%', height: 'auto', borderRadius: '8px' }}
            />
          </div>
        )}

        {/* Next */}
        <button
          style={isValid ? styles.button : styles.buttonDisabled}
          onClick={saveStep}
          disabled={!isValid}
        >
          Next ➡️
        </button>
        {!isValid && (
          <ul style={{color:'#b00', fontSize:'12px', textAlign:'left', marginTop:'6px', paddingLeft:'18px' }}>
              {!isValidPhone && <li>Invalid phone number</li>}
              {!phoneVerified && <li>Phone not verified</li>}
              {!formData.residence_city && <li>City of Residence missing</li>}
              {!formData.residence_country && <li>Country of Residence missing</li>}
              {!formData.profile_picture_url && <li>Profile Picture missing</li>}
              {!formData.native_language && <li>Native Language missing</li>}

          </ul>
        )}
      </div>
    </>
  );
};


/* STEP 3 */
const Step3 = ({ formData, setFormData, handleChange, saveStep }) => {
  const isValid = formData.sport && formData.main_role && formData.category;
  return (
    <>
      <h2 style={styles.title}>👤 Step 3</h2>
      <div style={styles.formGroup}>
        
          <Select
            name="sport"
            placeholder="Start typing sport"
            options={sports}
            value={sports.find(opt => opt.value === formData.sport) || null}
            onChange={(selected) =>
              setFormData({ ...formData, sport: selected?.value || '' })
            }
            filterOption={(option, inputValue) =>
              inputValue.length >= 2 &&
              option.label.toLowerCase().includes(inputValue.toLowerCase())
            }
            styles={{
              control: (base) => ({
                ...base,
                padding: '2px',
                borderRadius: '8px',
                borderColor: '#ccc',
              }),
            }}
          />
          {formData.sport && (
            <input
              style={styles.input}
              type="number"
              name="years_experience"
              placeholder="Years of Experience (0–60)"
              min={0}
              max={60}
              value={formData.years_experience}
              onChange={(e) => setFormData({ ...formData, years_experience: e.target.value })}
            />
          )}

        <input style={styles.input} name="main_role" placeholder="Main Role" value={formData.main_role} onChange={handleChange} />
        <input
          style={styles.input}
          name="previous_team"
          placeholder="Previous Team (optional)"
          value={formData.previous_team}
          onChange={handleChange}
        />
        <input
          style={styles.input}
          name="team_name"
          placeholder="Current Team (optional)"
          value={formData.team_name}
          onChange={handleChange}
        />
        <label style={{ textAlign: 'left' }}>
          <input
            type="checkbox"
            name="seeking_team"
            checked={!!formData.seeking_team}
            onChange={(e) => setFormData({ ...formData, seeking_team: e.target.checked })}
          />{' '}
          Seeking Team
        </label>

        <input style={styles.input} name="category" placeholder="Category" value={formData.category} onChange={handleChange} />
        <button style={isValid ? styles.button : styles.buttonDisabled} onClick={saveStep} disabled={!isValid}>Next ➡️</button>
        {!isValid && (
          <ul style={{ color:'#b00', fontSize:'12px', textAlign:'left', marginTop:'6px', paddingLeft:'18px' }}>
            {!formData.sport && <li>Sport missing</li>}
            {!formData.main_role && <li>Main Role missing</li>}
            {!formData.category && <li>Category missing</li>}
          </ul>
        )}


      </div>
    </>
  );
};

/* STEP 4 */
const Step4 = ({ formData, setFormData, finalize }) => {
  const [gdprHtml, setGdprHtml] = useState('');
  const [hasScrolled, setHasScrolled] = useState(false);
  const [gdprAccepted, setGdprAccepted] = useState(false);

  // fetch GDPR HTML
  useEffect(() => {
    fetch('/gdpr_policy_en.html')
      .then(res => res.text())
      .then(setGdprHtml)
      .catch(err => console.error('Failed to load GDPR policy', err));
  }, []);

  // DOB → age (uguale a prima)
  const parseDob = (str) => {
    if (!str) return null;
    let y, m, d;
    if (str.includes('-')) {
      [y, m, d] = str.split('-').map(v => parseInt(v, 10));
    } else {
      const mm = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!mm) return null;
      d = parseInt(mm[1], 10);
      m = parseInt(mm[2], 10);
      y = parseInt(mm[3], 10);
    }
    const dt = new Date(y, m - 1, d);
    return (dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d) ? dt : null;
  };
  const dobDate = parseDob(formData.date_of_birth);
  const age = (() => {
    if (!dobDate) return null;
    const t = new Date();
    let a = t.getFullYear() - dobDate.getFullYear();
    const mm = t.getMonth() - dobDate.getMonth();
    if (mm < 0 || (mm === 0 && t.getDate() < dobDate.getDate())) a--;
    return a;
  })();

  const avatarSize = 'clamp(110px, 28vw, 140px)';

  return (
    <>
      <style jsx>{`
        .tlx-hero{
          display:flex;
          gap:16px;
          align-items:center;
          margin-bottom:16px;
          flex-wrap:nowrap;
          justify-content:flex-start;
          text-align:left;
        }
        @media (min-width:700px){ .tlx-hero{ justify-content:flex-start; text-align:left; } }
        .tlx-review-grid{ display:grid; grid-template-columns:1fr; gap:16px; }
        @media (min-width:700px){ .tlx-review-grid{ grid-template-columns:1fr 1fr; } }
        .gdpr-box {
          border:1px solid #ccc;
          border-radius:8px;
          padding:12px;
          max-height:200px;
          overflow-y:auto;
          background:#fafafa;
          font-size:10px;
          text-align:left;
        }
      `}</style>

      <h2 style={styles.title}>Review & Publish</h2>

      {/* HERO */}
      <div className="tlx-hero">
        <div style={{
          width: avatarSize,
          borderRadius: 16,
          boxShadow: '0 6px 14px rgba(0,0,0,0.08)',
          background: '#eee'
        }}>
          <img
            src={formData.profile_picture_url || '/avatar-placeholder.png'}
            alt="Profile"
            style={{ display:'block', width:'100%', height:'auto', borderRadius:16 }}
          />
        </div>

        <div style={{ flex:1, minWidth:240 }}>
          <div style={{ fontSize:24, fontWeight:800, textAlign:'left' }}>
            {formData.first_name} {formData.last_name}
          </div>
        </div>
      </div>

      {/* GRID DATI */}
      <div className="tlx-review-grid">
        {/* Personal */}
        <div style={{
          background:'#fff', border:'1px solid #eee', borderRadius:12,
          padding:16, boxShadow:'0 6px 14px rgba(0,0,0,0.04)'
        }}>
          <div style={{ fontWeight:800, marginBottom:8 }}>Personal</div>
          <div style={{ display:'grid', rowGap:8 }}>
            <Row label="Date of Birth" value={`${formData.date_of_birth}${age ? ` (${age}y)` : ''}`} />
            <Row label="Gender" value={formData.gender === 'M' ? 'Male' : formData.gender === 'F' ? 'Female' : '—'} />
            <Row label="Nationality" value={formData.nationality || '—'} />
            <Row label="Birth City" value={formData.birth_city || '—'} />
            <Row label="Phone" value={formData.phone || '—'} />
            <Row
              label="Residence"
              value={[formData.residence_city, formData.residence_country].filter(Boolean).join(', ') || '—'}
            />
            <div style={{ display:'flex', gap:6, alignItems:'baseline', flexWrap:'wrap' }}>
              <span style={{ color:'#777', minWidth:120 }}>Languages</span>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {formData.native_language && <span style={chipStyle}>{formData.native_language}</span>}
                {formData.additional_language && <span style={chipStyle}>{formData.additional_language}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Sport & Team */}
        <div style={{
          background:'#fff', border:'1px solid #eee', borderRadius:12,
          padding:16, boxShadow:'0 6px 14px rgba(0,0,0,0.04)'
        }}>
          <div style={{ fontWeight:800, marginBottom:8 }}>Sport & Team</div>
          <div style={{ display:'grid', rowGap:8 }}>
            <Row label="Sport" value={formData.sport || '—'} />
            <Row label="Role" value={formData.main_role || '—'} />
            <Row label="Category" value={formData.category || '—'} />
            <Row label="Seeking Team" value={formData.seeking_team ? 'Yes' : 'No'} />
            <Row label="Current Team" value={formData.team_name || '—'} />
            <Row label="Previous Team" value={formData.previous_team || '—'} />
            <Row label="Experience" value={formData.years_experience ? `${formData.years_experience} years` : '—'} />
          </div>
        </div>
      </div>

      {/* GDPR BOX */}
      <div
        className="gdpr-box"
        onScroll={(e) => {
          const target = e.target;
          if (target.scrollTop + target.clientHeight >= target.scrollHeight - 5) {
            setHasScrolled(true);
          }
        }}
        dangerouslySetInnerHTML={{ __html: gdprHtml }}
      />

      {/* Checkbox GDPR */}
      <label style={{ display:'block', marginTop:12 }}>
        <input
          type="checkbox"
          disabled={!hasScrolled}
          checked={gdprAccepted}
          onChange={(e) => setGdprAccepted(e.target.checked)}
        />{' '}
        I have read and agree to the GDPR Compliance Policy
      </label>

      {/* Publish (opzionale) */}
      <label style={{ textAlign:'left', display:'block', marginTop:20, marginBottom:10 }}>
        <input
          type="checkbox"
          name="profile_published"
          checked={!!formData.profile_published}
          onChange={(e) => setFormData({ ...formData, profile_published: e.target.checked })}
        />{' '}
        Publish Profile Now?
      </label>

   {/* Final button */}
      <button
        style={gdprAccepted ? { ...styles.button, marginTop:4 } : { ...styles.buttonDisabled, marginTop:4 }}
        onClick={() => {
          if (gdprAccepted) {
            finalize();
          } else {
            alert("You must read and accept the GDPR policy before proceeding.");
          }
        }}
        disabled={!gdprAccepted}
        aria-label="Confirm and go to dashboard"
      >
        Confirm and Go to Dashboard
      </button>
    </>
  );
};

// helper UI
const Row = ({ label, value }) => (
  <div style={{ display:'flex', gap:6, alignItems:'baseline', flexWrap:'wrap' }}>
    <span style={{ color:'#777', minWidth:120 }}>{label}</span>
    <span style={{ fontWeight:600, wordBreak:'break-word', overflowWrap:'anywhere' }}>{value}</span>
  </div>
);

const chipStyle = {
  background:'#F1F3F5',
  border:'1px solid #E9ECEF',
  borderRadius:999,
  padding:'4px 10px',
  fontSize:12,
  fontWeight:700
};


const styles = {
userMenuContainer: {
  position: 'absolute',
  top: '20px',
  right: '20px',
  zIndex: 20,
},
menuIcon: {
  background: '#27E3DA',
  color: '#fff',
  width: '35px',
  height: '35px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
},
dropdown: {
  position: 'absolute',
  top: '45px',
  right: '0',
  background: '#FFF',
  border: '1px solid #E0E0E0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  minWidth: '180px',
  zIndex: 100,
  padding: '0.5rem',
},
dropdownUser: {
  padding: '0.5rem',
  fontSize: '0.9rem',
  color: '#555',
  borderBottom: '1px solid #eee',
  marginBottom: '0.5rem',
},
dropdownButton: {
  background: '#DD5555',
  color: '#FFF',
  border: 'none',
  padding: '0.5rem',
  width: '100%',
  borderRadius: '6px',
  cursor: 'pointer',
},
  background: {
    backgroundImage: "url('/BackG.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    width: '100%',
    minHeight: '100vh',    // <-- prima era height
    position: 'relative',
  },
  overlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    width: '100%',
    minHeight: '100%',     // <-- prima era height
    position: 'static',    // <-- toglie l’assoluto così il wrapper cresce
    zIndex: 1,
  },
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
  },
  card: {
    width: '100%',
    maxWidth: '450px',
    background: 'rgba(248, 249, 250, 0.95)',
    padding: '2rem',
    borderRadius: '16px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
    textAlign: 'center',
    zIndex: 2,
  },
  calendarBtn: {
  background: '#27E3DA',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  padding: '0.5rem 0.75rem',
  cursor: 'pointer',
  fontWeight: 700,
  lineHeight: 1,
  },
  logo: { width: '80px', marginBottom: '1rem' },
  progressBar: { background: '#E0E0E0', height: '8px', borderRadius: '8px', marginBottom: '1rem' },
  progressFill: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', height: '100%', borderRadius: '8px' },
  steps: { display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' },
  stepCircle: { width: '30px', height: '30px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  title: { fontSize: '1.5rem', marginBottom: '1rem' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' },
  input: { width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' },
  button: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', border: 'none', padding: '0.8rem', borderRadius: '8px', cursor: 'pointer', width: '100%', fontWeight: 'bold' },
  buttonDisabled: { background: '#ccc', color: '#fff', border: 'none', padding: '0.8rem', borderRadius: '8px', width: '100%', cursor: 'not-allowed' },
  reviewList: { textAlign: 'left', marginBottom: '1.5rem', lineHeight: '1.6' },
  error: { color: 'red', fontSize: '0.9rem', marginBottom: '1rem' },
  loading: { textAlign: 'center', fontSize: '1.2rem' },
};

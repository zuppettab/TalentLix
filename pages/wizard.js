import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

export default function Wizard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [athlete, setAthlete] = useState(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    native_language: 'English',
    profile_picture_url: '',
    phone: '',
    city: '',
    residence_country: '',
    sport: '',
    main_role: '',
    team_name: '',
    category: '',
    profile_published: false,
  });

  useEffect(() => {
    const initWizard = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

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

      if (athleteData.completion_percentage >= 40) {
        setAthlete(athleteData);
        setStep(null);
        setLoading(false);
        return;
      }

      setAthlete(athleteData);
      setFormData(prev => ({
        ...prev,
        ...athleteData,
        phone: '',
        sport: '',
        main_role: '',
        team_name: '',
        category: '',
      }));
      setStep(athleteData.current_step || 1);
      setLoading(false);
    };
    initWizard();
  }, [router]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const saveStep = async (nextStep) => {
    setErrorMessage('');

    try {
      if (step === 1) {
        // Save to athlete
        const { error } = await supabase.from('athlete').upsert([{
          id: user.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          date_of_birth: formData.date_of_birth,
          gender: formData.gender,
          nationality: formData.nationality,
          native_language: formData.native_language,
          profile_picture_url: formData.profile_picture_url,
          current_step: nextStep,
          completion_percentage: calcCompletion(nextStep),
        }]);
        if (error) throw error;
      } 
      else if (step === 2) {
        // Save to contacts_verification
        const { error } = await supabase.from('contacts_verification').upsert([{
          athlete_id: user.id,
          phone: formData.phone,
        }]);
        if (error) throw error;

        // Optionally update city/residence in athlete
        await supabase.from('athlete').update({
          current_step: nextStep,
          completion_percentage: calcCompletion(nextStep),
        }).eq('id', user.id);
      }
      else if (step === 3) {
        // Save to sports_experiences
        const { error } = await supabase.from('sports_experiences').insert([{
          athlete_id: user.id,
          sport: formData.sport,
          role: formData.main_role,
          team: formData.team_name,
          category: formData.category,
        }]);
        if (error) throw error;

        await supabase.from('athlete').update({
          current_step: nextStep,
          completion_percentage: calcCompletion(nextStep),
        }).eq('id', user.id);
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

  const calcCompletion = (nextStep) => {
    switch (nextStep) {
      case 2: return 10;
      case 3: return 20;
      case 4: return 30;
      default: return 40;
    }
  };

  if (loading) return <div style={styles.loading}>🔄 Loading Wizard...</div>;

  if (step === null) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
          <h2>✅ Your profile is already complete</h2>
          <p>You can go back to your Dashboard.</p>
          <button style={styles.button} onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
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
            {step === 1 && <Step1 formData={formData} handleChange={handleChange} saveStep={() => saveStep(2)} />}
            {step === 2 && <Step2 formData={formData} handleChange={handleChange} saveStep={() => saveStep(3)} />}
            {step === 3 && <Step3 formData={formData} handleChange={handleChange} saveStep={() => saveStep(4)} />}
            {step === 4 && <Step4 formData={formData} handleChange={handleChange} finalize={finalizeProfile} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* STEP 1 */
const Step1 = ({ formData, handleChange, saveStep }) => {
  const isValid = formData.first_name && formData.last_name && formData.date_of_birth && formData.gender && formData.nationality;
  return (
    <>
      <h2 style={styles.title}>👤 Personal Information</h2>
      <div style={styles.formGroup}>
        <input style={styles.input} name="first_name" placeholder="First Name" value={formData.first_name} onChange={handleChange} />
        <input style={styles.input} name="last_name" placeholder="Last Name" value={formData.last_name} onChange={handleChange} />
        <input style={styles.input} type="date" name="date_of_birth" value={formData.date_of_birth || ''} onChange={handleChange} />
        <select style={styles.input} name="gender" value={formData.gender} onChange={handleChange}>
          <option value="">Select Gender</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <input style={styles.input} name="nationality" placeholder="Nationality" value={formData.nationality} onChange={handleChange} />
        <button style={isValid ? styles.button : styles.buttonDisabled} onClick={saveStep} disabled={!isValid}>Next ➡️</button>
      </div>
    </>
  );
};

/* STEP 2 */
const Step2 = ({ formData, handleChange, saveStep }) => {
  const isValid = formData.phone;
  return (
    <>
      <h2 style={styles.title}>📞 Contact Information</h2>
      <div style={styles.formGroup}>
        <input style={styles.input} name="phone" placeholder="Phone Number" value={formData.phone} onChange={handleChange} />
        <button style={isValid ? styles.button : styles.buttonDisabled} onClick={saveStep} disabled={!isValid}>Next ➡️</button>
      </div>
    </>
  );
};

/* STEP 3 */
const Step3 = ({ formData, handleChange, saveStep }) => {
  const isValid = formData.sport && formData.main_role && formData.team_name && formData.category;
  return (
    <>
      <h2 style={styles.title}>🏀 Sports Information</h2>
      <div style={styles.formGroup}>
        <input style={styles.input} name="sport" placeholder="Sport" value={formData.sport} onChange={handleChange} />
        <input style={styles.input} name="main_role" placeholder="Main Role" value={formData.main_role} onChange={handleChange} />
        <input style={styles.input} name="team_name" placeholder="Current Team" value={formData.team_name} onChange={handleChange} />
        <input style={styles.input} name="category" placeholder="Category" value={formData.category} onChange={handleChange} />
        <button style={isValid ? styles.button : styles.buttonDisabled} onClick={saveStep} disabled={!isValid}>Next ➡️</button>
      </div>
    </>
  );
};

/* STEP 4 */
const Step4 = ({ formData, handleChange, finalize }) => (
  <>
    <h2 style={styles.title}>✅ Review & Publish</h2>
    <ul style={styles.reviewList}>
      <li><strong>Name:</strong> {formData.first_name} {formData.last_name}</li>
      <li><strong>Date of Birth:</strong> {formData.date_of_birth}</li>
      <li><strong>Gender:</strong> {formData.gender === 'M' ? 'Male' : 'Female'}</li>
      <li><strong>Nationality:</strong> {formData.nationality}</li>
      <li><strong>Phone:</strong> {formData.phone}</li>
      <li><strong>Sport:</strong> {formData.sport} ({formData.main_role})</li>
      <li><strong>Team:</strong> {formData.team_name} - {formData.category}</li>
    </ul>
    <label>
      <input type="checkbox" name="profile_published" checked={formData.profile_published} onChange={handleChange} /> Publish Profile Now?
    </label>
    <button style={styles.button} onClick={finalize}>Confirm and Go to Dashboard</button>
  </>
);

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(rgba(39, 227, 218, 0.15), rgba(247, 184, 78, 0.15))',
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
  loading: { textAlign: 'center', marginTop: '50px', fontSize: '1.2rem' },
};

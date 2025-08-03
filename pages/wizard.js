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

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    native_language: 'English',
    profile_picture_url: '',
    profile_published: false,
  });

  const [errorMessage, setErrorMessage] = useState('');

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
        first_name: athleteData.first_name || '',
        last_name: athleteData.last_name || '',
        date_of_birth: athleteData.date_of_birth || '',
        gender: athleteData.gender || '',
        nationality: athleteData.nationality || '',
        native_language: athleteData.native_language || 'English',
        profile_picture_url: athleteData.profile_picture_url || '',
        profile_published: athleteData.profile_published || false,
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
    const updatedData = {
      id: user.id,
      first_name: formData.first_name,
      last_name: formData.last_name,
      date_of_birth: formData.date_of_birth,
      gender: formData.gender,
      nationality: formData.nationality,
      native_language: formData.native_language,
      profile_picture_url: formData.profile_picture_url,
      profile_published: formData.profile_published,
      current_step: nextStep,
      completion_percentage: calcCompletion(nextStep),
    };

    const { error } = await supabase.from('athlete').upsert([updatedData]);
    if (error) {
      console.error('Supabase error:', error);
      setErrorMessage(`Error saving data: ${error.message}`);
      return;
    }
    setStep(nextStep);
  };

  const calcCompletion = (nextStep) => {
    switch (nextStep) {
      case 2: return 10;
      case 3: return 20;
      case 4: return 30;
      default: return 40;
    }
  };

  const finalizeProfile = async () => {
    const { error } = await supabase
      .from('athlete')
      .update({
        completion_percentage: 40,
        current_step: null,
        profile_published: formData.profile_published,
      })
      .eq('id', user.id);

    if (!error) router.push('/dashboard');
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
            {step === 1 && (
              <Step1 formData={formData} handleChange={handleChange} saveStep={() => saveStep(2)} />
            )}
            {step === 2 && (
              <Step2 formData={formData} handleChange={handleChange} saveStep={() => saveStep(3)} />
            )}
            {step === 3 && (
              <Step3 formData={formData} handleChange={handleChange} saveStep={() => saveStep(4)} />
            )}
            {step === 4 && (
              <Step4 formData={formData} handleChange={handleChange} finalize={finalizeProfile} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const Step1 = ({ formData, handleChange, saveStep }) => {
  const isStepValid =
    formData.first_name.trim() &&
    formData.last_name.trim() &&
    formData.date_of_birth.trim() &&
    formData.gender.trim() &&
    formData.nationality.trim();

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
        <button 
          style={isStepValid ? styles.button : styles.buttonDisabled} 
          onClick={saveStep} 
          disabled={!isStepValid}
        >
          Next ➡️
        </button>
      </div>
    </>
  );
};

/* Placeholder Steps */
const Step2 = () => <h2 style={styles.title}>📞 Contact Information (Next Steps...)</h2>;
const Step3 = () => <h2 style={styles.title}>🏀 Sports Information (Next Steps...)</h2>;
const Step4 = () => <h2 style={styles.title}>✅ Review & Publish (Next Steps...)</h2>;

const styles = {
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#FFFFFF', fontFamily: 'Inter, sans-serif' },
  card: { width: '100%', maxWidth: '450px', background: '#F8F9FA', padding: '2rem', borderRadius: '16px', boxShadow: '0 6px 20px rgba(0,0,0,0.08)', textAlign: 'center' },
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
  error: { color: 'red', fontSize: '0.9rem', marginBottom: '1rem' },
  loading: { textAlign: 'center', marginTop: '50px', fontSize: '1.2rem' },
};

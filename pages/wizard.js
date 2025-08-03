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

  // Fetch user and athlete data
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
      setFormData(prev => ({ ...prev, ...athleteData }));
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
        const { error } = await supabase.from('athlete').update({
          phone: formData.phone,
          city: formData.city,
          residence_country: formData.residence_country,
          current_step: nextStep,
          completion_percentage: calcCompletion(nextStep),
        }).eq('id', user.id);
        if (error) throw error;
      }
      else if (step === 3) {
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

  if (loading) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <p style={styles.loading}>🔄 Loading Wizard...</p>
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
      </div>
    </div>
  );
}

/* STEP components (Step1, Step2, Step3, Step4) rimangono invariati rispetto alla tua versione originale */

const styles = {
  background: {
    backgroundImage: "url('/BackG.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    width: '100%',
    height: '100vh',
    position: 'relative',
  },
  overlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
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

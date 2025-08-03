import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

export default function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null); // Foto profilo preview
  const [userId, setUserId] = useState(null);
  const router = useRouter();

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm();

  // ✅ Ottieni utente loggato e memorizza il suo ID
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.push('/login');
      else setUserId(user.id);
    };
    getUser();
  }, [router]);

  // ✅ Funzione per passare allo step successivo con salvataggio parziale
  const onSubmitStep = async (data) => {
    setLoading(true);

    try {
      if (step === 1) {
        // Salva/aggiorna tabella athlete
        const { error } = await supabase
          .from('athlete')
          .upsert({
            id: userId,
            first_name: data.first_name,
            last_name: data.last_name,
            date_of_birth: data.date_of_birth,
            gender: data.gender,
            nationality: data.nationality,
            profile_picture_url: preview, // URL salvato dopo upload
            completion_percentage: 10
          });
        if (error) throw error;
      }

      if (step === 2) {
        // Salva contatti
        const { error } = await supabase
          .from('contacts_verification')
          .upsert({
            athlete_id: userId,
            email: data.email,
            phone_number: data.phone,
            city: data.city,
            country: data.country,
          });
        if (error) throw error;
      }

      if (step === 3) {
        // Salva info sportive
        const { error1 } = await supabase
          .from('technical_skills')
          .upsert({
            athlete_id: userId,
            main_role: data.main_role,
          });

        const { error2 } = await supabase
          .from('sports_experiences')
          .upsert({
            athlete_id: userId,
            sport: data.sport,
            team: data.team,
            category: data.category,
            season: 'Current'
          });

        if (error1 || error2) throw (error1 || error2);
      }

      if (step < 4) setStep(step + 1);
      else {
        // ✅ Ultimo step: pubblicazione
        await supabase
          .from('athlete')
          .update({ profile_published: true, completion_percentage: 40 })
          .eq('id', userId);

        router.push('/dashboard');
      }

    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving data. Check console for details.');
    }

    setLoading(false);
  };

  // ✅ Upload foto profilo
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const filePath = `profile_photos/${userId}-${file.name}`;
    const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
    if (error) {
      alert('Upload failed');
    } else {
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setPreview(data.publicUrl);
    }
  };

  // ✅ UI degli step
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div>
            <h2 className="text-xl font-bold mb-4">Step 1: Personal Info</h2>
            <input {...register("first_name", { required: true })} placeholder="First Name" className="input" />
            {errors.first_name && <p className="error">Required</p>}
            <input {...register("last_name", { required: true })} placeholder="Last Name" className="input" />
            <input type="date" {...register("date_of_birth", { required: true })} className="input" />
            <select {...register("gender", { required: true })} className="input">
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
            <input {...register("nationality", { required: true })} placeholder="Nationality" className="input" />
            <label className="block mt-2">Profile Photo:</label>
            <input type="file" accept="image/*" onChange={handlePhotoUpload} />
            {preview && <img src={preview} alt="Preview" className="mt-2 w-24 h-24 rounded-full object-cover" />}
          </div>
        );

      case 2:
        return (
          <div>
            <h2 className="text-xl font-bold mb-4">Step 2: Contact Info</h2>
            <input {...register("email", { required: true })} placeholder="Email" readOnly className="input bg-gray-100" />
            <input {...register("phone", { required: true })} placeholder="Phone Number" className="input" />
            <input {...register("city", { required: true })} placeholder="City" className="input" />
            <input {...register("country", { required: true })} placeholder="Country" className="input" />
          </div>
        );

      case 3:
        return (
          <div>
            <h2 className="text-xl font-bold mb-4">Step 3: Sports Info</h2>
            <input {...register("sport", { required: true })} placeholder="Sport" className="input" />
            <input {...register("main_role", { required: true })} placeholder="Main Role" className="input" />
            <input {...register("team", { required: true })} placeholder="Current Team" className="input" />
            <input {...register("category", { required: true })} placeholder="Category" className="input" />
          </div>
        );

      case 4:
        return (
          <div>
            <h2 className="text-xl font-bold mb-4">Step 4: Review & Publish</h2>
            <p className="text-gray-600 mb-4">Review your info and publish your profile.</p>
            <label className="flex items-center space-x-2">
              <input type="checkbox" {...register("publish", { required: true })} />
              <span>I want to publish my profile</span>
            </label>
          </div>
        );
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-white font-inter">
      <div className="bg-gray-50 shadow-md border border-gray-200 rounded-lg p-8 w-full max-w-lg">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <p className="text-gray-500">Step {step} of 4</p>
            <div className="w-2/3 bg-gray-200 h-2 rounded-full">
              <div className="bg-green-400 h-2 rounded-full" style={{ width: `${(step / 4) * 100}%` }} />
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmitStep)}>
          {renderStep()}
          <div className="flex justify-between mt-6">
            {step > 1 && <button type="button" onClick={() => setStep(step - 1)} className="btn-outline">Back</button>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {step === 4 ? 'Finish & Publish' : 'Next'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Tailwind helper classes */
const styles = `
.input { width:100%; padding:0.75rem; margin-bottom:0.5rem; border:1px solid #ddd; border-radius:8px; }
.error { color:red; font-size:0.8rem; margin-bottom:0.5rem; }
.btn-primary { background:linear-gradient(90deg,#27E3DA,#F7B84E); color:white; padding:0.75rem 1.5rem; border-radius:8px; font-weight:bold; }
.btn-outline { border:2px solid #27E3DA; color:#27E3DA; padding:0.75rem 1.5rem; border-radius:8px; font-weight:bold; }
`;

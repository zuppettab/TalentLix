import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function UploadTest() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [bucket, setBucket] = useState('avatars');
  const [message, setMessage] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState(null); // 'auth' or 'anon'

  const router = useRouter();

  // ✅ Controlla se l'utente è loggato
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUser(user);
    };
    fetchUser();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
    if (file && file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  };

  // ✅ Gestione login
  const handleLoginRedirect = async () => {
    router.push('/login?redirect=upload'); // login con redirect automatico
  };

  const handleUpload = async () => {
    if (mode === 'auth' && !user) {
      setMessage('⚠️ Devi effettuare il login per usare la modalità autenticata.');
      return;
    }
    if (!selectedFile) return;

    setMessage('Uploading...');
    setPublicUrl('');

    try {
      // Se autenticato, user.id per organizzare cartella
      const userId = user?.id || 'anon';
      const path = `${userId}/${Date.now()}-${selectedFile.name}`;

      const { error } = await supabase.storage.from(bucket).upload(path, selectedFile, { upsert: true });
      if (error) throw error;

      if (bucket === 'avatars' || bucket === 'videos') {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        setPublicUrl(data.publicUrl);
        setMessage('✅ Upload riuscito! File pubblico visibile.');
      } else {
        setMessage('✅ Upload riuscito! (File privato in "documents").');
      }
    } catch (err) {
      console.error(err);
      setMessage(`❌ Errore upload: ${err.message}`);
    }
  };

  // ✅ UI
  if (!mode) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>Vuoi usare Upload come?</h2>
          <button style={styles.button} onClick={() => { setMode('auth'); handleLoginRedirect(); }}>
            🔑 Login e usa autenticato
          </button>
          <button style={styles.buttonOutline} onClick={() => setMode('anon')}>
            👤 Usa senza login (solo test lettura pubblica)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Upload Test ({mode === 'auth' ? 'Autenticato' : 'Anonimo'})</h2>
        <label style={styles.label}>Seleziona Bucket:</label>
        <select style={styles.select} value={bucket} onChange={(e) => setBucket(e.target.value)}>
          <option value="avatars">Avatars (public)</option>
          <option value="videos">Videos (public)</option>
          <option value="documents">Documents (private)</option>
        </select>

        <label style={styles.label}>Seleziona File:</label>
        <input type="file" onChange={handleFileChange} style={styles.input} />
        {preview && <img src={preview} alt="Preview" style={styles.preview} />}

        <button onClick={handleUpload} style={styles.button} disabled={!selectedFile}>
          🚀 Carica File
        </button>

        {message && <p style={styles.message}>{message}</p>}
        {publicUrl && (
          <p>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
              🔗 Vedi file pubblico
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#FFFFFF', fontFamily: 'Inter, sans-serif' },
  card: { background: '#F8F9FA', padding: '2rem', borderRadius: '12px', textAlign: 'center', width: '100%', maxWidth: '450px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0' },
  title: { fontSize: '1.5rem', marginBottom: '1rem', color: '#000000' },
  label: { display: 'block', textAlign: 'left', margin: '0.5rem 0', fontWeight: 'bold', color: '#333' },
  select: { width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '1rem' },
  input: { width: '100%', marginBottom: '1rem' },
  preview: { marginTop: '1rem', width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #ccc' },
  button: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#FFFFFF', padding: '0.8rem', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer', width: '100%', marginTop: '1rem' },
  buttonOutline: { border: '2px solid #27E3DA', color: '#27E3DA', padding: '0.8rem', borderRadius: '8px', fontWeight: 'bold', background: 'transparent', width: '100%', marginTop: '0.5rem', cursor: 'pointer' },
  message: { marginTop: '1rem', color: '#555' },
  link: { color: '#27E3DA', fontWeight: 'bold', textDecoration: 'none' },
};

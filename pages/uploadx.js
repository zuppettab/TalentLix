import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function UploadX() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    setFile(f);
    if (f && f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f));
    }
  };

  const handleUpload = async () => {
    if (!file) return setMessage('⚠️ Seleziona prima un file.');
    setMessage('⏳ Upload in corso...');

    // ✅ Percorso fisso nella cartella IMG
    const filePath = `IMG/${Date.now()}-${file.name}`;

    const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });

    if (error) {
      console.error("Errore upload:", error);
      setMessage(`❌ Upload fallito: ${error.message}`);
    } else {
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setPublicUrl(data.publicUrl);
      setMessage('✅ Upload riuscito nella cartella IMG!');
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h2>🧪 UploadX Test (No Auth) → Cartella IMG</h2>

      <input type="file" onChange={handleFileChange} />
      {preview && <img src={preview} alt="Preview" style={{ width: 100, height: 100, marginTop: '1rem', border: '1px solid #ccc', borderRadius: '8px' }} />}
      
      <button onClick={handleUpload} disabled={!file} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
        🚀 Upload su IMG
      </button>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}
      {publicUrl && (
        <p>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">🔗 Visualizza File</a>
        </p>
      )}
    </div>
  );
}

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
    if (!file) return setMessage('⚠️ Select a file first.');
    setMessage('Uploading...');

    const filePath = `anon-test/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });

    if (error) {
      console.error("Upload error:", error);
      setMessage(`❌ Upload failed: ${error.message}`);
    } else {
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setPublicUrl(data.publicUrl);
      setMessage('✅ Upload successful!');
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h2>🧪 UploadX Test (No Authentication)</h2>

      <input type="file" onChange={handleFileChange} />
      {preview && <img src={preview} alt="Preview" style={{ width: 100, height: 100, marginTop: '1rem', border: '1px solid #ccc', borderRadius: '8px' }} />}
      
      <button onClick={handleUpload} disabled={!file} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
        🚀 Upload File (No Auth)
      </button>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}
      {publicUrl && (
        <p>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">🔗 View File</a>
        </p>
      )}
    </div>
  );
}

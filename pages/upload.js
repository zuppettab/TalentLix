import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function UploadTest() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [bucket, setBucket] = useState('avatars');
  const [message, setMessage] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
    if (file && file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    setMessage('Uploading...');
    setPublicUrl('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage('⚠️ You must be logged in to upload');
        return;
      }

      const path = `${user.id}/${Date.now()}-${selectedFile.name}`;
      const { error } = await supabase.storage.from(bucket).upload(path, selectedFile, { upsert: true });

      if (error) throw error;

      // Ottieni URL pubblico solo se bucket è pubblico
      if (bucket === 'avatars' || bucket === 'videos') {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        setPublicUrl(data.publicUrl);
        setMessage('✅ Upload successful! File is publicly accessible.');
      } else {
        setMessage('✅ Upload successful! (Private file in documents bucket)');
      }
    } catch (err) {
      console.error(err);
      setMessage(`❌ Upload failed: ${err.message}`);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Test Upload to Supabase Storage</h2>

        <label style={styles.label}>Choose Bucket:</label>
        <select style={styles.select} value={bucket} onChange={(e) => setBucket(e.target.value)}>
          <option value="avatars">Avatars (public)</option>
          <option value="videos">Videos (public)</option>
          <option value="documents">Documents (private)</option>
        </select>

        <label style={styles.label}>Select File:</label>
        <input type="file" onChange={handleFileChange} style={styles.input} />

        {preview && <img src={preview} alt="Preview" style={styles.preview} />}

        <button onClick={handleUpload} style={styles.button} disabled={!selectedFile}>
          Upload File
        </button>

        {message && <p style={styles.message}>{message}</p>}
        {publicUrl && (
          <p>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
              View Public File
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
  message: { marginTop: '1rem', color: '#555' },
  link: { color: '#27E3DA', fontWeight: 'bold', textDecoration: 'none' },
};

import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function UploadTest() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [bucket, setBucket] = useState('avatars');
  const [message, setMessage] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  // ✅ Gestione login inline
  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage('Logging in...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage(`❌ Login failed: ${error.message}`);
    } else {
      setUser(data.user);
      setMessage('✅ Login successful! You can now upload.');
    }
  };

  // ✅ Logout semplice
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMessage('Logged out.');
  };

  // ✅ File upload
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
    if (!user) {
      setMessage('⚠️ You must login before uploading.');
      return;
    }
    if (!selectedFile) return;

    setMessage('Uploading...');
    setPublicUrl('');
    try {
      const path = `${user.id}/${Date.now()}-${selectedFile.name}`;
      const { error } = await supabase.storage.from(bucket).upload(path, selectedFile, { upsert: true });

      if (error) throw error;

      if (bucket === 'avatars' || bucket === 'videos') {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        setPublicUrl(data.publicUrl);
        setMessage('✅ Upload successful! File is publicly accessible.');
      } else {
        setMessage('✅ Upload successful! (Private file in "documents").');
      }
    } catch (err) {
      console.error(err);
      setMessage(`❌ Upload failed: ${err.message}`);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Upload Test</h2>

        {!user ? (
          <form onSubmit={handleLogin} style={{ marginBottom: '1rem' }}>
            <p style={{ marginBottom: '0.5rem' }}>Login to enable uploads:</p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required
            />
            <button type="submit" style={styles.button}>Login</button>
          </form>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <p>✅ Logged in as: <strong>{user.email}</strong></p>
            <button onClick={handleLogout} style={styles.buttonOutline}>Logout</button>
          </div>
        )}

        <label style={styles.label}>Select Bucket:</label>
        <select style={styles.select} value={bucket} onChange={(e) => setBucket(e.target.value)}>
          <option value="avatars">Avatars (public)</option>
          <option value="videos">Videos (public)</option>
          <option value="documents">Documents (private)</option>
        </select>

        <label style={styles.label}>Select File:</label>
        <input type="file" onChange={handleFileChange} style={styles.input} />
        {preview && <img src={preview} alt="Preview" style={styles.preview} />}

        <button onClick={handleUpload} style={styles.button} disabled={!selectedFile}>
          🚀 Upload File
        </button>

        {message && <p style={styles.message}>{message}</p>}
        {publicUrl && (
          <p>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
              🔗 View Public File
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
  input: { width: '100%', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '8px', border: '1px solid #ddd' },
  preview: { marginTop: '1rem', width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #ccc' },
  button: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#FFFFFF', padding: '0.8rem', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer', width: '100%', marginTop: '1rem' },
  buttonOutline: { border: '2px solid #27E3DA', color: '#27E3DA', padding: '0.5rem', borderRadius: '8px', fontWeight: 'bold', background: 'transparent', width: '100%', marginTop: '0.5rem', cursor: 'pointer' },
  message: { marginTop: '1rem', color: '#555' },
  link: { color: '#27E3DA', fontWeight: 'bold', textDecoration: 'none' },
};

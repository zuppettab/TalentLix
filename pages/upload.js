import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function UploadTest() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  // ✅ Check session and log debug data on mount
  useEffect(() => {
    const debugSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log("🔎 Session object:", session);

      if (session) {
        setUser(session.user);

        const jwt = session.access_token;
        const payload = JSON.parse(atob(jwt.split('.')[1]));
        console.log("🔑 JWT payload:", payload); // Shows role, sub, etc.
      } else {
        console.log("⚠️ No active session. User not authenticated.");
      }
    };

    debugSession();
  }, []);

  // ✅ Login inline
  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage('Logging in...');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(`❌ Login failed: ${error.message}`);
    } else {
      setUser(data.user);
      setMessage('✅ Login successful! Session initialized.');
      console.log("✅ User:", data.user);
    }
  };

  // ✅ Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMessage('🔒 Logged out. Session cleared.');
  };

  // ✅ Handle file change with image preview
  const handleFileChange = (e) => {
    const f = e.target.files[0];
    setFile(f);
    if (f && f.type.startsWith('image/')) setPreview(URL.createObjectURL(f));
  };

  // ✅ Upload with detailed logging
  const handleUpload = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    console.log("📥 Using session for upload:", session);

    if (!session) {
      setMessage('⚠️ No session found. Please login.');
      return;
    }

    setMessage('Uploading file...');
    const filePath = `${session.user.id}/debug-${Date.now()}-${file.name}`;

    const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });

    if (error) {
      console.error("❌ Upload failed:", error);
      setMessage(`❌ Upload failed: ${error.message}`);
    } else {
      console.log("✅ Upload successful!");
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setPublicUrl(data.publicUrl);
      setMessage('✅ Upload successful! File accessible (public).');
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h2>🔧 Upload Debug Page</h2>

      {!user ? (
        <form onSubmit={handleLogin} style={{ marginBottom: '1rem' }}>
          <p>Login to test authenticated uploads:</p>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={styles.input} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={styles.input} />
          <button type="submit" style={styles.button}>Login</button>
        </form>
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          <p>✅ Logged in as: <strong>{user.email}</strong></p>
          <button onClick={handleLogout} style={styles.buttonOutline}>Logout</button>
        </div>
      )}

      <input type="file" onChange={handleFileChange} style={styles.input} />
      {preview && <img src={preview} alt="Preview" style={{ width: 100, height: 100, marginTop: '1rem', border: '1px solid #ccc', borderRadius: '8px' }} />}
      <button onClick={handleUpload} disabled={!file} style={styles.button}>🚀 Upload File</button>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}
      {publicUrl && (
        <p>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#27E3DA', fontWeight: 'bold' }}>🔗 View Uploaded File</a>
        </p>
      )}
    </div>
  );
}

const styles = {
  input: { display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '6px' },
  button: { display: 'block', width: '100%', padding: '0.7rem', marginTop: '0.5rem', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  buttonOutline: { display: 'block', width: '100%', padding: '0.7rem', marginTop: '0.5rem', border: '2px solid #27E3DA', color: '#27E3DA', background: 'transparent', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }
};

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const TEST_TABLE = 'health_checks';

export default function SupabaseTestPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [status, setStatus] = useState('idle');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  const missingEnvMessage = useMemo(() => {
    const missing = [];
    if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    if (missing.length === 0) return null;
    return `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
  }, [supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    if (missingEnvMessage) {
      setStatus('error');
      setError(missingEnvMessage);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const loadRows = async () => {
      setStatus('loading');
      setError(null);

      const { data, error: queryError } = await supabase
        .from(TEST_TABLE)
        .select('*')
        .limit(5);

      if (queryError) {
        setStatus('error');
        setError(queryError.message);
        return;
      }

      setRows(data ?? []);
      setStatus('success');
    };

    loadRows();
  }, [missingEnvMessage, supabaseAnonKey, supabaseUrl]);

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>Supabase Connectivity Test</h1>
        <p>
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your environment before
          running <code>npm run dev</code> or building the project. Both variables must point to a Supabase project that
          contains a table named <code>{TEST_TABLE}</code> (or update the constant in this file). After setting the
          variables, refresh this page to verify connectivity.
        </p>

        <div style={styles.statusRow}>
          <span style={styles.label}>Status:</span>
          <span style={getStatusStyle(status)}>{status}</span>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {status === 'success' && (
          <div>
            <h2>Rows (limit 5)</h2>
            {rows.length === 0 ? (
              <p>No rows returned.</p>
            ) : (
              <pre style={styles.pre}>{JSON.stringify(rows, null, 2)}</pre>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: '0.75rem',
    padding: '2rem',
    maxWidth: '720px',
    width: '100%',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.08)',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginTop: '1.5rem',
    marginBottom: '1.5rem',
    fontSize: '1.1rem',
  },
  label: {
    fontWeight: 600,
  },
  errorBox: {
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: '0.5rem',
    padding: '1rem',
    marginBottom: '1.5rem',
  },
  pre: {
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '1rem',
    borderRadius: '0.5rem',
    overflowX: 'auto',
    fontSize: '0.9rem',
    lineHeight: 1.4,
  },
};

function getStatusStyle(status) {
  const base = {
    textTransform: 'capitalize',
    fontWeight: 600,
  };

  switch (status) {
    case 'success':
      return { ...base, color: '#16a34a' };
    case 'error':
      return { ...base, color: '#dc2626' };
    case 'loading':
      return { ...base, color: '#2563eb' };
    default:
      return { ...base, color: '#475569' };
  }
}

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const TEST_TABLE = 'health_checks';
const TABLE_TEST_MATRIX = [
  { name: 'athlete' },
  { name: 'social_profiles' },
  { name: 'awards_recognitions' },
  { name: 'health_checks' },
  { name: 'athlete_career' },
];

const TEST_IDENTIFIER_FIELD = 'test_run_token';

function makeTestPayload() {
  return {
    [TEST_IDENTIFIER_FIELD]: `talentlix-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

function getPrimaryKeyFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  if ('id' in row) return { column: 'id', value: row.id };
  if ('uuid' in row) return { column: 'uuid', value: row.uuid };
  const keys = Object.keys(row).filter((key) => key !== TEST_IDENTIFIER_FIELD);
  if (keys.length === 0) return null;
  return { column: keys[0], value: row[keys[0]] };
}

function buildUpdatePayload(insertPayload, fallbackRow) {
  if (insertPayload && Object.keys(insertPayload).length > 0) {
    return insertPayload;
  }

  if (fallbackRow && typeof fallbackRow === 'object') {
    const clone = { ...fallbackRow };
    delete clone.id;
    delete clone.uuid;
    return clone;
  }

  return null;
}

export default function SupabaseTestPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [status, setStatus] = useState('idle');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [tableName, setTableName] = useState(TEST_TABLE);
  const [tableInput, setTableInput] = useState(TEST_TABLE);
  const [queryTrigger, setQueryTrigger] = useState(0);
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authStatus, setAuthStatus] = useState('signed-out');
  const [authProcessing, setAuthProcessing] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState(null);
  const [testResults, setTestResults] = useState([]);

  const missingEnvMessage = useMemo(() => {
    const missing = [];
    if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    if (missing.length === 0) return null;
    return `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
  }, [supabaseUrl, supabaseAnonKey]);

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null;
    return createClient(supabaseUrl, supabaseAnonKey);
  }, [supabaseAnonKey, supabaseUrl]);

  useEffect(() => {
    if (missingEnvMessage) {
      setStatus('error');
      setError(missingEnvMessage);
      return;
    }

    if (!supabase) return;

    const loadRows = async () => {
      setStatus('loading');
      setError(null);

      const { data, error: queryError } = await supabase
        .from(tableName)
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
  }, [missingEnvMessage, supabase, tableName, queryTrigger]);

  useEffect(() => {
    if (!supabase) return undefined;

    let isMounted = true;

    const initialiseSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(data?.session ?? null);
      setAuthStatus(data?.session ? 'authenticated' : 'signed-out');
    };

    initialiseSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession ?? null);
      setAuthStatus(nextSession ? 'authenticated' : 'signed-out');
      if (nextSession) {
        setAuthError(null);
      }
    });

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [supabase]);

  const handleTableSubmit = (event) => {
    event.preventDefault();
    const trimmed = tableInput.trim();

    if (!trimmed) {
      setStatus('error');
      setError('Please enter a table name before running the query.');
      return;
    }

    setError(null);
    setTableInput(trimmed);
    setTableName(trimmed);
    setQueryTrigger((count) => count + 1);
  };

  const handleSignIn = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    const email = authEmail.trim();
    const password = authPassword;

    if (!email || !password) {
      setAuthError('Please provide both email and password.');
      return;
    }

    try {
      setAuthProcessing(true);
      setAuthError(null);
      setAuthStatus('signing-in');
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setAuthStatus('error');
        setAuthError(signInError.message);
        return;
      }

      setAuthStatus('authenticated');
      setAuthPassword('');
    } finally {
      setAuthProcessing(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    try {
      setAuthProcessing(true);
      setAuthError(null);
      setAuthStatus('signing-out');
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setAuthStatus('error');
        setAuthError(signOutError.message);
        return;
      }

      setAuthStatus('signed-out');
    } finally {
      setAuthProcessing(false);
    }
  };

  const runSecurityChecks = async () => {
    if (missingEnvMessage) {
      setTestError(missingEnvMessage);
      return;
    }

    if (!supabase) {
      setTestError('Supabase client is not available.');
      return;
    }

    setIsTesting(true);
    setTestError(null);
    setTestResults([]);

    const results = TABLE_TEST_MATRIX.map((entry) => ({
      table: entry.name,
      operations: [],
    }));

    let signedInDuringTest = false;

    try {
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });

      for (const table of TABLE_TEST_MATRIX) {
        const tableResult = results.find((item) => item.table === table.name);
        try {
          const { error: anonError } = await anonClient.from(table.name).select('*').limit(1);
          tableResult.operations.push({
            context: 'anonymous',
            operation: 'select',
            success: !anonError,
            message: anonError ? anonError.message : 'Select succeeded (unexpected if RLS is enforced).',
          });
        } catch (selectError) {
          tableResult.operations.push({
            context: 'anonymous',
            operation: 'select',
            success: false,
            message: selectError.message,
          });
        }
      }

      let activeSession = session;

      if (!activeSession) {
        const email = authEmail.trim();
        const password = authPassword;

        if (!email || !password) {
          throw new Error('Authenticated checks require a valid email and password. Sign in first or fill the credentials.');
        }

        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          throw new Error(`Unable to sign in for authenticated checks: ${signInError.message}`);
        }

        activeSession = data.session ?? null;
        signedInDuringTest = true;
      }

      const { data: refreshed } = await supabase.auth.getSession();
      activeSession = refreshed?.session ?? activeSession;

      if (!activeSession) {
        throw new Error('No active session detected after sign-in.');
      }

      for (const table of TABLE_TEST_MATRIX) {
        const tableResult = results.find((item) => item.table === table.name);
        const insertPayload = table.buildInsertPayload ? table.buildInsertPayload() : makeTestPayload();

        let insertData = null;
        let insertErrorMessage = null;

        try {
          const { data, error } = await supabase.from(table.name).insert(insertPayload).select();
          if (error) {
            insertErrorMessage = error.message;
          }
          insertData = Array.isArray(data) ? data[0] : null;
          tableResult.operations.push({
            context: 'authenticated',
            operation: 'insert',
            success: !error,
            message: error ? error.message : 'Insert executed successfully.',
          });
        } catch (unexpectedInsertError) {
          insertErrorMessage = unexpectedInsertError.message;
          tableResult.operations.push({
            context: 'authenticated',
            operation: 'insert',
            success: false,
            message: unexpectedInsertError.message,
          });
        }

        const primaryKey = getPrimaryKeyFromRow(insertData);

        if (!insertData || !primaryKey) {
          const contextMessage = insertErrorMessage
            ? `Insert failed: ${insertErrorMessage}`
            : 'Insert result did not expose a usable primary key.';

          tableResult.operations.push({
            context: 'authenticated',
            operation: 'update',
            success: false,
            message: `Skipped update. ${contextMessage}`,
          });

          tableResult.operations.push({
            context: 'authenticated',
            operation: 'delete',
            success: false,
            message: `Skipped delete. ${contextMessage}`,
          });
          continue;
        }

        const updatePayload = table.buildUpdatePayload
          ? table.buildUpdatePayload(insertData)
          : buildUpdatePayload(insertPayload, insertData);

        if (!updatePayload || Object.keys(updatePayload).length === 0) {
          tableResult.operations.push({
            context: 'authenticated',
            operation: 'update',
            success: false,
            message: 'Skipped update: no suitable payload available.',
          });
        } else {
          try {
            const { error: updateError } = await supabase
              .from(table.name)
              .update(updatePayload)
              .eq(primaryKey.column, primaryKey.value)
              .select();

            tableResult.operations.push({
              context: 'authenticated',
              operation: 'update',
              success: !updateError,
              message: updateError ? updateError.message : 'Update executed successfully.',
            });
          } catch (unexpectedUpdateError) {
            tableResult.operations.push({
              context: 'authenticated',
              operation: 'update',
              success: false,
              message: unexpectedUpdateError.message,
            });
          }
        }

        try {
          const { error: deleteError } = await supabase
            .from(table.name)
            .delete()
            .eq(primaryKey.column, primaryKey.value);

          tableResult.operations.push({
            context: 'authenticated',
            operation: 'delete',
            success: !deleteError,
            message: deleteError ? deleteError.message : 'Delete executed successfully.',
          });
        } catch (unexpectedDeleteError) {
          tableResult.operations.push({
            context: 'authenticated',
            operation: 'delete',
            success: false,
            message: unexpectedDeleteError.message,
          });
        }
      }
    } catch (testRunError) {
      setTestError((prev) => prev || testRunError.message);
    } finally {
      if (signedInDuringTest) {
        try {
          await supabase.auth.signOut();
        } catch (signOutDuringTestError) {
          setTestError((prev) => prev || `Sign out after tests failed: ${signOutDuringTestError.message}`);
        }
      }

      setTestResults(results);
      setIsTesting(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>Supabase Connectivity Test</h1>
        <p>
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your environment before
          running <code>npm run dev</code> or building the project. Both variables must point to a Supabase project. You
          can use the form below to specify which table to query (default <code>{TEST_TABLE}</code>). After setting the
          variables and choosing a table, refresh or re-run the query to verify connectivity.
        </p>

        <form style={styles.tableForm} onSubmit={handleTableSubmit}>
          <label htmlFor="table-name" style={styles.tableLabel}>
            Table name
          </label>
          <input
            id="table-name"
            name="table-name"
            type="text"
            value={tableInput}
            onChange={(event) => setTableInput(event.target.value)}
            style={styles.tableInput}
            placeholder="Enter table name"
          />
          <button type="submit" style={styles.tableButton}>
            Run query
          </button>
        </form>

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

        <section style={styles.section}>
          <h2>Authentication controls</h2>
          <p style={styles.sectionDescription}>
            Use email/password credentials from your Supabase project to authenticate and evaluate Row Level Security (RLS)
            policies. Signing in here keeps the session within this page only.
          </p>

          <form onSubmit={handleSignIn} style={styles.authForm}>
            <div style={styles.fieldGroup}>
              <label htmlFor="auth-email" style={styles.tableLabel}>
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                style={styles.input}
                placeholder="you@example.com"
                autoComplete="username"
              />
            </div>
            <div style={styles.fieldGroup}>
              <label htmlFor="auth-password" style={styles.tableLabel}>
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                style={styles.input}
                placeholder="Password"
                autoComplete="current-password"
              />
            </div>
            <div style={styles.buttonRow}>
              <button type="submit" style={styles.primaryButton} disabled={authProcessing}>
                {authProcessing && authStatus === 'signing-in' ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={handleSignOut}
                disabled={authProcessing || !session}
              >
                {authProcessing && authStatus === 'signing-out' ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </form>

          <div style={styles.statusRow}>
            <span style={styles.label}>Auth status:</span>
            <span style={getStatusStyle(authStatus)}>{authStatus}</span>
          </div>

          {authError && (
            <div style={styles.errorBox}>
              <strong>Error:</strong> {authError}
            </div>
          )}

          {session && (
            <div style={styles.sessionBox}>
              <strong>Session user:</strong>
              <pre style={styles.preSmall}>{JSON.stringify(session.user, null, 2)}</pre>
            </div>
          )}
        </section>

        <section style={styles.section}>
          <h2>Security regression matrix</h2>
          <p style={styles.sectionDescription}>
            The matrix below checks anonymous access (expecting failures when RLS is enforced) and authenticated CRUD
            operations for a curated list of tables. Temporary rows are inserted and then cleaned up when possible.
          </p>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={runSecurityChecks}
            disabled={isTesting}
          >
            {isTesting ? 'Running checks…' : 'Run security checks'}
          </button>

          {testError && (
            <div style={styles.errorBox}>
              <strong>Error:</strong> {testError}
            </div>
          )}

          {testResults.length > 0 && (
            <div style={styles.testGrid}>
              {testResults.map((tableResult) => (
                <div key={tableResult.table} style={styles.testCard}>
                  <h3 style={styles.testTitle}>{tableResult.table}</h3>
                  <table style={styles.operationTable}>
                    <thead>
                      <tr>
                        <th style={styles.tableHeader}>Context</th>
                        <th style={styles.tableHeader}>Operation</th>
                        <th style={styles.tableHeader}>Outcome</th>
                        <th style={styles.tableHeader}>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableResult.operations.map((operation, idx) => (
                        <tr key={`${tableResult.table}-${operation.context}-${operation.operation}-${idx}`}>
                          <td style={styles.tableCell}>{operation.context}</td>
                          <td style={styles.tableCell}>{operation.operation}</td>
                          <td style={styles.tableCell}>
                            <span style={operation.success ? styles.badgeSuccess : styles.badgeFailure}>
                              {operation.success ? 'success' : 'failure'}
                            </span>
                          </td>
                          <td style={styles.tableCell}>{operation.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>
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
  tableForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginTop: '1.5rem',
    flexWrap: 'wrap',
  },
  tableLabel: {
    fontWeight: 600,
  },
  tableInput: {
    flex: '1 1 220px',
    padding: '0.6rem 0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid #cbd5f5',
    fontSize: '1rem',
  },
  tableButton: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '0.65rem 1.25rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '1rem',
    transition: 'background 0.2s ease',
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
  preSmall: {
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    overflowX: 'auto',
    fontSize: '0.8rem',
    lineHeight: 1.35,
    marginTop: '0.75rem',
  },
  section: {
    marginTop: '2rem',
  },
  sectionDescription: {
    color: '#475569',
    lineHeight: 1.5,
    marginBottom: '1rem',
  },
  authForm: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    marginBottom: '1rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  input: {
    padding: '0.65rem 0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid #cbd5f5',
    fontSize: '1rem',
  },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  primaryButton: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '0.65rem 1.25rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '1rem',
    transition: 'background 0.2s ease',
  },
  secondaryButton: {
    background: '#e2e8f0',
    color: '#1f2937',
    border: 'none',
    padding: '0.65rem 1.25rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '1rem',
    transition: 'background 0.2s ease',
  },
  sessionBox: {
    marginTop: '1rem',
  },
  testGrid: {
    display: 'grid',
    gap: '1.5rem',
    marginTop: '1.5rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  },
  testCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '0.75rem',
    padding: '1rem',
    background: '#f8fafc',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
  },
  testTitle: {
    margin: 0,
    marginBottom: '0.75rem',
    fontSize: '1.1rem',
  },
  operationTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.9rem',
  },
  tableHeader: {
    textAlign: 'left',
    padding: '0.5rem',
    borderBottom: '1px solid #cbd5f5',
    color: '#1f2937',
  },
  tableCell: {
    padding: '0.5rem',
    borderBottom: '1px solid #e2e8f0',
    verticalAlign: 'top',
  },
  badgeSuccess: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    borderRadius: '999px',
    background: 'rgba(34, 197, 94, 0.15)',
    color: '#166534',
    fontWeight: 600,
    textTransform: 'uppercase',
    fontSize: '0.75rem',
    letterSpacing: '0.04em',
  },
  badgeFailure: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    borderRadius: '999px',
    background: 'rgba(248, 113, 113, 0.15)',
    color: '#991b1b',
    fontWeight: 600,
    textTransform: 'uppercase',
    fontSize: '0.75rem',
    letterSpacing: '0.04em',
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
    case 'authenticated':
      return { ...base, color: '#16a34a' };
    case 'signed-out':
      return { ...base, color: '#475569' };
    case 'signing-in':
    case 'signing-out':
      return { ...base, color: '#2563eb' };
    default:
      return { ...base, color: '#475569' };
  }
}

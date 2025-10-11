import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase as sb } from '../utils/supabaseClient';
import { isAdminUser } from '../utils/authRoles';

const supabase = sb;

const cellHead = { padding: 10, borderRight: '1px solid #EEE', fontWeight: 700 };
const cell = { padding: 10, borderRight: '1px solid #EEE' };

const badgeStyle = (status) => {
  const value = String(status || '').toLowerCase();
  const base = { padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 };
  if (value === 'approved' || value === 'verified' || value === 'completed') {
    return { ...base, color: '#2E7D32', border: '1px solid #2E7D32' };
  }
  if (value === 'submitted' || value === 'in_review' || value === 'in review') {
    return { ...base, color: '#8A6D3B', border: '1px solid #8A6D3B' };
  }
  if (value === 'needs_more_info') {
    return { ...base, color: '#0277BD', border: '1px solid #0277BD' };
  }
  if (value === 'rejected') {
    return { ...base, color: '#B00020', border: '1px solid #B00020' };
  }
  return { ...base, color: '#555', border: '1px solid #AAA' };
};

const miniBtn = (disabled) => ({
  height: 30,
  padding: '0 10px',
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid #CCC',
  background: disabled ? '#EEE' : '#FFF',
  cursor: disabled ? 'not-allowed' : 'pointer'
});

const actionBtn = (disabled, color) => ({
  height: 34,
  padding: '0 12px',
  fontWeight: 700,
  borderRadius: 8,
  color: disabled ? '#999' : color,
  border: `2px solid ${disabled ? '#DDD' : color}`,
  background: '#FFF',
  cursor: disabled ? 'not-allowed' : 'pointer'
});

async function signedUrl(path, bucket = 'documents') {
  if (!path || !supabase) return '';
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  return error ? '' : (data?.signedUrl || '');
}

export default function InternalEnabler() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [opRows, setOpRows] = useState([]);
  const [opLoading, setOpLoading] = useState(false);
  const [opBusy, setOpBusy] = useState(null);

  const initializeSession = useCallback(async () => {
    if (!supabase) {
      setAuthChecked(true);
      setAuthError('Supabase configuration missing.');
      return;
    }

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser && !isAdminUser(currentUser)) {
        await supabase.auth.signOut();
        setUser(null);
        setAuthError('Account not authorized for admin access.');
      } else {
        setUser(currentUser || null);
        setAuthError('');
      }
    } catch (error) {
      console.error('Failed to read auth session', error);
      setAuthError('Unable to verify current session. Please try again.');
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    initializeSession();

    if (!supabase) {
      return () => { active = false; };
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const sessionUser = session?.user || null;
      if (sessionUser && !isAdminUser(sessionUser)) {
        supabase.auth.signOut();
        if (!active) return;
        setUser(null);
        setAuthError('Account not authorized for admin access.');
        setAuthChecked(true);
        return;
      }
      setUser(sessionUser);
      if (sessionUser) {
        setAuthError('');
      }
      setAuthChecked(true);
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, [initializeSession]);

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    setAuthLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setAuthError('Incorrect email or password.');
        } else if (error.message.includes('Email not confirmed')) {
          setAuthError('Email not confirmed. Please check your inbox.');
        } else {
          setAuthError(error.message || 'Unable to authenticate.');
        }
      } else {
        setPassword('');
      }
    } catch (err) {
      console.error('Admin login failed', err);
      setAuthError('Unable to authenticate. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Failed to sign out admin', err);
    } finally {
      setUser(null);
      setRows([]);
      setOpRows([]);
    }
  };

  const loadAthletes = useCallback(async () => {
    if (!supabase) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('athlete')
        .select(`
          id, first_name, last_name, phone,
          contacts_verification (
            review_status, id_verified, rejected_reason,
            submitted_at, verified_at, verification_status_changed_at,
            id_document_type, id_document_url, id_selfie_url,
            phone_verified, residence_city, residence_country
          )
        `)
        .order('last_name', { ascending: true });

      if (error) {
        throw error;
      }

      const norm = (data || []).map((r) => {
        const cv = Array.isArray(r.contacts_verification) ? r.contacts_verification[0] : r.contacts_verification;
        const review_status = String(cv?.review_status || 'draft').toLowerCase();
        return { ...r, cv: cv || null, review_status };
      });
      setRows(norm);
    } catch (err) {
      console.error('Failed to load athletes', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOperators = useCallback(async () => {
    if (!supabase) {
      setOpRows([]);
      setOpLoading(false);
      return;
    }
    setOpLoading(true);
    try {
      const { data, error } = await supabase
        .from('op_account')
        .select(`
          id, status, wizard_status, type_id,
          op_type:op_type(id, code, name),
          op_profile:op_profile(legal_name, trade_name, vat_number, tax_id, country, city, address1, address2),
          op_contact:op_contact(email_primary, phone_e164, phone_verified_at),
          op_verification_request:op_verification_request(
            id, state, reason, submitted_at, created_at, updated_at,
            op_verification_document:op_verification_document(doc_type, file_key)
          )
        `);
      if (error) throw error;

      const normalized = (data || []).map((row) => {
        const profileArr = Array.isArray(row.op_profile) ? row.op_profile : (row.op_profile ? [row.op_profile] : []);
        const contactArr = Array.isArray(row.op_contact) ? row.op_contact : (row.op_contact ? [row.op_contact] : []);
        const reqArr = Array.isArray(row.op_verification_request)
          ? row.op_verification_request
          : (row.op_verification_request ? [row.op_verification_request] : []);
        const typeArr = Array.isArray(row.op_type) ? row.op_type : (row.op_type ? [row.op_type] : []);

        const profile = profileArr[0] || null;
        const contact = contactArr[0] || null;
        const typeInfo = typeArr[0] || null;

        const sortedReqs = [...reqArr].sort((a, b) => {
          const getTs = (r) => new Date(r?.submitted_at || r?.updated_at || r?.created_at || 0).getTime();
          return getTs(b) - getTs(a);
        });
        const verificationRaw = sortedReqs[0] || null;
        const docsRaw = verificationRaw?.op_verification_document;
        const docs = Array.isArray(docsRaw) ? docsRaw : (docsRaw ? [docsRaw] : []);
        const verification = verificationRaw ? { ...verificationRaw } : null;
        if (verification) delete verification.op_verification_document;
        const reviewState = String(verification?.state || row.wizard_status || '').toLowerCase() || 'not_started';

        return {
          id: row.id,
          status: row.status || '',
          wizard_status: row.wizard_status || '',
          type: typeInfo ? { id: typeInfo.id, code: typeInfo.code, name: typeInfo.name } : null,
          profile,
          contact,
          verification,
          documents: docs,
          review_state: reviewState,
        };
      });
      setOpRows(normalized);
    } catch (err) {
      console.error('Failed to load operators', err);
      setOpRows([]);
    } finally {
      setOpLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (!supabase) return;
    await Promise.all([loadAthletes(), loadOperators()]);
  }, [loadAthletes, loadOperators]);

  useEffect(() => {
    if (!user) return;
    refreshAll();
  }, [user, refreshAll]);

  const ordered = useMemo(() => {
    const rank = (s) => ({ submitted: 0, in_review: 1, needs_more_info: 2, rejected: 3, approved: 4 })[s] ?? 9;
    return [...rows].sort((a, b) => rank(a.review_status) - rank(b.review_status));
  }, [rows]);

  const opOrdered = useMemo(() => {
    const rank = (state) => {
      const normalized = state || '';
      if (normalized === 'submitted' || normalized === 'in_review') return 0;
      if (normalized === 'needs_more_info') return 1;
      if (normalized === 'rejected') return 2;
      if (normalized === 'verified' || normalized === 'completed') return 3;
      return 5;
    };
    return [...opRows].sort((a, b) => rank(a.review_state) - rank(b.review_state));
  }, [opRows]);

  const athleteStats = useMemo(() => {
    const totals = ordered.reduce((acc, row) => {
      const key = row.review_status || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const verified = ordered.filter((row) => row.cv?.id_verified).length;
    return {
      total: ordered.length,
      submitted: totals.submitted || 0,
      inReview: totals.in_review || 0,
      needsInfo: totals.needs_more_info || 0,
      rejected: totals.rejected || 0,
      approved: totals.approved || 0,
      verified,
    };
  }, [ordered]);

  const operatorStats = useMemo(() => {
    const totals = opOrdered.reduce((acc, row) => {
      const key = row.review_state || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return {
      total: opOrdered.length,
      submitted: totals.submitted || 0,
      inReview: totals.in_review || 0,
      needsInfo: totals.needs_more_info || 0,
      rejected: totals.rejected || 0,
      verified: totals.verified || totals.completed || 0,
    };
  }, [opOrdered]);

  const consolidatedUsers = useMemo(() => {
    const athletes = ordered.map((row) => ({
      id: `athlete-${row.id}`,
      type: 'Athlete',
      name: `${row.last_name || ''} ${row.first_name || ''}`.trim() || '—',
      status: row.review_status,
      detail: row.cv?.residence_city || row.cv?.residence_country
        ? [row.cv?.residence_city, row.cv?.residence_country].filter(Boolean).join(', ')
        : '—',
      meta: row.cv?.id_verified ? 'ID verified' : 'ID not verified',
    }));

    const operators = opOrdered.map((row) => ({
      id: `operator-${row.id}`,
      type: row.type?.name || row.type?.code || 'Operator',
      name: row.profile?.legal_name || row.profile?.trade_name || '—',
      status: row.review_state,
      detail: row.contact?.email_primary || row.contact?.phone_e164 || '—',
      meta: `Account: ${row.status || '-'} · Wizard: ${row.wizard_status || '-'}`,
    }));

    return [...athletes, ...operators].sort((a, b) => a.name.localeCompare(b.name));
  }, [ordered, opOrdered]);

  const viewDoc = async (key) => {
    const url = await signedUrl(key);
    if (url) window.open(url, '_blank', 'noreferrer');
  };

  const viewOpDoc = async (key) => {
    const url = await signedUrl(key, 'op_assets');
    if (url) window.open(url, '_blank', 'noreferrer');
  };

  const startAthleteReview = async (athleteId) => {
    if (!supabase) return;
    try {
      setBusy(athleteId);
      const { error } = await supabase
        .from('contacts_verification')
        .update({
          review_status: 'in_review',
          verification_status_changed_at: new Date().toISOString(),
        })
        .eq('athlete_id', athleteId)
        .in('review_status', ['submitted', 'needs_more_info']);
      if (error) throw error;
      await refreshAll();
    } catch (e) {
      console.error(e);
      alert('Unable to mark as in review.');
    } finally {
      setBusy(null);
    }
  };

  const requestAthleteInfo = async (athleteId) => {
    if (!supabase) return;
    const reason = window.prompt('Motivo della richiesta di integrazione (opzionale):', '');
    if (reason === null) return;
    try {
      setBusy(athleteId);
      const { error } = await supabase
        .from('contacts_verification')
        .update({
          review_status: 'needs_more_info',
          id_verified: false,
          verification_status_changed_at: new Date().toISOString(),
          rejected_reason: (reason || '').trim() || null,
        })
        .eq('athlete_id', athleteId)
        .in('review_status', ['submitted', 'in_review']);
      if (error) throw error;
      await refreshAll();
    } catch (e) {
      console.error(e);
      alert('Unable to request additional info.');
    } finally {
      setBusy(null);
    }
  };

  const doApprove = async (athleteId) => {
    if (!supabase) return;
    try {
      setBusy(athleteId);
      const { error } = await supabase
        .from('contacts_verification')
        .update({
          review_status: 'approved',
          id_verified: true,
          verified_at: new Date().toISOString(),
          verification_status_changed_at: new Date().toISOString(),
          rejected_reason: null,
        })
        .eq('athlete_id', athleteId)
        .in('review_status', ['submitted', 'in_review']);
      if (error) throw error;
      await refreshAll();
    } catch (e) {
      console.error(e);
      alert('Approve failed');
    } finally {
      setBusy(null);
    }
  };

  const doReject = async (athleteId) => {
    if (!supabase) return;
    const reason = window.prompt('Motivo del rifiuto (opzionale):', '');
    if (reason === null) return;
    try {
      setBusy(athleteId);
      const { error } = await supabase
        .from('contacts_verification')
        .update({
          review_status: 'rejected',
          id_verified: false,
          verification_status_changed_at: new Date().toISOString(),
          rejected_reason: (reason || '').trim() || null,
        })
        .eq('athlete_id', athleteId)
        .in('review_status', ['submitted', 'in_review']);
      if (error) throw error;
      await refreshAll();
    } catch (e) {
      console.error(e);
      alert('Reject failed');
    } finally {
      setBusy(null);
    }
  };

  const startOperatorReview = async (row) => {
    if (!supabase) return;
    if (!row?.verification?.id) { alert('Missing verification request.'); return; }
    try {
      setOpBusy(row.id);
      const payload = { state: 'IN_REVIEW', reason: null };
      if (!row.verification?.submitted_at) {
        payload.submitted_at = new Date().toISOString();
      }
      const { error: reqErr } = await supabase
        .from('op_verification_request')
        .update(payload)
        .eq('id', row.verification.id);
      if (reqErr) throw reqErr;

      const { error: accErr } = await supabase
        .from('op_account')
        .update({ wizard_status: 'SUBMITTED' })
        .eq('id', row.id);
      if (accErr) throw accErr;

      await refreshAll();
    } catch (e) {
      console.error(e);
      alert('Failed to start operator review');
    } finally {
      setOpBusy(null);
    }
  };

  const requestOperatorInfo = async (row) => {
    if (!supabase) return;
    if (!row?.verification?.id) { alert('Missing verification request.'); return; }
    const reason = window.prompt('Motivo della richiesta di integrazione (obbligatorio):', '');
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) { alert('Inserire un motivo valido.'); return; }
    try {
      setOpBusy(row.id);
      const { error: reqErr } = await supabase
        .from('op_verification_request')
        .update({ state: 'NEEDS_MORE_INFO', reason: trimmed })
        .eq('id', row.verification.id);
      if (reqErr) throw reqErr;

      const { error: accErr } = await supabase
        .from('op_account')
        .update({ wizard_status: 'IN_PROGRESS' })
        .eq('id', row.id);
      if (accErr) throw accErr;

      await refreshAll();
    } catch (e) {
      console.error(e);
      alert('Operator update failed');
    } finally {
      setOpBusy(null);
    }
  };

  const approveOperator = async (row) => {
    if (!supabase) return;
    if (!row?.verification?.id) { alert('Missing verification request.'); return; }
    try {
      setOpBusy(row.id);
      const { error: reqErr } = await supabase
        .from('op_verification_request')
        .update({ state: 'VERIFIED', reason: null })
        .eq('id', row.verification.id);
      if (reqErr) throw reqErr;

      const { error: accErr } = await supabase
        .from('op_account')
        .update({ status: 'active', wizard_status: 'COMPLETED' })
        .eq('id', row.id);
      if (accErr) throw accErr;

      await refreshAll();
    } catch (e) {
      console.error(e);
      alert('Operator approve failed');
    } finally {
      setOpBusy(null);
    }
  };

  const rejectOperator = async (row) => {
    if (!supabase) return;
    if (!row?.verification?.id) { alert('Missing verification request.'); return; }
    const reason = window.prompt('Motivo del rifiuto (richiesto):', '');
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) { alert('Inserire un motivo di rifiuto.'); return; }
    try {
      setOpBusy(row.id);
      const { error: reqErr } = await supabase
        .from('op_verification_request')
        .update({ state: 'REJECTED', reason: trimmed })
        .eq('id', row.verification.id);
      if (reqErr) throw reqErr;

      await refreshAll();
    } catch (e) {
      console.error(e);
      alert('Operator reject failed');
    } finally {
      setOpBusy(null);
    }
  };

  if (!authChecked) {
    return (
      <div style={styles.fullPage}>
        <div style={styles.loader}>Checking credentials…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.loginWrapper}>
        <div style={styles.loginCard}>
          <img src="/logo-talentlix.png" alt="TalentLix Logo" style={{ width: 72, marginBottom: 16 }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: 8 }}>Admin Control Panel</h1>
          <p style={{ fontSize: 14, color: '#555', marginBottom: 24 }}>
            Sign in with your administrator credentials to access the internal enabler tools.
          </p>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" style={{ ...styles.primaryButton, opacity: authLoading ? 0.7 : 1 }} disabled={authLoading}>
              {authLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          {authError && <div style={styles.errorBox}>{authError}</div>}
        </div>
      </div>
    );
  }

  const globalLoading = loading || opLoading;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>TalentLix Admin Control Panel</h1>
          <p style={{ margin: '6px 0 0', color: '#555' }}>
            Monitor submissions, manage verification workflows and unlock access for athletes and operators.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#555' }}>{user.email}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={refreshAll} disabled={globalLoading} style={styles.secondaryButton}>
              {globalLoading ? 'Updating…' : 'Refresh data'}
            </button>
            <button onClick={handleLogout} style={styles.dangerButton}>Sign out</button>
          </div>
          {authError && <div style={{ color: '#B00020', fontSize: 12, marginTop: 8 }}>{authError}</div>}
        </div>
      </header>

      <section style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statTitle}>Athletes</div>
          <div style={styles.statValue}>{athleteStats.total}</div>
          <div style={styles.statMeta}>
            Submitted: {athleteStats.submitted} · In review: {athleteStats.inReview} · Approved: {athleteStats.approved}
          </div>
          <div style={styles.statMeta}>Needs info: {athleteStats.needsInfo} · Rejected: {athleteStats.rejected}</div>
          <div style={styles.statMeta}>ID verified: {athleteStats.verified}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statTitle}>Operators</div>
          <div style={styles.statValue}>{operatorStats.total}</div>
          <div style={styles.statMeta}>
            Submitted: {operatorStats.submitted} · In review: {operatorStats.inReview} · Verified: {operatorStats.verified}
          </div>
          <div style={styles.statMeta}>Needs info: {operatorStats.needsInfo} · Rejected: {operatorStats.rejected}</div>
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Directory overview</h2>
          <p style={styles.sectionDescription}>
            Quick snapshot of every account with their role, status and most relevant contact details.
          </p>
        </div>
        <div style={{ border: '1px solid #EEE', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 220px 160px 1fr', background: '#FAFAFA' }}>
            <div style={cellHead}>Type</div>
            <div style={cellHead}>Name</div>
            <div style={cellHead}>Status</div>
            <div style={cellHead}>Details</div>
          </div>
          {consolidatedUsers.map((item) => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '160px 220px 160px 1fr', borderTop: '1px solid #EEE' }}>
              <div style={cell}>{item.type}</div>
              <div style={cell}>{item.name}</div>
              <div style={{ ...cell, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={badgeStyle(item.status)}>{item.status}</span>
                <span style={{ fontSize: 12, color: '#666' }}>{item.meta}</span>
              </div>
              <div style={cell}>{item.detail}</div>
            </div>
          ))}
          {consolidatedUsers.length === 0 && (
            <div style={{ padding: 20, color: '#666' }}>Nessun utente trovato.</div>
          )}
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Athletes – Identity reviews</h2>
          <p style={styles.sectionDescription}>
            Progress submissions through review, request clarifications or finalize approvals.
          </p>
        </div>
        <div style={{ border: '1px solid #EEE', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr 1fr 1fr', background: '#FAFAFA' }}>
            <div style={cellHead}>Athlete</div>
            <div style={cellHead}>Status</div>
            <div style={cellHead}>Phone</div>
            <div style={cellHead}>Documents</div>
            <div style={cellHead}>Actions</div>
          </div>

          {ordered.map((r) => {
            const cv = r.cv || {};
            const canStartReview = ['submitted', 'needs_more_info'].includes(r.review_status);
            const canFinalize = ['submitted', 'in_review'].includes(r.review_status);
            const canRequestInfo = ['submitted', 'in_review'].includes(r.review_status);
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr 1fr 1fr', borderTop: '1px solid #EEE' }}>
                <div style={cell}>
                  <div style={{ fontWeight: 700 }}>{r.last_name} {r.first_name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {cv.residence_city ? `${cv.residence_city}` : ''}{cv.residence_country ? `, ${cv.residence_country}` : ''}
                  </div>
                </div>

                <div style={cell}>
                  <span style={badgeStyle(r.review_status)}>{r.review_status}</span>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                    {cv.id_verified ? 'ID verified ✓' : 'ID not verified'}
                    {cv.rejected_reason ? <div style={{ color: '#B00020' }}>Reason: {cv.rejected_reason}</div> : null}
                  </div>
                </div>

                <div style={cell}>
                  <div style={{ fontSize: 13 }}>{r.phone || '-'}</div>
                  <div style={{ fontSize: 12, color: cv.phone_verified ? '#2E7D32' : '#B00020' }}>
                    {cv.phone_verified ? 'Phone verified ✓' : 'Phone not verified'}
                  </div>
                </div>

                <div style={cell}>
                  <div style={{ fontSize: 12 }}>Type: {cv.id_document_type || '-'}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => viewDoc(cv.id_document_url)}
                      disabled={!cv.id_document_url}
                      style={miniBtn(!cv.id_document_url)}
                      title="View ID document"
                    >ID Doc</button>
                    <button
                      onClick={() => viewDoc(cv.id_selfie_url)}
                      disabled={!cv.id_selfie_url}
                      style={miniBtn(!cv.id_selfie_url)}
                      title="View Face photo"
                    >Face</button>
                  </div>
                </div>

                <div style={cell}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => startAthleteReview(r.id)}
                      disabled={!canStartReview || busy === r.id}
                      style={actionBtn(!canStartReview || busy === r.id, '#0277BD')}
                    >Start review</button>
                    <button
                      onClick={() => requestAthleteInfo(r.id)}
                      disabled={!canRequestInfo || busy === r.id}
                      style={actionBtn(!canRequestInfo || busy === r.id, '#8A6D3B')}
                    >Need info</button>
                    <button
                      onClick={() => doApprove(r.id)}
                      disabled={!canFinalize || busy === r.id}
                      style={actionBtn(!canFinalize || busy === r.id, '#2E7D32')}
                    >Approve</button>
                    <button
                      onClick={() => doReject(r.id)}
                      disabled={!canFinalize || busy === r.id}
                      style={actionBtn(!canFinalize || busy === r.id, '#B00020')}
                    >Reject</button>
                  </div>
                </div>
              </div>
            );
          })}

          {ordered.length === 0 && !loading && (
            <div style={{ padding: 20, color: '#666' }}>Nessun atleta trovato.</div>
          )}
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Operators – Verification</h2>
          <p style={styles.sectionDescription}>
            Validate business documentation, request integrations or finalize onboarding.
          </p>
        </div>
        <div style={{ border: '1px solid #EEE', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1fr 1fr 1fr', background: '#FAFAFA' }}>
            <div style={cellHead}>Operator</div>
            <div style={cellHead}>Status</div>
            <div style={cellHead}>Contacts</div>
            <div style={cellHead}>Documents</div>
            <div style={cellHead}>Actions</div>
          </div>

          {opOrdered.map((row) => {
            const { profile, contact, verification, documents, review_state } = row;
            const canStart = ['submitted', 'needs_more_info'].includes(review_state);
            const canFinalize = ['submitted', 'in_review'].includes(review_state);
            const canRequestInfo = ['submitted', 'in_review'].includes(review_state);
            const reason = verification?.reason ? verification.reason : null;

            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1fr 1fr 1fr', borderTop: '1px solid #EEE' }}>
                <div style={cell}>
                  <div style={{ fontWeight: 700 }}>{profile?.legal_name || profile?.trade_name || '—'}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {row.type?.name ? `${row.type.name}${profile?.city || profile?.country ? ' · ' : ''}` : ''}
                    {profile?.city || profile?.country ? [profile?.city, profile?.country].filter(Boolean).join(', ') : ''}
                  </div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 6 }}>
                    Account: {row.status || '-'} · Wizard: {row.wizard_status || '-'}
                  </div>
                </div>

                <div style={cell}>
                  <span style={badgeStyle(review_state)}>{review_state}</span>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                    Request: {verification ? (verification.state || '-') : '—'}
                    {reason ? <div style={{ color: '#B00020' }}>Reason: {reason}</div> : null}
                  </div>
                </div>

                <div style={cell}>
                  <div style={{ fontSize: 13 }}>{contact?.email_primary || '-'}</div>
                  <div style={{ fontSize: 13 }}>{contact?.phone_e164 || '-'}</div>
                  <div style={{ fontSize: 12, color: contact?.phone_verified_at ? '#2E7D32' : '#B00020' }}>
                    {contact?.phone_verified_at ? 'Phone verified ✓' : 'Phone not verified'}
                  </div>
                </div>

                <div style={cell}>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    {documents.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>—</span>}
                    {documents.map((doc) => (
                      <button
                        key={`${doc.doc_type}-${doc.file_key}`}
                        onClick={() => viewOpDoc(doc.file_key)}
                        disabled={!doc.file_key}
                        style={miniBtn(!doc.file_key)}
                        title={doc.doc_type || 'Document'}
                      >
                        {doc.doc_type || 'Doc'}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={cell}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => startOperatorReview(row)}
                      disabled={!canStart || opBusy === row.id}
                      style={actionBtn(!canStart || opBusy === row.id, '#0277BD')}
                    >Start review</button>
                    <button
                      onClick={() => requestOperatorInfo(row)}
                      disabled={!canRequestInfo || opBusy === row.id}
                      style={actionBtn(!canRequestInfo || opBusy === row.id, '#8A6D3B')}
                    >Need info</button>
                    <button
                      onClick={() => approveOperator(row)}
                      disabled={!canFinalize || opBusy === row.id}
                      style={actionBtn(!canFinalize || opBusy === row.id, '#2E7D32')}
                    >Approve</button>
                    <button
                      onClick={() => rejectOperator(row)}
                      disabled={!canFinalize || opBusy === row.id}
                      style={actionBtn(!canFinalize || opBusy === row.id, '#B00020')}
                    >Reject</button>
                  </div>
                </div>
              </div>
            );
          })}

          {opOrdered.length === 0 && !opLoading && (
            <div style={{ padding: 20, color: '#666' }}>Nessun operatore trovato.</div>
          )}
        </div>
      </section>
    </div>
  );
}

const styles = {
  fullPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, system-ui, sans-serif',
    background: '#F5F7FA',
    color: '#333',
  },
  loader: {
    fontSize: '1.1rem',
    color: '#555',
  },
  loginWrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #F6F8FB 0%, #E9EEF6 100%)',
    fontFamily: 'Inter, system-ui, sans-serif',
    padding: 20,
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    background: '#FFFFFF',
    borderRadius: 16,
    padding: '32px 36px',
    boxShadow: '0 20px 45px rgba(15, 23, 42, 0.08)',
    border: '1px solid rgba(15,23,42,0.05)',
    textAlign: 'center',
  },
  input: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #CBD5E1',
    fontSize: 15,
    outline: 'none',
  },
  primaryButton: {
    padding: '12px 14px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #27E3DA 0%, #4E9AF7 100%)',
    color: '#FFFFFF',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 15,
  },
  errorBox: {
    marginTop: 16,
    padding: '10px 12px',
    background: 'rgba(176, 0, 32, 0.08)',
    color: '#B00020',
    borderRadius: 10,
    fontSize: 13,
  },
  page: {
    padding: '32px 40px 60px',
    fontFamily: 'Inter, system-ui, sans-serif',
    background: '#F8FAFC',
    color: '#0F172A',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 24,
    marginBottom: 32,
  },
  secondaryButton: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #CBD5E1',
    background: '#FFFFFF',
    cursor: 'pointer',
    fontWeight: 600,
    color: '#0F172A',
  },
  dangerButton: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #FCA5A5',
    background: '#FEE2E2',
    cursor: 'pointer',
    fontWeight: 600,
    color: '#B91C1C',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 20,
    marginBottom: 40,
  },
  statCard: {
    background: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    border: '1px solid rgba(15,23,42,0.05)',
    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
  },
  statTitle: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#475569',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 700,
    color: '#0F172A',
  },
  statMeta: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
  section: {
    marginBottom: 48,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.4rem',
    color: '#0F172A',
  },
  sectionDescription: {
    margin: '6px 0 0',
    fontSize: 14,
    color: '#475569',
  },
};

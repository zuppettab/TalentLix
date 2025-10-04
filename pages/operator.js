// pages/operator.js
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase as sb } from '../utils/supabaseClient';
import { useOperatorGuard } from '../hooks/useOperatorGuard';

const supabase = sb;

const cellHead = { padding: 10, borderRight: '1px solid #EEE' };
const cell = { padding: 10, borderRight: '1px solid #EEE' };

const badgeStyle = (status) => {
  const base = { padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 };
  if (status === 'approved')  return { ...base, color: '#2E7D32', border: '1px solid #2E7D32' };
  if (status === 'submitted') return { ...base, color: '#8A6D3B', border: '1px solid #8A6D3B' };
  if (status === 'rejected')  return { ...base, color: '#B00020', border: '1px solid #B00020' };
  return { ...base, color: '#555', border: '1px solid #AAA' }; // draft/unknown
};

const miniBtn = (disabled) => ({
  height: 30, padding: '0 10px', fontSize: 12, borderRadius: 8,
  border: '1px solid #CCC', background: disabled ? '#EEE' : '#FFF', cursor: disabled ? 'not-allowed' : 'pointer'
});
const actionBtn = (disabled, color) => ({
  height: 34, padding: '0 12px', fontWeight: 700, borderRadius: 8,
  color: disabled ? '#999' : color,
  border: `2px solid ${disabled ? '#DDD' : color}`,
  background: '#FFF',
  cursor: disabled ? 'not-allowed' : 'pointer'
});

async function signedUrl(path) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60);
  return error ? '' : (data?.signedUrl || '');
}

export default function Operator() {
  const { loading: checkingOperator, user: operatorUser, error: guardError } = useOperatorGuard();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // athlete_id in lavorazione

  const load = useCallback(async () => {
    setLoading(true);
    // LEFT JOIN: athlete + eventuale riga in contacts_verification
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
      console.error(error);
      setRows([]);
    } else {
      const norm = (data || []).map(r => {
        // Supabase può restituire array se 1:N; prendiamo la prima (aspettata 1:1)
        const cv = Array.isArray(r.contacts_verification) ? r.contacts_verification[0] : r.contacts_verification;
        const review_status = String(cv?.review_status || 'draft').toLowerCase();
        return { ...r, cv: cv || null, review_status };
      });
      setRows(norm);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!checkingOperator && operatorUser) {
      load();
    }
  }, [checkingOperator, operatorUser, load]);

  if (checkingOperator) {
    return (
      <div style={{ padding: 20, fontFamily: 'system-ui, Arial, sans-serif' }}>
        <h2 style={{ margin: 0 }}>Checking operator permissions…</h2>
      </div>
    );
  }

  if (guardError) {
    return (
      <div style={{ padding: 20, fontFamily: 'system-ui, Arial, sans-serif' }}>
        <h2 style={{ margin: 0 }}>Unable to verify operator session.</h2>
      </div>
    );
  }

  if (!operatorUser) {
    return null;
  }

  const ordered = useMemo(() => {
    // Focus immediato sui "submitted"
    const rank = s => ({ submitted: 0, rejected: 1, draft: 2, approved: 3 })[s] ?? 9;
    return [...rows].sort((a, b) => rank(a.review_status) - rank(b.review_status));
  }, [rows]);

  const viewDoc = async (key) => {
    const url = await signedUrl(key);
    if (url) window.open(url, '_blank', 'noreferrer');
  };

  // *** IMPORTANTISSIMO ***
  // Nessuna creazione/alter table. Si AGGIORNA SOLO se esiste già una riga "submitted".
  const doApprove = async (athleteId) => {
    try {
      setBusy(athleteId);
      // Aggiorna SOLO dove già esiste una riga submitted per quell'athlete_id
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
        .eq('review_status', 'submitted');
      if (error) throw error;
      await load();
    } catch (e) {
      console.error(e); alert('Approve failed');
    } finally {
      setBusy(null);
    }
  };

  const doReject = async (athleteId) => {
    const reason = window.prompt('Motivo del rifiuto (opzionale):', '');
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
        .eq('review_status', 'submitted');
      if (error) throw error;
      await load();
    } catch (e) {
      console.error(e); alert('Reject failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, Arial, sans-serif' }}>
      <h1 style={{ margin: '0 0 12px' }}>Operator – Identity Reviews (public)</h1>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={load} disabled={loading} style={{ height: 36, padding: '0 12px', fontWeight: 600 }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>
          Sola lettura + azioni su profili già “submitted”. Nessuna modifica allo schema.
        </span>
      </div>

      <div style={{ border: '1px solid #EEE', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr 1fr 1fr', gap: 0, background: '#FAFAFA', fontWeight: 700 }}>
          <div style={cellHead}>Athlete</div>
          <div style={cellHead}>Status</div>
          <div style={cellHead}>Phone</div>
          <div style={cellHead}>Documents</div>
          <div style={cellHead}>Actions</div>
        </div>

        {ordered.map((r) => {
          const cv = r.cv || {};
          const canAct = r.review_status === 'submitted'; // SOLO se già sottomesso
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
                    onClick={() => doApprove(r.id)}
                    disabled={!canAct || busy === r.id}
                    style={actionBtn(!canAct || busy === r.id, '#2E7D32')}
                  >Approve</button>
                  <button
                    onClick={() => doReject(r.id)}
                    disabled={!canAct || busy === r.id}
                    style={actionBtn(!canAct || busy === r.id, '#B00020')}
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
    </div>
  );
}

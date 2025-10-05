// pages/operator.js
import { useEffect, useMemo, useState } from 'react';
import { supabase as sb } from '../utils/supabaseClient';

const supabase = sb;

const cellHead = { padding: 10, borderRight: '1px solid #EEE' };
const cell = { padding: 10, borderRight: '1px solid #EEE' };

const badgeStyle = (status) => {
  const value = String(status || '').toLowerCase();
  const base = { padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 };
  if (value === 'approved' || value === 'verified' || value === 'completed') {
    return { ...base, color: '#2E7D32', border: '1px solid #2E7D32' };
  }
  if (value === 'submitted' || value === 'in_review') {
    return { ...base, color: '#8A6D3B', border: '1px solid #8A6D3B' };
  }
  if (value === 'needs_more_info') {
    return { ...base, color: '#0277BD', border: '1px solid #0277BD' };
  }
  if (value === 'rejected') {
    return { ...base, color: '#B00020', border: '1px solid #B00020' };
  }
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

async function signedUrl(path, bucket = 'documents') {
  if (!path) return '';
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  return error ? '' : (data?.signedUrl || '');
}

export default function Operator() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // athlete_id in lavorazione
  const [opRows, setOpRows] = useState([]);
  const [opLoading, setOpLoading] = useState(true);
  const [opBusy, setOpBusy] = useState(null); // op_id in lavorazione

  const loadAthletes = async () => {
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
  };

  const loadOperators = async () => {
    setOpLoading(true);
    try {
      const { data, error } = await supabase
        .from('op_account')
        .select(`
          id, status, wizard_status, type_id,
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

        const profile = profileArr[0] || null;
        const contact = contactArr[0] || null;

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
          profile,
          contact,
          verification,
          documents: docs,
          review_state: reviewState,
        };
      });
      setOpRows(normalized);
    } catch (err) {
      console.error(err);
      setOpRows([]);
    } finally {
      setOpLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([loadAthletes(), loadOperators()]);
  };

  useEffect(() => { refreshAll(); }, []);

  const ordered = useMemo(() => {
    // Focus immediato sui "submitted"
    const rank = s => ({ submitted: 0, rejected: 1, draft: 2, approved: 3 })[s] ?? 9;
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

  const viewDoc = async (key) => {
    const url = await signedUrl(key);
    if (url) window.open(url, '_blank', 'noreferrer');
  };

  const viewOpDoc = async (key) => {
    const url = await signedUrl(key, 'op_assets');
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
      await refreshAll();
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
      await refreshAll();
    } catch (e) {
      console.error(e); alert('Reject failed');
    } finally {
      setBusy(null);
    }
  };

  const approveOperator = async (row) => {
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
      console.error(e); alert('Operator approve failed');
    } finally {
      setOpBusy(null);
    }
  };

  const rejectOperator = async (row) => {
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
      console.error(e); alert('Operator reject failed');
    } finally {
      setOpBusy(null);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, Arial, sans-serif' }}>
      <h1 style={{ margin: '0 0 12px' }}>Operator – Identity Reviews (public)</h1>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={refreshAll} disabled={loading || opLoading} style={{ height: 36, padding: '0 12px', fontWeight: 600 }}>
          {loading || opLoading ? 'Loading…' : 'Refresh'}
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

      <h2 style={{ margin: '32px 0 12px' }}>Operators – Verification</h2>
      <div style={{ border: '1px solid #EEE', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1fr 1fr 1fr', gap: 0, background: '#FAFAFA', fontWeight: 700 }}>
          <div style={cellHead}>Operator</div>
          <div style={cellHead}>Status</div>
          <div style={cellHead}>Contacts</div>
          <div style={cellHead}>Documents</div>
          <div style={cellHead}>Actions</div>
        </div>

        {opOrdered.map((row) => {
          const { profile, contact, verification, documents, review_state } = row;
          const canAct = ['submitted', 'in_review', 'needs_more_info'].includes(review_state);
          const reason = verification?.reason ? verification.reason : null;

          return (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '260px 1fr 1fr 1fr 1fr', borderTop: '1px solid #EEE' }}>
              <div style={cell}>
                <div style={{ fontWeight: 700 }}>{profile?.legal_name || profile?.trade_name || '—'}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
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
                    onClick={() => approveOperator(row)}
                    disabled={!canAct || opBusy === row.id}
                    style={actionBtn(!canAct || opBusy === row.id, '#2E7D32')}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => rejectOperator(row)}
                    disabled={!canAct || opBusy === row.id}
                    style={actionBtn(!canAct || opBusy === row.id, '#B00020')}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {opOrdered.length === 0 && !opLoading && (
          <div style={{ padding: 20, color: '#666' }}>Nessun operatore trovato.</div>
        )}
      </div>
    </div>
  );
}

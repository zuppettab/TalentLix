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
  if (status === 'submitted' || status === 'in_review') return { ...base, color: '#8A6D3B', border: '1px solid #8A6D3B' };
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
  if (!supabase) return '';
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60);
  return error ? '' : (data?.signedUrl || '');
}

export default function Operator() {
  const { loading: checkingOperator, user: operatorUser, error: guardError } = useOperatorGuard();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // account id currently in progress

  const load = useCallback(async () => {
    if (!supabase) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('op_account')
      .select(`
        id,
        status,
        enabled_by_admin_at,
        op_profile (
          legal_name,
          trade_name,
          city,
          country
        ),
        op_contact (
          phone_e164,
          phone_verified_at
        ),
        op_verification_request (
          id,
          verification_id,
          state,
          reason,
          op_verification_document (
            id,
            verification_id,
            doc_type,
            file_key,
            created_at
          )
        )
      `)
      .order('id', { ascending: true })
      .order('state', { referencedTable: 'op_verification_request', ascending: true });

    if (error) {
      console.error(error);
      setRows([]);
    } else {
      const norm = (data || []).map((account) => {
        const {
          op_verification_request: rawRequests,
          op_profile: rawProfile,
          op_contact: rawContact,
          ...rest
        } = account;
        const profile = Array.isArray(rawProfile)
          ? rawProfile[0]
          : rawProfile;
        const contact = Array.isArray(rawContact)
          ? rawContact[0]
          : rawContact;
        const requests = Array.isArray(rawRequests)
          ? rawRequests
          : rawRequests
            ? [rawRequests]
            : [];
        const currentRequest =
          requests.find((req) => {
            const state = String(req?.state || '').toLowerCase();
            return state === 'submitted' || state === 'in_review';
          }) ||
          requests[0] ||
          null;
        const { op_verification_document: rawDocs, ...requestRest } = currentRequest || {};
        const documents = currentRequest
          ? Array.isArray(rawDocs)
            ? rawDocs
            : rawDocs
              ? [rawDocs]
              : []
          : [];

        return {
          ...rest,
          profile: profile || null,
          contact: contact || null,
          request: currentRequest ? { ...requestRest, documents } : null,
          review_status: String(currentRequest?.state || 'draft').toLowerCase(),
        };
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
    const rank = (s) => ({ submitted: 0, in_review: 0, rejected: 1, draft: 2, approved: 3 })[s] ?? 9;
    return [...rows].sort((a, b) => rank(a.review_status) - rank(b.review_status));
  }, [rows]);

  const viewDoc = async (key) => {
    const url = await signedUrl(key);
    if (url) window.open(url, '_blank', 'noreferrer');
  };

  // *** IMPORTANTISSIMO ***
  // Nessuna creazione/alter table. Si AGGIORNA SOLO se esiste già una riga "submitted".
  const doApprove = async (account) => {
    if (!account?.request) return;
    const requestId = account.request.id;
    try {
      if (!supabase) throw new Error('Supabase not configured');
      setBusy(account.id);
      const { error } = await supabase
        .from('op_verification_request')
        .update({
          state: 'approved',
          reason: null,
        })
        .eq('id', requestId)
        .eq('state', 'submitted');
      if (error) throw error;

      const { error: accountError } = await supabase
        .from('op_account')
        .update({
          status: 'active',
          enabled_by_admin_at: new Date().toISOString(),
        })
        .eq('id', account.id);
      if (accountError) throw accountError;

      await load();
    } catch (e) {
      console.error(e); alert('Approve failed');
    } finally {
      setBusy(null);
    }
  };

  const doReject = async (account) => {
    if (!account?.request) return;
    const requestId = account.request.id;
    const reasonInput = window.prompt('Rejection reason (optional):', '');
    const reason = (reasonInput || '').trim();
    try {
      if (!supabase) throw new Error('Supabase not configured');
      setBusy(account.id);
      const { error } = await supabase
        .from('op_verification_request')
        .update({
          state: 'rejected',
          reason: reason || null,
        })
        .eq('id', requestId)
        .eq('state', 'submitted');
      if (error) throw error;

      const verificationId = account.request?.verification_id;
      if (reason && verificationId) {
        const { error: noteError } = await supabase
          .from('op_review_note')
          .insert({
            verification_id: verificationId,
            note: reason,
          });
        if (noteError) console.error(noteError);
      }

      const { error: accountError } = await supabase
        .from('op_account')
        .update({
          status: 'disabled',
          enabled_by_admin_at: null,
        })
        .eq('id', account.id);
      if (accountError) throw accountError;

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
          Read-only view plus actions on profiles already “submitted.” No schema changes.
        </span>
      </div>

      <div style={{ border: '1px solid #EEE', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr 1fr 1fr', gap: 0, background: '#FAFAFA', fontWeight: 700 }}>
          <div style={cellHead}>Operator</div>
          <div style={cellHead}>Status</div>
          <div style={cellHead}>Phone</div>
          <div style={cellHead}>Documents</div>
          <div style={cellHead}>Actions</div>
        </div>

        {ordered.map((r) => {
          const profile = r.profile || {};
          const contact = r.contact || {};
          const request = r.request || {};
          const displayName = profile.legal_name || profile.trade_name || '—';
          const phone = contact.phone_e164 || '—';
          const phoneVerified = Boolean(contact.phone_verified_at);
          const docCount = request.documents?.length ?? 0;
          const canAct = r.review_status === 'submitted'; // SOLO se già sottomesso
          return (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr 1fr 1fr', borderTop: '1px solid #EEE' }}>
              <div style={cell}>
                <div style={{ fontWeight: 700 }}>{displayName}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {profile.city ? `${profile.city}` : ''}{profile.country ? `, ${profile.country}` : ''}
                </div>
              </div>

              <div style={cell}>
                <span style={badgeStyle(r.review_status)}>{r.review_status}</span>
                <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                  Account: {r.status || 'unknown'}
                  {request.reason ? <div style={{ color: '#B00020' }}>Reason: {request.reason}</div> : null}
                </div>
              </div>

              <div style={cell}>
                <div style={{ fontSize: 13 }}>{phone}</div>
                <div style={{ fontSize: 12, color: phoneVerified ? '#2E7D32' : '#B00020' }}>
                  {phoneVerified ? 'Phone verified ✓' : 'Phone not verified'}
                </div>
              </div>

              <div style={cell}>
                <div style={{ fontSize: 12 }}>Docs: {docCount}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {(request.documents || []).map((doc) => {
                    const type = String(doc.doc_type || '').toLowerCase();
                    const labelMap = {
                      government_id: 'ID Doc',
                      identity: 'ID Doc',
                      id_document: 'ID Doc',
                      selfie: 'Face',
                      face: 'Face',
                      proof_of_address: 'Address',
                      address: 'Address',
                      business_license: 'Business License',
                    };
                    const label = labelMap[type] || doc.doc_type || 'Document';
                    const key = doc.id || doc.file_key || doc.doc_type;
                    return (
                      <button
                        key={key}
                        onClick={() => viewDoc(doc.file_key)}
                        disabled={!doc.file_key}
                        style={miniBtn(!doc.file_key)}
                        title={`View ${label}`}
                      >{label}</button>
                    );
                  })}
                </div>
              </div>

              <div style={cell}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => doApprove(r)}
                    disabled={!canAct || busy === r.id}
                    style={actionBtn(!canAct || busy === r.id, '#2E7D32')}
                  >Approve</button>
                  <button
                    onClick={() => doReject(r)}
                    disabled={!canAct || busy === r.id}
                    style={actionBtn(!canAct || busy === r.id, '#B00020')}
                  >Reject</button>
                </div>
              </div>
            </div>
          );
        })}

        {ordered.length === 0 && !loading && (
          <div style={{ padding: 20, color: '#666' }}>No operator accounts found.</div>
        )}
      </div>
    </div>
  );
}

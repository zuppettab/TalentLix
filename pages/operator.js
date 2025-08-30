import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function Operator() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetchAthletes();
  }, []);

  const fetchAthletes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('athlete')
      .select(
        `
        id, first_name, last_name,
        contacts_verification!left(
          id, phone_number, id_document_url, id_selfie_url,
          review_status, rejected_reason, residence_address, submitted_at
        )
        `
      );
    console.log(data);
    if (error) {
      console.error(error);
      setAthletes([]);
    } else {
      const rows = await Promise.all(
        (data || []).map(async (a) => {
          const cv = a.contacts_verification?.[0] || null;
          if (cv) {
            const { data: docSigned } = cv.id_document_url
              ? await supabase.storage
                  .from('documents')
                  .createSignedUrl(cv.id_document_url, 60)
              : { data: null };
            const { data: selfieSigned } = cv.id_selfie_url
              ? await supabase.storage
                  .from('documents')
                  .createSignedUrl(cv.id_selfie_url, 60)
              : { data: null };
            cv.id_document_signed_url = docSigned?.signedUrl || null;
            cv.id_selfie_signed_url = selfieSigned?.signedUrl || null;
          }
          delete a.contacts_verification;
          return { ...a, cv };
        })
      );
      setAthletes(rows);
    }
    setLoading(false);
  };

  const handleApprove = async (id) => {
    const { error } = await supabase
      .from('contacts_verification')
      .update({ review_status: 'approved', reviewed_at: new Date().toISOString(), rejected_reason: null })
      .eq('athlete_id', id);
    if (error) return alert(error.message);
    setAthletes((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, cv: { ...(a.cv || {}), review_status: 'approved', reviewed_at: new Date().toISOString(), rejected_reason: null } }
          : a
      )
    );
    alert('Approved');
  };

  const handleReject = async (id) => {
    const reason = prompt('Reason for rejection?');
    if (!reason) return;
    const { error } = await supabase
      .from('contacts_verification')
      .update({ review_status: 'rejected', rejected_reason: reason, reviewed_at: new Date().toISOString() })
      .eq('athlete_id', id);
    if (error) return alert(error.message);
    setAthletes((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, cv: { ...(a.cv || {}), review_status: 'rejected', rejected_reason: reason, reviewed_at: new Date().toISOString() } }
          : a
      )
    );
    alert('Rejected');
  };
  const renderDetails = (a) => {
    const cv = a.cv;
    return (
      <div style={{ marginTop: 10 }}>
        {cv ? (
          <>
            <div>Phone: {cv.phone_number || 'N/A'}</div>
            <div>Address: {cv.residence_address || 'N/A'}</div>
            {cv.id_document_signed_url && (
              <div>
                <a href={cv.id_document_signed_url} target="_blank" rel="noreferrer">
                  ID document
                </a>
              </div>
            )}
            {cv.id_selfie_signed_url && (
              <div>
                <a href={cv.id_selfie_signed_url} target="_blank" rel="noreferrer">
                  ID selfie
                </a>
              </div>
            )}
            {cv.rejected_reason && (
              <div style={{ color: 'red' }}>Reason: {cv.rejected_reason}</div>
            )}
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={() => handleApprove(a.id)}>Approve</button>
              <button onClick={() => handleReject(a.id)}>Reject</button>
            </div>
          </>
        ) : (
          <div>User has not submitted verification data yet</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Operator Review</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {athletes.map((a) => {
            const status = a.cv?.review_status || 'not submitted';
            return (
              <li
                key={a.id}
                style={{
                  marginBottom: 10,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  padding: 10,
                  background: status === 'submitted' ? '#fff7e6' : '#fff',
                }}
              >
                <div
                  onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>
                    {a.first_name} {a.last_name}
                  </span>
                  <span>{status}</span>
                </div>
                {expanded === a.id && renderDetails(a)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

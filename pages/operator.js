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
      .select('id, first_name, last_name, contacts_verification(*)');
    if (error) {
      console.error(error);
      setAthletes([]);
    } else {
      setAthletes(data || []);
    }
    setLoading(false);
  };

  const handleApprove = async (id) => {
    await supabase
      .from('contacts_verification')
      .update({ review_status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('athlete_id', id);
    fetchAthletes();
  };

  const handleReject = async (id) => {
    const reason = prompt('Reason for rejection?');
    if (!reason) return;
    await supabase
      .from('contacts_verification')
      .update({ review_status: 'rejected', rejected_reason: reason, reviewed_at: new Date().toISOString() })
      .eq('athlete_id', id);
    fetchAthletes();
  };

  const renderDetails = (cv, id) => {
    return (
      <div style={{ marginTop: 10 }}>
        {cv ? (
          <>
            <div>Phone: {cv.phone || 'N/A'}</div>
            <div>Document: {cv.document_number || 'N/A'}</div>
            <div>Address: {cv.residence_address || 'N/A'}</div>
            {cv.signed_document_url && (
              <div>
                <a href={cv.signed_document_url} target="_blank" rel="noreferrer">Signed document</a>
              </div>
            )}
            {cv.rejected_reason && (
              <div style={{ color: 'red' }}>Reason: {cv.rejected_reason}</div>
            )}
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={() => handleApprove(id)}>Approve</button>
              <button onClick={() => handleReject(id)}>Reject</button>
            </div>
          </>
        ) : (
          <div>No submission</div>
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
            const status = a.contacts_verification?.review_status || 'not submitted';
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
                {expanded === a.id && renderDetails(a.contacts_verification, a.id)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

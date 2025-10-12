import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperatorGuard } from '../hooks/useOperatorGuard';
import { supabase } from '../utils/supabaseClient';

export default function OperatorInReview() {
  const router = useRouter();
  const { loading, user } = useOperatorGuard({ redirectTo: '/login-operator', includeReason: false });
  const [statusState, setStatusState] = useState({
    loading: true,
    reviewState: null,
    reason: '',
    accountId: null,
    wizardStatus: null,
    error: '',
  });
  const [actionState, setActionState] = useState({ restarting: false, error: '' });

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login-operator');
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (loading || !user) return;

    let isActive = true;

    const fetchStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('op_account')
          .select(`
            id,
            wizard_status,
            op_verification_request:op_verification_request(id, state, reason, submitted_at)
          `)
          .eq('auth_user_id', user.id)
          .order('created_at', { ascending: false, foreignTable: 'op_verification_request' })
          .limit(1, { foreignTable: 'op_verification_request' })
          .maybeSingle();

        if (!isActive) return;

        if (error) throw error;

        const request = Array.isArray(data?.op_verification_request)
          ? data?.op_verification_request?.[0]
          : data?.op_verification_request || null;

        setStatusState({
          loading: false,
          reviewState: request?.state || null,
          reason: request?.reason || '',
          accountId: data?.id || null,
          wizardStatus: data?.wizard_status || null,
          error: '',
        });
      } catch (err) {
        if (!isActive) return;
        setStatusState({
          loading: false,
          reviewState: null,
          reason: '',
          accountId: null,
          wizardStatus: null,
          error: err?.message || 'Unable to load your review status. Please try again later.',
        });
      }
    };

    fetchStatus();

    return () => {
      isActive = false;
    };
  }, [loading, user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login-operator');
  };

  const handleRestartWizard = useCallback(async () => {
    if (!user) return;

    setActionState({ restarting: true, error: '' });

    try {
      if (statusState.accountId) {
        const { error } = await supabase
          .from('op_account')
          .update({ wizard_status: 'IN_PROGRESS' })
          .eq('id', statusState.accountId);
        if (error) throw error;
      }

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(`operator_wizard_step:${user.id}`);
      }

      await router.replace('/operator-wizard');
    } catch (err) {
      setActionState({
        restarting: false,
        error: err?.message || 'Unable to restart the accreditation wizard. Please try again.',
      });
      return;
    }

    setActionState({ restarting: false, error: '' });
  }, [router, statusState.accountId, user]);

  const normalizedState = useMemo(() => {
    if (!statusState.reviewState) return null;
    return String(statusState.reviewState).trim().toUpperCase();
  }, [statusState.reviewState]);

  const isRejected = normalizedState === 'REJECTED';

  if (loading) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <div style={styles.loaderContainer} role="status" aria-live="polite">
              <div style={styles.spinner} aria-hidden="true" />
              <span style={styles.srOnly}>Checking status…</span>
            </div>
            <style jsx>{`
              @keyframes profilePreviewSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (statusState.loading) {
    return (
      <div style={styles.background}>
        <div style={styles.overlay}>
          <div style={styles.container}>
            <div style={styles.card}>
              <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
              <div style={styles.loaderContainer} role="status" aria-live="polite">
                <div style={styles.spinner} aria-hidden="true" />
                <span style={styles.srOnly}>Checking review status…</span>
              </div>
              <style jsx>{`
                @keyframes profilePreviewSpin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.background}>
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.card}>
            <img src="/logo-talentlix.png" alt="TalentLix Logo" style={styles.logo} />
            <h1 style={{ marginBottom: 8 }}>Operator profile review</h1>
            {statusState.error ? (
              <p style={{ ...styles.message, color: '#B00020' }}>{statusState.error}</p>
            ) : isRejected ? (
              <>
                <p style={styles.message}>
                  We could not approve your accreditation request. Please review the reason below and update your
                  information before submitting it again.
                </p>
                <div style={styles.rejectionBox}>
                  <div style={styles.rejectionTitle}>Rejection reason</div>
                  <p style={styles.rejectionText}>{statusState.reason || 'No additional details were provided.'}</p>
                </div>
              </>
            ) : (
              <p style={styles.message}>
                Thank you for submitting your operator details. Our compliance team is reviewing your documents. You will
                receive an email as soon as the review is complete.
              </p>
            )}

            {actionState.error && (
              <p style={{ ...styles.message, color: '#B00020' }}>{actionState.error}</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isRejected && (
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={handleRestartWizard}
                  disabled={actionState.restarting}
                >
                  {actionState.restarting ? 'Preparing wizard…' : 'Restart accreditation wizard'}
                </button>
              )}
              <button type="button" style={styles.button} onClick={() => router.replace('/')}>
                Go to home page
              </button>
              <button type="button" style={styles.secondaryButton} onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  background: {
    backgroundImage: "url('/BackG.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    width: '100%',
    minHeight: '100vh',
    position: 'relative',
  },
  overlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    width: '100%',
    minHeight: '100%',
    position: 'static',
    zIndex: 1,
  },
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
  },
  card: {
    width: '100%',
    maxWidth: '480px',
    background: 'rgba(248, 249, 250, 0.95)',
    padding: '2rem',
    borderRadius: '16px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
    textAlign: 'center',
    zIndex: 2,
  },
  logo: { width: '80px', marginBottom: '1rem' },
  button: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    border: 'none',
    padding: '0.8rem',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    fontWeight: 'bold',
  },
  primaryButton: {
    background: '#111',
    color: '#fff',
    border: 'none',
    padding: '0.8rem',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    fontWeight: 'bold',
  },
  secondaryButton: {
    background: '#fff',
    border: '1px solid #27E3DA',
    color: '#027373',
    padding: '0.8rem',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    fontWeight: 'bold',
  },
  loaderContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 16,
    padding: 48,
    textAlign: 'center',
    minHeight: 'calc(100vh - 32px)',
    width: '100%',
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '4px solid #27E3DA',
    borderTopColor: '#F7B84E',
    animation: 'profilePreviewSpin 1s linear infinite',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  message: {
    marginBottom: 20,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },
  rejectionBox: {
    background: '#FFF4F4',
    border: '1px solid #F2B8B5',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '1.5rem',
    textAlign: 'left',
  },
  rejectionTitle: {
    fontWeight: 700,
    marginBottom: '0.5rem',
    color: '#B00020',
  },
  rejectionText: {
    margin: 0,
    color: '#5A1A1A',
    lineHeight: 1.5,
  },
};

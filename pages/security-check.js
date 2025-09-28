import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const POLLING_INTERVAL_MS = 4000;

const STEP_BLUEPRINT = [
  {
    id: 'schema-discovery',
    label: 'Analisi schema',
    description: 'Raccolta metadati di tabelle, viste e policy per verificare la copertura dei test.',
  },
  {
    id: 'permissions',
    label: 'Verifica permessi R/W',
    description: 'Esegue operazioni CRUD sia da guest che da utente autenticato per validare le policy RLS.',
  },
  {
    id: 'stress-anon',
    label: 'Stress test non autenticato',
    description: 'Simula carico sul profilo anonimo cercando escalation di privilegi o leak di dati.',
  },
  {
    id: 'stress-auth',
    label: 'Stress test autenticato',
    description: 'Saturazione API con token valido per rilevare race condition e scritture improprie.',
  },
];

const OVERALL_LABEL = {
  idle: 'In attesa',
  starting: 'Avvio in corso…',
  running: 'Test in esecuzione…',
  completed: 'Suite completata',
  failed: 'Suite fallita',
};

function createInitialSteps() {
  return STEP_BLUEPRINT.map((step) => ({
    ...step,
    status: 'pending',
    message: step.description,
    updatedAt: null,
    progress: null,
  }));
}

function normalizeStatus(raw) {
  if (!raw) return undefined;
  const status = String(raw).toLowerCase();
  if (['done', 'success', 'succeeded', 'completed', 'ok', 'finish', 'finished'].includes(status)) return 'completed';
  if (['error', 'failed', 'ko', 'failure'].includes(status)) return 'failed';
  if (['running', 'processing', 'working', 'active', 'in-progress'].includes(status)) return 'running';
  if (['starting', 'queued', 'pending', 'waiting', 'ready'].includes(status)) return 'pending';
  return status;
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function clampProgress(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function extractFilename(disposition, fallback) {
  if (!disposition) return fallback;
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  if (!match) return fallback;
  const encoded = match[1] || match[2];
  try {
    return decodeURIComponent(encoded.replace(/"/g, ''));
  } catch (error) {
    return encoded;
  }
}

export default function SecurityCheck() {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [steps, setSteps] = useState(() => createInitialSteps());
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [reportSummary, setReportSummary] = useState('');
  const [reportUrl, setReportUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const pollTimeoutRef = useRef(null);
  const logRegistryRef = useRef(new Set());
  const downloadUrlRef = useRef(null);

  const resetSuiteState = useCallback(() => {
    setSteps(createInitialSteps());
    setLogs([]);
    setReportSummary('');
    setReportUrl('');
    setError(null);
    setJobId(null);
  }, []);

  useEffect(() => () => {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
  }, []);

  const registerLog = useCallback((entry) => {
    if (!entry) return;
    const normalizedStatus = normalizeStatus(entry.status);
    const timestamp = entry.timestamp || new Date().toISOString();
    const key = entry.id || `${entry.stepId || entry.step || 'log'}-${normalizedStatus || 'info'}-${timestamp}-${entry.message || ''}`;
    if (logRegistryRef.current.has(key)) return;
    logRegistryRef.current.add(key);
    setLogs((previous) => ([
      ...previous,
      {
        id: key,
        stepId: entry.stepId || entry.step || null,
        label: entry.label || entry.stepLabel || entry.step || 'Aggiornamento',
        status: normalizedStatus || 'info',
        message: entry.message || entry.detail || '',
        timestamp,
      },
    ]));
  }, []);

  const applyStepsUpdate = useCallback((incomingSteps = []) => {
    if (!incomingSteps || incomingSteps.length === 0) return;
    const incomingMap = new Map();
    incomingSteps.forEach((step) => {
      if (!step) return;
      const id = step.id || step.stepId || step.step || step.code || step.name;
      if (!id) return;
      incomingMap.set(id, step);
    });

    const updates = [];

    setSteps((previous) => {
      const next = previous.map((step) => {
        const update = incomingMap.get(step.id);
        if (!update) return step;
        const normalizedStatus = normalizeStatus(update.status || update.state) || step.status;
        const message = update.message || update.detail || update.description || step.message;
        const updatedAt = update.updatedAt || update.timestamp || update.completedAt || step.updatedAt;
        const progress = clampProgress(update.progress);
        return {
          ...step,
          status: normalizedStatus,
          message,
          updatedAt,
          progress: progress ?? step.progress,
        };
      });

      next.forEach((nextStep, index) => {
        const prevStep = previous[index];
        if (!prevStep) return;
        if (prevStep.status !== nextStep.status) {
          updates.push({
            stepId: nextStep.id,
            label: nextStep.label,
            status: nextStep.status,
            message: nextStep.message,
            timestamp: nextStep.updatedAt || new Date().toISOString(),
          });
        } else if (
          nextStep.status === 'running' &&
          nextStep.message &&
          nextStep.message !== prevStep.message
        ) {
          updates.push({
            stepId: nextStep.id,
            label: nextStep.label,
            status: nextStep.status,
            message: nextStep.message,
            timestamp: nextStep.updatedAt || new Date().toISOString(),
          });
        }
      });

      return next;
    });

    updates.forEach(registerLog);
  }, [registerLog]);

  const overallProgress = useMemo(() => {
    if (!steps.length) return 0;
    const total = steps.length;
    const completedCount = steps.filter((step) => step.status === 'completed').length;
    const runningStep = steps.find((step) => step.status === 'running');
    if (status === 'completed') return 100;
    const base = (completedCount / total) * 100;
    if (runningStep) return Math.min(99, Math.round(base + 100 / total * 0.5));
    return Math.round(base);
  }, [steps, status]);

  const startSuite = useCallback(async () => {
    if (status === 'running' || status === 'starting') return;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    logRegistryRef.current = new Set();
    resetSuiteState();
    setStatus('starting');

    try {
      const response = await fetch('/api/security-check/run', { method: 'POST' });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Impossibile avviare la suite di security check.');
      }
      const payload = await response.json().catch(() => ({}));
      const nextJobId = payload.jobId || payload.id || payload.runId || payload.executionId;
      if (!nextJobId) {
        throw new Error('Risposta backend non valida: jobId mancante.');
      }
      setJobId(nextJobId);
      setStatus('running');
      registerLog({
        id: `start-${nextJobId}`,
        stepId: null,
        label: 'Suite avviata',
        status: 'running',
        message: 'Runner inizializzato, in attesa dei primi risultati…',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err?.message || 'Errore sconosciuto durante l\'avvio della suite.';
      setError(message);
      setStatus('failed');
      registerLog({
        id: `start-error-${Date.now()}`,
        stepId: null,
        label: 'Errore avvio',
        status: 'failed',
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }, [registerLog, resetSuiteState, status]);

  useEffect(() => {
    if (!jobId) return undefined;
    if (!['running', 'starting'].includes(status)) return undefined;

    let aborted = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/security-check/status?jobId=${encodeURIComponent(jobId)}`);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Polling fallito: risposta non valida.');
        }
        const payload = await response.json().catch(() => ({}));
        if (aborted) return;

        if (Array.isArray(payload.steps)) applyStepsUpdate(payload.steps);
        if (Array.isArray(payload.events)) {
          payload.events.forEach((event) => {
            registerLog({
              id: event.id,
              stepId: event.stepId || event.step || null,
              label: event.label || event.title || event.scope,
              status: event.status || event.state,
              message: event.message || event.detail,
              timestamp: event.timestamp || event.createdAt,
            });
          });
        }

        if (payload.report) {
          if (typeof payload.report === 'string') {
            setReportSummary(payload.report);
          } else if (typeof payload.report === 'object' && payload.report !== null) {
            if (payload.report.summary) setReportSummary(payload.report.summary);
            if (payload.report.url || payload.report.downloadUrl) {
              setReportUrl(payload.report.url || payload.report.downloadUrl);
            }
          }
        }
        if (payload.reportUrl) {
          setReportUrl(payload.reportUrl);
        }
        if (payload.summary) {
          setReportSummary(payload.summary);
        }

        const payloadStatus = normalizeStatus(payload.status || payload.state);
        if (payloadStatus) {
          setStatus((current) => (current === payloadStatus ? current : payloadStatus));
        }
        if (payloadStatus === 'failed' && payload.error) {
          setError(typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error));
        }
        if (payloadStatus === 'completed' && payload.error) {
          registerLog({
            id: `completed-warning-${Date.now()}`,
            status: 'pending',
            message: typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error),
          });
        }
      } catch (err) {
        if (aborted) return;
        const message = err?.message || 'Errore di rete durante il polling.';
        setError(message);
        registerLog({
          id: `poll-error-${Date.now()}`,
          status: 'failed',
          message,
          timestamp: new Date().toISOString(),
        });
      } finally {
        if (aborted) return;
        const shouldContinue = ['running', 'starting'].includes(status);
        if (shouldContinue) {
          pollTimeoutRef.current = setTimeout(poll, POLLING_INTERVAL_MS);
        }
      }
    };

    poll();

    return () => {
      aborted = true;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [applyStepsUpdate, jobId, registerLog, status]);

  useEffect(() => {
    if (['completed', 'failed'].includes(status) && pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'running') return;
    if (steps.length === 0) return;
    const hasFailure = steps.some((step) => step.status === 'failed');
    if (hasFailure) {
      setStatus('failed');
      return;
    }
    const allCompleted = steps.every((step) => step.status === 'completed');
    if (allCompleted) {
      setStatus('completed');
    }
  }, [status, steps]);

  const handleDownloadReport = useCallback(async () => {
    if (isDownloading) return;
    if (reportUrl) {
      window.open(reportUrl, '_blank', 'noopener');
      return;
    }
    if (!jobId) return;

    try {
      setIsDownloading(true);
      const response = await fetch(`/api/security-check/report?jobId=${encodeURIComponent(jobId)}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Download del report non riuscito.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const suggested = extractFilename(response.headers.get('Content-Disposition'), `security-check-${jobId}.pdf`);
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
      downloadUrlRef.current = objectUrl;
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = suggested;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => {
        if (downloadUrlRef.current) {
          URL.revokeObjectURL(downloadUrlRef.current);
          downloadUrlRef.current = null;
        }
      }, 5000);
    } catch (err) {
      const message = err?.message || 'Errore imprevisto durante il download.';
      setError(message);
      registerLog({
        id: `download-error-${Date.now()}`,
        status: 'failed',
        message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, jobId, registerLog, reportUrl]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <header style={styles.header}>
          <div style={styles.backLinkWrapper}>
            <Link href="/supabase-test" style={styles.backLink}>
              ← Torna alla console di test Supabase
            </Link>
          </div>
          <h1 style={styles.title}>Security check runner</h1>
          <p style={styles.subtitle}>
            Avvia la suite completa di controlli: discovery dello schema, verifica dei permessi e stress test autenticato / non
            autenticato. I progressi vengono aggiornati automaticamente e al termine potrai scaricare il report riassuntivo in
            italiano generato dal backend.
          </p>
        </header>

        <section style={styles.section}>
          <div style={styles.controlRow}>
            <button
              type="button"
              onClick={startSuite}
              style={{
                ...styles.primaryButton,
                opacity: ['running', 'starting'].includes(status) ? 0.7 : 1,
                cursor: ['running', 'starting'].includes(status) ? 'not-allowed' : 'pointer',
              }}
              disabled={['running', 'starting'].includes(status)}
            >
              {status === 'running' || status === 'starting' ? 'Suite in esecuzione…' : 'Avvia l\'intera suite'}
            </button>
            {jobId && (
              <span style={styles.jobTag}>Job ID: {jobId}</span>
            )}
          </div>

          <div style={styles.statusBox}>
            <span style={styles.statusLabel}>Stato:</span>
            <span style={styles.statusValue}>
              {OVERALL_LABEL[status] || status}
            </span>
          </div>

          <div style={styles.progressBar}>
            <div style={{ ...styles.progressValue, width: `${overallProgress}%` }} />
          </div>

          {error && (
            <div style={styles.errorBox}>
              <strong>Errore:</strong> {error}
            </div>
          )}
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Step della suite</h2>
          <div style={styles.stepList}>
            {steps.map((step) => (
              <div key={step.id} style={styles.stepCard}>
                <div style={styles.stepHeader}>
                  <span style={styles.stepLabel}>{step.label}</span>
                  <span style={{
                    ...styles.badge,
                    ...(step.status === 'completed'
                      ? styles.badgeSuccess
                      : step.status === 'running'
                        ? styles.badgeRunning
                        : step.status === 'failed'
                          ? styles.badgeError
                          : styles.badgePending),
                  }}>
                    {step.status === 'completed' && 'completato'}
                    {step.status === 'running' && 'in corso'}
                    {step.status === 'failed' && 'errore'}
                    {step.status === 'pending' && 'in coda'}
                    {!['completed', 'running', 'failed', 'pending'].includes(step.status) && step.status}
                  </span>
                </div>
                <p style={styles.stepDescription}>{step.message || step.description}</p>
                {typeof step.progress === 'number' && (
                  <div style={styles.stepProgressWrapper}>
                    <div style={styles.stepProgressBar}>
                      <div style={{ ...styles.stepProgressValue, width: `${step.progress}%` }} />
                    </div>
                    <span style={styles.stepProgressText}>{step.progress}%</span>
                  </div>
                )}
                {step.updatedAt && (
                  <p style={styles.stepTimestamp}>Aggiornato alle {formatTimestamp(step.updatedAt)}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Log in tempo reale</h2>
          {logs.length === 0 ? (
            <p style={styles.mutedText}>Nessun aggiornamento ancora disponibile.</p>
          ) : (
            <div style={styles.logList}>
              {logs.map((log) => (
                <div key={log.id} style={styles.logRow}>
                  <div style={styles.logMeta}>
                    <span style={styles.logTime}>{formatTimestamp(log.timestamp)}</span>
                    {log.label && <span style={styles.logLabel}>{log.label}</span>}
                  </div>
                  <div style={styles.logMessage}>
                    <span
                      style={{
                        ...styles.logBadge,
                        ...(log.status === 'completed'
                          ? styles.badgeSuccess
                          : log.status === 'running'
                            ? styles.badgeRunning
                            : log.status === 'failed'
                              ? styles.badgeError
                              : styles.badgePending),
                      }}
                    >
                      {log.status || 'info'}
                    </span>
                    <span>{log.message || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Report finale</h2>
          {status !== 'completed' ? (
            <p style={styles.mutedText}>Avvia una nuova esecuzione per generare il report aggiornato.</p>
          ) : (
            <>
              {reportSummary ? (
                <pre style={styles.reportPreview}>{reportSummary}</pre>
              ) : (
                <p style={styles.mutedText}>Il backend ha completato i test. Usa i pulsanti sotto per scaricare il report dettagliato.</p>
              )}
              <div style={styles.reportActions}>
                <button
                  type="button"
                  onClick={handleDownloadReport}
                  style={{
                    ...styles.primaryButton,
                    minWidth: 200,
                    opacity: isDownloading ? 0.7 : 1,
                    cursor: isDownloading ? 'wait' : 'pointer',
                  }}
                  disabled={isDownloading || (!reportUrl && !jobId)}
                >
                  {isDownloading ? 'Download in corso…' : 'Scarica report'}
                </button>
                {reportUrl && (
                  <a
                    href={reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.secondaryLink}
                  >
                    Apri in una nuova scheda
                  </a>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    padding: '3rem 1.5rem',
    background: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 960,
    background: '#ffffff',
    borderRadius: 24,
    boxShadow: '0 25px 45px rgba(15, 23, 42, 0.25)',
    padding: '2.5rem',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#0f172a',
  },
  header: {
    marginBottom: '2rem',
  },
  backLinkWrapper: {
    marginBottom: '0.75rem',
  },
  backLink: {
    color: '#2563eb',
    fontWeight: 600,
    textDecoration: 'none',
  },
  title: {
    fontSize: '2.25rem',
    margin: 0,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    marginTop: '0.75rem',
    marginBottom: 0,
    color: '#334155',
    fontSize: '1.05rem',
    lineHeight: 1.6,
  },
  section: {
    marginBottom: '2.5rem',
  },
  controlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #22d3ee, #6366f1)',
    color: '#0f172a',
    border: 'none',
    borderRadius: 14,
    padding: '0.85rem 1.6rem',
    fontSize: '1rem',
    fontWeight: 700,
    boxShadow: '0 12px 25px rgba(99, 102, 241, 0.35)',
    transition: 'transform 120ms ease, box-shadow 120ms ease',
  },
  jobTag: {
    background: '#e2e8f0',
    padding: '0.45rem 0.8rem',
    borderRadius: 999,
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#1e293b',
  },
  statusBox: {
    marginTop: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '1.05rem',
  },
  statusLabel: {
    fontWeight: 700,
    color: '#475569',
  },
  statusValue: {
    fontWeight: 700,
    color: '#0f172a',
  },
  progressBar: {
    height: 10,
    background: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: '1rem',
    marginBottom: '1rem',
  },
  progressValue: {
    height: '100%',
    background: 'linear-gradient(135deg, #22d3ee, #38bdf8)',
    transition: 'width 200ms ease',
  },
  errorBox: {
    background: '#fee2e2',
    color: '#b91c1c',
    padding: '1rem',
    borderRadius: 12,
    fontSize: '0.95rem',
  },
  sectionTitle: {
    margin: '0 0 1.25rem',
    fontSize: '1.45rem',
    fontWeight: 700,
  },
  stepList: {
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  },
  stepCard: {
    border: '1px solid #e2e8f0',
    borderRadius: 18,
    padding: '1.25rem',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  stepLabel: {
    fontWeight: 700,
    color: '#1e293b',
  },
  badge: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    fontWeight: 700,
    padding: '0.35rem 0.65rem',
    borderRadius: 999,
    letterSpacing: '0.08em',
  },
  badgeSuccess: {
    background: 'rgba(34,197,94,0.1)',
    color: '#15803d',
  },
  badgeRunning: {
    background: 'rgba(59,130,246,0.12)',
    color: '#1d4ed8',
  },
  badgeError: {
    background: 'rgba(248,113,113,0.12)',
    color: '#b91c1c',
  },
  badgePending: {
    background: 'rgba(148,163,184,0.15)',
    color: '#475569',
  },
  stepDescription: {
    margin: 0,
    color: '#475569',
    fontSize: '0.95rem',
    lineHeight: 1.5,
  },
  stepProgressWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  stepProgressBar: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    background: '#cbd5f5',
    overflow: 'hidden',
  },
  stepProgressValue: {
    height: '100%',
    background: '#6366f1',
  },
  stepProgressText: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#4338ca',
  },
  stepTimestamp: {
    margin: 0,
    color: '#64748b',
    fontSize: '0.8rem',
  },
  mutedText: {
    color: '#64748b',
    fontSize: '0.95rem',
  },
  logList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    maxHeight: 260,
    overflowY: 'auto',
    paddingRight: '0.5rem',
  },
  logRow: {
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: '0.75rem 1rem',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  logMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    fontSize: '0.8rem',
    color: '#64748b',
  },
  logTime: {
    fontWeight: 700,
  },
  logLabel: {
    fontWeight: 600,
  },
  logMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.95rem',
    color: '#1e293b',
  },
  logBadge: {
    fontSize: '0.7rem',
    padding: '0.25rem 0.55rem',
    borderRadius: 999,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  reportPreview: {
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '1.5rem',
    borderRadius: 16,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    maxHeight: 260,
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
  },
  reportActions: {
    marginTop: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    flexWrap: 'wrap',
  },
  secondaryLink: {
    color: '#2563eb',
    fontWeight: 600,
    textDecoration: 'none',
  },
};

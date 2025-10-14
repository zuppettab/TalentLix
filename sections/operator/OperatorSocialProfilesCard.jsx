import { useEffect, useRef, useState } from 'react';
import { FiLink } from 'react-icons/fi';
import { Trash2 } from 'lucide-react';
import { supabase as sb } from '../../utils/supabaseClient';

const supabase = sb;

const TABLE = 'op_social_profiles';

const PLATFORM_SUGGESTIONS = [
  'Instagram',
  'X',
  'Facebook',
  'TikTok',
  'YouTube',
  'LinkedIn',
  'Twitch',
  'Threads',
  'Website',
  'Other',
];

const ICON_BUTTON_BASE = {
  background: 'transparent',
  border: 'none',
  padding: 4,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  borderRadius: 8,
  minWidth: 32,
  minHeight: 32,
};

const socialStyles = {
  grid: { display: 'grid', gridTemplateColumns: '1fr', gap: 24 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  grid2Mobile: { gridTemplateColumns: '1fr' },

  sectionTitle: { fontSize: 16, fontWeight: 700, margin: '6px 0 2px' },
  subnote: { fontSize: 12, color: '#666', marginBottom: 6 },

  field: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  fieldRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  label: { fontSize: 13, fontWeight: 600 },
  input: {
    width: '100%',
    height: 42,
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF',
    boxSizing: 'border-box',
  },
  checkboxRow: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  th: { textAlign: 'left', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE', whiteSpace: 'nowrap' },
  thChk: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 700,
    padding: '10px 6px',
    borderBottom: '1px solid #EEE',
    width: 60,
    whiteSpace: 'nowrap',
  },
  thRight: { textAlign: 'right', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE' },
  td: { fontSize: 14, padding: '10px 12px', borderBottom: '1px solid #F5F5F5', verticalAlign: 'top' },
  tdChk: {
    fontSize: 14,
    padding: '10px 6px',
    borderBottom: '1px solid #F5F5F5',
    textAlign: 'center',
    width: 60,
  },
  tableWrap: { overflowX: 'auto', border: '1px solid #EEE', borderRadius: 10, background: '#FFF' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: '8px 0' },
  tableActionsCell: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  urlIcon: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1976d2' },

  card: { border: '1px solid #EEE', borderRadius: 12, marginBottom: 8, background: '#FFF', width: '100%' },
  summary: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    minHeight: 56,
  },
  titleText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginLeft: 8,
  },
  chevron: { width: 16, height: 16, transition: 'transform 0.2s', flexShrink: 0 },
  details: { padding: 12, borderTop: '1px solid #EEE', display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  actions: { display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },

  smallBtn: {
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #E0E0E0',
    background: '#FFF',
    cursor: 'pointer',
    fontWeight: 600,
  },
  smallBtnPrimary: {
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  smallBtnDisabled: {
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    background: '#EEE',
    color: '#999',
    border: '1px solid #E0E0E0',
    cursor: 'not-allowed',
    fontWeight: 600,
  },
  linkBtn: {
    ...ICON_BUTTON_BASE,
    color: '#1976d2',
    gap: 4,
  },
  iconBtnDanger: {
    ...ICON_BUTTON_BASE,
    color: '#b00',
    gap: 4,
  },
  error: { fontSize: 12, color: '#b00' },

  saveBar: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
  },
  saveBtn: { height: 38, padding: '0 16px', borderRadius: 8, fontWeight: 600, border: 'none' },
  saveBtnEnabled: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', cursor: 'pointer' },
  saveBtnDisabled: { background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed' },
  statusTextOK: {
    marginLeft: 10,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    color: '#2E7D32',
  },
  statusTextERR: {
    marginLeft: 10,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    color: '#b00',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
};

export default function OperatorSocialProfilesCard({ operatorId, onSaved, isMobile }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [dirty, setDirty] = useState(false);

  const [rows, setRows] = useState([]);
  const [snapshot, setSnapshot] = useState([]);
  const [rowErrors, setRowErrors] = useState({});

  const [add, setAdd] = useState({ platform: '', handle: '', profile_url: '', is_public: true, is_primary: false, err: '' });
  const platformInputRef = useRef(null);
  const handleInputRef = useRef(null);
  const profileUrlInputRef = useRef(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!operatorId) {
        setRows([]);
        setSnapshot([]);
        setDirty(false);
        setLoading(false);
        return;
      }

      if (!supabase) {
        setStatus({ type: 'error', msg: 'Service unavailable' });
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select('*')
          .eq('op_id', operatorId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (error) throw error;

        if (!active) return;
        setRows(data || []);
        setSnapshot(data || []);
        setDirty(false);
        setRowErrors({});
      } catch (err) {
        console.error(err);
        if (active) {
          setStatus({ type: 'error', msg: 'Load failed' });
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [operatorId]);

  const onField = (id, key, val) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
    if (rowErrors[id]) setRowErrors((prev) => ({ ...prev, [id]: '' }));
  };

  const onTogglePublic = (id) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_public: !r.is_public } : r)));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  const onTogglePrimary = (id) => {
    setRows((prev) => prev.map((r) => ({ ...r, is_primary: r.id === id ? !r.is_primary : false })));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  const addRow = () => {
    const platform = String(add.platform || '').trim();
    const handle = String(add.handle || '').trim();
    const profileUrl = String(add.profile_url || '').trim();

    if (!platform || !profileUrl) {
      setAdd((prev) => ({
        ...prev,
        platform,
        handle,
        profile_url: profileUrl,
        err: 'Fill Platform and URL before adding.',
      }));

      const targetRef = !platform ? platformInputRef : !profileUrl ? profileUrlInputRef : handleInputRef;
      if (targetRef?.current) {
        targetRef.current.focus();
      }
      return;
    }

    const tempId = `tmp-${Date.now()}`;
    const nextOrder = rows.length ? Math.max(...rows.map((r) => Number(r.sort_order || 0))) + 1 : 0;
    const newRow = {
      id: tempId,
      op_id: operatorId,
      platform,
      handle,
      profile_url: profileUrl,
      is_public: !!add.is_public,
      is_primary: !!add.is_primary,
      sort_order: nextOrder,
    };

    setRows((prev) => [...prev, newRow]);
    setAdd({ platform: '', handle: '', profile_url: '', is_public: true, is_primary: false, err: '' });
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  const deleteRow = async (id) => {
    const ok = typeof window === 'undefined' ? true : window.confirm('Delete this social profile?');
    if (!ok) return;

    try {
      if (String(id).startsWith('tmp-')) {
        setRows((prev) => prev.filter((r) => r.id !== id).map((r, idx) => ({ ...r, sort_order: idx })));
        setDirty(true);
        setStatus({ type: 'success', msg: 'Saved ✓' });
        return;
      }

      if (!supabase) throw new Error('Service unavailable');

      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== id).map((r, idx) => ({ ...r, sort_order: idx })));
      setDirty(true);
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', msg: 'Delete failed' });
    }
  };

  const validateRow = (row) => {
    const platform = String(row.platform || '').trim();
    const url = String(row.profile_url || '').trim();
    if (!platform || !url) return 'Platform and URL are required by DB.';
    return '';
  };

  const hasDirty = dirty;
  const isSaveDisabled = saving || !hasDirty || !supabase || !operatorId;

  const onSave = async () => {
    if (isSaveDisabled) return;

    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      const primaries = rows.filter((r) => !!r.is_primary);
      if (primaries.length > 1) {
        const firstId = primaries[0].id;
        setRows((prev) => prev.map((r) => ({ ...r, is_primary: r.id === firstId })));
      }

      const ordered = rows.map((r, idx) => ({ ...r, sort_order: idx }));

      const errs = {};
      for (const row of ordered) {
        const err = validateRow(row);
        if (err) errs[row.id] = err;
      }
      if (Object.keys(errs).length) {
        setRowErrors(errs);
        setSaving(false);
        setStatus({ type: 'error', msg: 'Fill platform and URL.' });
        return;
      }

      const toInsert = ordered.filter((r) => String(r.id).startsWith('tmp-') || r.id == null);
      const toUpdate = ordered.filter((r) => !(String(r.id).startsWith('tmp-')) && r.id != null);

      for (const row of toInsert) {
        const payload = {
          op_id: operatorId,
          platform: String(row.platform || '').trim(),
          handle: String(row.handle || '').trim() || null,
          profile_url: String(row.profile_url || '').trim(),
          is_public: !!row.is_public,
          is_primary: !!row.is_primary,
          sort_order: Number(row.sort_order || 0),
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from(TABLE).insert([payload]).select().single();
        if (error) throw error;
        setRows((prev) => prev.map((r) => (r.id === row.id ? data : r)));
      }

      for (const row of toUpdate) {
        const snap = snapshot.find((s) => s.id === row.id);
        const changed = !snap ||
          JSON.stringify({
            platform: snap.platform,
            handle: snap.handle || '',
            profile_url: snap.profile_url,
            is_public: !!snap.is_public,
            is_primary: !!snap.is_primary,
            sort_order: Number(snap.sort_order || 0),
          }) !== JSON.stringify({
            platform: row.platform,
            handle: row.handle || '',
            profile_url: row.profile_url,
            is_public: !!row.is_public,
            is_primary: !!row.is_primary,
            sort_order: Number(row.sort_order || 0),
          });
        if (!changed) continue;

        const payload = {
          platform: String(row.platform || '').trim(),
          handle: String(row.handle || '').trim() || null,
          profile_url: String(row.profile_url || '').trim(),
          is_public: !!row.is_public,
          is_primary: !!row.is_primary,
          sort_order: Number(row.sort_order || 0),
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from(TABLE).update(payload).eq('id', row.id);
        if (error) throw error;
      }

      const { data: fresh, error: refreshError } = await supabase
        .from(TABLE)
        .select('*')
        .eq('op_id', operatorId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (refreshError) throw refreshError;

      setRows(fresh || []);
      setSnapshot(fresh || []);
      setRowErrors({});
      setDirty(false);
      setStatus({ type: 'success', msg: 'Saved ✓' });

      if (onSaved) {
        await onSaved();
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', msg: 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  if (!operatorId) {
    return (
      <div style={socialStyles.grid}>
        <div>
          <div style={socialStyles.sectionTitle}>Social profiles</div>
          <div style={socialStyles.subnote}>Link your organisation’s social channels to increase visibility.</div>
        </div>
        <div style={{ fontSize: 13, color: '#666' }}>
          Complete the onboarding process to enable social profiles management.
        </div>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 8, color: '#666' }}>Loading…</div>;
  }

  const saveBtnStyle = isSaveDisabled
    ? { ...socialStyles.saveBtn, ...socialStyles.saveBtnDisabled }
    : { ...socialStyles.saveBtn, ...socialStyles.saveBtnEnabled };
  const saveBarStyle = isMobile
    ? { ...socialStyles.saveBar, flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 8 }
    : socialStyles.saveBar;
  const statusBaseStyle = status.type === 'error' ? socialStyles.statusTextERR : socialStyles.statusTextOK;
  const statusStyle = isMobile
    ? { ...statusBaseStyle, display: 'flex', flexBasis: '100%', justifyContent: 'flex-end', marginLeft: 0 }
    : statusBaseStyle;

  return (
    <div style={socialStyles.grid}>
      <div>
        <div style={socialStyles.sectionTitle}>Social profiles</div>
        <div style={socialStyles.subnote}>
          Add your organisation’s social profiles. You can mark one as “Primary”.
        </div>
      </div>

      <div style={{ ...socialStyles.grid, gap: 16 }}>
        <div className="row" style={socialStyles.field}>
          <label style={socialStyles.label}>Platform</label>
          <input
            list="operator-platform-suggestions"
            value={add.platform}
            onChange={(e) => setAdd((s) => ({ ...s, platform: e.target.value, err: '' }))}
            placeholder="e.g. Instagram / X / TikTok…"
            style={socialStyles.input}
            ref={platformInputRef}
          />
          <datalist id="operator-platform-suggestions">
            {PLATFORM_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="row" style={socialStyles.field}>
          <label style={socialStyles.label}>Handle (optional)</label>
          <input
            value={add.handle}
            onChange={(e) => setAdd((s) => ({ ...s, handle: e.target.value, err: '' }))}
            placeholder="@username"
            style={socialStyles.input}
            ref={handleInputRef}
          />
        </div>
        <div className="row" style={socialStyles.field}>
          <label style={socialStyles.label}>Profile URL</label>
          <input
            value={add.profile_url}
            onChange={(e) => setAdd((s) => ({ ...s, profile_url: e.target.value, err: '' }))}
            placeholder="https://…"
            style={socialStyles.input}
            ref={profileUrlInputRef}
          />
        </div>
        {isMobile ? (
          <>
            <div style={socialStyles.field}>
              <label htmlFor="op-add-public" style={socialStyles.label}>
                Public
              </label>
              <input
                id="op-add-public"
                type="checkbox"
                checked={!!add.is_public}
                onChange={() => setAdd((s) => ({ ...s, is_public: !s.is_public }))}
                aria-label="Public"
              />
            </div>
            <div style={socialStyles.field}>
              <label htmlFor="op-add-primary" style={socialStyles.label}>
                Primary
              </label>
              <input
                id="op-add-primary"
                type="checkbox"
                checked={!!add.is_primary}
                onChange={() => setAdd((s) => ({ ...s, is_primary: !s.is_primary }))}
                aria-label="Primary"
              />
            </div>
            <button type="button" onClick={addRow} style={{ ...socialStyles.smallBtnPrimary, width: '100%' }}>
              + Add
            </button>
            {add.err && <div style={socialStyles.error}>{add.err}</div>}
          </>
        ) : (
          <div className="row" style={{ ...socialStyles.fieldRow, gap: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={socialStyles.checkboxRow}>
                <input
                  id="op-add-public"
                  type="checkbox"
                  checked={!!add.is_public}
                  onChange={() => setAdd((s) => ({ ...s, is_public: !s.is_public }))}
                  aria-label="Public"
                />
                <label htmlFor="op-add-public" style={{ marginLeft: 4 }}>
                  Public
                </label>
              </div>
              <div style={socialStyles.checkboxRow}>
                <input
                  id="op-add-primary"
                  type="checkbox"
                  checked={!!add.is_primary}
                  onChange={() => setAdd((s) => ({ ...s, is_primary: !s.is_primary }))}
                  aria-label="Primary"
                />
                <label htmlFor="op-add-primary" style={{ marginLeft: 4 }}>
                  Primary
                </label>
              </div>
            </div>
            <button type="button" onClick={addRow} style={{ ...socialStyles.smallBtnPrimary, flexBasis: '100%' }}>
              + Add
            </button>
            {add.err && <div style={{ ...socialStyles.error, flexBasis: '100%' }}>{add.err}</div>}
          </div>
        )}
      </div>

      {!isMobile ? (
        <div style={socialStyles.tableWrap}>
          <table style={socialStyles.table}>
            <thead>
              <tr>
                <th style={socialStyles.th}>Platform</th>
                <th style={socialStyles.th}>Handle</th>
                <th style={socialStyles.th}>Profile URL</th>
                <th style={socialStyles.thChk}>Public</th>
                <th style={socialStyles.thChk}>Primary</th>
                <th style={socialStyles.thRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...socialStyles.td, textAlign: 'center', color: '#666' }}>
                    No social profiles yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const rowError = rowErrors[row.id];
                  return (
                    <tr key={row.id}>
                      <td style={socialStyles.td}>
                        <input
                          value={row.platform || ''}
                          onChange={(e) => onField(row.id, 'platform', e.target.value)}
                          placeholder="Instagram / X / …"
                          style={socialStyles.input}
                        />
                        {rowError && !String(row.platform || '').trim() && (
                          <div style={socialStyles.error}>Platform is required.</div>
                        )}
                      </td>
                      <td style={socialStyles.td}>
                        <input
                          value={row.handle || ''}
                          onChange={(e) => onField(row.id, 'handle', e.target.value)}
                          placeholder="@username"
                          style={socialStyles.input}
                        />
                      </td>
                      <td style={socialStyles.td}>
                        <input
                          value={row.profile_url || ''}
                          onChange={(e) => onField(row.id, 'profile_url', e.target.value)}
                          placeholder="https://…"
                          style={socialStyles.input}
                        />
                        {rowError && !String(row.profile_url || '').trim() && (
                          <div style={socialStyles.error}>URL is required.</div>
                        )}
                      </td>
                      <td style={socialStyles.tdChk}>
                        <input
                          type="checkbox"
                          checked={!!row.is_public}
                          onChange={() => onTogglePublic(row.id)}
                          aria-label="Public"
                        />
                      </td>
                      <td style={socialStyles.tdChk}>
                        <input
                          type="checkbox"
                          checked={!!row.is_primary}
                          onChange={() => onTogglePrimary(row.id)}
                          aria-label="Primary"
                        />
                      </td>
                      <td style={{ ...socialStyles.td, ...socialStyles.tableActionsCell }}>
                        <a
                          href={row.profile_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={row.profile_url}
                          style={socialStyles.linkBtn}
                          aria-label="Open social profile"
                        >
                          <FiLink size={16} />
                        </a>
                        <button
                          type="button"
                          style={socialStyles.iconBtnDanger}
                          onClick={() => deleteRow(row.id)}
                          aria-label="Delete social profile"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.length === 0 ? (
            <div style={{ fontSize: 13, color: '#666', padding: '8px 0' }}>No social profiles yet.</div>
          ) : (
            rows.map((row) => (
              <OperatorSocialAccordionItem
                key={row.id}
                row={row}
                onField={onField}
                onTogglePublic={onTogglePublic}
                onTogglePrimary={onTogglePrimary}
                onDelete={() => deleteRow(row.id)}
                rowError={rowErrors[row.id]}
              />
            ))
          )}
        </div>
      )}

      <div style={saveBarStyle}>
        <button
          type="button"
          disabled={isSaveDisabled}
          onClick={onSave}
          style={saveBtnStyle}
          aria-disabled={isSaveDisabled}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status.msg && (
          <span
            role="status"
            aria-live="polite"
            style={statusStyle}
          >
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}

function OperatorSocialAccordionItem({ row, onField, onTogglePublic, onTogglePrimary, onDelete, rowError }) {
  const [open, setOpen] = useState(false);
  const summaryId = `op-social-summary-${row.id}`;
  const regionId = `op-social-region-${row.id}`;

  const title = [row.platform || '—', row.handle ? `• ${row.handle}` : ''].filter(Boolean).join(' ');

  return (
    <div style={socialStyles.card}>
      <button
        type="button"
        style={socialStyles.summary}
        onClick={() => setOpen((prev) => !prev)}
        id={summaryId}
        aria-controls={regionId}
        aria-expanded={open}
      >
        <span style={socialStyles.titleText}>{title}</span>
        <span style={{ ...socialStyles.chevron, transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
      </button>

      {open && (
        <div id={regionId} role="region" aria-labelledby={summaryId} style={socialStyles.details}>
          <div style={socialStyles.field}>
            <label style={socialStyles.label}>Platform</label>
            <input
              value={row.platform || ''}
              onChange={(e) => onField(row.id, 'platform', e.target.value)}
              placeholder="Instagram / X / …"
              style={socialStyles.input}
            />
            {rowError && !String(row.platform || '').trim() && (
              <div style={socialStyles.error}>Platform is required.</div>
            )}
          </div>

          <div style={socialStyles.field}>
            <label style={socialStyles.label}>Handle (optional)</label>
            <input
              value={row.handle || ''}
              onChange={(e) => onField(row.id, 'handle', e.target.value)}
              placeholder="@username"
              style={socialStyles.input}
            />
          </div>

          <div style={socialStyles.field}>
            <label style={socialStyles.label}>Profile URL</label>
            <input
              value={row.profile_url || ''}
              onChange={(e) => onField(row.id, 'profile_url', e.target.value)}
              placeholder="https://…"
              style={socialStyles.input}
            />
            {rowError && !String(row.profile_url || '').trim() && (
              <div style={socialStyles.error}>URL is required.</div>
            )}
          </div>

          <div style={socialStyles.field}>
            <label htmlFor={`op-pub-m-${row.id}`} style={socialStyles.label}>
              Public
            </label>
            <input
              id={`op-pub-m-${row.id}`}
              type="checkbox"
              checked={!!row.is_public}
              onChange={() => onTogglePublic(row.id)}
              aria-label="Public"
            />
          </div>
          <div style={socialStyles.field}>
            <label htmlFor={`op-pri-m-${row.id}`} style={socialStyles.label}>
              Primary
            </label>
            <input
              id={`op-pri-m-${row.id}`}
              type="checkbox"
              checked={!!row.is_primary}
              onChange={() => onTogglePrimary(row.id)}
              aria-label="Primary"
            />
          </div>

          <div style={socialStyles.actions}>
            <a
              href={row.profile_url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              title={row.profile_url}
              style={{ ...socialStyles.smallBtn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <FiLink size={16} />
            </a>
            <button
              type="button"
              style={socialStyles.iconBtnDanger}
              onClick={onDelete}
              aria-label="Delete social profile"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

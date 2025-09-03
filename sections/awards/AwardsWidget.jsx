// sections/sports/AwardsWidget.jsx
// @ts-check
import { useEffect, useState } from 'react';
import { supabase as sb } from '../../utils/supabaseClient';

const supabase = sb;
const AWARDS_TABLE = 'awards_recognitions';

// Utilities (formati identici alla logica delle stagioni)
const formatSeason = (start, end) => {
  const s = start ? String(start) : '';
  const e = end ? String(end) : '';
  if (s && e) {
    const short = e.length === 4 ? e.slice(2) : e;
    return `${s}/${short}`;
  }
  return s || '-';
};
const formatDate = (d) => (d ? d : '—');

export default function AwardsWidget({ athleteId, isMobile }) {
  const [rows, setRows] = useState([]);
  const [cLoading, setCLoading] = useState(true);
  const [cStatus, setCStatus] = useState({ type: '', msg: '' });

  // Add row state
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState({
    season_start: '',
    season_end: '',
    title: '',
    awarding_entity: '',
    date_awarded: '',
    description: '',
  });
  const [addErrors, setAddErrors] = useState({});

  // Edit row state
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [openId, setOpenId] = useState(null);   // accordion open row (mobile)
  const [rowBusy, setRowBusy] = useState(null); // disable actions while saving/deleting

  // --- load
  const loadRows = async () => {
    if (!athleteId) return;
    try {
      setCLoading(true);
      const { data, error } = await supabase
        .from(AWARDS_TABLE)
        .select('*')
        .eq('athlete_id', athleteId)
        .order('season_start', { ascending: false })
        .order('date_awarded', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      console.error(e);
      setCStatus({ type: 'error', msg: 'Load failed' });
    } finally {
      setCLoading(false);
    }
  };

  useEffect(() => { loadRows(); }, [athleteId]);

  // --- validation (nessun campo obbligatorio; solo coerenza anni/date se inserite)
  const validYear = (y) => {
    if (y === '' || y == null) return true;
    const n = Number(y);
    return Number.isInteger(n) && n >= 1900 && n <= 2100;
  };
  const validate = (obj) => {
    const out = {};
    if (!validYear(obj.season_start)) out.season_start = 'Year must be between 1900 and 2100';
    if (obj.season_end !== '' && obj.season_end != null) {
      if (!validYear(obj.season_end)) out.season_end = 'Year must be between 1900 and 2100';
      else if (obj.season_start !== '' && Number(obj.season_end) < Number(obj.season_start))
        out.season_end = 'Season end must be >= start (or empty)';
    }
    // data in formato YYYY-MM-DD se compilata
    if (obj.date_awarded && !/^\d{4}-\d{2}-\d{2}$/.test(String(obj.date_awarded))) {
      out.date_awarded = 'Use YYYY-MM-DD';
    }
    return out;
  };

  // --- toggle accordion (mobile)
  const toggleAward = (id) => {
    setEditId(null);
    setOpenId((p) => (p === id ? null : id));
  };

  // --- ADD
  const onAddClick = () => {
    setAdding(true);
    setCStatus({ type: '', msg: '' });
    setAdd({
      season_start: '',
      season_end: '',
      title: '',
      awarding_entity: '',
      date_awarded: '',
      description: '',
    });
    setAddErrors({});
  };
  const onAddCancel = () => {
    setAdding(false);
    setAddErrors({});
    setCStatus({ type: '', msg: '' });
  };
  const onAddSave = async () => {
    const errs = validate(add);
    setAddErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      setCStatus({ type: '', msg: '' });

      const payload = {
        athlete_id: athleteId,
        // nessun campo obbligatorio: invio stringhe trim() o null dove ha senso
        title: (add.title || '').trim(),
        description: (add.description || '').trim() || null,
        awarding_entity: (add.awarding_entity || '').trim(),
        date_awarded: add.date_awarded || null,
        season_start: add.season_start === '' ? null : Number(add.season_start),
        season_end: add.season_end === '' ? null : Number(add.season_end),
      };

      const { error } = await supabase.from(AWARDS_TABLE).insert([payload]);
      if (error) throw error;

      setAdding(false);
      setCStatus({ type: 'success', msg: 'Saved ✓' });
      await loadRows();
    } catch (e) {
      console.error(e);
      setCStatus({ type: 'error', msg: 'Save failed' });
    }
  };

  // --- EDIT
  const onEdit = (row) => {
    setOpenId(row.id);
    setEditId(row.id);
    setEdit({
      season_start: row.season_start ?? '',
      season_end: row.season_end ?? '',
      title: row.title || '',
      awarding_entity: row.awarding_entity || '',
      date_awarded: row.date_awarded || '',
      description: row.description || '',
    });
    setEditErrors({});
    setCStatus({ type: '', msg: '' });
  };
  const onEditCancel = () => {
    setEditId(null);
    setEdit({});
    setEditErrors({});
  };
  const onEditSave = async (id) => {
    const errs = validate(edit);
    setEditErrors(errs);
    if (Object.keys(errs).length) {
      const el = document.getElementById(`award-region-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    try {
      setCStatus({ type: '', msg: '' });
      setRowBusy(id);

      const payload = {
        title: (edit.title || '').trim(),
        description: (edit.description || '').trim() || null,
        awarding_entity: (edit.awarding_entity || '').trim(),
        date_awarded: edit.date_awarded || null,
        season_start: edit.season_start === '' ? null : Number(edit.season_start),
        season_end: edit.season_end === '' ? null : Number(edit.season_end),
      };

      const { error } = await supabase
        .from(AWARDS_TABLE)
        .update(payload)
        .eq('id', id);
      if (error) throw error;

      setEditId(null);
      setCStatus({ type: 'success', msg: 'Saved ✓' });
      await loadRows();
    } catch (e) {
      console.error(e);
      setCStatus({ type: 'error', msg: 'Save failed' });
    } finally {
      setRowBusy(null);
    }
  };

  // --- DELETE
  const onDelete = async (id) => {
    const ok = window.confirm('Delete this award?');
    if (!ok) return;
    try {
      setRowBusy(id);
      const { error } = await supabase.from(AWARDS_TABLE).delete().eq('id', id);
      if (error) throw error;
      setCStatus({ type: 'success', msg: 'Deleted ✓' });
      await loadRows();
    } catch (e) {
      console.error(e);
      setCStatus({ type: 'error', msg: 'Delete failed' });
    } finally {
      setRowBusy(null);
    }
  };

  // ---------------- UI ----------------
  if (cLoading) return <div style={{ padding: 8, color: '#666' }}>Loading…</div>;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Awards &amp; Recognitions</h3>
        {!adding ? (
          <button type="button" onClick={onAddClick} style={styles.smallBtn}>+ Add award</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onAddSave} style={styles.smallBtnPrimary}>Save</button>
            <button type="button" onClick={onAddCancel} style={styles.smallBtn}>Cancel</button>
          </div>
        )}
      </div>

      {/* Add row form (inline) */}
      {adding && (
        <div style={styles.careerForm}>
          <div style={styles.field}>
            <label style={styles.sublabel}>Season start</label>
            <input
              type="number"
              value={add.season_start}
              onChange={(e) => setAdd((p) => ({ ...p, season_start: e.target.value }))}
              style={{ ...styles.careerInput, borderColor: addErrors.season_start ? '#b00' : '#E0E0E0' }}
            />
            {addErrors.season_start && <div style={styles.error}>{addErrors.season_start}</div>}
          </div>
          <div style={styles.field}>
            <label style={styles.sublabel}>Season end</label>
            <input
              type="number"
              value={add.season_end}
              onChange={(e) => setAdd((p) => ({ ...p, season_end: e.target.value }))}
              style={{ ...styles.careerInput, borderColor: addErrors.season_end ? '#b00' : '#E0E0E0' }}
            />
            {addErrors.season_end && <div style={styles.error}>{addErrors.season_end}</div>}
          </div>
          <div style={styles.field}>
            <label style={styles.sublabel}>Title</label>
            <input
              value={add.title}
              onChange={(e) => setAdd((p) => ({ ...p, title: e.target.value }))}
              style={styles.careerInput}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.sublabel}>Awarding entity</label>
            <input
              value={add.awarding_entity}
              onChange={(e) => setAdd((p) => ({ ...p, awarding_entity: e.target.value }))}
              style={styles.careerInput}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.sublabel}>Date awarded</label>
            <input
              type="date"
              value={add.date_awarded}
              onChange={(e) => setAdd((p) => ({ ...p, date_awarded: e.target.value }))}
              style={{ ...styles.careerInput, borderColor: addErrors.date_awarded ? '#b00' : '#E0E0E0' }}
            />
            {addErrors.date_awarded && <div style={styles.error}>{addErrors.date_awarded}</div>}
          </div>
          <div style={styles.field}>
            <label style={styles.sublabel}>Description</label>
            <textarea
              rows={3}
              value={add.description}
              onChange={(e) => setAdd((p) => ({ ...p, description: e.target.value }))}
              style={{ ...styles.careerInput, height: 'auto', paddingTop: 8, paddingBottom: 8 }}
              placeholder="Optional notes…"
            />
          </div>
        </div>
      )}

      {/* Table (desktop) o Accordion (mobile) */}
      {!isMobile ? (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Season</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Title</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Entity</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Date</th>
                <th style={{ ...styles.th, ...(isMobile ? styles.thMobile : null) }}>Description</th>
                <th style={{ ...styles.thRight, ...(isMobile ? styles.thMobile : null) }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isEditing = editId === r.id;
                return (
                  <tr key={r.id}>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      {isEditing ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <input
                            type="number"
                            value={edit.season_start}
                            onChange={(e) => setEdit((p) => ({ ...p, season_start: e.target.value }))}
                            style={{ ...styles.careerInput, borderColor: editErrors.season_start ? '#b00' : '#E0E0E0' }}
                          />
                          <input
                            type="number"
                            value={edit.season_end}
                            onChange={(e) => setEdit((p) => ({ ...p, season_end: e.target.value }))}
                            style={{ ...styles.careerInput, borderColor: editErrors.season_end ? '#b00' : '#E0E0E0' }}
                          />
                        </div>
                      ) : (
                        <span>{formatSeason(r.season_start, r.season_end)}</span>
                      )}
                      {(isEditing && (editErrors.season_start || editErrors.season_end)) && (
                        <div style={styles.error}>{editErrors.season_start || editErrors.season_end}</div>
                      )}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      {isEditing ? (
                        <input
                          value={edit.title}
                          onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))}
                          style={styles.careerInput}
                        />
                      ) : (r.title || '—')}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      {isEditing ? (
                        <input
                          value={edit.awarding_entity}
                          onChange={(e) => setEdit((p) => ({ ...p, awarding_entity: e.target.value }))}
                          style={styles.careerInput}
                        />
                      ) : (r.awarding_entity || '—')}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null) }}>
                      {isEditing ? (
                        <input
                          type="date"
                          value={edit.date_awarded}
                          onChange={(e) => setEdit((p) => ({ ...p, date_awarded: e.target.value }))}
                          style={{ ...styles.careerInput, borderColor: editErrors.date_awarded ? '#b00' : '#E0E0E0' }}
                        />
                      ) : (formatDate(r.date_awarded))}
                      {isEditing && editErrors.date_awarded && <div style={styles.error}>{editErrors.date_awarded}</div>}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null), minWidth: 200 }}>
                      {isEditing ? (
                        <textarea
                          rows={2}
                          value={edit.description}
                          onChange={(e) => setEdit((p) => ({ ...p, description: e.target.value }))}
                          style={{ ...styles.careerInput, height: 'auto', paddingTop: 8, paddingBottom: 8 }}
                        />
                      ) : (r.description || '—')}
                    </td>
                    <td style={{ ...styles.td, ...(isMobile ? styles.tdMobile : null), textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!isEditing ? (
                        <>
                          <button type="button" style={styles.linkBtn} onClick={() => onEdit(r)} disabled={rowBusy === r.id}>Edit</button>
                          <span style={{ margin: '0 6px' }}>|</span>
                          <button type="button" style={{ ...styles.linkBtn, color: '#b00' }} onClick={() => onDelete(r.id)} disabled={rowBusy === r.id}>Delete</button>
                        </>
                      ) : (
                        <>
                          <button type="button" style={styles.linkBtn} onClick={() => onEditSave(r.id)} disabled={rowBusy === r.id}>Save</button>
                          <span style={{ margin: '0 6px' }}>|</span>
                          <button type="button" style={styles.linkBtn} onClick={onEditCancel} disabled={rowBusy === r.id}>Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {rows.map((r) => (
            <AwardAccordionItem
              key={r.id}
              row={r}
              isOpen={openId === r.id}
              isEditing={editId === r.id}
              toggle={() => toggleAward(r.id)}
              onEdit={() => onEdit(r)}
              onEditSave={() => onEditSave(r.id)}
              onEditCancel={onEditCancel}
              onDelete={() => onDelete(r.id)}
              edit={edit}
              setEdit={setEdit}
              editErrors={editErrors}
              styles={styles}
              busy={rowBusy === r.id}
            />
          ))}
        </div>
      )}

      {cStatus.msg && (
        <div style={{
          marginTop: 8,
          fontWeight: 600,
          color: cStatus.type === 'error' ? '#b00' : '#2E7D32',
          display: 'inline-flex',
          alignItems: 'center'
        }}>
          {cStatus.msg}
        </div>
      )}
    </div>
  );
}

/** -------------------- Mobile accordion item -------------------- */
function AwardAccordionItem({
  row,
  isOpen,
  isEditing,
  toggle,
  onEdit,
  onEditSave,
  onEditCancel,
  onDelete,
  edit,
  setEdit,
  editErrors,
  styles,
  busy,
}) {
  const summaryId = `award-summary-${row.id}`;
  const regionId = `award-region-${row.id}`;
  return (
    <div style={styles.seasonCard}>
      <button
        type="button"
        id={summaryId}
        aria-expanded={isOpen}
        aria-controls={regionId}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggle();
          }
        }}
        style={styles.seasonSummary}
      >
        <span style={styles.seasonText}>{formatSeason(row.season_start, row.season_end)}</span>
        <span style={styles.teamText}>{row.title || '-'}</span>
        <span style={{ ...styles.chevron, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
      </button>

      {isOpen && (
        <div id={regionId} role="region" aria-labelledby={summaryId} style={styles.seasonDetails}>
          {isEditing ? (
            <>
              <div style={styles.careerForm}>
                <div style={styles.field}>
                  <label style={styles.sublabel}>Season start</label>
                  <input
                    type="number"
                    value={edit.season_start}
                    onChange={(e) => setEdit((p) => ({ ...p, season_start: e.target.value }))}
                    style={{ ...styles.careerInput, borderColor: editErrors.season_start ? '#b00' : '#E0E0E0' }}
                  />
                  {editErrors.season_start && <div style={styles.error}>{editErrors.season_start}</div>}
                </div>
                <div style={styles.field}>
                  <label style={styles.sublabel}>Season end</label>
                  <input
                    type="number"
                    value={edit.season_end}
                    onChange={(e) => setEdit((p) => ({ ...p, season_end: e.target.value }))}
                    style={{ ...styles.careerInput, borderColor: editErrors.season_end ? '#b00' : '#E0E0E0' }}
                  />
                  {editErrors.season_end && <div style={styles.error}>{editErrors.season_end}</div>}
                </div>
                <div style={styles.field}>
                  <label style={styles.sublabel}>Title</label>
                  <input
                    value={edit.title}
                    onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))}
                    style={styles.careerInput}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.sublabel}>Awarding entity</label>
                  <input
                    value={edit.awarding_entity}
                    onChange={(e) => setEdit((p) => ({ ...p, awarding_entity: e.target.value }))}
                    style={styles.careerInput}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.sublabel}>Date awarded</label>
                  <input
                    type="date"
                    value={edit.date_awarded}
                    onChange={(e) => setEdit((p) => ({ ...p, date_awarded: e.target.value }))}
                    style={{ ...styles.careerInput, borderColor: editErrors.date_awarded ? '#b00' : '#E0E0E0' }}
                  />
                  {editErrors.date_awarded && <div style={styles.error}>{editErrors.date_awarded}</div>}
                </div>
                <div style={styles.field}>
                  <label style={styles.sublabel}>Description</label>
                  <textarea
                    rows={3}
                    value={edit.description}
                    onChange={(e) => setEdit((p) => ({ ...p, description: e.target.value }))}
                    style={{ ...styles.careerInput, height: 'auto', paddingTop: 8, paddingBottom: 8 }}
                    placeholder="Optional notes…"
                  />
                </div>
              </div>
              <div style={styles.seasonActions}>
                <button type="button" style={styles.smallBtnPrimary} onClick={onEditSave} disabled={busy}>Save</button>
                <button type="button" style={styles.smallBtn} onClick={onEditCancel} disabled={busy}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div style={styles.seasonDetailRow}>
                <span style={styles.seasonLabel}>Season</span>
                <span style={styles.seasonValue}>{formatSeason(row.season_start, row.season_end)}</span>
              </div>
              <div style={styles.seasonDetailRow}>
                <span style={styles.seasonLabel}>Title</span>
                <span style={styles.seasonValue}>{row.title || '-'}</span>
              </div>
              <div style={styles.seasonDetailRow}>
                <span style={styles.seasonLabel}>Entity</span>
                <span style={styles.seasonValue}>{row.awarding_entity || '-'}</span>
              </div>
              <div style={styles.seasonDetailRow}>
                <span style={styles.seasonLabel}>Date</span>
                <span style={styles.seasonValue}>{formatDate(row.date_awarded)}</span>
              </div>
              {row.description && (
                <div style={styles.seasonDetailRow}>
                  <span style={styles.seasonLabel}>Description</span>
                  <span style={styles.seasonValue}>{row.description}</span>
                </div>
              )}
              <div style={styles.seasonActions}>
                <button type="button" style={styles.smallBtnPrimary} onClick={onEdit} disabled={busy}>Edit</button>
                <button type="button" style={{ ...styles.smallBtn, color: '#b00', borderColor: '#E0E0E0' }} onClick={onDelete} disabled={busy}>Delete</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------- STYLES (identici / armonizzati) -----------------------
const styles = {
  // input/label/error
  field: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: 600 },
  sublabel: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 },

  input: {
    height: 42,
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF',
  },
  careerInput: {
    height: 38,
    padding: '8px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF',
    width: '100%',
    boxSizing: 'border-box',
  },
  error: { fontSize: 12, color: '#b00' },

  // Bottoni coerenti
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
  linkBtn: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: '#1976d2',
    cursor: 'pointer',
    fontWeight: 600,
  },

  // Tabella desktop
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #EEE',
    borderRadius: 10,
    background: '#FFF',
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
  th: {
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 700,
    padding: '10px 12px',
    borderBottom: '1px solid #EEE',
    whiteSpace: 'nowrap',
  },
  thRight: { textAlign: 'right', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE' },
  thMobile: { padding: '12px 20px', minWidth: 180 },
  td: {
    fontSize: 14,
    padding: '10px 12px',
    borderBottom: '1px solid #F5F5F5',
    verticalAlign: 'top',
  },
  tdMobile: { padding: '12px 20px', minWidth: 180 },

  // Form inline (riuso stile “careerForm” per coerenza visiva)
  careerForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    margin: '12px 0',
    padding: 12,
    border: '1px dashed #E0E0E0',
    borderRadius: 10,
    background: '#FAFAFA',
  },

  // Mobile season accordion (stessi token della Season card)
  seasonCard: { border: '1px solid #EEE', borderRadius: 12, marginBottom: 8, background: '#FFF' },
  seasonSummary: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px', background: 'transparent', border: 'none', textAlign: 'left',
    cursor: 'pointer', minHeight: 56,
  },
  seasonText: { fontSize: 16, fontWeight: 600, color: '#111827' },
  teamText: {
    flex: 1, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 8,
  },
  chevron: { width: 16, height: 16, transition: 'transform 0.2s', flexShrink: 0 },
  seasonDetails: { padding: 12, borderTop: '1px solid #EEE', display: 'flex', flexDirection: 'column', gap: 8 },
  seasonDetailRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  seasonLabel: { fontSize: 12, color: '#6B7280' },
  seasonValue: { fontSize: 14, color: '#111827' },
  seasonActions: { display: 'flex', gap: 8, marginTop: 8 },
};

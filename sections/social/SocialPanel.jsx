// sections/social/SocialPanel.jsx
// Card "Social Profiles" — TalentLix
// - UI/UX allineate alle altre card (stessi token, Save Bar, logiche di dirty/save).
// - Nessun campo marcato “obbligatorio” a livello di UI; tuttavia, per coerenza con il DB
//   (NOT NULL su platform e profile_url) la card segnala in modo coerente l’assenza e non salva la riga incompleta.
// - Mobile first: tabella su desktop, accordion su mobile.
// - L'ordinamento è automatico: sort_order viene aggiornato sequenzialmente al salvataggio.
// - Un solo profilo "primario" per atleta: enforced lato UI (il toggle su uno spegne gli altri).

import { useEffect, useState } from 'react';
import { FiLink } from 'react-icons/fi';
import { supabase as sb } from '../../utils/supabaseClient';

const supabase = sb;

// ------------------------------ COSTANTI ------------------------------
const TBL = 'social_profiles';

// Suggerimenti liberi per la piattaforma (l’input resta testo libero)
const PLATFORM_SUGGESTIONS = [
  'Instagram', 'X', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn', 'Twitch', 'Threads', 'Website', 'Other'
];

// ------------------------------ STILI (copiati/armonizzati con le altre card) ------------------------------
const styles = {
  // Layout coerente
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
    background: '#FFF'
  },
  textarea: {
    minHeight: 70,
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 10,
    fontSize: 14,
    background: '#FFF'
  },
  checkboxRow: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  thChk: { textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '10px 6px', borderBottom: '1px solid #EEE', width: 40 },
  tdChk: { fontSize: 14, padding: '10px 6px', borderBottom: '1px solid #F5F5F5', textAlign: 'center', width: 40 },
  thUrl: { textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE', width: 60 },
  tdUrl: { fontSize: 14, padding: '10px 12px', borderBottom: '1px solid #F5F5F5', textAlign: 'center', width: 60 },
  urlIcon: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1976d2' },
  error: { fontSize: 12, color: '#b00' },

  // Bottoni (coerenti)
  smallBtn: {
    height: 32, padding: '0 12px', borderRadius: 8,
    border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer', fontWeight: 600
  },
  smallBtnPrimary: {
    height: 32, padding: '0 12px', borderRadius: 8,
    border: 'none', background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff', cursor: 'pointer', fontWeight: 600
  },
  smallBtnDisabled: {
    height: 32, padding: '0 12px', borderRadius: 8,
    background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed', fontWeight: 600
  },
  linkBtn: {
    background: 'transparent', border: 'none', padding: 0, color: '#1976d2',
    cursor: 'pointer', fontWeight: 600
  },

  // Table desktop
  tableWrap: { overflowX: 'auto', border: '1px solid #EEE', borderRadius: 10, background: '#FFF' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: '8px 0' },
  th: { textAlign: 'left', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE', whiteSpace: 'nowrap' },
  thRight: { textAlign: 'right', fontSize: 12, fontWeight: 700, padding: '10px 12px', borderBottom: '1px solid #EEE' },
  td: { fontSize: 14, padding: '10px 12px', borderBottom: '1px solid #F5F5F5', verticalAlign: 'top' },

  // Mobile accordion
  card: { border: '1px solid #EEE', borderRadius: 12, marginBottom: 8, background: '#FFF' },
  summary: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px', background: 'transparent', border: 'none', textAlign: 'left',
    cursor: 'pointer', minHeight: 56,
  },
  titleText: { flex: 1, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 8 },
  chevron: { width: 16, height: 16, transition: 'transform 0.2s', flexShrink: 0 },
  details: { padding: 12, borderTop: '1px solid #EEE', display: 'flex', flexDirection: 'column', gap: 8 },
  actions: { display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },

  // Save Bar allineata alle altre card
  saveBar: {
    gridColumn: '1 / -1',
    display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12,
    justifyContent: 'flex-end', flexWrap: 'nowrap'
  },
  saveBtn: { height: 38, padding: '0 16px', borderRadius: 8, fontWeight: 600, border: 'none' },
  saveBtnEnabled: { background: 'linear-gradient(90deg, #27E3DA, #F7B84E)', color: '#fff', cursor: 'pointer' },
  saveBtnDisabled: { background: '#EEE', color: '#999', border: '1px solid #E0E0E0', cursor: 'not-allowed' },
  statusTextOK: { marginLeft: 10, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', color: '#2E7D32' },
  statusTextERR:{ marginLeft: 10, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', color: '#b00' },
};

// ------------------------------ COMPONENTE ------------------------------
export default function SocialPanel({ athlete, onSaved, isMobile }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState({ type: '', msg: '' });
  const [dirty, setDirty]     = useState(false);

  // Stato righe social
  const [rows, setRows] = useState([]);        // array di record {id?, platform, handle, profile_url, is_public, is_primary, sort_order, ...}
  const [snapshot, setSnapshot] = useState([]); // clone per confronto
  const [rowErrors, setRowErrors] = useState({}); // { [id]: 'messaggio' }

  // Stato ADD (riga nuova)
  const [add, setAdd] = useState({ platform: '', handle: '', profile_url: '', is_public: true, is_primary: false, err: '' });

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!athlete?.id) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from(TBL)
          .select('*')
          .eq('athlete_id', athlete.id)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (error) throw error;

        if (!mounted) return;
        setRows(data || []);
        setSnapshot(data || []);
        setDirty(false);
        setStatus(s => s); // non resettiamo il badge
      } catch (e) {
        console.error(e);
        if (mounted) setStatus({ type: 'error', msg: 'Load failed' });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [athlete?.id]);

  // ---------------- CAMBIO CAMPI ----------------
  const onField = (id, key, val) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: val } : r));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
    if (rowErrors[id]) setRowErrors(prev => ({ ...prev, [id]: '' }));
  };

  const onTogglePublic = (id) => onField(id, 'is_public', !rows.find(r => r.id === id)?.is_public);

  const onTogglePrimary = (id) => {
    setRows(prev => prev.map(r => ({ ...r, is_primary: r.id === id ? !r.is_primary : false })));
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  // ---------------- Aggiungi / Elimina ----------------
  const addRow = () => {
    const tempId = `tmp-${Date.now()}`;
    const nextOrder = rows.length ? Math.max(...rows.map(r => Number(r.sort_order || 0))) + 1 : 0;
    const newRow = {
      id: tempId,
      athlete_id: athlete.id,
      platform: add.platform || '',
      handle: add.handle || '',
      profile_url: add.profile_url || '',
      is_public: !!add.is_public,
      is_primary: !!add.is_primary,
      sort_order: nextOrder,
    };
    setRows(prev => [...prev, newRow]);
    setAdd({ platform: '', handle: '', profile_url: '', is_public: true, is_primary: false, err: '' });
    setDirty(true);
    if (status.type) setStatus({ type: '', msg: '' });
  };

  const deleteRow = async (id) => {
    const ok = window.confirm('Delete this social profile?');
    if (!ok) return;
    try {
      if (String(id).startsWith('tmp-')) {
        setRows(prev => prev.filter(r => r.id !== id).map((r, idx) => ({ ...r, sort_order: idx })));
        setDirty(true);
        setStatus({ type: 'success', msg: 'Saved ✓' });
        return;
      }
      const { error } = await supabase.from(TBL).delete().eq('id', id);
      if (error) throw error;
      setRows(prev => prev.filter(r => r.id !== id).map((r, idx) => ({ ...r, sort_order: idx })));
      setDirty(true);
      setStatus({ type: 'success', msg: 'Saved ✓' });
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Delete failed' });
    }
  };


  // ---------------- VALIDAZIONE SOFT (coerente con DB NOT NULL su platform/profile_url) ----------------
  const validateRow = (r) => {
    const platform = String(r.platform || '').trim();
    const url = String(r.profile_url || '').trim();
    if (!platform || !url) return 'Platform and URL are required by DB.';
    return '';
  };

  // ---------------- SAVE ----------------
  const hasDirty = dirty;
  const isSaveDisabled = saving || !hasDirty;

  const onSave = async () => {
    if (isSaveDisabled) return;
    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      // Garantiamo un solo "primary" lato UI
      const primaries = rows.filter(r => !!r.is_primary);
      if (primaries.length > 1) {
        // Forziamo il primo come primary e spegniamo gli altri
        const firstId = primaries[0].id;
        setRows(prev => prev.map(r => ({ ...r, is_primary: r.id === firstId }))); 
      }

      // sort_order sequenziale
      const ordered = rows.map((r, idx) => ({ ...r, sort_order: idx }));

      // Validazione riga-per-riga
      const errs = {};
      for (const r of ordered) {
        const e = validateRow(r);
        if (e) errs[r.id] = e;
      }
      if (Object.keys(errs).length) {
        setRowErrors(errs);
        setSaving(false);
        setStatus({ type: 'error', msg: 'Fill platform and URL.' });
        return;
      }

      // Split insert/update
      const toInsert = ordered.filter(r => String(r.id).startsWith('tmp-') || r.id == null);
      const toUpdate = ordered.filter(r => !(String(r.id).startsWith('tmp-')) && r.id != null);

      // INSERTS
      for (const r of toInsert) {
        const payload = {
          athlete_id: athlete.id,
          platform: String(r.platform || '').trim(),
          handle: String(r.handle || '').trim() || null,
          profile_url: String(r.profile_url || '').trim(),
          is_public: !!r.is_public,
          is_primary: !!r.is_primary,
          sort_order: Number(r.sort_order || 0),
          updated_at: new Date().toISOString()
        };
        const { data, error } = await supabase.from(TBL).insert([payload]).select().single();
        if (error) throw error;
        // rimpiazza temp id
        setRows(prev => prev.map(x => x.id === r.id ? data : x));
      }

      // UPDATES (solo se diversi dallo snapshot)
      for (const r of toUpdate) {
        const snap = snapshot.find(s => s.id === r.id);
        const changed = !snap || JSON.stringify({
          platform: snap.platform, handle: snap.handle || '',
          profile_url: snap.profile_url, is_public: !!snap.is_public,
          is_primary: !!snap.is_primary, sort_order: Number(snap.sort_order || 0)
        }) !== JSON.stringify({
          platform: r.platform, handle: r.handle || '',
          profile_url: r.profile_url, is_public: !!r.is_public,
          is_primary: !!r.is_primary, sort_order: Number(r.sort_order || 0)
        });
        if (!changed) continue;

        const payload = {
          platform: String(r.platform || '').trim(),
          handle: String(r.handle || '').trim() || null,
          profile_url: String(r.profile_url || '').trim(),
          is_public: !!r.is_public,
          is_primary: !!r.is_primary,
          sort_order: Number(r.sort_order || 0),
          updated_at: new Date().toISOString()
        };
        const { error } = await supabase.from(TBL).update(payload).eq('id', r.id);
        if (error) throw error;
      }

      // Ricarica fresco
      const { data: fresh } = await supabase
        .from(TBL)
        .select('*')
        .eq('athlete_id', athlete.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      setRows(fresh || []);
      setSnapshot(fresh || []);
      setRowErrors({});
      setDirty(false);
      setStatus({ type: 'success', msg: 'Saved ✓' });

      // Callback parent (coerente con altre card)
      if (onSaved) {
        const { data: aFresh } = await supabase.from('athlete').select('*').eq('id', athlete.id).single();
        onSaved(aFresh || null);
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  // ---------------- RENDER ----------------
  if (loading) return <div style={{ padding: 8, color: '#666' }}>Loading…</div>;

  const saveBtnStyle = isSaveDisabled
    ? { ...styles.saveBtn, ...styles.saveBtnDisabled }
    : { ...styles.saveBtn, ...styles.saveBtnEnabled };

  return (
    <div style={styles.grid}>
      {/* HEADER CARD */}
      <div>
        <div style={styles.sectionTitle}>Social Profiles</div>
        <div style={styles.subnote}>
          Aggiungi i profili social dell’atleta. “Primary” ne consente uno solo.
        </div>
      </div>

      {/* FORM AGGIUNTA */}
      <div style={{ ...styles.grid, gap: 16 }}>
        <div className="row" style={styles.field}>
          <label style={styles.label}>Platform</label>
          <input
            list="platform-suggestions"
            value={add.platform}
            onChange={(e) => setAdd(s => ({ ...s, platform: e.target.value, err: '' }))}
            placeholder="e.g. Instagram / X / TikTok…"
            style={styles.input}
          />
          <datalist id="platform-suggestions">
            {PLATFORM_SUGGESTIONS.map(p => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div className="row" style={styles.field}>
          <label style={styles.label}>Handle (optional)</label>
          <input
            value={add.handle}
            onChange={(e) => setAdd(s => ({ ...s, handle: e.target.value, err: '' }))}
            placeholder="@username"
            style={styles.input}
          />
        </div>
        <div className="row" style={styles.field}>
          <label style={styles.label}>Profile URL</label>
          <input
            value={add.profile_url}
            onChange={(e) => setAdd(s => ({ ...s, profile_url: e.target.value, err: '' }))}
            placeholder="https://…"
            style={styles.input}
          />
        </div>
        <div className="row" style={{ ...styles.fieldRow, gap: 16, marginBottom: 12 }}>
        <div style={styles.checkboxRow}>
          <input
            id="add-public"
            type="checkbox"
            checked={!!add.is_public}
            onChange={() => setAdd(s => ({ ...s, is_public: !s.is_public }))}
            aria-label="Public"
          />
          <label htmlFor="add-public" style={{ marginLeft: 4 }}>Public</label>
        </div>
        <div style={styles.checkboxRow}>
          <input
            id="add-primary"
            type="checkbox"
            checked={!!add.is_primary}
            onChange={() => setAdd(s => ({ ...s, is_primary: !s.is_primary }))}
            aria-label="Primary"
          />
          <label htmlFor="add-primary" style={{ marginLeft: 4 }}>Primary</label>
        </div>
          <button
            type="button"
            onClick={addRow}
            style={{ ...styles.smallBtnPrimary, marginLeft: 'auto' }}
          >
            + Add
          </button>
          {add.err && <div style={{ ...styles.error, flexBasis: '100%' }}>{add.err}</div>}
        </div>
      </div>

      {/* LISTA — DESKTOP: tabella / MOBILE: accordion */}
      {!isMobile ? (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Platform</th>
                <th style={styles.th}>Handle</th>
                <th style={styles.thUrl}>Profile URL</th>
                <th style={styles.thChk}>Public</th>
                <th style={styles.thChk}>Primary</th>
                <th style={styles.thRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? rows.map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>
                    <input
                      list="platform-suggestions"
                      value={r.platform || ''}
                      onChange={(e) => onField(r.id, 'platform', e.target.value)}
                      style={styles.input}
                    />
                    {rowErrors[r.id] && !String(r.platform || '').trim() && (
                      <div style={styles.error}>Platform is required.</div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <input
                      value={r.handle || ''}
                      onChange={(e) => onField(r.id, 'handle', e.target.value)}
                      placeholder="@username"
                      style={styles.input}
                    />
                  </td>
                  <td style={styles.tdUrl}>
                    {r.profile_url && (
                      <a
                        href={r.profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={r.profile_url}
                        style={styles.urlIcon}
                      >
                        <FiLink />
                      </a>
                    )}
                  </td>
                  <td style={styles.tdChk}>
                    <input
                      id={`pub-${r.id}`}
                      type="checkbox"
                      checked={!!r.is_public}
                      onChange={() => onTogglePublic(r.id)}
                      aria-label="Public"
                    />
                  </td>
                  <td style={styles.tdChk}>
                    <input
                      id={`pri-${r.id}`}
                      type="checkbox"
                      checked={!!r.is_primary}
                      onChange={() => onTogglePrimary(r.id)}
                      aria-label="Primary"
                    />
                  </td>
                  <td style={{ ...styles.td, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      style={{ ...styles.linkBtn, color: '#b00' }}
                      onClick={() => deleteRow(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td style={styles.td} colSpan={6}><span style={{ fontSize: 12, color: '#666' }}>No social profiles added.</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {rows.map((r) => (
            <SocialAccordionItem
              key={r.id}
              row={r}
              onField={onField}
              onTogglePublic={onTogglePublic}
              onTogglePrimary={onTogglePrimary}
              onDelete={() => deleteRow(r.id)}
              rowError={rowErrors[r.id]}
            />
          ))}
          {rows.length === 0 && (
            <div style={{ fontSize: 12, color: '#666' }}>No social profiles added.</div>
          )}
        </div>
      )}

      {/* SAVE BAR */}
      <div style={styles.saveBar}>
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
          <span role="status" aria-live="polite" style={status.type === 'error' ? styles.statusTextERR : styles.statusTextOK}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------- SUB-COMPONENTE — Mobile Accordion ----------------
function SocialAccordionItem({ row, onField, onTogglePublic, onTogglePrimary, onDelete, rowError }) {
  const [open, setOpen] = useState(false);
  const summaryId = `social-summary-${row.id}`;
  const regionId  = `social-region-${row.id}`;

  const title = [row.platform || '—', row.handle ? `• ${row.handle}` : '', row.profile_url ? `• ${row.profile_url}` : '']
    .filter(Boolean).join(' ');

  return (
    <div style={styles.card}>
      <button
        type="button"
        style={styles.summary}
        onClick={() => setOpen(p => !p)}
        id={summaryId}
        aria-controls={regionId}
        aria-expanded={open}
      >
        <span style={styles.titleText}>{title}</span>
        <span style={{ ...styles.chevron, transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
      </button>

      {open && (
        <div id={regionId} role="region" aria-labelledby={summaryId} style={styles.details}>
          <div style={styles.field}>
            <label style={styles.label}>Platform</label>
            <input
              value={row.platform || ''}
              onChange={(e) => onField(row.id, 'platform', e.target.value)}
              placeholder="Instagram / X / …"
              style={styles.input}
            />
            {rowError && !String(row.platform || '').trim() && <div style={styles.error}>Platform is required.</div>}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Handle (optional)</label>
            <input
              value={row.handle || ''}
              onChange={(e) => onField(row.id, 'handle', e.target.value)}
              placeholder="@username"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Profile URL</label>
            <input
              value={row.profile_url || ''}
              onChange={(e) => onField(row.id, 'profile_url', e.target.value)}
              placeholder="https://…"
              style={styles.input}
            />
            {rowError && !String(row.profile_url || '').trim() && <div style={styles.error}>URL is required.</div>}
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.checkboxRow} htmlFor={`pub-m-${row.id}`}>
              <input
                id={`pub-m-${row.id}`}
                type="checkbox"
                checked={!!row.is_public}
                onChange={() => onTogglePublic(row.id)}
                aria-label="Public"
              />
              <span style={{ marginLeft: 4 }}>Public</span>
            </label>
            <label style={styles.checkboxRow} htmlFor={`pri-m-${row.id}`}>
              <input
                id={`pri-m-${row.id}`}
                type="checkbox"
                checked={!!row.is_primary}
                onChange={() => onTogglePrimary(row.id)}
                aria-label="Primary"
              />
              <span style={{ marginLeft: 4 }}>Primary</span>
            </label>
          </div>

          <div style={styles.actions}>
            <a
              href={(row.profile_url || '#')}
              target="_blank"
              rel="noopener noreferrer"
              title={row.profile_url}
              style={{ ...styles.smallBtn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <FiLink />
            </a>
            <button type="button" style={{ ...styles.smallBtn, color: '#b00', borderColor: '#E0E0E0' }} onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

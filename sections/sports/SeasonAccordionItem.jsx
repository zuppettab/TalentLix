import Select from 'react-select';
import sports from '../../utils/sports';

const formatSeason = (start, end) => {
  const s = start ? String(start) : '';
  const e = end ? String(end) : '';
  if (s && e) {
    const short = e.length === 4 ? e.slice(2) : e;
    return `${s}/${short}`;
  }
  return s || '-';
};

export default function SeasonAccordionItem({
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
  selectStyles,
  styles,
  busy,
}) {
  const summaryId = `season-summary-${row.id}`;
  const regionId = `season-region-${row.id}`;
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
        {row.sport && <span style={{ ...styles.pill, ...styles.pillSport }}>{row.sport}</span>}
        {row.is_current && <span style={{ ...styles.pill, ...styles.pillCurrent }}>Current</span>}
        <span style={styles.teamText}>{row.team_name || '-'}</span>
        <span style={{ ...styles.chevron, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
      </button>
      {isOpen && (
        <div
          id={regionId}
          role="region"
          aria-labelledby={summaryId}
          style={styles.seasonDetails}
        >
          {isEditing ? (
            <>
              <div style={{ ...styles.careerForm, ...styles.careerFormMobile }}>
                <div>
                  <label style={styles.sublabel}>Sport</label>
                  <Select
                    options={sports}
                    value={sports.find((o) => o.value === edit.sport) || null}
                    onChange={(opt) => setEdit((p) => ({ ...p, sport: opt?.value || '' }))}
                    styles={selectStyles}
                  />
                </div>
                <div>
                  <label style={styles.sublabel}>Season start *</label>
                  <input
                    type="number"
                    value={edit.season_start}
                    onChange={(e) => setEdit((p) => ({ ...p, season_start: e.target.value }))}
                    style={{ ...styles.careerInput, borderColor: editErrors.season_start ? '#b00' : '#E0E0E0' }}
                  />
                  {editErrors.season_start && <div style={styles.error}>{editErrors.season_start}</div>}
                </div>
                <div>
                  <label style={styles.sublabel}>Season end</label>
                  <input
                    type="number"
                    value={edit.season_end}
                    onChange={(e) => setEdit((p) => ({ ...p, season_end: e.target.value }))}
                    style={{ ...styles.careerInput, borderColor: editErrors.season_end ? '#b00' : '#E0E0E0' }}
                  />
                  {editErrors.season_end && <div style={styles.error}>{editErrors.season_end}</div>}
                </div>
                <div>
                  <label style={styles.sublabel}>Team *</label>
                  <input
                    value={edit.team_name}
                    onChange={(e) => setEdit((p) => ({ ...p, team_name: e.target.value }))}
                    style={{ ...styles.careerInput, borderColor: editErrors.team_name ? '#b00' : '#E0E0E0' }}
                  />
                  {editErrors.team_name && <div style={styles.error}>{editErrors.team_name}</div>}
                </div>
                <div>
                  <label style={styles.sublabel}>Role *</label>
                  <input
                    value={edit.role}
                    onChange={(e) => setEdit((p) => ({ ...p, role: e.target.value }))}
                    style={{ ...styles.careerInput, borderColor: editErrors.role ? '#b00' : '#E0E0E0' }}
                  />
                  {editErrors.role && <div style={styles.error}>{editErrors.role}</div>}
                </div>
                <div>
                  <label style={styles.sublabel}>Category *</label>
                  <input
                    value={edit.category}
                    onChange={(e) => setEdit((p) => ({ ...p, category: e.target.value }))}
                    style={{ ...styles.careerInput, borderColor: editErrors.category ? '#b00' : '#E0E0E0' }}
                  />
                  {editErrors.category && <div style={styles.error}>{editErrors.category}</div>}
                </div>
                <div>
                  <label style={styles.sublabel}>League</label>
                  <input
                    value={edit.league}
                    onChange={(e) => setEdit((p) => ({ ...p, league: e.target.value }))}
                    style={styles.careerInput}
                  />
                </div>
                <div>
                  <label style={styles.sublabel}>Current</label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!edit.is_current}
                      onChange={(e) => setEdit((p) => ({ ...p, is_current: e.target.checked }))}
                    />
                    <span>This is my current season</span>
                  </label>
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
                <span style={styles.seasonLabel}>Team</span>
                <span style={styles.seasonValue}>{row.team_name || '-'}</span>
              </div>
              <div style={styles.seasonDetailRow}>
                <span style={styles.seasonLabel}>Role</span>
                <span style={styles.seasonValue}>{row.role || '-'}</span>
              </div>
              <div style={styles.seasonDetailRow}>
                <span style={styles.seasonLabel}>Category</span>
                <span style={styles.seasonValue}>{row.category || '-'}</span>
              </div>
              {row.league && (
                <div style={styles.seasonDetailRow}>
                  <span style={styles.seasonLabel}>League</span>
                  <span style={styles.seasonValue}>{row.league}</span>
                </div>
              )}
              <div style={styles.seasonDetailRow}>
                <span style={styles.seasonLabel}>Current</span>
                <span style={styles.seasonValue}>{row.is_current ? 'Yes' : '—'}</span>
              </div>
              <div style={styles.seasonActions}>
                <button type="button" style={styles.linkBtn} onClick={onEdit} disabled={busy}>Edit</button>
                <button type="button" style={{ ...styles.linkBtn, color: '#b00' }} onClick={onDelete} disabled={busy}>Delete</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

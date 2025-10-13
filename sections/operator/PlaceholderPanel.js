export default function PlaceholderPanel({ title, description }) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.badge}>Coming soon</div>
      <h3 style={styles.heading}>{title}</h3>
      <p style={styles.body}>{description}</p>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: 'linear-gradient(135deg, rgba(39,227,218,0.08), rgba(247,184,78,0.12))',
    borderRadius: 16,
    padding: 24,
    border: '1px dashed rgba(2,115,115,0.35)',
  },
  badge: {
    alignSelf: 'flex-start',
    padding: '4px 10px',
    borderRadius: 999,
    background: '#FFF',
    color: '#027373',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  heading: {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    color: '#0B3D91',
  },
  body: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.6,
    color: '#374151',
  },
};

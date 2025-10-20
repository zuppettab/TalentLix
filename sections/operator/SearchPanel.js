const styles = {
  container: {
    padding: '48px 24px',
    maxWidth: 720,
    margin: '0 auto',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    fontSize: 18,
    margin: 0,
    color: '#555',
  },
  panel: {
    border: '1px dashed #cbd5f5',
    borderRadius: 16,
    padding: '48px 24px',
    backgroundColor: '#f5f7ff',
  },
};

export default function SearchPanel() {
  return (
    <section style={styles.container}>
      <div style={styles.panel}>
        <h1 style={styles.title}>Search is being revamped</h1>
        <p style={styles.subtitle}>
          We&apos;re working on a brand new experience. Please check back soon to discover the updated search tools.
        </p>
      </div>
    </section>
  );
}

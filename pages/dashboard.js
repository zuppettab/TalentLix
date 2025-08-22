import { useMemo, useState } from "react";
import Link from "next/link";

// Dashboard v1 — Scaffold completo + 4 card "vive" (Overview)
// Coerente con /pages/index.js: gradient brand, card, tipografia, bottoni
// NOTE: questa è una prima versione SOLO UI (no chiamate API reali). I dati sono stub local state.
// TODO (Sprint 1.1): collegare GET /api/dashboard, PATCH /api/athlete/:id, UPSERT /api/physical-data, OTP endpoints

export default function Dashboard() {
  // ====== STUB DATI (simula payload GET /api/dashboard) ======
  const [athlete, setAthlete] = useState({
    id: 1,
    full_name: "Luca Marino",
    dob: "2008-03-14", // ISO date
    nationality: "IT",
    native_language: "Italiano",
    additional_language: "Inglese",
    residence_city: "Bari",
    residence_country: "Italia",
    phone: "+39 320 123 4567",
    profile_picture_url: "/avatar-placeholder.png",
    profile_published: false,
  });

  const [physicalData, setPhysicalData] = useState({
    height_cm: 182,
    weight_kg: 74,
    dominant_hand: "Destra",
  });

  const [verif, setVerif] = useState({
    email_verified: true,
    phone_verified: false,
  });

  // ====== HELPER ======
  const age = useMemo(() => {
    try {
      const d = new Date(athlete.dob);
      const today = new Date();
      let a = today.getFullYear() - d.getFullYear();
      const m = today.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
      return a;
    } catch {
      return "-";
    }
  }, [athlete.dob]);

  const completion = useMemo(() => {
    // Regole minime di completamento (v1):
    // Profilo base (nome, dob, nazionalità, madrelingua, foto) = 40
    // Contatti (città, nazione, telefono) = 30
    // Dati fisici (altezza, peso, mano) = 20
    // Verifica telefono = 10
    let v = 0;
    if (athlete.full_name && athlete.dob && athlete.nationality && athlete.native_language && athlete.profile_picture_url) v += 40;
    if (athlete.residence_city && athlete.residence_country && athlete.phone) v += 30;
    if (physicalData.height_cm && physicalData.weight_kg && physicalData.dominant_hand) v += 20;
    if (verif.phone_verified) v += 10;
    return v;
  }, [athlete, physicalData, verif]);

  const canPublish = completion >= 70; // soglia iniziale

  // ====== UI STATE ======
  const [editing, setEditing] = useState({
    contacts: false,
    physical: false,
  });
  const [otpUI, setOtpUI] = useState({ sending: false, sent: false, code: "" });
  const [toast, setToast] = useState(null);

  // ====== ACTIONS (stub) ======
  const saveContacts = (next) => {
    setAthlete((prev) => ({ ...prev, ...next }));
    setEditing((e) => ({ ...e, contacts: false }));
    pingToast("Contatti aggiornati");
  };

  const savePhysical = (next) => {
    setPhysicalData((prev) => ({ ...prev, ...next }));
    setEditing((e) => ({ ...e, physical: false }));
    pingToast("Dati fisici aggiornati");
  };

  const sendOTP = async () => {
    setOtpUI({ sending: true, sent: false, code: "" });
    // TODO: POST /api/verify/phone/send-otp
    setTimeout(() => setOtpUI({ sending: false, sent: true, code: "" }), 700);
  };

  const checkOTP = async () => {
    // TODO: POST /api/verify/phone/check-otp
    if (otpUI.code.trim() === "123456") {
      setVerif((v) => ({ ...v, phone_verified: true }));
      setOtpUI({ sending: false, sent: false, code: "" });
      pingToast("Telefono verificato");
    } else {
      pingToast("Codice OTP non valido", "error");
    }
  };

  const togglePublish = () => {
    if (!canPublish) return;
    setAthlete((a) => ({ ...a, profile_published: !a.profile_published }));
    pingToast(athlete.profile_published ? "Profilo impostato su Privato" : "Profilo Pubblicato");
  };

  function pingToast(message, type = "ok") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2200);
  }

  // ====== RENDER ======
  return (
    <div style={sx.page}>
      <Topbar fullName={athlete.full_name} avatar={athlete.profile_picture_url} />

      <div style={sx.shell}>
        <Sidebar />

        <main style={sx.main}>
          {/* RIGA 1 */}
          <div style={sx.row}>
            <Card style={{ ...sx.card, ...sx.cardWide }}>
              <CardHeader label="Profilo" title={athlete.full_name} />
              <div style={sx.profileWrap}>
                <img src={athlete.profile_picture_url} alt="Avatar" style={sx.avatar} />
                <div style={sx.profileInfo}>
                  <KV k="Età" v={`${age}`} />
                  <KV k="Nazione" v={athlete.nationality} />
                  <KV k="Madrelingua" v={athlete.native_language} />
                  <KV k="Lingua aggiuntiva" v={athlete.additional_language || "—"} />
                </div>
                <div style={sx.profileActions}>
                  <button aria-label="Carica foto profilo" style={{ ...sx.button, ...sx.buttonSecondary }}>Carica foto</button>
                  <Link href="#" aria-label="Vedi profilo pubblico" style={{ ...sx.linkBtn }}>Anteprima profilo</Link>
                </div>
              </div>
            </Card>

            <Card style={sx.card}>
              <CardHeader label="Verifiche" title="Stato & Pubblicazione" />
              <div style={{ display: "grid", gap: 10 }}>
                <BadgeRow label="Email" ok={verif.email_verified} />
                <div>
                  <BadgeRow label="Telefono" ok={verif.phone_verified} />
                  {!verif.phone_verified && (
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {!otpUI.sent ? (
                        <button onClick={sendOTP} disabled={otpUI.sending} style={{ ...sx.button, ...sx.buttonPrimary }}>
                          {otpUI.sending ? "Invio…" : "Invia OTP"}
                        </button>
                      ) : (
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            aria-label="Codice OTP"
                            placeholder="Codice"
                            value={otpUI.code}
                            onChange={(e) => setOtpUI({ ...otpUI, code: e.target.value })}
                            style={sx.input}
                          />
                          <button onClick={checkOTP} style={{ ...sx.button, ...sx.buttonSecondary }}>Verifica</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 8 }}>
                  <Progress value={completion} />
                  <div style={sx.publishRow}>
                    <span style={sx.textMuted}>Completamento profilo: {completion}%</span>
                    <button
                      onClick={togglePublish}
                      disabled={!canPublish}
                      aria-disabled={!canPublish}
                      style={{ ...sx.button, ...(canPublish ? sx.buttonPrimary : sx.buttonDisabled) }}
                    >
                      {athlete.profile_published ? "Imposta Privato" : "Pubblica profilo"}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* RIGA 2 */}
          <div style={sx.row}>
            <Card style={{ ...sx.card, ...sx.cardWide }}>
              <CardHeader label="Contatti" title="Residenza & Telefono" />
              {!editing.contacts ? (
                <div style={sx.grid2}>
                  <KV k="Città" v={athlete.residence_city} />
                  <KV k="Paese" v={athlete.residence_country} />
                  <KV k="Telefono" v={athlete.phone} />
                  <div />
                  <div />
                  <div style={{ textAlign: "right" }}>
                    <button onClick={() => setEditing((e) => ({ ...e, contacts: true }))} style={{ ...sx.button, ...sx.buttonSecondary }}>Modifica</button>
                  </div>
                </div>
              ) : (
                <div style={sx.grid2}>
                  <LabeledInput label="Città" value={athlete.residence_city} onChange={(v) => setAthlete((a) => ({ ...a, residence_city: v }))} />
                  <LabeledInput label="Paese" value={athlete.residence_country} onChange={(v) => setAthlete((a) => ({ ...a, residence_country: v }))} />
                  <LabeledInput label="Telefono" value={athlete.phone} onChange={(v) => setAthlete((a) => ({ ...a, phone: v }))} placeholder="Formato E.164" />
                  <div />
                  <div />
                  <div style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditing((e) => ({ ...e, contacts: false }))} style={{ ...sx.button, ...sx.buttonSecondary }}>Annulla</button>
                    <button onClick={() => saveContacts({})} style={{ ...sx.button, ...sx.buttonPrimary }}>Salva</button>
                  </div>
                </div>
              )}
            </Card>

            <Card style={sx.card}>
              <CardHeader label="Dati fisici" title="Misure principali" />
              {!editing.physical ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <KV k="Altezza" v={`${physicalData.height_cm} cm`} />
                  <KV k="Peso" v={`${physicalData.weight_kg} kg`} />
                  <KV k="Mano" v={physicalData.dominant_hand} />
                  <div style={{ textAlign: "right" }}>
                    <button onClick={() => setEditing((e) => ({ ...e, physical: true }))} style={{ ...sx.button, ...sx.buttonSecondary }}>Modifica</button>
                  </div>
                </div>
              ) : (
                <div style={sx.grid2}>
                  <LabeledInput label="Altezza (cm)" type="number" value={physicalData.height_cm} onChange={(v) => setPhysicalData((p) => ({ ...p, height_cm: Number(v) }))} min={120} max={250} />
                  <LabeledInput label="Peso (kg)" type="number" value={physicalData.weight_kg} onChange={(v) => setPhysicalData((p) => ({ ...p, weight_kg: Number(v) }))} min={30} max={180} />
                  <LabeledInput label="Mano" value={physicalData.dominant_hand} onChange={(v) => setPhysicalData((p) => ({ ...p, dominant_hand: v }))} placeholder="Destra/Sinistra" />
                  <div />
                  <div style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditing((e) => ({ ...e, physical: false }))} style={{ ...sx.button, ...sx.buttonSecondary }}>Annulla</button>
                    <button onClick={() => savePhysical({})} style={{ ...sx.button, ...sx.buttonPrimary }}>Salva</button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* RIGA 3 — SHELL (roadmap) */}
          <div style={sx.row}>
            <ShellCard title="Info sportive" sprint="2" />
            <ShellCard title="Esperienze" sprint="2" />
            <ShellCard title="Media" sprint="2" />
          </div>

          <div style={sx.row}>
            <ShellCard title="Documenti" sprint="3" />
            <ShellCard title="Privacy & Consensi" sprint="3" />
            <ShellCard title="Notifiche" sprint="3" />
          </div>
        </main>
      </div>

      {toast && (
        <div role="status" aria-live="polite" style={{ ...sx.toast, ...(toast.type === "error" ? sx.toastErr : {}) }}>
          {toast.message}
        </div>
      )}

      <footer style={sx.footer}>
        <p style={sx.footerText}>© {new Date().getFullYear()} TalentLix</p>
      </footer>
    </div>
  );
}

// ====== COMPONENTI BASE ======
function Topbar({ fullName, avatar }) {
  return (
    <header style={sx.header}>
      <div style={sx.headerLeft}>
        <img src="/logo-talentlix.png" alt="TalentLix Logo" style={sx.logo} />
        <h1 style={sx.claim}>Dashboard</h1>
      </div>
      <div style={sx.headerRight}>
        <div style={sx.userMini}>
          <img src={avatar} alt="Avatar" style={sx.userAvatar} />
          <span style={sx.userName}>{fullName}</span>
        </div>
        <Link href="/logout" style={{ ...sx.button, ...sx.buttonSecondary }}>Logout</Link>
      </div>
    </header>
  );
}

function Sidebar() {
  const items = [
    "Overview",
    "Dati personali",
    "Contatti",
    "Dati fisici",
    "Info sportive",
    "Esperienze",
    "Media",
    "Documenti",
    "Privacy & Consensi",
    "Notifiche",
  ];
  return (
    <aside style={sx.sidebar}>
      {items.map((label, idx) => (
        <button key={idx} style={{ ...sx.sideBtn, ...(idx === 0 ? sx.sideBtnActive : {}) }}>
          {label}
        </button>
      ))}
    </aside>
  );
}

function Card({ style, children }) {
  return <section style={{ ...sx.cardBase, ...style }}>{children}</section>;
}

function CardHeader({ label, title }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={sx.badge}>{label}</span>
      <h2 style={sx.title}>{title}</h2>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div style={sx.kvRow}>
      <span style={sx.kvK}>{k}</span>
      <span style={sx.kvV}>{v}</span>
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder, type = "text", min, max }) {
  return (
    <label style={sx.label}>
      <span style={sx.labelText}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={sx.input}
      />
    </label>
  );
}

function Progress({ value }) {
  return (
    <div style={sx.progressWrap}>
      <div style={{ ...sx.progressBar, width: `${value}%` }} />
    </div>
  );
}

function BadgeRow({ label, ok }) {
  return (
    <div style={sx.badgeRow}>
      <span>{label}</span>
      <span style={{ ...sx.statusBadge, ...(ok ? sx.statusOk : sx.statusWarn) }}>{ok ? "Verificato" : "Da verificare"}</span>
    </div>
  );
}

function ShellCard({ title, sprint }) {
  return (
    <Card style={sx.card}>
      <CardHeader label="In arrivo" title={title} />
      <p style={sx.textMuted}>Questa sezione sarà attivata nello Sprint {sprint}. Nel frattempo il layout è già predisposto.</p>
      <div style={{ marginTop: 12 }}>
        <button style={{ ...sx.button, ...sx.buttonSecondary }}>Scopri roadmap</button>
      </div>
    </Card>
  );
}

// ====== STILI (coerenti con /pages/index.js) ======
const sx = {
  page: {
    minHeight: "100vh",
    background: "#FFFFFF",
    fontFamily: "Inter, sans-serif",
    color: "#000000",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem 1.25rem",
    borderBottom: "1px solid #EAEAEA",
    position: "sticky",
    top: 0,
    background: "#FFFFFF",
    zIndex: 10,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  logo: {
    width: 36,
    height: 36,
    filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.1))",
  },
  claim: {
    fontSize: "1.4rem",
    margin: 0,
    fontWeight: 800,
    letterSpacing: "-0.01em",
    background: "linear-gradient(90deg, #27E3DA, #F7B84E)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  shell: {
    display: "flex",
    gap: 12,
    padding: 12,
    flex: 1,
    maxWidth: 1280,
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
  },
  sidebar: {
    width: 230,
    border: "1px solid #E0E0E0",
    borderRadius: 16,
    padding: 10,
    background: "#F8F9FA",
    height: "fit-content",
    position: "sticky",
    top: 76,
    alignSelf: "flex-start",
  },
  sideBtn: {
    width: "100%",
    textAlign: "left",
    background: "#FFFFFF",
    border: "1px solid #E0E0E0",
    borderRadius: 12,
    padding: "0.6rem 0.75rem",
    marginBottom: 8,
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 120ms ease, box-shadow 120ms ease",
    boxShadow: "0 3px 10px rgba(0,0,0,0.05)",
  },
  sideBtnActive: {
    background: "linear-gradient(90deg, #27E3DA, #F7B84E)",
    color: "#FFFFFF",
    border: "1px solid transparent",
  },
  main: { flex: 1 },
  row: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  cardBase: {
    background: "#F8F9FA",
    border: "1px solid #E0E0E0",
    borderRadius: 16,
    padding: "1rem",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    flex: "1 1 320px",
  },
  card: { maxWidth: 480 },
  cardWide: { flex: "2 1 520px", maxWidth: 720 },
  badge: {
    display: "inline-block",
    fontSize: "0.9rem",
    fontWeight: 800,
    padding: "0.3rem 0.7rem",
    borderRadius: 999,
    border: "1px solid #D7D7D7",
    background: "#FFFFFF",
    marginBottom: 6,
  },
  title: {
    margin: "0.2rem 0 0.5rem",
    fontSize: "1.3rem",
    fontWeight: 800,
    background: "linear-gradient(90deg, #27E3DA, #F7B84E)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  kvRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    border: "1px solid #E8E8E8",
    background: "#FFFFFF",
    borderRadius: 10,
    padding: "0.6rem 0.75rem",
  },
  kvK: { color: "#666", fontWeight: 700 },
  kvV: { fontWeight: 800 },
  label: { display: "flex", flexDirection: "column", gap: 6 },
  labelText: { fontSize: "0.9rem", color: "#555", fontWeight: 700 },
  input: {
    width: "100%",
    border: "1px solid #E0E0E0",
    borderRadius: 10,
    padding: "0.6rem 0.7rem",
    outline: "none",
  },
  progressWrap: {
    width: "100%",
    height: 10,
    background: "#ECECEC",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    background: "linear-gradient(90deg, #27E3DA, #F7B84E)",
  },
  publishRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.7rem 0.9rem",
    borderRadius: 12,
    fontWeight: 800,
    textDecoration: "none",
    transition: "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
    border: "1px solid transparent",
    boxShadow: "0 3px 10px rgba(0,0,0,0.08)",
    cursor: "pointer",
    minWidth: 120,
  },
  buttonPrimary: {
    background: "linear-gradient(90deg, #27E3DA, #F7B84E)",
    color: "#FFFFFF",
  },
  buttonSecondary: {
    background: "#FFFFFF",
    color: "#000000",
    border: "1px solid #E0E0E0",
  },
  buttonDisabled: {
    background: "#F1F1F1",
    color: "#999",
    border: "1px solid #E9E9E9",
    cursor: "not-allowed",
  },
  linkBtn: { fontWeight: 800, textDecoration: "underline", color: "#000" },
  profileWrap: { display: "grid", gridTemplateColumns: "80px 1fr auto", gap: 12, alignItems: "center" },
  avatar: { width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid #E6E6E6" },
  profileInfo: { display: "grid", gap: 8 },
  profileActions: { display: "flex", gap: 8, alignItems: "center" },
  badgeRow: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FFFFFF", border: "1px solid #E8E8E8", borderRadius: 10, padding: "0.6rem 0.75rem" },
  statusBadge: { fontWeight: 900, padding: "0.2rem 0.55rem", borderRadius: 999, border: "1px solid transparent" },
  statusOk: { background: "#EAF9F4", color: "#0E7C66", borderColor: "#BFEBDD" },
  statusWarn: { background: "#FFF4E5", color: "#8A5200", borderColor: "#F5D1A6" },
  textMuted: { color: "#666", fontSize: "0.95rem" },
  userMini: { display: "flex", alignItems: "center", gap: 8 },
  userAvatar: { width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "1px solid #E6E6E6" },
  userName: { fontWeight: 800 },
  toast: {
    position: "fixed",
    bottom: 16,
    right: 16,
    background: "#0E7C66",
    color: "white",
    padding: "0.7rem 0.9rem",
    borderRadius: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
    zIndex: 20,
    fontWeight: 800,
  },
  toastErr: { background: "#8A1C1C" },
  footer: { padding: "1rem 1.25rem", textAlign: "center", borderTop: "1px solid #EAEAEA" },
  footerText: { margin: 0, color: "#777", fontSize: "0.9rem" },
};

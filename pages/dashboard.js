import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// Dashboard v1.2 — ENGLISH UI. Reads from /api/dashboard (no mock data)
// Visual style consistent with Home.

export default function Dashboard() {
  // ====== STATE ======
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Real data (GET /api/dashboard)
  const [athlete, setAthlete] = useState<any | null>(null);
  const [physicalData, setPhysicalData] = useState<any | null>(null);
  const [verif, setVerif] = useState<any | null>(null);

  // ====== FETCH REAL DATA ======
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/dashboard", { credentials: "include" });
        if (!res.ok) throw new Error(`GET /api/dashboard ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setAthlete(data.athlete);
        setPhysicalData(data.physical_data || {});
        setVerif(data.contacts_verification || {});
        setErr(null);
      } catch (e: any) {
        setErr(e?.message || "Load error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ====== HELPERS ======
  const age = useMemo(() => {
    if (!athlete?.date_of_birth) return "-";
    const d = new Date(athlete.date_of_birth);
    const today = new Date();
    let a = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
    return a;
  }, [athlete?.date_of_birth]);

  const completion = useMemo(() => {
    // Minimal weights aligned with schema (athlete + physical_data + phone verify)
    let v = 0;
    const base = athlete?.first_name && athlete?.last_name && athlete?.date_of_birth && athlete?.nationality && athlete?.native_language && athlete?.profile_picture_url;
    if (base) v += 40;
    const cont = athlete?.residence_city && athlete?.residence_country && athlete?.phone;
    if (cont) v += 30;
    const phys = physicalData?.height_cm && physicalData?.weight_kg && physicalData?.dominant_hand;
    if (phys) v += 20;
    if (verif?.phone_verified) v += 10;
    return v;
  }, [athlete, physicalData, verif]);

  const canPublish = completion >= 70;

  // ====== UI STATE ======
  const [editing, setEditing] = useState({ contacts: false, physical: false });
  const [otpUI, setOtpUI] = useState({ sending: false, sent: false, code: "" });
  const [toast, setToast] = useState<{ message: string; type?: "ok" | "error" } | null>(null);

  // ====== ACTIONS (REAL API CALLS) ======
  async function saveContacts() {
    try {
      const body = {
        residence_city: athlete.residence_city,
        residence_country: athlete.residence_country,
        phone: athlete.phone,
      };
      const res = await fetch(`/api/athlete/${athlete.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save contacts");
      setEditing((e) => ({ ...e, contacts: false }));
      pingToast("Contacts updated");
    } catch (e: any) {
      pingToast(e?.message || "Save error", "error");
    }
  }

  async function savePhysical() {
    try {
      const res = await fetch(`/api/physical-data`, {
        method: "PUT", // upsert
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ athlete_id: athlete.id, ...physicalData }),
      });
      if (!res.ok) throw new Error("Failed to save measurements");
      setEditing((e) => ({ ...e, physical: false }));
      pingToast("Measurements updated");
    } catch (e: any) {
      pingToast(e?.message || "Save error", "error");
    }
  }

  async function sendOTP() {
    try {
      setOtpUI({ sending: true, sent: false, code: "" });
      const res = await fetch(`/api/verify/phone/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: athlete.phone }),
      });
      if (!res.ok) throw new Error("OTP send failed");
      setOtpUI({ sending: false, sent: true, code: "" });
    } catch (e: any) {
      setOtpUI({ sending: false, sent: false, code: "" });
      pingToast(e?.message || "OTP error", "error");
    }
  }

  async function checkOTP() {
    try {
      const res = await fetch(`/api/verify/phone/check-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: otpUI.code, phone: athlete.phone }),
      });
      if (!res.ok) throw new Error("Invalid code");
      setVerif((v: any) => ({ ...(v || {}), phone_verified: true, phone_number: athlete.phone }));
      setOtpUI({ sending: false, sent: false, code: "" });
      pingToast("Phone verified");
    } catch (e: any) {
      pingToast(e?.message || "OTP invalid/expired", "error");
    }
  }

  async function togglePublish() {
    if (!canPublish) return;
    try {
      const next = !athlete.profile_published;
      const res = await fetch(`/api/athlete/${athlete.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profile_published: next }),
      });
      if (!res.ok) throw new Error("Failed to update publish state");
      setAthlete((a: any) => ({ ...a, profile_published: next }));
      pingToast(next ? "Profile published" : "Profile set to Private");
    } catch (e: any) {
      pingToast(e?.message || "Publish error", "error");
    }
  }

  function pingToast(message: string, type: "ok" | "error" = "ok") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2200);
  }

  // ====== RENDER ======
  return (
    <div style={sx.page}>
      <Topbar fullName={athlete ? `${athlete.first_name} ${athlete.last_name}` : ""} avatar={athlete?.profile_picture_url || "/avatar-placeholder.png"} />

      <div style={sx.shell}>
        <Sidebar />
        <main style={sx.main}>
          {loading ? (
            <Skeleton />
          ) : err ? (
            <ErrorBox message={err} />
          ) : (
            <>
              {/* ROW 1 */}
              <div style={sx.row}>
                <Card style={{ ...sx.card, ...sx.cardWide }}>
                  <CardHeader label="Profile" title={`${athlete.first_name} ${athlete.last_name}`} />
                  <div style={sx.profileWrap}>
                    <img src={athlete.profile_picture_url || "/avatar-placeholder.png"} alt="Avatar" style={sx.avatar} />
                    <div style={sx.profileInfo}>
                      <KV k="Age" v={`${age}`} />
                      <KV k="Nationality" v={athlete.nationality || "—"} />
                      <KV k="Native language" v={athlete.native_language || "—"} />
                      <KV k="Additional language" v={athlete.additional_language || "—"} />
                    </div>
                    <div style={sx.profileActions}>
                      <button aria-label="Upload profile photo" style={{ ...sx.button, ...sx.buttonSecondary }}>Upload photo</button>
                      <Link href="#" aria-label="Preview public profile" style={{ ...sx.linkBtn }}>Preview</Link>
                    </div>
                  </div>
                </Card>

                <Card style={sx.card}>
                  <CardHeader label="Verification" title="Status & Publishing" />
                  <div style={{ display: "grid", gap: 10 }}>
                    <BadgeRow label="Email" ok={!!verif?.email_verified} />
                    <div>
                      <BadgeRow label="Phone" ok={!!verif?.phone_verified} />
                      {!verif?.phone_verified && (
                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {!otpUI.sent ? (
                            <button onClick={sendOTP} disabled={otpUI.sending || !athlete.phone} style={{ ...sx.button, ...sx.buttonPrimary }}>
                              {otpUI.sending ? "Sending…" : "Send OTP"}
                            </button>
                          ) : (
                            <div style={{ display: "flex", gap: 8 }}>
                              <input aria-label="OTP code" placeholder="Code" value={otpUI.code} onChange={(e) => setOtpUI({ ...otpUI, code: e.target.value })} style={sx.input} />
                              <button onClick={checkOTP} style={{ ...sx.button, ...sx.buttonSecondary }}>Verify</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <Progress value={completion} />
                      <div style={sx.publishRow}>
                        <span style={sx.textMuted}>Profile completion: {completion}%</span>
                        <button onClick={togglePublish} disabled={!canPublish} aria-disabled={!canPublish} style={{ ...sx.button, ...(canPublish ? sx.buttonPrimary : sx.buttonDisabled) }}>
                          {athlete.profile_published ? "Set Private" : "Publish profile"}
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* ROW 2 */}
              <div style={sx.row}>
                <Card style={{ ...sx.card, ...sx.cardWide }}>
                  <CardHeader label="Contacts" title="Residence & Phone" />
                  {!editing.contacts ? (
                    <div style={sx.grid2}>
                      <KV k="City" v={athlete.residence_city || "—"} />
                      <KV k="Country" v={athlete.residence_country || "—"} />
                      <KV k="Phone" v={athlete.phone || "—"} />
                      <div />
                      <div />
                      <div style={{ textAlign: "right" }}>
                        <button onClick={() => setEditing((e) => ({ ...e, contacts: true }))} style={{ ...sx.button, ...sx.buttonSecondary }}>Edit</button>
                      </div>
                    </div>
                  ) : (
                    <div style={sx.grid2}>
                      <LabeledInput label="City" value={athlete.residence_city || ""} onChange={(v) => setAthlete((a: any) => ({ ...a, residence_city: v }))} />
                      <LabeledInput label="Country" value={athlete.residence_country || ""} onChange={(v) => setAthlete((a: any) => ({ ...a, residence_country: v }))} />
                      <LabeledInput label="Phone" value={athlete.phone || ""} onChange={(v) => setAthlete((a: any) => ({ ...a, phone: v }))} placeholder="E.164 format" />
                      <div />
                      <div />
                      <div style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => setEditing((e) => ({ ...e, contacts: false }))} style={{ ...sx.button, ...sx.buttonSecondary }}>Cancel</button>
                        <button onClick={saveContacts} style={{ ...sx.button, ...sx.buttonPrimary }}>Save</button>
                      </div>
                    </div>
                  )}
                </Card>

                <Card style={sx.card}>
                  <CardHeader label="Physical data" title="Key measurements" />
                  {!editing.physical ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <KV k="Height" v={physicalData?.height_cm ? `${physicalData.height_cm} cm` : "—"} />
                      <KV k="Weight" v={physicalData?.weight_kg ? `${physicalData.weight_kg} kg` : "—"} />
                      <KV k="Dominant hand" v={physicalData?.dominant_hand || "—"} />
                      <div style={{ textAlign: "right" }}>
                        <button onClick={() => setEditing((e) => ({ ...e, physical: true }))} style={{ ...sx.button, ...sx.buttonSecondary }}>Edit</button>
                      </div>
                    </div>
                  ) : (
                    <div style={sx.grid2}>
                      <LabeledInput label="Height (cm)" type="number" value={physicalData?.height_cm ?? ""} onChange={(v) => setPhysicalData((p: any) => ({ ...p, height_cm: Number(v) }))} />
                      <LabeledInput label="Weight (kg)" type="number" value={physicalData?.weight_kg ?? ""} onChange={(v) => setPhysicalData((p: any) => ({ ...p, weight_kg: Number(v) }))} />
                      <LabeledInput label="Dominant hand" value={physicalData?.dominant_hand ?? ""} onChange={(v) => setPhysicalData((p: any) => ({ ...p, dominant_hand: v }))} placeholder="Right/Left" />
                      <div />
                      <div style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => setEditing((e) => ({ ...e, physical: false }))} style={{ ...sx.button, ...sx.buttonSecondary }}>Cancel</button>
                        <button onClick={savePhysical} style={{ ...sx.button, ...sx.buttonPrimary }}>Save</button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {/* ROW 3 — SHELLS (roadmap) */}
              <div style={sx.row}>
                <ShellCard title="Sports info" sprint="2" />
                <ShellCard title="Experiences" sprint="2" />
                <ShellCard title="Media" sprint="2" />
              </div>
              <div style={sx.row}>
                <ShellCard title="Documents" sprint="3" />
                <ShellCard title="Privacy & Consents" sprint="3" />
                <ShellCard title="Notifications" sprint="3" />
              </div>
            </>
          )}
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

// ====== BASE COMPONENTS ======
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
    "Personal data",
    "Contacts",
    "Physical data",
    "Sports info",
    "Experiences",
    "Media",
    "Documents",
    "Privacy & Consents",
    "Notifications",
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

function LabeledInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label style={sx.label}>
      <span style={sx.labelText}>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={sx.input} />
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
      <span style={{ ...sx.statusBadge, ...(ok ? sx.statusOk : sx.statusWarn) }}>{ok ? "Verified" : "Pending"}</span>
    </div>
  );
}

function ShellCard({ title, sprint }) {
  return (
    <Card style={sx.card}>
      <CardHeader label="Coming soon" title={title} />
      <p style={sx.textMuted}>This section will be enabled in Sprint {sprint}. Layout already prepared.</p>
      <div style={{ marginTop: 12 }}>
        <button style={{ ...sx.button, ...sx.buttonSecondary }}>See roadmap</button>
      </div>
    </Card>
  );
}

function Skeleton() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={sx.skelRow} />
      <div style={sx.skelRow} />
      <div style={sx.skelRow} />
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div style={{ ...sx.cardBase, borderColor: "#F1C0C0", background: "#FFF6F6" }}>
      <strong>Error</strong>
      <div style={{ marginTop: 6 }}>{message}</div>
    </div>
  );
}

// ====== STYLES ======
const sx: any = {
  page: { minHeight: "100vh", background: "#FFFFFF", fontFamily: "Inter, sans-serif", color: "#000", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid #EAEAEA", position: "sticky", top: 0, background: "#FFFFFF", zIndex: 10 },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  logo: { width: 36, height: 36, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.1))" },
  claim: { fontSize: "1.4rem", margin: 0, fontWeight: 800, letterSpacing: "-0.01em", background: "linear-gradient(90deg, #27E3DA, #F7B84E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  shell: { display: "flex", gap: 12, padding: 12, flex: 1, maxWidth: 1280, width: "100%", margin: "0 auto", boxSizing: "border-box" },
  sidebar: { width: 230, border: "1px solid #E0E0E0", borderRadius: 16, padding: 10, background: "#F8F9FA", height: "fit-content", position: "sticky", top: 76, alignSelf: "flex-start" },
  sideBtn: { width: "100%", textAlign: "left", background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 12, padding: "0.6rem 0.75rem", marginBottom: 8, fontWeight: 700, cursor: "pointer", transition: "transform 120ms ease, box-shadow 120ms ease", boxShadow: "0 3px 10px rgba(0,0,0,0.05)" },
  sideBtnActive: { background: "linear-gradient(90deg, #27E3DA, #F7B84E)", color: "#FFFFFF", border: "1px solid transparent" },
  main: { flex: 1 },
  row: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 },
  cardBase: { background: "#F8F9FA", border: "1px solid #E0E0E0", borderRadius: 16, padding: "1rem", boxShadow: "0 6px 18px rgba(0,0,0,0.06)", flex: "1 1 320px" },
  card: { maxWidth: 480 },
  cardWide: { flex: "2 1 520px", maxWidth: 720 },
  badge: { display: "inline-block", fontSize: "0.9rem", fontWeight: 800, padding: "0.3rem 0.7rem", borderRadius: 999, border: "1px solid #D7D7D7", background: "#FFFFFF", marginBottom: 6 },
  title: { margin: "0.2rem 0 0.5rem", fontSize: "1.3rem", fontWeight: 800, background: "linear-gradient(90deg, #27E3DA, #F7B84E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  kvRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid #E8E8E8", background: "#FFFFFF", borderRadius: 10, padding: "0.6rem 0.75rem" },
  kvK: { color: "#666", fontWeight: 700 },
  kvV: { fontWeight: 800 },
  label: { display: "flex", flexDirection: "column", gap: 6 },
  labelText: { fontSize: "0.9rem", color: "#555", fontWeight: 700 },
  input: { width: "100%", border: "1px solid #E0E0E0", borderRadius: 10, padding: "0.6rem 0.7rem", outline: "none" },
  progressWrap: { width: "100%", height: 10, background: "#ECECEC", borderRadius: 999, overflow: "hidden" },
  progressBar: { height: "100%", background: "linear-gradient(90deg, #27E3DA, #F7B84E)" },
  publishRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  button: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0.7rem 0.9rem", borderRadius: 12, fontWeight: 800, textDecoration: "none", transition: "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease", border: "1px solid transparent", boxShadow: "0 3px 10px rgba(0,0,0,0.08)", cursor: "pointer", minWidth: 120 },
  buttonPrimary: { background: "linear-gradient(90deg, #27E3DA, #F7B84E)", color: "#FFFFFF" },
  buttonSecondary: { background: "#FFFFFF", color: "#000000", border: "1px solid #E0E0E0" },
  buttonDisabled: { background: "#F1F1F1", color: "#999", border: "1px solid #E9E9E9", cursor: "not-allowed" },
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
  toast: { position: "fixed", bottom: 16, right: 16, background: "#0E7C66", color: "white", padding: "0.7rem 0.9rem", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 20, fontWeight: 800 },
  toastErr: { background: "#8A1C1C" },
  footer: { padding: "1rem 1.25rem", textAlign: "center", borderTop: "1px solid #EAEAEA" },
  footerText: { margin: 0, color: "#777", fontSize: "0.9rem" },
  skelRow: { height: 140, borderRadius: 16, background: "linear-gradient(90deg,#f2f2f2,#e9e9e9,#f2f2f2)", animation: "pulse 1.6s infinite" },
};

/* =====================
EXPECTED ENDPOINTS (Next.js / Prisma / Supabase)
=======================
GET /api/dashboard → returns:
{
  athlete: {
    id, first_name, last_name, date_of_birth, nationality, native_language,
    additional_language, residence_city, residence_country, phone,
    profile_picture_url, profile_published, completion_percentage
  },
  physical_data: { height_cm, weight_kg, dominant_hand, wingspan_cm },
  contacts_verification: { email_verified, phone_verified, phone_number }
}

PATCH /api/athlete/:id → accepts: { residence_city?, residence_country?, phone?, profile_published? }
PUT   /api/physical-data → accepts: { athlete_id, height_cm?, weight_kg?, dominant_hand? }
POST  /api/verify/phone/send-otp  → { phone }
POST  /api/verify/phone/check-otp → { code, phone }
*/

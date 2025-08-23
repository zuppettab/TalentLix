// pages/voice-otp.js
// Unica pagina: UI + chiamate a Twilio Verify (voice) dal server via getServerSideProps.
// Nessun DB, nessuna API route, nessuna env. SOLO per test (le chiavi sono nel file!).
// Consiglio: repo privato o subaccount Twilio temporaneo.

export default function VoiceOtpPage({ initialPhone = '', statusMsg = '', approved = null }) {
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h2 style={{marginTop:0}}>Voice OTP Test (Twilio Verify)</h2>

        {/* Form invio chiamata */}
        <form method="GET" style={{marginBottom:12}}>
          <div style={s.row}>
            <label style={s.label}>Telefono (E.164)</label>
            <input
              name="phone"
              defaultValue={initialPhone}
              placeholder="+393401234567"
              pattern="^\+[1-9]\d{6,14}$"
              required
              style={s.input}
            />
            <input type="hidden" name="action" value="send" />
          </div>
          <button type="submit" style={s.btn}>Chiama e leggi codice</button>
          <div style={{fontSize:12, color:'#777', marginTop:6}}>
            Trial Twilio: puoi chiamare solo numeri “Verified Caller IDs”. Formato E.164 obbligatorio.
          </div>
        </form>

        {/* Form verifica codice */}
        <form method="GET">
          <input type="hidden" name="phone" value={initialPhone} />
          <input type="hidden" name="action" value="check" />
          <div style={s.row}>
            <label style={s.label}>Codice (6 cifre)</label>
            <input
              name="code"
              placeholder="------"
              inputMode="numeric"
              maxLength={8}
              pattern="^\d{4,8}$"
              required
              style={s.input}
            />
          </div>
          <button type="submit" style={s.btn}>Verifica codice</button>
        </form>

        {statusMsg ? <p style={{marginTop:14, color: approved===true ? '#0a0' : '#333'}}>{statusMsg}</p> : null}
      </div>
    </div>
  );
}

const s = {
  wrap: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f6f7f9', padding:'24px' },
  card: { width:'100%', maxWidth:520, background:'#fff', border:'1px solid #eee', borderRadius:12, padding:20, boxShadow:'0 6px 18px rgba(0,0,0,0.06)' },
  row: { display:'flex', flexDirection:'column', gap:6, marginBottom:12 },
  label: { fontSize:14, color:'#555', fontWeight:600 },
  input: { height:44, border:'1px solid #ccc', borderRadius:8, padding:'0 12px', fontSize:16 },
  btn: { height:44, border:'none', borderRadius:8, background:'linear-gradient(90deg,#27E3DA,#F7B84E)', color:'#fff', fontWeight:700, cursor:'pointer' },
};

// ---------- SERVER SIDE (Twilio calls) ----------
export async function getServerSideProps(ctx) {
  const query = ctx.query || {};
  const action = (query.action || '').toString();
  const phone  = (query.phone  || '').toString().trim();
  const code   = (query.code   || '').toString().trim();

  let statusMsg = '';
  let approved = null;

  // ⛔️ Metti qui le TUE credenziali Twilio (solo test!)
  const TWILIO_ACCOUNT_SID = 'AC4d924fcc26814702d0aa1f7c275ccbd6';
  const TWILIO_AUTH_TOKEN  = '8697c18cc42e6155f3ceb707392f120a';
  const TWILIO_VERIFY_SID  = 'MG806d198c78ebc16cc832a5a0bd679e4e';

  const isE164 = (p) => /^\+[1-9]\d{6,14}$/.test(p);
  const basicAuth = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  try {
    if (action === 'send') {
      if (!isE164(phone)) {
        statusMsg = 'Inserisci numero valido in formato E.164 (es. +393401234567).';
      } else {
        const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SID)}/Verifications`;
        const body = new URLSearchParams({ To: phone, Channel: 'call' });
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': basicAuth, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body
        });
        const j = await safeJson(r);
        if (!r.ok) throw new Error(j?.message || `Twilio HTTP ${r.status}`);
        statusMsg = 'Chiamata inviata. Rispondi e ascolta il codice a 6 cifre.';
      }
    } else if (action === 'check') {
      if (!isE164(phone)) {
        statusMsg = 'Telefono non valido.';
      } else if (!/^\d{4,8}$/.test(code)) {
        statusMsg = 'Codice non valido (usa 6 cifre).';
      } else {
        const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SID)}/VerificationCheck`;
        const body = new URLSearchParams({ To: phone, Code: code });
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': basicAuth, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body
        });
        const j = await safeJson(r);
        if (!r.ok) throw new Error(j?.message || `Twilio HTTP ${r.status}`);
        approved = j?.status === 'approved';
        statusMsg = approved ? '✅ Numero verificato correttamente!' : 'Codice errato o scaduto.';
      }
    }
  } catch (e) {
    statusMsg = 'Errore: ' + (e?.message || String(e));
  }

  return { props: { initialPhone: phone, statusMsg, approved } };
}

async function safeJson(resp) {
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { message: text }; }
}

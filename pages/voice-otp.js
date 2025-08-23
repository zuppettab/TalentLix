// pages/voice-otp.js
// Single Next.js page: UI + server-side calls to Twilio Verify (Voice).
// No env vars. No API routes. No DB. Credentials are inline (for testing only).

/** >>> REPLACE WITH YOUR REAL TWILIO CREDENTIALS <<< **/
const TWILIO_ACCOUNT_SID = 'AC4d924fcc26814702d0aa1f7c275ccbd6';
const TWILIO_AUTH_TOKEN  = '5989f810afbdada3015db4ab592403e5';
const TWILIO_VERIFY_SID  = ' VA6f5779c66742d2c6ee00c39e1356ada0';

export default function VoiceOtpPage({ initialPhone = '', statusMsg = '', approved = null, debug = null }) {
  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <h1 style={{marginTop:0}}>Voice OTP Test (Twilio Verify)</h1>

        {/* SEND CALL */}
        <form method="GET" style={{marginBottom:16}}>
          <div style={S.row}>
            <label style={S.label}>Phone (E.164)</label>
            <input
              name="phone"
              defaultValue={initialPhone}
              placeholder="+393401234567"
              autoComplete="tel"
              inputMode="tel"
              required
              style={S.input}
            />
            <input type="hidden" name="action" value="send" />
          </div>
          <button type="submit" style={S.btn}>Call me and read the code</button>
          <div style={S.hint}>
            Make sure your Verify Service (<code>VA…</code>) has the <b>Voice</b> channel enabled and Italy allowed in Geo/Dialing permissions.
          </div>
        </form>

        {/* VERIFY CODE */}
        <form method="GET" style={{marginBottom:8}}>
          <input type="hidden" name="phone" value={initialPhone} />
          <input type="hidden" name="action" value="check" />
          <div style={S.row}>
            <label style={S.label}>Code (4–10 digits)</label>
            <input
              name="code"
              placeholder="------"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              required
              style={S.input}
            />
          </div>
          <button type="submit" style={S.btn}>Verify code</button>
        </form>

        {statusMsg ? (
          <p style={{marginTop:14, color: approved === true ? '#0a0' : '#333'}}>{statusMsg}</p>
        ) : null}

        {debug ? (
          <details style={{marginTop:16}}>
            <summary style={{cursor:'pointer', fontWeight:700}}>Debug (Twilio response)</summary>
            <pre style={S.debug}>{JSON.stringify(debug, null, 2)}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

const S = {
  wrap: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f3f5f7', padding:'24px' },
  card: { width:'100%', maxWidth:640, background:'#fff', border:'1px solid #eee', borderRadius:16, padding:'24px', boxShadow:'0 8px 20px rgba(0,0,0,.06)' },
  row: { display:'flex', flexDirection:'column', gap:6, marginBottom:12 },
  label: { fontSize:15, color:'#444', fontWeight:700 },
  input: { height:48, border:'2px solid #111', borderRadius:12, padding:'0 14px', fontSize:18 },
  btn: { height:46, border:'none', borderRadius:10, background:'linear-gradient(90deg,#27E3DA,#F7B84E)', color:'#fff', fontWeight:800, cursor:'pointer', padding:'0 16px' },
  hint: { fontSize:12, color:'#777', marginTop:6 },
  debug: { marginTop:12, padding:12, background:'#fafafa', border:'1px solid #eee', borderRadius:8, fontSize:12, color:'#333', maxHeight:280, overflow:'auto' },
};

// ---------- SERVER SIDE (Twilio calls, with server-side sanitization) ----------
export async function getServerSideProps(ctx) {
  const q = ctx.query || {};
  const action   = String(q.action || '');
  const rawPhone = String(q.phone  || '');
  const rawCode  = String(q.code   || '');

  // Sanitize (server-side)
  const phone = rawPhone.replace(/\s+/g, '').trim(); // remove spaces
  const code  = rawCode.replace(/\D/g, '');          // keep digits only

  let statusMsg = '';
  let approved = null;
  let debug = null;

  const isE164 = (p) => /^\+[1-9]\d{6,14}$/.test(p);
  const authHeader = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  // Helper to POST application/x-www-form-urlencoded to Twilio Verify
  async function twilioPost(url, params) {
    const body = new URLSearchParams(params);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    });
    const text = await resp.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: resp.ok, status: resp.status, json };
  }

  try {
    if (action === 'send') {
      if (!isE164(phone)) {
        statusMsg = 'Enter a valid E.164 number (e.g. +393401234567).';
      } else {
        const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SID)}/Verifications`;
        const r = await twilioPost(url, { To: phone, Channel: 'call' }); // Voice OTP
        debug = { when: 'send', httpStatus: r.status, twilio: r.json };
        if (!r.ok) {
          statusMsg = `Error: ${r.json?.message || 'Twilio error'}`;
        } else {
          statusMsg = 'Call sent. Answer and listen to the 6-digit code.';
        }
      }
    }

    if (action === 'check') {
      if (!isE164(phone)) {
        statusMsg = 'Phone is invalid.';
      } else if (code.length < 4 || code.length > 10) {
        statusMsg = 'Code is invalid (4–10 digits).';
      } else {
        const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SID)}/VerificationCheck`;
        const r = await twilioPost(url, { To: phone, Code: code });
        debug = { when: 'check', httpStatus: r.status, twilio: r.json };
        if (!r.ok) {
          statusMsg = `Error: ${r.json?.message || 'Twilio error'}`;
        } else {
          approved = r.json?.status === 'approved';
          statusMsg = approved ? '✅ Verified successfully.' : 'Code is wrong or expired.';
        }
      }
    }
  } catch (e) {
    statusMsg = 'Error: ' + (e?.message || String(e));
  }

  return { props: { initialPhone: phone, statusMsg, approved, debug } };
}

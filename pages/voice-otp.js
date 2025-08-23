// pages/voice-otp.js
// Single page: UI + Twilio Verify (voice) calls from the server (SSR).
// No env, no API routes, no DB. For testing only — your Twilio credentials are in this file.

/** >>>> PUT YOUR TWILIO CREDENTIALS HERE (REAL VALUES) <<<< **/
  const TWILIO_ACCOUNT_SID = 'AC4d924fcc26814702d0aa1f7c275ccbd6';
  const TWILIO_AUTH_TOKEN  = '8697c18cc42e6155f3ceb707392f120a';
  const TWILIO_VERIFY_SID  = 'MG806d198c78ebc16cc832a5a0bd679e4e';

export default function VoiceOtpPage({ initialPhone = '', statusMsg = '', approved = null, debug = null }) {
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h1 style={{marginTop:0}}>Voice OTP Test (Twilio Verify)</h1>

        <form method="GET" style={{marginBottom:16}}>
          <div style={s.row}>
            <label style={s.label}>Phone (E.164)</label>
            <input
              name="phone"
              defaultValue={initialPhone}
              placeholder="+393401234567"
              pattern="^\\+[1-9]\\d{6,14}$"
              required
              style={s.input}
            />
            <input type="hidden" name="action" value="send" />
          </div>
          <button type="submit" style={s.btn}>Call me and read the code</button>
          <div style={s.hint}>Make sure your Verify Service has the <strong>Voice</strong> channel enabled.</div>
        </form>

        <form method="GET" style={{marginBottom:8}}>
          <input type="hidden" name="phone" value={initialPhone} />
          <input type="hidden" name="action" value="check" />
          <div style={s.row}>
            <label style={s.label}>Code (6 digits)</label>
            <input
              name="code"
              placeholder="------"
              inputMode="numeric"
              maxLength={8}
              pattern="^\\d{4,8}$"
              required
              style={s.input}
            />
          </div>
          <button type="submit" style={s.btn}>Verify code</button>
        </form>

        {statusMsg ? (
          <p style={{marginTop:14, color: approved === true ? '#0a0' : '#333'}}>{statusMsg}</p>
        ) : null}

        {debug ? (
          <pre style={s.debug}>
{JSON.stringify(debug, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

const s = {
  wrap: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f3f5f7', padding:'24px' },
  card: { width:'100%', maxWidth:640, background:'#fff', border:'1px solid #eee', borderRadius:16, padding:'24px', boxShadow:'0 8px 20px rgba(0,0,0,.06)' },
  row: { display:'flex', flexDirection:'column', gap:6, marginBottom:12 },
  label: { fontSize:15, color:'#444', fontWeight:700 },
  input: { height:48, border:'2px solid #111', borderRadius:12, padding:'0 14px', fontSize:18 },
  btn: { height:46, border:'none', borderRadius:10, background:'linear-gradient(90deg,#27E3DA,#F7B84E)', color:'#fff', fontWeight:800, cursor:'pointer', padding:'0 16px' },
  hint: { fontSize:12, color:'#777', marginTop:6 },
  debug: { marginTop:16, padding:12, background:'#fafafa', border:'1px solid #eee', borderRadius:8, fontSize:12, color:'#333', maxHeight:260, overflow:'auto' }
};

// ---------- SERVER SIDE ----------
export async function getServerSideProps(ctx) {
  const q = ctx.query || {};
  const action = String(q.action || '');
  const phone  = String(q.phone || '').trim();
  const code   = String(q.code  || '').trim();

  let statusMsg = '';
  let approved = null;
  let debug = null;

  const isE164 = (p) => /^\+[1-9]\d{6,14}$/.test(p);
  const auth = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  const postForm = async (url, params) => {
    const body = new URLSearchParams(params);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    });
    const text = await resp.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: resp.ok, status: resp.status, json };
  };

  try {
    if (action === 'send') {
      if (!isE164(phone)) {
        statusMsg = 'Enter a valid E.164 number (e.g. +393401234567).';
      } else {
        const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SID)}/Verifications`;
        const r = await postForm(url, { To: phone, Channel: 'call' }); // Voice OTP
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
      } else if (!/^\d{4,8}$/.test(code)) {
        statusMsg = 'Code is invalid (use 6 digits).';
      } else {
        const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SID)}/VerificationCheck`;
        const r = await postForm(url, { To: phone, Code: code });
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

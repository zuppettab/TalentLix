// /api/voice-otp.js
// Unico file: serve una pagina HTML e gestisce invio chiamata + verifica codice
// via Twilio Verify REST (senza SDK, nessuna dipendenza, niente DB).

/** @param {import('http').IncomingMessage} req */
/** @param {import('http').ServerResponse} res */
export default async function handler(req, res) {
  // CORS basico per sicurezza (stessa origin va bene)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    return respondJSON(res, 500, { error: 'Missing Twilio env vars' });
  }

  if (req.method === 'GET') {
    // Pagina unica (UI + JS)
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(renderHTML());
  }

  if (req.method !== 'POST') {
    return respondJSON(res, 405, { error: 'Method not allowed' });
  }

  // Leggi JSON body
  const body = await readJson(req).catch(() => null);
  if (!body || typeof body !== 'object') {
    return respondJSON(res, 400, { error: 'Bad JSON' });
  }

  const action = String(body.action || '');
  if (action === 'send') {
    const phone = String(body.phone || '').trim();
    if (!isE164(phone)) return respondJSON(res, 400, { error: 'Invalid phone (use E.164, es. +393401234567)' });

    try {
      const r = await twilioVerifyRequest('Verifications', {
        To: phone,
        Channel: 'call', // chiamata vocale con TTS del codice
      });
      // r.status = 'pending' se ok
      return respondJSON(res, 200, { status: r.status, to: r.to });
    } catch (e) {
      return respondJSON(res, 400, { error: e.message || 'Twilio error' });
    }
  }

  if (action === 'check') {
    const phone = String(body.phone || '').trim();
    const code  = String(body.code  || '').trim();
    if (!isE164(phone)) return respondJSON(res, 400, { error: 'Invalid phone' });
    if (!/^\d{4,8}$/.test(code)) return respondJSON(res, 400, { error: 'Invalid code' });

    try {
      const r = await twilioVerifyRequest('VerificationCheck', {
        To: phone,
        Code: code,
      });
      const approved = r.status === 'approved';
      return respondJSON(res, approved ? 200 : 400, { approved, status: r.status });
    } catch (e) {
      return respondJSON(res, 400, { error: e.message || 'Twilio error' });
    }
  }

  return respondJSON(res, 400, { error: 'Unknown action' });

  // -------- Helpers --------
  function isE164(p) { return /^\+[1-9]\d{6,14}$/.test(p); }

  async function twilioVerifyRequest(kind, params) {
    // kind: 'Verifications' | 'VerificationCheck'
    const base = `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SERVICE_SID)}`;
    const url  = kind === 'Verifications'
      ? `${base}/Verifications`
      : `${base}/VerificationCheck`;

    const auth  = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const body  = new URLSearchParams(params);
    const resp  = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    });

    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { message: text }; }
    if (!resp.ok) {
      const msg = json?.message || `Twilio HTTP ${resp.status}`;
      throw new Error(msg);
    }
    return json;
  }

  function respondJSON(res, status, obj) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); }
        catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  function renderHTML() {
    return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Voice OTP Test (Twilio Verify) — Single File</title>
<style>
  body{background:#f6f7f9;font-family:Inter,system-ui,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:520px;width:100%;background:#fff;border:1px solid #eee;border-radius:12px;padding:20px;box-shadow:0 6px 18px rgba(0,0,0,.06)}
  h2{margin:0 0 12px 0}
  .row{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
  label{font-size:14px;color:#555;font-weight:600}
  input{height:44px;border:1px solid #ccc;border-radius:8px;padding:0 12px;font-size:16px}
  button{height:44px;border:none;border-radius:8px;background:linear-gradient(90deg,#27E3DA,#F7B84E);color:#fff;font-weight:700;cursor:pointer}
  button[disabled]{background:#ccc;cursor:not-allowed}
  #status{margin-top:12px;white-space:pre-wrap;color:#333}
  .hint{font-size:12px;color:#777;margin-top:6px}
</style>
</head>
<body>
  <div class="card">
    <h2>Voice OTP Test (Twilio Verify)</h2>

    <div class="row">
      <label>Telefono (E.164)</label>
      <input id="phone" placeholder="+393401234567" />
      <div class="hint">Trial Twilio: chiama solo numeri verificati nel console Twilio.</div>
    </div>

    <button id="sendBtn" onclick="sendCall()">Chiama e leggi codice</button>

    <div class="row" style="margin-top:12px">
      <label>Codice (6 cifre)</label>
      <input id="code" placeholder="------" inputmode="numeric" maxlength="8" />
    </div>

    <button id="verifyBtn" onclick="verifyCode()">Verifica codice</button>

    <p id="status"></p>
  </div>

<script>
const isE164 = (p)=>/^\\+[1-9]\\d{6,14}$/.test(p);

async function sendCall(){
  const phone = document.getElementById('phone').value.trim();
  const status = document.getElementById('status');
  if(!isE164(phone)){ status.textContent='Inserisci numero in formato E.164 (es. +393401234567)'; return; }
  status.textContent='Chiamo…';
  setDisabled('sendBtn', true);
  try{
    const r = await fetch(window.location.href, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'send', phone })
    });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error || 'Errore invio chiamata');
    status.textContent='Chiamata inviata. Rispondi e ascolta il codice a 6 cifre.';
  }catch(e){
    status.textContent = e.message || String(e);
  }finally{
    setDisabled('sendBtn', false);
  }
}

async function verifyCode(){
  const phone = document.getElementById('phone').value.trim();
  const code  = (document.getElementById('code').value || '').replace(/\\D/g,'');
  const status = document.getElementById('status');
  if(!isE164(phone)){ status.textContent='Telefono non valido'; return; }
  if(!/^\\d{4,8}$/.test(code)){ status.textContent='Codice non valido (usa 6 cifre)'; return; }
  status.textContent='Verifico…';
  setDisabled('verifyBtn', true);
  try{
    const r = await fetch(window.location.href, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'check', phone, code })
    });
    const j = await r.json();
    if(!r.ok || !j.approved) throw new Error(j.error || 'Codice errato o scaduto');
    status.textContent='✅ Numero verificato correttamente!';
  }catch(e){
    status.textContent = e.message || String(e);
  }finally{
    setDisabled('verifyBtn', false);
  }
}

function setDisabled(id, v){ const el = document.getElementById(id); if(el) el.disabled = v; }
</script>
</body>
</html>`;
  }
}

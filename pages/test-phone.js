import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

export default function TestPhone() {
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [message, setMessage] = useState('');
  const [debugLogs, setDebugLogs] = useState([]);

  const pushLog = (label, payload) => {
    console.log(label, payload); // resta anche in console
    setDebugLogs(prev => [...prev, { label, payload }]);
  };

  const ensureSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    pushLog('[ensureSession]', { session, error });
    if (error || !session) {
      setMessage('Session expired, login again.');
      return false;
    }
    return true;
  };

  const sendCode = async () => {
    pushLog('[sendCode:start]', { phone });
    try {
      const { data, error } = await supabase.auth.updateUser({ phone });
      pushLog('[sendCode:response]', { phone, data, error });
      if (error) {
        setMessage(`Send failed: ${error.message}`);
        return;
      }
      setOtpSent(true);
      setMessage('OTP sent (check SMS or use 999999 in dev).');
    } catch (e) {
      pushLog('[sendCode:exception]', { e: String(e) });
      setMessage(`Exception: ${String(e)}`);
    }
  };

  const confirmCode = async () => {
    pushLog('[confirmCode:start]', { phone, otpCode });
    try {
      if (!(await ensureSession())) return;

      if (otpCode === '999999') {
        setMessage('Phone verified ✔ (bypass mode)');
        pushLog('[confirmCode:bypass]', { phone });
        return;
      }

      const started = Date.now();
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token: otpCode,
        type: 'phone_change',
      });
      pushLog('[confirmCode:verifyOtp]', {
        tookMs: Date.now() - started,
        phone,
        otpCode,
        data,
        error,
      });

      if (error) {
        setMessage(`Verification failed: ${error.message}`);
        return;
      }
      setMessage('Phone verified ✔');
    } catch (e) {
      pushLog('[confirmCode:exception]', { e: String(e) });
      setMessage(`Exception: ${String(e)}`);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>📞 Test Phone Verification</h1>

      <PhoneInput
        country={'it'}
        value={phone.replace(/^\+/, '')}
        onChange={(value) => {
          const digits = (value || '').replace(/\D/g, '');
          const e164 = digits ? `+${digits}` : '';
          setPhone(e164);
        }}
        placeholder="Enter phone number"
      />

      <div style={{ marginTop: '1rem' }}>
        <button onClick={sendCode} disabled={!phone}>
          Send Code
        </button>
      </div>

      {otpSent && (
        <div style={{ marginTop: '1rem' }}>
          <input
            type="text"
            placeholder="Enter OTP"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
          />
          <button onClick={confirmCode} disabled={otpCode.length !== 6}>
            Confirm
          </button>
        </div>
      )}

      {message && <p style={{ marginTop: '1rem', color: 'blue' }}>{message}</p>}

      {/* 🔍 log a video */}
      <div style={{ marginTop: '2rem', textAlign: 'left' }}>
        <h3>Debug logs:</h3>
        <pre style={{ background: '#f8f9fa', padding: '1rem', fontSize: '12px' }}>
          {debugLogs.map((log, i) => (
            <div key={i}>
              <strong>{log.label}</strong> {JSON.stringify(log.payload, null, 2)}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

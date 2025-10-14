import { useEffect, useMemo, useRef, useState } from 'react';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { supabase } from '../../utils/supabaseClient';

const COOLDOWN_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_OTP_COOLDOWN || 60);
const OTP_TTL_SECONDS = Number(process.env.NEXT_PUBLIC_PHONE_OTP_TTL || 600);
const MAX_ATTEMPTS = 5;

const onlyDigits = (value = '') => String(value || '').replace(/\D+/g, '');
const formatTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

export default function OperatorPhoneVerificationCard({
  operatorId,
  contact,
  onRefresh,
}) {
  const initialPhoneRef = useRef(onlyDigits(contact?.phone_e164));
  const [phone, setPhone] = useState(() => onlyDigits(contact?.phone_e164));
  const [verifiedAt, setVerifiedAt] = useState(contact?.phone_verified_at || null);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const digits = onlyDigits(contact?.phone_e164);
    initialPhoneRef.current = digits;
    setPhone(digits);
    setVerifiedAt(contact?.phone_verified_at || null);
  }, [contact?.phone_e164, contact?.phone_verified_at]);

  useEffect(() => {
    if (cooldown <= 0) return () => {};
    const timer = setInterval(() => {
      setCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (expiresIn <= 0) return () => {};
    const timer = setInterval(() => {
      setExpiresIn((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresIn]);

  const e164 = useMemo(() => {
    const digits = onlyDigits(phone);
    if (!digits) return '';
    return `+${digits}`;
  }, [phone]);

  const isValidPhone = useMemo(() => {
    if (!e164) return false;
    try {
      return parsePhoneNumberFromString(e164)?.isValid() || false;
    } catch (err) {
      return false;
    }
  }, [e164]);

  const phoneChanged = useMemo(() => {
    return onlyDigits(phone) !== onlyDigits(initialPhoneRef.current || '');
  }, [phone]);

  const otpBtnDisabled = !phoneChanged || !isValidPhone || cooldown > 0 || sending || verifying;
  const codeInputDisabled = !otpSent;
  const confirmDisabled =
    verifying || !otpSent || !otp || attempts >= MAX_ATTEMPTS || expiresIn <= 0 || !isValidPhone || !operatorId;

  const ensureSession = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) {
      setOtpMsg('Session expired. Please sign in again.');
      return false;
    }
    return true;
  };

  const sendCode = async () => {
    try {
      if (!phoneChanged) {
        setOtpMsg('Edit your phone number before requesting a code.');
        return;
      }
      if (!isValidPhone) {
        setOtpMsg('Please enter a valid phone number.');
        return;
      }
      if (cooldown > 0) {
        setOtpMsg(`Please wait ${cooldown}s before requesting a new code.`);
        return;
      }
      if (!(await ensureSession())) return;

      setSending(true);
      const { error } = await supabase.auth.updateUser({ phone: e164 });
      if (error) {
        setOtpMsg(`Failed to request OTP: ${error.message}`);
        return;
      }
      setOtpSent(true);
      setCooldown(COOLDOWN_SECONDS);
      setExpiresIn(OTP_TTL_SECONDS);
      setAttempts(0);
      setOtpMsg('OTP requested. Check your SMS.');
    } catch (err) {
      console.error(err);
      setOtpMsg(`Send error: ${err?.message || String(err)}`);
    } finally {
      setSending(false);
    }
  };

  const confirmCode = async () => {
    try {
      if (!otpSent) {
        setOtpMsg('Request a code first.');
        return;
      }
      if (!otp) {
        setOtpMsg('Please enter the code.');
        return;
      }
      if (expiresIn <= 0) {
        setOtpMsg('The code has expired. Please request a new one.');
        return;
      }
      if (attempts >= MAX_ATTEMPTS) {
        setOtpMsg('Too many attempts. Please request a new code.');
        return;
      }
      if (!operatorId) {
        setOtpMsg('Operator account missing. Please refresh the page.');
        return;
      }
      if (!(await ensureSession())) return;

      setVerifying(true);
      const { error } = await supabase.auth.verifyOtp({
        phone: e164,
        token: otp,
        type: 'phone_change',
      });
      setAttempts((count) => count + 1);
      if (error) {
        setOtpMsg(`Verification error: ${error.message}`);
        return;
      }

      const verifiedIso = new Date().toISOString();
      const upsertPayload = {
        op_id: operatorId,
        phone_e164: e164,
        phone_verified_at: verifiedIso,
      };
      const { error: upsertError } = await supabase
        .from('op_contact')
        .upsert([upsertPayload], { onConflict: 'op_id' });
      if (upsertError) {
        setOtpMsg(`Unable to persist phone: ${upsertError.message}`);
        return;
      }

      initialPhoneRef.current = onlyDigits(e164);
      setPhone(onlyDigits(e164));
      setVerifiedAt(verifiedIso);
      setOtp('');
      setOtpSent(false);
      setCooldown(0);
      setExpiresIn(0);
      setAttempts(0);
      setOtpMsg('Phone verified ✓');
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
      setOtpMsg(`Verification error: ${err?.message || String(err)}`);
    } finally {
      setVerifying(false);
    }
  };

  const verifiedLabel = useMemo(() => {
    if (!verifiedAt) return 'Not verified';
    const ts = formatTimestamp(verifiedAt);
    return ts ? `Verified on ${ts}` : 'Verified';
  }, [verifiedAt]);

  return (
    <div style={styles.fieldWide}>
      <label style={styles.label}>Phone number</label>
      <div style={styles.phoneRow}>
        <div style={styles.phoneInputWrap}>
          <PhoneInput
            country="it"
            value={phone}
            onChange={(value) => {
              setPhone(onlyDigits(value));
              setOtpMsg('');
            }}
            inputStyle={styles.phoneInput}
            buttonStyle={styles.phoneButton}
            containerStyle={{ width: '100%' }}
            specialLabel=""
            disabled={sending || verifying}
          />
        </div>
        <button
          type="button"
          onClick={sendCode}
          disabled={otpBtnDisabled}
          style={otpBtnDisabled ? styles.smallBtnDisabled : styles.smallBtnEnabled}
          title={cooldown > 0 ? `Wait ${cooldown}s` : ''}
        >
          Request code
        </button>
        <input
          type="text"
          maxLength={8}
          placeholder="Code"
          value={otp}
          onChange={(event) => setOtp(event.target.value.trim())}
          disabled={codeInputDisabled}
          style={{
            ...styles.smallInput,
            ...(codeInputDisabled ? styles.smallInputDisabled : null),
          }}
        />
        <button
          type="button"
          onClick={confirmCode}
          disabled={confirmDisabled}
          style={confirmDisabled ? styles.smallBtnDisabled : styles.smallBtnEnabled}
        >
          Confirm
        </button>
      </div>
      <div style={styles.otpMeta}>
        {cooldown > 0 && <span style={styles.metaItem}>Cooldown: {cooldown}s</span>}
        {otpSent && expiresIn > 0 && (
          <span style={styles.metaItem}>Expires in: {expiresIn}s</span>
        )}
        <span
          style={{
            ...styles.metaItem,
            color: verifiedAt ? '#166534' : '#B91C1C',
            fontWeight: 600,
          }}
        >
          {verifiedLabel}
        </span>
      </div>
      {otpMsg && <div style={styles.otpMsg}>{otpMsg}</div>}
    </div>
  );
}

const styles = {
  fieldWide: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#64748B',
  },
  phoneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  phoneInputWrap: {
    flex: '1 1 260px',
    minWidth: 240,
  },
  phoneInput: {
    width: '100%',
    height: 40,
    borderRadius: 8,
    border: '1px solid #E0E0E0',
    fontSize: 14,
  },
  phoneButton: {
    border: '1px solid #E0E0E0',
    borderRadius: '8px 0 0 8px',
  },
  smallInput: {
    height: 38,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid #E0E0E0',
    minWidth: 110,
  },
  smallInputDisabled: {
    background: '#F7F7F7',
    color: '#999',
  },
  smallBtnEnabled: {
    height: 38,
    padding: '0 12px',
    borderRadius: 8,
    fontWeight: 600,
    minWidth: 120,
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
  },
  smallBtnDisabled: {
    height: 38,
    padding: '0 12px',
    borderRadius: 8,
    fontWeight: 600,
    minWidth: 120,
    background: '#EEE',
    color: '#999',
    border: '1px solid #E0E0E0',
    cursor: 'not-allowed',
  },
  otpMeta: {
    display: 'flex',
    gap: 12,
    marginTop: 6,
    fontSize: 12,
    color: '#666',
    flexWrap: 'wrap',
  },
  metaItem: {
    whiteSpace: 'nowrap',
  },
  otpMsg: {
    marginTop: 6,
    fontSize: 12,
    color: '#666',
  },
};

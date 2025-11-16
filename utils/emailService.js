import nodemailer from 'nodemailer';
import { createHttpError } from './internalEnablerApi';

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
};

const coercePort = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const normalizeAddressList = (value) => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const filtered = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : null))
      .filter(Boolean);
    return filtered.length ? filtered.join(', ') : undefined;
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }
  return undefined;
};

const resolveTransportConfig = () => {
  const host = process.env.SMTP_HOST;
  const port = coercePort(process.env.SMTP_PORT);
  const secure = parseBoolean(process.env.SMTP_SECURE);
  const authUser = process.env.EMAIL_SMTP_USERNAME;
  const authPass = process.env.EMAIL_SMTP_PASSWORD;
  const sender = process.env.EMAIL_SENDER;

  if (!host || !authUser || !authPass || !sender) {
    const missing = [];
    if (!host) missing.push('SMTP_HOST');
    if (!authUser) missing.push('EMAIL_SMTP_USERNAME');
    if (!authPass) missing.push('EMAIL_SMTP_PASSWORD');
    if (!sender) missing.push('EMAIL_SENDER');
    const error = createHttpError(500, 'Email service is not configured.');
    error.details = missing.length
      ? `Missing environment variables: ${missing.join(', ')}.`
      : 'SMTP configuration is incomplete.';
    throw error;
  }

  return {
    host,
    port: port ?? 587,
    secure: secure ?? false,
    auth: {
      user: authUser,
      pass: authPass,
    },
    defaults: {
      from: sender,
    },
  };
};

let transporterPromise = null;
let defaultSenderAddress = null;

const getTransporter = async () => {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve().then(() => {
      const config = resolveTransportConfig();
      const { defaults, ...transportConfig } = config;
      const transporter = nodemailer.createTransport(transportConfig);
      defaultSenderAddress = defaults?.from ?? null;
      if (defaults?.from) {
        transporter.use('compile', (mail, done) => {
          if (!mail.data.from) {
            mail.data.from = defaults.from;
          }
          done();
        });
      }
      return transporter;
    });
  }

  return transporterPromise;
};

const collectEnvelopeRecipients = (...lists) => {
  const recipients = lists
    .filter(Boolean)
    .flatMap((entry) =>
      String(entry)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    );

  return recipients.length ? recipients : undefined;
};

export const sendEmail = async ({
  to,
  cc,
  bcc,
  subject,
  text,
  html,
  replyTo,
  headers,
  metadata,
} = {}) => {
  const transporter = await getTransporter();

  const normalizedTo = normalizeAddressList(to);
  if (!normalizedTo) {
    throw createHttpError(400, 'Recipient address is required.');
  }

  if (!subject || typeof subject !== 'string') {
    throw createHttpError(400, 'Email subject is required.');
  }

  if (!text && !html) {
    throw createHttpError(400, 'Email body is required. Provide text or HTML content.');
  }

  const mailOptions = {
    to: normalizedTo,
    subject,
    text: typeof text === 'string' ? text : undefined,
    html: typeof html === 'string' ? html : undefined,
  };

  if (defaultSenderAddress) {
    mailOptions.from = defaultSenderAddress;
  }

  const normalizedCc = normalizeAddressList(cc);
  if (normalizedCc) {
    mailOptions.cc = normalizedCc;
  }

  const normalizedBcc = normalizeAddressList(bcc);
  if (normalizedBcc) {
    mailOptions.bcc = normalizedBcc;
  }

  const normalizedReplyTo = normalizeAddressList(replyTo);
  if (normalizedReplyTo) {
    mailOptions.replyTo = normalizedReplyTo;
  }

  if (metadata && typeof metadata === 'object') {
    mailOptions.headers = {
      ...headers,
      'X-TalentLix-Metadata': Buffer.from(JSON.stringify(metadata)).toString('base64'),
    };
  } else if (headers && typeof headers === 'object') {
    mailOptions.headers = headers;
  }

  const envelopeRecipients = collectEnvelopeRecipients(
    normalizedTo,
    mailOptions.cc,
    mailOptions.bcc
  );
  if (defaultSenderAddress && envelopeRecipients) {
    mailOptions.envelope = {
      from: defaultSenderAddress,
      to: envelopeRecipients,
    };
  }

  const info = await transporter.sendMail(mailOptions);

  return {
    messageId: info?.messageId ?? null,
    accepted: Array.isArray(info?.accepted) ? info.accepted : [],
    rejected: Array.isArray(info?.rejected) ? info.rejected : [],
    response: info?.response ?? null,
    envelope: info?.envelope ?? null,
  };
};

export default sendEmail;

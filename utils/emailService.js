import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { createHttpError } from './internalEnablerApi';

const getAssetAbsolutePath = (...segments) => path.join(process.cwd(), ...segments);

let inlineLogoDataUri;

const getInlineLogoDataUri = () => {
  if (typeof inlineLogoDataUri === 'string') {
    return inlineLogoDataUri;
  }

  try {
    const assetPath = getAssetAbsolutePath('public', 'logo-talentlix.png');
    const buffer = fs.readFileSync(assetPath);
    inlineLogoDataUri = `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn('[emailService] Unable to inline TalentLix logo asset for emails', error);
    inlineLogoDataUri = '';
  }

  return inlineLogoDataUri;
};

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const convertTextToHtml = (value) => {
  if (!value || typeof value !== 'string') return '';

  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px 0; line-height:1.6;">${escapeHtml(paragraph).replace(
          /\n/g,
          '<br />'
        )}</p>`
    )
    .join('');
};

const extractBodyContent = (html) => {
  if (!html || typeof html !== 'string') return '';
  const trimmed = html.trim();
  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    return bodyMatch[1].trim();
  }
  return trimmed;
};

const buildTalentLixTemplate = (contentHtml, subject = 'TalentLix update') => {
  const logoUri = getInlineLogoDataUri();
  const year = new Date().getFullYear();
  const websiteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://talentlix.com';
  const innerContent = contentHtml || '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:24px; background-color:#F5F7FB; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#0F172A;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px; width:100%; background:#FFFFFF; border-radius:24px; padding:32px 32px 24px; box-shadow:0 10px 40px rgba(15,23,42,0.08); border:1px solid #E5E7EB;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                ${
                  logoUri
                    ? `<img src="${logoUri}" alt="TalentLix" width="96" height="96" style="display:block; margin:0 auto;" />`
                    : '<strong style="font-size:20px; color:#0EA5E9;">TalentLix</strong>'
                }
              </td>
            </tr>
            <tr>
              <td style="font-size:15px; line-height:1.7; color:#111827;">
                ${innerContent}
              </td>
            </tr>
            <tr>
              <td style="padding-top:32px;">
                <div style="height:1px; width:100%; background:#E5E7EB;"></div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:16px; font-size:12px; color:#6B7280; line-height:1.6;">
                © ${year} TalentLix. All rights reserved.<br />
                <a href="${websiteUrl}" style="color:#0EA5E9; text-decoration:none;">Visit our website</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const applyTalentLixBranding = (mailOptions) => {
  const rawHtml = mailOptions.html || convertTextToHtml(mailOptions.text || '');
  const bodyHtml = extractBodyContent(rawHtml);
  if (!bodyHtml) {
    return mailOptions;
  }

  mailOptions.html = buildTalentLixTemplate(bodyHtml, mailOptions.subject || 'TalentLix update');
  return mailOptions;
};

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

const RESERVED_HEADER_NAMES = new Set([
  'from',
  'sender',
  'reply-to',
  'reply_to',
  'replyto',
  'return-path',
  'return_path',
  'returnpath',
  'x-sender',
  'x-from',
  'x-envelope-from',
  'envelope-from',
]);

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

const createBaseMailOptions = ({ subject, text, html }) => {
  if (!subject || typeof subject !== 'string') {
    throw createHttpError(400, 'Email subject is required.');
  }

  if (!text && !html) {
    throw createHttpError(400, 'Email body is required. Provide text or HTML content.');
  }

  return {
    subject,
    text: typeof text === 'string' ? text : undefined,
    html: typeof html === 'string' ? html : undefined,
  };
};

const applyRecipientLists = (mailOptions, { to, cc, bcc, replyTo }) => {
  const normalizedTo = normalizeAddressList(to);
  if (!normalizedTo) {
    throw createHttpError(400, 'Recipient address is required.');
  }

  mailOptions.to = normalizedTo;

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

  return mailOptions;
};

const mergeMetadataHeaders = (mailOptions, { metadata }) => {
  if (!metadata || typeof metadata !== 'object') {
    return mailOptions;
  }

  const encodedMetadata = Buffer.from(JSON.stringify(metadata)).toString('base64');
  mailOptions.headers = {
    ...(mailOptions.headers || {}),
    'X-TalentLix-Metadata': encodedMetadata,
  };

  return mailOptions;
};

const sanitizeHeaders = (headers = {}) =>
  Object.entries(headers).reduce((acc, [key, value]) => {
    if (!key) return acc;
    const normalized = key.trim().toLowerCase();
    if (RESERVED_HEADER_NAMES.has(normalized)) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});

const attachHeaders = (mailOptions, { headers }) => {
  if (!headers || typeof headers !== 'object') {
    return mailOptions;
  }

  const safeHeaders = sanitizeHeaders(headers);
  if (!Object.keys(safeHeaders).length) {
    return mailOptions;
  }

  const existingHeaders = mailOptions.headers || {};
  const mergedHeaders = { ...existingHeaders };
  Object.entries(safeHeaders).forEach(([key, value]) => {
    if (
      key &&
      key.trim().toLowerCase() === 'x-talentlix-metadata' &&
      Object.prototype.hasOwnProperty.call(existingHeaders, 'X-TalentLix-Metadata')
    ) {
      return;
    }
    mergedHeaders[key] = value;
  });

  mailOptions.headers = mergedHeaders;

  return mailOptions;
};

const enforceSenderIdentity = (mailOptions, envelopeRecipients) => {
  const identity = defaultSenderAddress || process.env.EMAIL_SENDER;
  if (!identity) {
    return mailOptions;
  }

  mailOptions.from = identity;
  mailOptions.sender = identity;
  mailOptions.replyTo = identity;

  mailOptions.headers = {
    ...(mailOptions.headers || {}),
    Sender: identity,
  };

  if (envelopeRecipients?.length) {
    mailOptions.envelope = {
      ...(mailOptions.envelope || {}),
      to: envelopeRecipients,
    };
  }

  mailOptions.envelope = {
    ...(mailOptions.envelope || {}),
    from: identity,
  };

  return mailOptions;
};

const finalizeMailOptions = (mailOptions) => {
  const envelopeRecipients = collectEnvelopeRecipients(
    mailOptions.to,
    mailOptions.cc,
    mailOptions.bcc
  );

  return enforceSenderIdentity(mailOptions, envelopeRecipients);
};

export const sendEmail = async (payload = {}) => {
  const transporter = await getTransporter();

  const baseOptions = createBaseMailOptions(payload);
  applyRecipientLists(baseOptions, payload);
  mergeMetadataHeaders(baseOptions, payload);
  attachHeaders(baseOptions, payload);
  applyTalentLixBranding(baseOptions);
  const mailOptions = finalizeMailOptions(baseOptions);

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

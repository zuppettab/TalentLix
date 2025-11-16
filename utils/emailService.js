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
  const inlineLogo = getInlineLogoDataUri();
  const fallbackLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL || 'https://www.talentlix.com/logo-talentlix.png';
  const logoSrc = inlineLogo || fallbackLogoUrl;
  const year = new Date().getFullYear();
  const websiteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.talentlix.com';
  const innerContent = contentHtml || '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial,Helvetica,sans-serif; color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f6f8">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:600px; max-width:100%; border-radius:16px; overflow:hidden; box-shadow:0 4px 14px rgba(0,0,0,0.08);">
            <tr>
              <td align="center" style="padding:36px 24px;background:#ffffff;">
                ${
                  logoSrc
                    ? `<img src="${logoSrc}" alt="TalentLix" width="150" style="display:block;border:0;outline:none;text-decoration:none;" />`
                    : '<strong style="font-size:20px; color:#19BDB6;">TalentLix</strong>'
                }
              </td>
            </tr>
            <tr>
              <td style="padding:36px 50px;color:#222;font-size:16px;line-height:1.6;">
                ${innerContent}
              </td>
            </tr>
            <tr>
              <td align="center" bgcolor="#f8f9fa" style="padding:20px;font-size:13px;color:#888;">
                <p style="margin:4px 0;">© ${year} <strong>TalentLix</strong>. All rights reserved.</p>
                <p style="margin:4px 0;"><a href="${websiteUrl}" style="color:#27E3DA;text-decoration:none;">Visit our website</a></p>
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

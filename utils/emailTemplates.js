const BRAND = {
  background: '#f4f6f8',
  card: '#ffffff',
  border: '#e2e8f0',
  primaryText: '#222222',
  secondaryText: '#555555',
  accentText: '#6b6b6b',
  gradientStart: '#27E3DA',
  gradientEnd: '#F7B84E',
  gradientBorder: '#19BDB6',
  buttonShadow: '0 4px 10px rgba(0, 0, 0, 0.12)',
  footerBackground: '#f8f9fa',
};

const LOGO_URL = 'https://www.talentlix.com/logo-talentlix.png';
const DEFAULT_FOOTER_LINK = {
  label: 'Visit our website',
  url: 'https://www.talentlix.com',
};
const DEFAULT_PREVIEW_TEXT = 'Stay connected with TalentLix.';

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildPlainText = (lines = []) =>
  lines
    .filter((line) => typeof line === 'string' && line.trim().length)
    .map((line) => line.trim())
    .join('\n\n');

const normalizeParagraphs = (content = []) => {
  const items = Array.isArray(content) ? content : [content];
  return items
    .filter(Boolean)
    .map(
      (item) =>
        `<p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:${BRAND.primaryText};">${item}</p>`
    )
    .join('');
};

const buildButtonHtml = (label, url) => {
  if (!label || !url) return '';
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `
    <table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" style="margin:30px auto;">
      <tr>
        <td align="center">
          <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}"
              style="height:54px;v-text-anchor:middle;width:320px;" arcsize="14%" strokecolor="${BRAND.gradientBorder}" fill="t">
              <v:fill type="gradient" angle="90" color="${BRAND.gradientStart}" color2="${BRAND.gradientEnd}"/>
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;text-decoration:none;">
                ${safeLabel}
              </center>
            </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
            <a href="${safeUrl}"
               style="display:inline-block;text-decoration:none;padding:16px 36px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;letter-spacing:0.2px;color:#ffffff;background:linear-gradient(90deg,${BRAND.gradientStart},${BRAND.gradientEnd});border-radius:12px;border:1px solid ${BRAND.gradientBorder};box-shadow:${BRAND.buttonShadow};">
              ${safeLabel}
            </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
  `;
};

const buildFallbackText = (text, url) => {
  if (!text || !url) return '';
  return `
    <p style="margin:0 0 24px 0;font-size:13px;color:${BRAND.accentText};">
      ${text.replace('{{ link }}', `<a href="${escapeHtml(url)}" style="color:${BRAND.gradientStart};text-decoration:none;">${escapeHtml(url)}</a>`)}
    </p>
  `;
};

export const renderTalentLixEmailTemplate = ({
  title,
  paragraphs,
  highlight,
  buttonLabel,
  buttonUrl,
  fallbackText,
  disclaimer,
  footerLink = DEFAULT_FOOTER_LINK,
  previewText = DEFAULT_PREVIEW_TEXT,
} = {}) => {
  const safeTitle = title ? escapeHtml(title) : 'TalentLix notification';
  const safeHighlight = highlight
    ? `<p style="margin:0 0 24px 0;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:${BRAND.gradientBorder};font-weight:700;">${highlight}</p>`
    : '';

  const body = normalizeParagraphs(paragraphs);
  const button = buildButtonHtml(buttonLabel, buttonUrl);
  const fallback = buildFallbackText(fallbackText, buttonUrl);
  const footerLinkHtml = footerLink?.url
    ? `<a href="${escapeHtml(footerLink.url)}" style="color:${BRAND.gradientStart};text-decoration:none;">${escapeHtml(
        footerLink.label || DEFAULT_FOOTER_LINK.label
      )}</a>`
    : DEFAULT_FOOTER_LINK.label;

  const disclaimerHtml = disclaimer
    ? `<p style="margin:0;color:${BRAND.secondaryText};font-size:14px;">${disclaimer}</p>`
    : '';

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${safeTitle} - TalentLix</title>
    <meta name="x-apple-disable-message-reformatting">
  </head>
  <body style="margin:0; padding:0; background-color:${BRAND.background};">
    <div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${escapeHtml(previewText)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${BRAND.background}">
      <tr>
        <td align="center" style="padding:40px 0;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="${BRAND.card}" style="width:600px;max-width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.08);">
            <tr>
              <td align="center" style="padding:36px 24px;background:#ffffff;">
                <img src="${LOGO_URL}" alt="TalentLix" width="150" style="display:block;border:0;outline:none;text-decoration:none;">
              </td>
            </tr>
            <tr>
              <td style="padding:36px 50px;color:${BRAND.primaryText};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">
                ${safeHighlight}
                <h1 style="margin:0 0 12px 0;font-size:22px;color:#000;font-weight:700;">${safeTitle}</h1>
                ${body}
                ${button}
                ${fallback}
                ${disclaimerHtml}
              </td>
            </tr>
            <tr>
              <td align="center" bgcolor="${BRAND.footerBackground}" style="padding:20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#888;">
                <p style="margin:4px 0;">© ${new Date().getFullYear()} <strong>TalentLix</strong>. All rights reserved.</p>
                <p style="margin:4px 0;">${footerLinkHtml}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
};

const DEFAULT_BASE_URL = 'https://app.talentlix.com';

const resolveUrl = (url) => {
  if (typeof url === 'string' && url.trim()) return url.trim();
  return DEFAULT_BASE_URL;
};

export const buildTalentLixConfirmationEmail = ({ confirmationUrl, userName }) => {
  const url = resolveUrl(confirmationUrl);
  const greeting = userName ? `Hi ${escapeHtml(userName)},` : 'Hi there,';
  const subject = 'Confirm your email address';
  const previewText = 'Activate your TalentLix account in one tap.';
  const html = renderTalentLixEmailTemplate({
    title: subject,
    paragraphs: [
      greeting,
      'Thank you for joining <strong>TalentLix</strong>! Please confirm your email address to complete your registration and activate your account.',
      'Once confirmed, you can start exploring tailored training insights, opportunities and resources.'
    ],
    buttonLabel: 'Confirm Email',
    buttonUrl: url,
    fallbackText: 'If the button isn’t visible, copy and paste this link into your browser: {{ link }}',
    disclaimer: 'If you didn’t create a TalentLix account, you can safely ignore this message.',
    previewText,
  });

  const text = buildPlainText([
    greeting,
    'Thank you for joining TalentLix. Confirm your email address to activate your account.',
    `Confirmation link: ${url}`,
    'If you didn’t create a TalentLix account, you can ignore this message.',
  ]);

  return { subject, html, text, previewText };
};

export const buildTalentLixPasswordResetEmail = ({ resetUrl, userName, expiresInMinutes = 30 }) => {
  const url = resolveUrl(resetUrl);
  const subject = 'Reset your TalentLix password';
  const previewText = 'Create a new password and get back to TalentLix.';
  const greeting = userName ? `Hi ${escapeHtml(userName)},` : 'Hi there,';
  const expirationCopy = expiresInMinutes
    ? `The link below will expire in about ${expiresInMinutes} minutes.`
    : 'The link below is time limited.';

  const html = renderTalentLixEmailTemplate({
    title: subject,
    highlight: 'Security alert',
    paragraphs: [
      greeting,
      'We received a request to reset your TalentLix password.',
      `${expirationCopy} If you’re ready, click the button to choose a new password and secure your account.`,
    ],
    buttonLabel: 'Reset Password',
    buttonUrl: url,
    fallbackText: 'If the button isn’t visible, copy and paste this link into your browser: {{ link }}',
    disclaimer: 'If you didn’t request a password reset, you can safely ignore this email.',
    previewText,
  });

  const text = buildPlainText([
    greeting,
    'We received a request to reset your TalentLix password.',
    expirationCopy,
    `Reset link: ${url}`,
    'If you didn’t request the reset, you can ignore this email.',
  ]);

  return { subject, html, text, previewText };
};

export const buildTalentLixMagicLinkEmail = ({ magicLinkUrl, userName }) => {
  const url = resolveUrl(magicLinkUrl);
  const subject = 'Sign in to TalentLix';
  const previewText = 'Use this secure link to continue in TalentLix.';
  const greeting = userName ? `Hi ${escapeHtml(userName)},` : 'Hi there,';

  const html = renderTalentLixEmailTemplate({
    title: subject,
    paragraphs: [
      greeting,
      'Here is your secure link to get back into <strong>TalentLix</strong>. The link works once and expires shortly to keep your account safe.',
    ],
    buttonLabel: 'Open TalentLix',
    buttonUrl: url,
    fallbackText: 'If the button isn’t visible, copy and paste this link into your browser: {{ link }}',
    disclaimer: 'If you did not attempt to sign in, please secure your account and ignore this message.',
    previewText,
  });

  const text = buildPlainText([
    greeting,
    'Here is your secure link to sign in to TalentLix.',
    `Magic link: ${url}`,
    'If you did not attempt to sign in, ignore this message.',
  ]);

  return { subject, html, text, previewText };
};

export default {
  renderTalentLixEmailTemplate,
  buildTalentLixConfirmationEmail,
  buildTalentLixPasswordResetEmail,
  buildTalentLixMagicLinkEmail,
};

import tls from 'tls';

const SMTP_HOST = process.env.SMTP_HOST || 'smtps.aruba.it';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';
const EMAIL_SENDER = process.env.EMAIL_SENDER || 'no-reply@talentlix.com';
const EMAIL_SMTP_PASSWORD = process.env.EMAIL_SMTP_PASSWORD || '010405VegaLix..!';
const DISPATCHER_PASSWORD = process.env.EMAIL_DISPATCHER_PASSWORD || '010405Lev..!';

const BRAND_COLORS = {
  primary: '#027373',
  accent: '#27E3DA',
  text: '#0F172A',
  background: '#F8FAFC',
  divider: '#E2E8F0',
};

const MAX_RECIPIENTS = 20;

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normaliseRecipients(to) {
  if (!to) return [];
  if (Array.isArray(to)) {
    return to
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  }
  if (typeof to === 'string') {
    return to
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function formatMessageBlocks(message) {
  if (!message) {
    return [''];
  }
  if (Array.isArray(message)) {
    return message
      .map((block) => (typeof block === 'string' ? block.trim() : ''))
      .filter(Boolean);
  }
  if (typeof message === 'string') {
    const trimmed = message.trim();
    if (!trimmed) {
      return [''];
    }
    return trimmed.split(/\n{2,}/).map((block) => block.trim());
  }
  return [''];
}

function createPlainTextContent({ heading, blocks }) {
  const headingLine = heading ? `${heading}\n\n` : '';
  return `${headingLine}${blocks.join('\n\n')}`.trim();
}

function createHtmlTemplate({ subject, heading, previewText, blocks }) {
  const safeHeading = escapeHtml(heading || 'TalentLix');
  const safeSubject = escapeHtml(subject || '');
  const safePreview = escapeHtml(previewText || blocks[0] || '');
  const contentBlocks = blocks
    .map((block) => {
      const safeBlock = escapeHtml(block).replace(/\n/g, '<br />');
      return `<p style="margin: 0 0 16px; color: ${BRAND_COLORS.text}; font-size: 15px; line-height: 24px;">${safeBlock}</p>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charSet="utf-8" />
    <title>${safeSubject}</title>
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin: 0; padding: 24px; background: ${BRAND_COLORS.background}; font-family: 'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color: ${BRAND_COLORS.text};">
    <span style="display: none; visibility: hidden; opacity: 0; height: 0; width: 0;">${safePreview}</span>
    <table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);">
      <thead>
        <tr>
          <td style="padding: 24px; background: ${BRAND_COLORS.primary};">
            <div style="display: flex; align-items: center; gap: 12px; color: #ffffff;">
              <div style="width: 42px; height: 42px; border-radius: 12px; background: ${BRAND_COLORS.accent}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; letter-spacing: 0.08em; color: ${BRAND_COLORS.primary};">TL</div>
              <div>
                <div style="font-size: 18px; font-weight: 600; line-height: 1.3;">${safeHeading}</div>
                <div style="font-size: 12px; opacity: 0.85; line-height: 1.4;">Aggiornamenti dalla piattaforma TalentLix</div>
              </div>
            </div>
          </td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 32px 32px 8px 32px;">
            ${contentBlocks}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 32px 32px 32px;">
            <table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="border-top: 1px solid ${BRAND_COLORS.divider}; margin-top: 16px; padding-top: 16px;">
              <tr>
                <td style="font-size: 12px; line-height: 20px; color: rgba(15, 23, 42, 0.64);">
                  Questo messaggio è stato generato automaticamente dalla piattaforma TalentLix. Per assistenza contatta il team di supporto.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}

function buildMessageData({ from, to, subject, html, text }) {
  const boundary = `----=_TalentLix_${Math.random().toString(16).slice(2)}`;
  const toHeader = Array.isArray(to) ? to.join(', ') : to;
  const headers = [
    `From: TalentLix <${from}>`,
    `To: ${toHeader}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(16).slice(2)}@talentlix.com>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ];

  return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
}

function createSmtpClient({ host, port, secure }) {
  const socket = tls.connect({ host, port, rejectUnauthorized: false, servername: host });
  socket.setEncoding('utf8');

  const pending = [];
  const waiting = [];
  let closed = false;

  const resolveWaiting = (response) => {
    if (waiting.length > 0) {
      const { resolve } = waiting.shift();
      resolve(response);
    } else {
      pending.push(response);
    }
  };

  const failAll = (error) => {
    while (waiting.length) {
      const { reject } = waiting.shift();
      reject(error);
    }
  };

  socket.on('data', (chunk) => {
    const lines = chunk.split(/\r?\n/);
    for (const line of lines) {
      if (!line) {
        continue;
      }
      const match = line.match(/^(\d{3})([\s-])(.*)$/);
      if (!match) {
        continue;
      }
      const code = Number(match[1]);
      const separator = match[2];
      const message = match[3];
      if (separator === '-') {
        continue;
      }
      resolveWaiting({ code, message, raw: line });
    }
  });

  socket.on('error', (error) => {
    closed = true;
    failAll(error);
  });

  socket.on('close', () => {
    closed = true;
  });

  socket.on('end', () => {
    if (!closed) {
      failAll(new Error('SMTP connection ended unexpectedly'));
    }
  });

  const waitForResponse = () =>
    new Promise((resolve, reject) => {
      if (pending.length > 0) {
        const response = pending.shift();
        resolve(response);
        return;
      }
      waiting.push({ resolve, reject });
    });

  const sendCommand = async (command, expectedCodes) => {
    socket.write(`${command}\r\n`);
    const response = await waitForResponse();
    if (expectedCodes && !expectedCodes.includes(response.code)) {
      throw new Error(`SMTP command failed (${command}): ${response.raw || response.message}`);
    }
    return response;
  };

  return {
    socket,
    waitForResponse,
    sendCommand,
  };
}

async function deliverEmail({ host, port, secure, username, password, from, to, subject, html, text }) {
  if (!secure) {
    throw new Error('The SMTP transport requires an SSL/TLS connection.');
  }

  const client = createSmtpClient({ host, port, secure });
  const { waitForResponse, sendCommand, socket } = client;

  try {
    const greeting = await waitForResponse();
    if (greeting.code !== 220) {
      throw new Error(`SMTP server rejected connection: ${greeting.raw || greeting.message}`);
    }

    await sendCommand('EHLO talentlix.com', [250]);
    await sendCommand('AUTH LOGIN', [334]);
    await sendCommand(Buffer.from(username).toString('base64'), [334]);
    await sendCommand(Buffer.from(password).toString('base64'), [235]);
    await sendCommand(`MAIL FROM:<${from}>`, [250]);
    for (const recipient of to) {
      await sendCommand(`RCPT TO:<${recipient}>`, [250, 251]);
    }
    await sendCommand('DATA', [354]);
    const data = buildMessageData({ from, to, subject, html, text });
    socket.write(`${data}\r\n.\r\n`);
    const dataResponse = await waitForResponse();
    if (![250, 251].includes(dataResponse.code)) {
      throw new Error(`SMTP server rejected DATA command: ${dataResponse.raw || dataResponse.message}`);
    }
    await sendCommand('QUIT', [221]);
  } finally {
    if (!socket.destroyed) {
      socket.end();
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Metodo non consentito' });
  }

  const { password, to, subject, message, heading, previewText } = req.body || {};

  if (!password || password !== DISPATCHER_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Credenziali non valide' });
  }

  const recipients = normaliseRecipients(to);
  if (!recipients.length) {
    return res.status(400).json({ success: false, error: 'Destinatario mancante' });
  }

  if (recipients.length > MAX_RECIPIENTS) {
    return res.status(400).json({ success: false, error: `Numero massimo di destinatari superato (${MAX_RECIPIENTS})` });
  }

  if (!subject || typeof subject !== 'string') {
    return res.status(400).json({ success: false, error: 'Oggetto della mail mancante' });
  }

  const blocks = formatMessageBlocks(message);
  const html = createHtmlTemplate({ subject, heading, previewText, blocks });
  const text = createPlainTextContent({ heading, blocks });

  try {
    await deliverEmail({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      username: EMAIL_SENDER,
      password: EMAIL_SMTP_PASSWORD,
      from: EMAIL_SENDER,
      to: recipients,
      subject,
      html,
      text,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[EmailDispatcher] invio fallito', error);
    return res.status(500).json({ success: false, error: 'Invio email fallito', details: error.message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

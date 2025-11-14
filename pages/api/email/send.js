import tls from 'tls';

function resolveEmailConfig() {
  const envConfig = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    EMAIL_SENDER: process.env.EMAIL_SENDER,
    EMAIL_SMTP_USERNAME: process.env.EMAIL_SMTP_USERNAME,
    EMAIL_SMTP_PASSWORD: process.env.EMAIL_SMTP_PASSWORD,
    EMAIL_DISPATCHER_PASSWORD: process.env.EMAIL_DISPATCHER_PASSWORD,
  };

  const missing = Object.entries(envConfig)
    .filter(([, value]) => typeof value === 'undefined' || value === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const port = Number(envConfig.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a positive integer');
  }

  const secure = String(envConfig.SMTP_SECURE).toLowerCase() !== 'false';

  return {
    host: envConfig.SMTP_HOST,
    port,
    secure,
    sender: envConfig.EMAIL_SENDER,
    username: envConfig.EMAIL_SMTP_USERNAME,
    password: envConfig.EMAIL_SMTP_PASSWORD,
    dispatcherPassword: envConfig.EMAIL_DISPATCHER_PASSWORD,
  };
}

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
      return `<p style="margin: 0 0 20px; color: #222; font-size: 16px; line-height: 1.6;">${safeBlock}</p>`;
    })
    .join('\n');

  const headingBlock = heading
    ? `<h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #000;">${safeHeading}</h1>`
    : '';

  return `<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charSet="utf-8" />
    <title>${safeSubject}</title>
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: Arial, Helvetica, sans-serif; color: #222;">
    <span style="display: none; visibility: hidden; opacity: 0; height: 0; width: 0;">${safePreview}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f6f8">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width: 600px; max-width: 100%; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12);">
            <tr>
              <td align="center" style="padding: 36px 24px; background: #ffffff;">
                <img src="https://www.talentlix.com/logo-talentlix.png" alt="TalentLix" width="150" style="display: block; border: 0; outline: none; text-decoration: none;" />
              </td>
            </tr>
            <tr>
              <td style="padding: 36px 48px 28px 48px; color: #222;">
                ${headingBlock}
                ${contentBlocks}
              </td>
            </tr>
            <tr>
              <td align="center" bgcolor="#f8f9fa" style="padding: 24px 16px; font-size: 13px; color: #6b7280; line-height: 1.6;">
                <p style="margin: 4px 0;">© ${new Date().getFullYear()} <strong>TalentLix</strong>. Tutti i diritti riservati.</p>
                <p style="margin: 4px 0;"><a href="https://www.talentlix.com" style="color: ${BRAND_COLORS.accent}; text-decoration: none;">Visita il sito</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
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

  let emailConfig;
  try {
    emailConfig = resolveEmailConfig();
  } catch (error) {
    console.error('[EmailDispatcher] configurazione mancante o invalida', error);
    return res
      .status(500)
      .json({ success: false, error: 'Configurazione email non valida', details: error.message });
  }

  const { password, to, subject, message, heading, previewText } = req.body || {};

  if (!password || password !== emailConfig.dispatcherPassword) {
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
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      username: emailConfig.username,
      password: emailConfig.password,
      from: emailConfig.sender,
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

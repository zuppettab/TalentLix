const SERVICE_ENV_VAR = 'SECURITY_CHECK_API_BASE_URL';

function resolveServiceUrl(pathname) {
  const baseUrl = process.env[SERVICE_ENV_VAR];
  if (!baseUrl) {
    throw new Error(`${SERVICE_ENV_VAR} is not configured`);
  }
  const url = new URL(pathname, baseUrl);
  return url.toString();
}

function buildHeaders(req) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (req.headers && req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }

  return headers;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).end('Method Not Allowed');
    return;
  }

  let endpoint;
  try {
    endpoint = resolveServiceUrl('/run');
  } catch (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(req),
      body: JSON.stringify(req.body ?? {}),
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!isJson) {
      const text = await response.text();
      res.status(response.status).json({ error: text || 'Unexpected response from security check service.' });
      return;
    }

    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(502).json({
      error: 'Failed to reach security check service.',
      details: error.message,
    });
  }
}

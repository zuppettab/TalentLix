const SERVICE_ENV_VAR = 'SECURITY_CHECK_API_BASE_URL';

function resolveServiceUrl(pathname) {
  const baseUrl = process.env[SERVICE_ENV_VAR];
  if (!baseUrl) {
    throw new Error(`${SERVICE_ENV_VAR} is not configured`);
  }
  return new URL(pathname, baseUrl);
}

function normalizeJobId(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end('Method Not Allowed');
    return;
  }

  const jobId = normalizeJobId(req.query.jobId);
  if (!jobId) {
    res.status(400).json({ error: 'A valid jobId query parameter is required.' });
    return;
  }

  let url;
  try {
    url = resolveServiceUrl('/status');
  } catch (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  url.searchParams.set('jobId', jobId);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
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

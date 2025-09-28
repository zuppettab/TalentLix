import { Readable } from 'stream';

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

async function streamResponse(backendResponse, res) {
  const contentType = backendResponse.headers.get('content-type');
  const contentDisposition = backendResponse.headers.get('content-disposition');

  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  if (contentDisposition) {
    res.setHeader('Content-Disposition', contentDisposition);
  }

  res.status(backendResponse.status);

  if (backendResponse.body) {
    let nodeStream;
    if (typeof Readable.fromWeb === 'function') {
      nodeStream = Readable.fromWeb(backendResponse.body);
    } else if (typeof backendResponse.body.getReader !== 'function' && typeof backendResponse.body.pipe === 'function') {
      nodeStream = backendResponse.body;
    }

    if (nodeStream && typeof nodeStream.pipe === 'function') {
      nodeStream.pipe(res);
      return;
    }

    const buffer = Buffer.from(await backendResponse.arrayBuffer());
    res.send(buffer);
    return;
  }

  const buffer = Buffer.from(await backendResponse.arrayBuffer());
  res.send(buffer);
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
    url = resolveServiceUrl('/report');
  } catch (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  url.searchParams.set('jobId', jobId);

  let backendResponse;
  try {
    backendResponse = await fetch(url.toString());
  } catch (error) {
    res.status(502).json({
      error: 'Failed to reach security check service.',
      details: error.message,
    });
    return;
  }

  if (!backendResponse.ok) {
    const contentType = backendResponse.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await backendResponse.json();
      res.status(backendResponse.status).json(payload);
      return;
    }

    const text = await backendResponse.text();
    res.status(backendResponse.status).json({ error: text || 'Failed to fetch report from security check service.' });
    return;
  }

  try {
    await streamResponse(backendResponse, res);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stream report from security check service.',
      details: error.message,
    });
  }
}

import dns from 'node:dns/promises';
import express from 'express';
import net from 'node:net';

const app = express();
const HOST = process.env.PROXY_HOST || '127.0.0.1';
const PORT = Number(process.env.PROXY_PORT || 5174);
const ALLOW_PRIVATE_TARGETS = process.env.PROXY_ALLOW_PRIVATE_TARGETS === 'true';

class ProxyHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const FORWARDED_REQUEST_HEADERS = new Set([
  'accept',
  'authorization',
  'content-type',
  'anthropic-beta',
  'x-api-key',
  'anthropic-version',
  'anthropic-dangerous-direct-browser-access',
  'openai-organization',
  'openai-project',
  'x-goog-api-key',
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'set-cookie',
  'transfer-encoding',
]);

const isAllowedCorsOrigin = (origin) => {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return ['http:', 'https:'].includes(url.protocol) && (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
};

const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && isAllowedCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
};

const parseIpv4 = (address) => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
};

const isPrivateIpv4 = (address) => {
  const parts = parseIpv4(address);
  if (!parts) return false;
  const [a, b, c] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
};

const isPrivateIpv6 = (address) => {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4[1]);

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  );
};

const isPrivateAddress = (address) => {
  const ip = address.replace(/^\[|\]$/g, '');
  if (net.isIP(ip) === 4) return isPrivateIpv4(ip);
  if (net.isIP(ip) === 6) return isPrivateIpv6(ip);
  return false;
};

const assertAllowedTarget = async (url) => {
  if (ALLOW_PRIVATE_TARGETS) return;

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isPrivateAddress(hostname)) {
    throw new ProxyHttpError(403, 'Private proxy targets are disabled');
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (records.some(record => isPrivateAddress(record.address))) {
    throw new ProxyHttpError(403, 'Private proxy targets are disabled');
  }
};

// Read raw body as buffer — don't parse JSON so we can forward it as-is
app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.options('/api/proxy', (req, res) => {
  setCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.status(204).end();
});

app.all('/api/proxy', async (req, res) => {
  const target = req.query.target;
  if (!target || typeof target !== 'string') {
    return res.status(400).json({ error: 'Missing target query param' });
  }

  let url;
  try {
    url = new URL(target);
  } catch {
    return res.status(400).json({ error: 'Invalid target URL' });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return res.status(400).json({ error: 'Invalid target protocol' });
  }

  try {
    await assertAllowedTarget(url);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      const kl = k.toLowerCase();
      if (!FORWARDED_REQUEST_HEADERS.has(kl) || v === undefined) continue;
      headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    headers.set('accept-encoding', 'identity');

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && Buffer.isBuffer(req.body) && req.body.length > 0;

    const upstream = await fetch(url.href, {
      method: req.method,
      headers,
      ...(hasBody ? { body: req.body } : {}),
    });

    res.status(upstream.status);
    for (const [k, v] of upstream.headers.entries()) {
      if (STRIPPED_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
      res.setHeader(k, v);
    }
    setCorsHeaders(req, res);

    const reader = upstream.body?.getReader();
    if (!reader) { res.end(); return; }
    while (true) {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(value);
    }
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (err instanceof ProxyHttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: String(err) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[proxy] LLM proxy running on http://${HOST}:${PORT}`);
});

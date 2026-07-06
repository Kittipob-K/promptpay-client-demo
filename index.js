require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const { createLineConnectorClient } = require('./connector-client');

const app = express();
const sseClients = new Set();

const PORT = Number(process.env.PORT || 3002);
const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const API_KEY = process.env.API_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const connector = createLineConnectorClient({
  apiBase: API_BASE,
  apiKey: API_KEY,
  sharedSecret: WEBHOOK_SECRET,
  tokenFile: process.env.LINE_TOKEN_FILE,
  intervalMs: Number(process.env.LINE_CONNECTOR_UPLOAD_INTERVAL_MS || 300000),
  onStatus: (status) => broadcast('connector', status),
});

if (!API_KEY) {
  console.error('ERROR: API_KEY must be set in .env');
  process.exit(1);
}

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.static('public'));

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

function publicConfig() {
  return {
    apiBase: API_BASE,
    demoPort: PORT,
    webhookPath: '/webhook',
    apiKeySuffix: API_KEY.slice(-6),
    lineConnectorConfigured: connector.publicStatus().configured,
  };
}

function verifyWebhookSignature(req) {
  const signature = req.headers['x-webhook-signature'];
  const secret = WEBHOOK_SECRET;

  if (!secret) return { ok: true, skipped: true };
  if (typeof signature !== 'string') return { ok: false, reason: 'Missing signature' };

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(req.rawBody || JSON.stringify(req.body))
    .digest('hex')}`;

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  return valid ? { ok: true, skipped: false } : { ok: false, reason: 'Invalid signature' };
}

function verifyBootstrapSignature(req) {
  const timestamp = req.headers['x-connector-timestamp'];
  const signature = req.headers['x-connector-signature'];
  const secret = WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: 'Missing WEBHOOK_SECRET' };
  if (typeof timestamp !== 'string' || typeof signature !== 'string') {
    return { ok: false, reason: 'Missing bootstrap signature headers' };
  }
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${req.rawBody || JSON.stringify(req.body)}`).digest('hex')}`;
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'Invalid bootstrap signature' };
  }
  return { ok: true };
}

app.get('/settings', (_req, res) => {
  res.json(publicConfig());
});

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/line-connector/status', (_req, res) => {
  res.json(connector.publicStatus());
});

app.post('/line-connector/bootstrap', async (req, res) => {
  const verification = verifyBootstrapSignature(req);
  if (!verification.ok) return res.status(401).json({ error: verification.reason });
  try {
    await connector.saveTokenBundle(req.body);
    const status = await connector.uploadNow();
    if (status.lastError) return res.status(502).json(status);
    return res.json({ ok: true, status });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Bootstrap failed' });
  }
});

app.post('/line-connector/upload', async (_req, res) => {
  const status = await connector.uploadNow();
  if (status.lastError) return res.status(502).json(status);
  return res.json(status);
});

app.post('/create-transaction', async (req, res) => {
  const amount = Number(req.body.amount);
  const orderId = String(req.body.orderId || '').trim() || `demo-${Date.now()}`;
  const expiresInSeconds = Number(req.body.expiresInSeconds || 300);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const body = {
    amount,
    orderId,
    expiresInSeconds,
    metadata: { source: 'promptpay-client-demo' },
  };

  try {
    const apiRes = await fetch(`${API_BASE}/promptpay/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await apiRes.text();
    const data = text ? JSON.parse(text) : {};

    if (!apiRes.ok) return res.status(apiRes.status).json(data);
    return res.status(201).json(data);
  } catch (err) {
    return res.status(502).json({
      error: 'UPSTREAM_UNAVAILABLE',
      message: err instanceof Error ? err.message : 'Cannot reach NotiBank API',
    });
  }
});

app.post('/webhook', (req, res) => {
  const verification = verifyWebhookSignature(req);
  if (!verification.ok) return res.status(401).json({ error: verification.reason });

  const { event, transaction } = req.body;
  console.log(`Webhook received: ${event} ${transaction?.id || ''}`);
  broadcast('webhook', { event, transaction, signatureVerified: !verification.skipped });

  return res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`PromptPay demo running: http://localhost:${PORT}`);
  console.log(`NotiBank API base: ${API_BASE}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
  connector.start();
});

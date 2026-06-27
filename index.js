require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ── Config ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;   // sk_line_... key
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const PROMPTPAY_ID = process.env.PROMPTPAY_ID || '';
const PROMPTPAY_TYPE = process.env.PROMPTPAY_TYPE || 'phone';

if (!API_KEY) {
  console.error('ERROR: API_KEY must be set in .env');
  process.exit(1);
}

// ── SSE clients ──────────────────────────────────────────────────────────────
// Each browser connection is held here and receives push events
const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Proxy: fetch PromptPay settings for display
app.get('/settings', (req, res) => {
  res.json({ promptpayId: PROMPTPAY_ID || null, promptpayType: PROMPTPAY_TYPE });
});

// SSE stream — browser subscribes once and receives all status updates
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Proxy: create a PromptPay transaction (browser → this server → NestJS)
// We proxy here so the API key never touches the browser.
app.post('/create-transaction', async (req, res) => {
  const { amount, expiresInSeconds } = req.body;

  if (!amount || isNaN(amount) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const nestRes = await fetch(`${API_BASE}/promptpay/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ amount: Number(amount), expiresInSeconds }),
  });

  const data = await nestRes.json();
  if (!nestRes.ok) {
    return res.status(nestRes.status).json(data);
  }
  return res.json(data);
});

// Webhook receiver — NestJS POSTs here when a transaction is fulfilled or expired
app.post('/webhook', (req, res) => {
  // ── Signature verification ──────────────────────────────────────────────────
  // IMPORTANT: Always verify the webhook signature in production.
  // Without this check, anyone can POST fake events to your endpoint and trick
  // your system into marking transactions as fulfilled.
  //
  // How it works:
  //   1. The server signs the raw JSON body with HMAC-SHA256 using WEBHOOK_SECRET
  //   2. It sends the result as:  X-Webhook-Signature: sha256=<hex>
  //   3. We recompute the HMAC and compare with timingSafeEqual — a constant-time
  //      comparison that prevents timing-oracle attacks.
  // ────────────────────────────────────────────────────────────────────────────
  const signature = req.headers['x-webhook-signature'];
  if (!signature) {
    console.warn('Webhook received without signature — rejected');
    return res.status(401).json({ error: 'Missing signature' });
  }

  const rawBody = JSON.stringify(req.body);
  const expected = `sha256=${crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')}`;

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  const valid =
    sigBuf.length === expBuf.length &&
    crypto.timingSafeEqual(sigBuf, expBuf);

  if (!valid) {
    console.warn('Webhook signature mismatch — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, transaction } = req.body;
  console.log(`Webhook received: ${event} — txn ${transaction?.id}`);

  // Push the update to all connected browsers via SSE
  broadcast('webhook', { event, transaction });

  res.json({ received: true });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Demo client running at http://localhost:${PORT}`);
  console.log(`Webhook receiver ready at http://localhost:${PORT}/webhook`);
  console.log(`Set this URL in your API key's webhook URL field on the dashboard.`);
});

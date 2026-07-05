let currentTxn = null;
let countdownInterval = null;

const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', () => {
  $('payment-form').addEventListener('submit', createTransaction);
  $('reset-btn').addEventListener('click', reset);
  loadSettings();
  connectSSE();
});

async function loadSettings() {
  try {
    const res = await fetch('/settings');
    const data = await res.json();
    $('settings-bar').innerHTML = [
      `API: <strong>${escapeHtml(data.apiBase)}</strong>`,
      `Key suffix: <strong>••••${escapeHtml(data.apiKeySuffix)}</strong>`,
      `Webhook: <strong>http://localhost:${data.demoPort}${data.webhookPath}</strong>`,
    ].join('<br>');
  } catch {
    $('settings-bar').textContent = 'โหลดการตั้งค่า demo ไม่สำเร็จ';
  }
}

function connectSSE() {
  const source = new EventSource('/events');

  source.addEventListener('ready', () => {
    $('sse-status').textContent = 'SSE online';
    $('sse-status').className = 'status online';
  });

  source.addEventListener('webhook', (event) => {
    const data = JSON.parse(event.data);
    handleWebhookEvent(data.event, data.transaction, data.signatureVerified);
  });

  source.onerror = () => {
    $('sse-status').textContent = 'SSE reconnecting';
    $('sse-status').className = 'status pending';
  };
}

async function createTransaction(event) {
  event.preventDefault();

  const amount = Number($('amount').value);
  const orderId = $('order-id').value.trim();
  const expiresInSeconds = Number($('expires').value);

  setError('');
  if (!Number.isFinite(amount) || amount <= 0) {
    setError('กรุณาใส่จำนวนเงินที่ถูกต้อง');
    return;
  }

  $('create-btn').disabled = true;

  try {
    const res = await fetch('/create-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, orderId, expiresInSeconds }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message || data.error || 'สร้างรายการไม่สำเร็จ');
      $('create-btn').disabled = false;
      return;
    }

    showTransaction(data);
  } catch {
    setError('เชื่อมต่อ demo server ไม่สำเร็จ');
    $('create-btn').disabled = false;
  }
}

function showTransaction(txn) {
  currentTxn = txn;
  $('empty-state').hidden = true;
  $('qr-section').hidden = false;
  $('qr-amount').textContent = `฿${Number(txn.amount).toFixed(2)}`;
  $('qr-img').src = txn.qrDataUrl;
  $('txn-label').textContent = txn.id;
  $('order-label').textContent = txn.orderId;
  setStatus('pending', 'รอชำระ');
  startCountdown(new Date(txn.expiresAt));
  logEvent(`สร้าง QR สำเร็จ: ${txn.orderId}`, 'pending');
}

function handleWebhookEvent(event, transaction, signatureVerified) {
  const label = signatureVerified ? 'verified' : 'unverified local';
  if (!transaction) {
    logEvent(`${event} (${label})`, 'pending');
    return;
  }

  if (!currentTxn || transaction.id !== currentTxn.id) {
    logEvent(`${event}: ${transaction.id.slice(0, 12)}... (${label})`, eventType(event));
    return;
  }

  if (event === 'transaction.fulfilled') {
    setStatus('fulfilled', 'ชำระแล้ว');
    stopCountdown();
  }
  if (event === 'transaction.expired') {
    setStatus('expired', 'หมดอายุ');
    stopCountdown();
  }
  logEvent(`${event}: ${transaction.orderId || transaction.id} (${label})`, eventType(event));
}

function startCountdown(expiresAt) {
  stopCountdown();
  const tick = () => {
    const remaining = Math.max(0, expiresAt.getTime() - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    $('countdown').textContent = remaining > 0
      ? `หมดอายุใน ${mins}:${String(secs).padStart(2, '0')}`
      : 'หมดอายุแล้ว';
    if (remaining === 0) stopCountdown();
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function stopCountdown() {
  if (!countdownInterval) return;
  clearInterval(countdownInterval);
  countdownInterval = null;
}

function setStatus(type, text) {
  $('status-badge').textContent = text;
  $('status-badge').className = `status ${type}`;
}

function logEvent(message, type) {
  const log = $('event-log');
  if (log.querySelector('.muted')) log.innerHTML = '';
  const line = document.createElement('div');
  line.className = `log-line ${type || ''}`.trim();
  line.textContent = `${new Date().toLocaleTimeString('th-TH')} - ${message}`;
  log.prepend(line);
}

function reset() {
  currentTxn = null;
  stopCountdown();
  $('payment-form').reset();
  $('empty-state').hidden = false;
  $('qr-section').hidden = true;
  $('txn-label').textContent = 'ยังไม่มีรายการที่กำลังติดตาม';
  $('countdown').textContent = '-';
  $('order-label').textContent = '-';
  $('create-btn').disabled = false;
  setStatus('pending', 'พร้อม');
  setError('');
}

function setError(message) {
  $('form-error').textContent = message;
}

function eventType(event) {
  if (event?.includes('fulfilled')) return 'fulfilled';
  if (event?.includes('expired')) return 'expired';
  return 'pending';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

const crypto = require('crypto');
const fs = require('fs/promises');

function createLineConnectorClient(input) {
  const state = {
    configured: !!(input.apiBase && input.apiKey && input.sharedSecret && (hasCredentials() || input.tokenFile)),
    mode: hasCredentials() ? 'email_password' : 'token_file',
    inFlight: false,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
  };

  async function uploadNow() {
    if (!state.configured) return publicStatus();
    if (state.inFlight) return publicStatus();
    state.inFlight = true;
    state.lastAttemptAt = new Date().toISOString();
    input.onStatus?.(publicStatus());
    try {
      const payload = await readUploadPayload();
      const publicKey = await fetchJson(`${input.apiBase}/line/connector/public-key`);
      const body = JSON.stringify(encryptPayload(publicKey, payload));
      const timestamp = Date.now().toString();
      const nonce = crypto.randomBytes(16).toString('hex');
      const signature = signRequest(input.sharedSecret, timestamp, nonce, body);
      const res = await fetch(`${input.apiBase}/line/connector/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`,
          'x-connector-timestamp': timestamp,
          'x-connector-nonce': nonce,
          'x-connector-signature': signature,
        },
        body,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(text);
      if (data?.tokenBundle) await saveTokenBundle(data.tokenBundle);
      state.lastSuccessAt = new Date().toISOString();
      state.lastError = null;
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : 'Connector upload failed';
    } finally {
      state.inFlight = false;
      input.onStatus?.(publicStatus());
    }
    return publicStatus();
  }

  async function saveTokenBundle(tokenBundle) {
    assertTokenBundle(tokenBundle);
    await fs.mkdir(require('path').dirname(input.tokenFile), { recursive: true });
    await fs.writeFile(input.tokenFile, `${JSON.stringify(tokenBundle, null, 2)}\n`, 'utf8');
  }

  function start() {
    if (!state.configured) return;
    void uploadNow();
    const timer = setInterval(() => void uploadNow(), input.intervalMs);
    timer.unref?.();
  }

  function publicStatus() {
    return { ...state, tokenFile: state.configured ? input.tokenFile : null };
  }

  return { start, uploadNow, publicStatus, saveTokenBundle };

  async function readUploadPayload() {
    const tokenBundle = await readTokenBundle();
    if (tokenBundle && hasCredentials()) {
      return { ...tokenBundle, fallback: { type: 'email_password', email: input.lineEmail, password: input.linePassword } };
    }
    if (tokenBundle) return tokenBundle;
    if (hasCredentials()) return { type: 'email_password', email: input.lineEmail, password: input.linePassword };
    throw new Error('Missing LINE token file and LINE credentials');
  }

  function hasCredentials() {
    return !!(input.lineEmail && input.linePassword);
  }

  async function readTokenBundle() {
    try {
      const tokenBundle = JSON.parse(await fs.readFile(input.tokenFile, 'utf8'));
      assertTokenBundle(tokenBundle);
      return tokenBundle;
    } catch (err) {
      if (!hasCredentials()) throw err;
      return null;
    }
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function encryptPayload(publicKey, payload) {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedKey = crypto.publicEncrypt({ key: publicKey.publicKeyPem, oaepHash: 'sha256' }, aesKey);
  return {
    keyId: publicKey.keyId,
    encryptedKey: encryptedKey.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function signRequest(secret, timestamp, nonce, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.${body}`).digest('hex')}`;
}

function assertTokenBundle(value) {
  if (!value || typeof value !== 'object') throw new Error('LINE token file must be JSON');
  for (const key of ['authToken', 'refreshToken', 'mid']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`Missing ${key} in LINE token file`);
  }
}

module.exports = { createLineConnectorClient };

const connectorState = { loading: true };

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('connector-upload-btn')?.addEventListener('click', manualConnectorUpload);
  loadConnectorStatus();
});

window.updateConnectorStatus = (status) => {
  Object.assign(connectorState, status, { loading: false });
  renderConnectorStatus();
};

async function loadConnectorStatus() {
  try {
    const res = await fetch('/line-connector/status');
    window.updateConnectorStatus(await res.json());
  } catch {
    window.updateConnectorStatus({ configured: false, lastError: 'โหลดสถานะ connector ไม่สำเร็จ' });
  }
}

async function manualConnectorUpload() {
  const button = document.getElementById('connector-upload-btn');
  if (button) button.disabled = true;
  try {
    const res = await fetch('/line-connector/upload', { method: 'POST' });
    const data = await res.json();
    window.updateConnectorStatus(data);
  } finally {
    if (button) button.disabled = false;
  }
}

function renderConnectorStatus() {
  const el = document.getElementById('connector-status');
  if (!el) return;
  if (connectorState.loading) {
    el.textContent = 'กำลังโหลด LINE connector...';
    return;
  }
  if (!connectorState.configured) {
    el.textContent = 'LINE connector ยังไม่ได้ตั้งค่าใน .env';
    return;
  }
  const lines = [
    `Mode: ${connectorState.mode || '-'}`,
    `Token file: ${connectorState.tokenFile || '-'}`,
    `Last attempt: ${format(connectorState.lastAttemptAt)}`,
    `Last success: ${format(connectorState.lastSuccessAt)}`,
    `Status: ${connectorState.lastError ? `error - ${connectorState.lastError}` : connectorState.inFlight ? 'uploading' : 'ready'}`,
  ];
  el.innerHTML = lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
}

function format(value) {
  return value ? new Date(value).toLocaleString('th-TH') : 'ยังไม่มี';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

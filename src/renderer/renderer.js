const { ipcRenderer } = require('electron');

// --- Settings Modal Logic ---
const modal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const saveSettingsBtn = document.getElementById('saveSettings');
const settingsStatus = document.getElementById('settingsStatus');

openSettingsBtn.onclick = () => {
  modal.style.display = 'flex';
  ipcRenderer.send('get-settings');
  settingsStatus.innerText = '';
};
closeSettingsBtn.onclick = () => { modal.style.display = 'none'; };
saveSettingsBtn.onclick = () => {
  const deviceId = document.getElementById('deviceIdInput').value.trim();
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const wsUrl = document.getElementById('wsUrlInput').value.trim();
  if (!deviceId || !apiKey || !wsUrl) {
    settingsStatus.innerText = 'All fields are required.';
    settingsStatus.className = 'status error';
    return;
  }
  ipcRenderer.send('save-settings', { deviceId, apiKey, wsUrl });
  settingsStatus.innerText = 'Settings saved. Restarting app...';
  setTimeout(() => { ipcRenderer.send('restart-app'); }, 900);
};

ipcRenderer.on('settings', (event, settings) => {
  document.getElementById('deviceIdInput').value = settings.deviceId || '';
  document.getElementById('apiKeyInput').value = settings.apiKey || '';
  document.getElementById('wsUrlInput').value = settings.wsUrl || '';
});

// --- Live Status and Logs ---
function appendLog(msg) {
  const log = document.getElementById('appLog');
  log.innerHTML += `[${(new Date()).toLocaleTimeString()}] ${msg}<br>`;
  log.scrollTop = log.scrollHeight;
}

ipcRenderer.on('connectivity-status', (event, status, msg) => {
  const el = document.getElementById('connectivityStatus');
  el.innerText = msg;
  el.className = 'status ' + (status === 'ok' ? 'ok' : 'error');
  appendLog(msg);
});
ipcRenderer.on('printer-status', (event, msg, ok) => {
  const el = document.getElementById('printerStatus');
  el.innerText = msg;
  el.className = 'status ' + (ok ? 'ok' : 'error');
  appendLog(msg);
});
ipcRenderer.on('log', (event, msg) => appendLog(msg));

// On load, request settings and printer status
window.onload = () => {
  ipcRenderer.send('get-settings');
  ipcRenderer.send('refresh-printers');
};

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { Bonjour } = require('bonjour-service');
const WebSocket = require('ws');

const settingsPath = path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath)); }
  catch { return {}; }
}
function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

let printers = [];
let ws;
let wsReconnectTimeout = null;
let settings = loadSettings();
let mainWindow;

function sendRenderer(channel, ...args) {
  if (mainWindow) mainWindow.webContents.send(channel, ...args);
}

function log(msg) {
  sendRenderer('log', msg);
  console.log(msg);
}

function setConnectivity(ok, msg) {
  sendRenderer('connectivity-status', ok ? 'ok' : 'error', msg);
  log(msg);
}

function setPrinterStatus(msg, ok) {
  sendRenderer('printer-status', msg, ok);
  log(msg);
}

app.whenReady().then(() => {
  createWindow();
  discoverPrinters();
  connectToMiddleware();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900, height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/renderer.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.on('refresh-printers', () => { discoverPrinters(); });
ipcMain.on('get-settings', (event) => { event.reply('settings', settings); });
ipcMain.on('save-settings', (event, newSettings) => {
  settings = newSettings;
  saveSettings(settings);
  event.reply('settings', settings);
});
ipcMain.on('restart-app', () => { app.relaunch(); app.exit(); });

async function discoverPrinters() {
  printers = [];
  setPrinterStatus('Discovering printers...', true);
  const bonjour = new Bonjour();
  bonjour.find({ type: 'printer' }, service => {
    printers.push({
      id: `net-${service.host}-${service.port}`,
      name: service.name,
      ip: service.host,
      capabilities: {}
    });
    setPrinterStatus(`Network printer found: ${service.name} (${service.host})`, true);
  });
  if (mainWindow) {
    try {
      const localPrinters = await mainWindow.webContents.getPrintersAsync();
      localPrinters.forEach(p => {
        printers.push({
          id: `local-${p.name}`,
          name: p.name,
          ip: null,
          capabilities: {
            duplex: p.options?.Duplex || false,
            color: p.options?.Color || false,
            paperSizes: p.options?.PaperSizes || []
          }
        });
      });
      setPrinterStatus(`Local printers: ${localPrinters.map(p => p.name).join(', ')}`, true);
    } catch (e) {
      setPrinterStatus('Failed to enumerate local printers: ' + e.message, false);
    }
  }
}

function connectToMiddleware() {
  if (!settings.deviceId || !settings.apiKey || !settings.wsUrl) {
    setConnectivity(false, 'Setup incomplete: Please configure Device ID, API Key, and Server URL.');
    wsReconnectTimeout = setTimeout(connectToMiddleware, 5000);
    return;
  }
  setConnectivity(false, 'Connecting to middleware server...');
  ws = new WebSocket(settings.wsUrl);

  ws.on('open', () => {
    setConnectivity(true, 'Connected to middleware server.');
    ws.send(JSON.stringify({
      type: 'register',
      deviceId: settings.deviceId,
      apiKey: settings.apiKey
    }));
    log(`Sent registration: deviceId=${settings.deviceId}`);
  });

  ws.on('message', async (msg) => {
    log(`Received message from middleware: ${msg}`);
    try {
      const data = JSON.parse(msg);
      // Respond to get_printers command
      if (data.type === 'command' && data.command === 'get_printers') {
        const printerList = printers.map(p => ({
          id: p.id,
          name: p.name
        }));
        ws.send(JSON.stringify({
          type: 'status',
          deviceId: settings.deviceId,
          status: 'printers',
          printers: printerList,
          timestamp: new Date().toISOString()
        }));
      }
      // Handle print command
      else if (data.type === 'command' && data.command === 'print') {
        const { printer_id, content, options, jobName } = data.payload;
        const selected = printers.find(p => p.id === printer_id);
        if (!selected) {
          ws.send(JSON.stringify({
            type: 'status',
            deviceId: settings.deviceId,
            status: 'error',
            error: 'Printer not found',
            printer_id
          }));
          log(`[PRINT] Printer not found: ${printer_id}`);
          return;
        }
        try {
          const buffer = Buffer.from(content, 'base64');
          await printBufferSilently(buffer, selected.name, options?.mimeType || 'text/html', options, jobName);
          ws.send(JSON.stringify({
            type: 'status',
            deviceId: settings.deviceId,
            status: 'printed',
            printer_id,
            jobName,
            timestamp: new Date().toISOString()
          }));
          log(`[PRINT] Job "${jobName || ''}" printed on ${selected.name}`);
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'status',
            deviceId: settings.deviceId,
            status: 'error',
            error: err.message,
            printer_id,
            jobName
          }));
          log(`[PRINT] Error printing job "${jobName || ''}": ${err.message}`);
        }
      }
      // Registration and error responses
      else if (data.type === 'registered') {
        setConnectivity(true, `Device registered as "${data.deviceId}"`);
      } else if (data.type === 'error') {
        setConnectivity(false, `Middleware error: ${data.error}`);
      }
    } catch (e) {
      log('[WS] Failed to parse message: ' + e.message);
    }
  });

  ws.on('close', () => {
    setConnectivity(false, 'Disconnected from middleware server. Retrying...');
    if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = setTimeout(connectToMiddleware, 5000);
  });

  ws.on('error', (err) => {
    setConnectivity(false, 'WebSocket error: ' + err.message);
  });
}

async function printBufferSilently(buffer, printerName, mimeType = 'text/html', options = {}, jobName = '') {
  const printWin = new BrowserWindow({ show: false });
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  printWin.webContents.on('did-finish-load', () => {
    printWin.webContents.print({
      silent: true,
      printBackground: true,
      deviceName: printerName,
      copies: options.copies || 1
    }, (success, errorType) => {
      log(`[PRINT] ${success ? 'Success' : 'Failed'}: ${jobName || '(unnamed)'} on ${printerName} (${errorType || 'OK'})`);
      printWin.close();
    });
  });
  printWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log(`[PRINT] Failed to load print content: ${errorDescription}`);
    printWin.close();
  });
  printWin.webContents.on('crashed', () => {
    log('[PRINT] Print window crashed');
    printWin.close();
  });
  try {
    await printWin.loadURL(dataUrl);
  } catch (err) {
    log('[PRINT] Error loading print content: ' + err.message);
    printWin.close();
  }
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { });
process.on('unhandledRejection', (reason, promise) => { log('[APP] Unhandled Rejection: ' + reason); });

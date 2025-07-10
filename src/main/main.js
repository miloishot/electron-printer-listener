const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Express REST API setup
const apiApp = express();
const PORT = 3000;

apiApp.use(helmet());
apiApp.use(cors({ origin: 'http://localhost', credentials: true }));
apiApp.use(express.json());

// API routes
apiApp.use('/api', require('./api/devices'));
apiApp.use('/api', require('./api/print'));
apiApp.use('/api', require('./api/scan'));

// Error handling
apiApp.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

apiApp.listen(PORT, 'localhost', () => {
  console.log(`REST API running on http://localhost:${PORT}`);
});

// Electron window
function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/app.js'),
    },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

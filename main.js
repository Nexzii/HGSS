const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'DS Stream — HeartGold & SoulSilver',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0d0d1a',
    frame: false, // borderless frameless window
    show: false, // hidden initially to prevent white loading flash
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
  });

  // Reveal window smoothly when HTML is loaded and ready
  win.once('ready-to-show', () => {
    win.show();
  });

  // Track and broadcast window state changes (for maximize/restore icon updates)
  win.on('maximize', () => {
    win.webContents.send('window-state', 'maximized');
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-state', 'restored');
  });

  // Safe IPC handlers to minimize, maximize/restore, and close window
  ipcMain.on('window-minimize', () => {
    if (!win.isDestroyed()) win.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (!win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (!win.isDestroyed()) win.close();
  });

  // Camera access authorization auto-approval
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  win.loadFile('index.html');

  // Ouvre DevTools en dev uniquement
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


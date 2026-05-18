const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

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

  // Handle auto-update downloads and launches
  ipcMain.on('download-update', (event, url) => {
    const tempPath = path.join(app.getPath('temp'), 'DS_Stream_HGSS_Setup_Update.exe');
    
    // Remove old update file if exists
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch(e){}
    }

    downloadFile(url, tempPath, 
      (percent) => {
        if (!win.isDestroyed()) {
          win.webContents.send('download-progress', percent);
        }
      },
      () => {
        if (!win.isDestroyed()) {
          win.webContents.send('download-complete', tempPath);
        }

        // Spawn installer and quit app after short delay so renderer UI can finish showing complete state
        setTimeout(() => {
          try {
            const child = spawn(tempPath, [], {
              detached: true,
              stdio: 'ignore'
            });
            child.unref();
            app.quit();
          } catch(err) {
            console.error('Failed to spawn installer:', err);
            if (!win.isDestroyed()) {
              win.webContents.send('download-error', 'Impossible de lancer l\'installateur : ' + err.message);
            }
          }
        }, 1500);
      },
      (err) => {
        if (!win.isDestroyed()) {
          win.webContents.send('download-error', err.message);
        }
      }
    );
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

// Recursive HTTP downloader that automatically follows redirects (like GitHub releases)
function downloadFile(fileUrl, destPath, onProgress, onComplete, onError) {
  const request = https.get(fileUrl, (response) => {
    // Handle redirect
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      downloadFile(response.headers.location, destPath, onProgress, onComplete, onError);
      return;
    }

    if (response.statusCode !== 200) {
      onError(new Error(`Status ${response.statusCode}`));
      return;
    }

    const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
    let downloadedBytes = 0;
    const fileStream = fs.createWriteStream(destPath);

    response.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      fileStream.write(chunk);
      if (totalBytes > 0) {
        const percent = Math.round((downloadedBytes / totalBytes) * 100);
        onProgress(percent);
      }
    });

    response.on('end', () => {
      fileStream.end();
      onComplete();
    });

    fileStream.on('error', (err) => {
      fileStream.close();
      onError(err);
    });
  });

  request.on('error', (err) => {
    onError(err);
  });
}


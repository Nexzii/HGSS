const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onWindowStateChange: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('window-state', listener);
    return () => ipcRenderer.removeListener('window-state', listener);
  },
  downloadUpdate: (url) => ipcRenderer.send('download-update', url),
  onDownloadProgress: (callback) => {
    const listener = (event, percent) => callback(percent);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  onDownloadComplete: (callback) => {
    const listener = (event, filePath) => callback(filePath);
    ipcRenderer.on('download-complete', listener);
    return () => ipcRenderer.removeListener('download-complete', listener);
  },
  onDownloadError: (callback) => {
    const listener = (event, errorMsg) => callback(errorMsg);
    ipcRenderer.on('download-error', listener);
    return () => ipcRenderer.removeListener('download-error', listener);
  },
  setZoom: (factor) => webFrame.setZoomFactor(factor),
  getZoom: () => webFrame.getZoomFactor(),
  getLocalIp: () => ipcRenderer.invoke('get-local-ip')
});

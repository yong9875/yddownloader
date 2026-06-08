const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window Controls
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onWindowMaximizedState: (callback) => ipcRenderer.on('window-maximized-state', (event, isMaximized) => callback(isMaximized)),

  // Dependency Check (just verifies bundled binaries exist)
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),

  // Settings & Navigation
  selectDownloadDir: () => ipcRenderer.invoke('select-download-dir'),
  getDefaultDownloadDir: () => ipcRenderer.invoke('get-default-download-dir'),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),

  // Video Operations (yt-dlp based)
  getVideoInfo: (options) => ipcRenderer.invoke('get-video-info', options),
  downloadVideo: (options) => ipcRenderer.send('download-video', options),
  onDownloadProgress: (id, callback) => {
    const channel = `download-progress-${id}`;
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  killDownload: (id) => ipcRenderer.send(`kill-download-${id}`)
});

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  openPath: (path) => ipcRenderer.invoke('desktop:open-path', path),
  saveTextFile: (filename, content) =>
    ipcRenderer.invoke('desktop:save-text-file', filename, content),
  scanSources: () => ipcRenderer.invoke('desktop:scan-sources'),
  ingest: (force) => ipcRenderer.invoke('desktop:ingest', !!force),
  getRuntimeInfo: () => ipcRenderer.invoke('desktop:get-runtime-info'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('desktop:install-update'),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('desktop:update-status', listener)
    return () => ipcRenderer.removeListener('desktop:update-status', listener)
  },
})

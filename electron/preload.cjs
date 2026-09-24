const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  openPath: (path) => ipcRenderer.invoke('desktop:open-path', path),
  saveTextFile: (filename, content) =>
    ipcRenderer.invoke('desktop:save-text-file', filename, content),
  scanSources: () => ipcRenderer.invoke('desktop:scan-sources'),
  getRuntimeInfo: () => ipcRenderer.invoke('desktop:get-runtime-info'),
})

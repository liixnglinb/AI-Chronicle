const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  openPath: (path) => ipcRenderer.invoke('desktop:open-path', path),
  saveTextFile: (filename, content) =>
    ipcRenderer.invoke('desktop:save-text-file', filename, content),
  scanSources: () => ipcRenderer.invoke('desktop:scan-sources'),
  ingest: (force) => ipcRenderer.invoke('desktop:ingest', !!force),
  getRuntimeInfo: () => ipcRenderer.invoke('desktop:get-runtime-info'),
  // 让 Windows 标题栏覆盖层跟随应用主题，避免浅色模式下顶部残留深色条
  setWindowTheme: (theme) => ipcRenderer.invoke('desktop:set-window-theme', theme),
  // 渲染进程错误上报（写入 userData/logs）
  reportError: (payload) => ipcRenderer.invoke('desktop:report-error', payload),
  // 界面缩放（高分屏 / 无障碍）
  setZoom: (level) => ipcRenderer.invoke('desktop:set-zoom', level),
  // 桌面集成偏好（托盘 / 自启 / 通知）
  getDesktopPrefs: () => ipcRenderer.invoke('desktop:get-desktop-prefs'),
  setDesktopPrefs: (patch) => ipcRenderer.invoke('desktop:set-desktop-prefs', patch),
  // 加密备份（scrypt + AES-256-GCM）
  exportEncryptedBackup: (payload) =>
    ipcRenderer.invoke('desktop:export-encrypted-backup', payload),
  openEncryptedBackup: (password) => ipcRenderer.invoke('desktop:open-encrypted-backup', password),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('desktop:install-update'),
  setSkippedUpdate: (version) => ipcRenderer.invoke('desktop:set-skipped-update', version),
  openUpdatePage: () => ipcRenderer.invoke('desktop:open-update-page'),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('desktop:update-status', listener)
    return () => ipcRenderer.removeListener('desktop:update-status', listener)
  },
})

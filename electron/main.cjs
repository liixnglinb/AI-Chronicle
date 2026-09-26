const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { autoUpdater } = require('electron-updater')
const { collectAll } = require('./ingest.cjs')

const isDevelopment = !app.isPackaged
const devServerUrl = process.env.ELECTRON_START_URL
const isSmokeTest = process.argv.includes('--smoke-test')

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico')
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 680,
    show: false,
    backgroundColor: '#f3f5f4',
    title: 'AI 轨迹',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (!isSmokeTest) {
    window.once('ready-to-show', () => window.show())
  }
  if (isSmokeTest) {
    const timeout = setTimeout(() => {
      console.error('SMOKE_TIMEOUT: renderer did not finish loading.')
      app.exit(2)
    }, 10000)

    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout)
      console.log(`SMOKE_OK ${window.webContents.getTitle()}`)
      setTimeout(() => app.exit(0), 250)
    })
    window.webContents.once(
      'did-fail-load',
      (_event, errorCode, errorDescription) => {
        clearTimeout(timeout)
        console.error(`SMOKE_FAILED: ${errorCode} ${errorDescription}`)
        app.exit(1)
      },
    )
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL()
    if (url !== currentUrl && !url.startsWith('file://')) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  if (isDevelopment && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function sendUpdateStatus(status) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('desktop:update-status', status)
  }
}

function configureUpdater() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () =>
    sendUpdateStatus({ state: 'checking', message: '正在检查 GitHub Releases。' }),
  )
  autoUpdater.on('update-available', (info) =>
    sendUpdateStatus({
      state: 'available',
      version: info.version,
      message: `发现新版本 v${info.version}，正在下载。`,
    }),
  )
  autoUpdater.on('update-not-available', (info) =>
    sendUpdateStatus({
      state: 'not-available',
      version: info.version,
      message: '当前已经是最新版本。',
    }),
  )
  autoUpdater.on('download-progress', (progress) =>
    sendUpdateStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      message: `正在下载更新 ${Math.round(progress.percent)}%`,
    }),
  )
  autoUpdater.on('update-downloaded', (info) =>
    sendUpdateStatus({
      state: 'downloaded',
      version: info.version,
      message: `新版本 v${info.version} 已下载，可以安装并重启。`,
    }),
  )
  autoUpdater.on('error', (error) =>
    sendUpdateStatus({
      state: 'error',
      message: error?.message || '检查更新失败。',
    }),
  )

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      sendUpdateStatus({ state: 'error', message: error.message })
    })
  }, 7000)
}

function expandPath(value) {
  return value
    .replace(/^~(?=$|[\\/])/, os.homedir())
    .replace(/%APPDATA%/gi, app.getPath('appData'))
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA ?? app.getPath('userData'))
}

const SOURCE_DEFINITIONS = [
  { id: 'source-codex', path: '~/.codex/sessions' },
  { id: 'source-claude', path: '~/.claude/projects' },
  { id: 'source-qoder', path: '%APPDATA%/com.qodercn.app.stable' },
  { id: 'source-catpaw', path: '%APPDATA%/catpaw-moon' },
  { id: 'source-trae', path: '%APPDATA%/TRAE SOLO CN' },
  { id: 'source-doubao', path: '%APPDATA%/Doubao' },
  { id: 'source-kimi', path: '%APPDATA%/kimi-code-app' },
]

const ignoredDirectories = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'Crashpad',
  'logs',
  'node_modules',
  '.git',
])

async function inspectSource(source) {
  const root = expandPath(source.path)
  if (!fs.existsSync(root)) {
    return { id: source.id, exists: false, filesToday: 0 }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let filesToday = 0
  let lastModified = 0
  let visited = 0

  async function walk(directory, depth) {
    if (depth > 5 || visited > 3000) return
    let entries
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (visited > 3000) return
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await walk(entryPath, depth + 1)
        continue
      }
      visited += 1
      try {
        const stat = await fs.promises.stat(entryPath)
        lastModified = Math.max(lastModified, stat.mtimeMs)
        if (stat.mtime >= today) filesToday += 1
      } catch {
        // Ignore files that disappear or are locked while scanning.
      }
    }
  }

  await walk(root, 0)
  return {
    id: source.id,
    exists: true,
    filesToday,
    lastModified: lastModified
      ? new Date(lastModified).toLocaleString('zh-CN', { hour12: false })
      : undefined,
  }
}

ipcMain.handle('desktop:get-runtime-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  dataPath: app.getPath('userData'),
  packaged: app.isPackaged,
}))

ipcMain.handle('desktop:open-path', async (_event, rawPath) => {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, message: '路径为空。' }
  }
  const target = path.resolve(expandPath(rawPath))
  if (!fs.existsSync(target)) {
    return { ok: false, message: `路径不存在：${target}` }
  }
  const error = await shell.openPath(target)
  return error ? { ok: false, message: error } : { ok: true, message: target }
})

ipcMain.handle('desktop:save-text-file', async (_event, filename, content) => {
  if (typeof content !== 'string') {
    return { ok: false, message: '没有可写入的内容。' }
  }
  const safeName =
    typeof filename === 'string' && filename.trim()
      ? filename.replace(/[<>:"/\\|?*]/g, '-')
      : `AI轨迹导出-${Date.now()}.txt`
  const result = await dialog.showSaveDialog({
    title: '导出 AI 轨迹文件',
    defaultPath: path.join(app.getPath('documents'), safeName),
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'CSV', extensions: ['csv'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  })
  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true, message: '已取消保存。' }
  }
  await fs.promises.writeFile(result.filePath, content, 'utf8')
  return { ok: true, filePath: result.filePath, message: result.filePath }
})

ipcMain.handle('desktop:scan-sources', async () => {
  const sources = await Promise.all(SOURCE_DEFINITIONS.map(inspectSource))
  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    sources,
  }
})

// ---------------- 真实数据采集 ----------------
let ingestInFlight = null
let ingestResult = null

function runIngest(force = false) {
  if (ingestInFlight) return ingestInFlight
  if (ingestResult && !force) {
    // 60 秒内直接复用
    if (Date.now() - ingestResult.generatedAt < 60_000) {
      return Promise.resolve(ingestResult)
    }
  }
  ingestInFlight = collectAll({
    cachePath: path.join(app.getPath('userData'), 'chronicle-ingest-cache.json'),
  })
    .then((result) => {
      ingestResult = result
      return result
    })
    .finally(() => {
      ingestInFlight = null
    })
  return ingestInFlight
}

ipcMain.handle('desktop:ingest', (_event, force) => runIngest(!!force))

ipcMain.handle('desktop:check-for-updates', async () => {
  if (!app.isPackaged) {
    return {
      ok: false,
      state: 'unavailable',
      message: '开发模式不检查更新，安装版会自动连接 GitHub Releases。',
    }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo?.version
    const available = version && version !== app.getVersion()
    return {
      ok: true,
      state: available ? 'available' : 'not-available',
      version,
      message: available
        ? `发现新版本 v${version}，正在后台下载。`
        : '当前已经是最新版本。',
    }
  } catch (error) {
    return {
      ok: false,
      state: 'error',
      message: error?.message || '无法连接 GitHub Releases。',
    }
  }
})

ipcMain.handle('desktop:install-update', () => {
  if (!app.isPackaged) {
    return { ok: false, message: '只有安装后的正式版本可以安装更新。' }
  }
  try {
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error?.message || '安装更新失败。' }
  }
})

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.aichronicle.desktop')
    createWindow()
    if (!isSmokeTest) {
      configureUpdater()
      // 启动后预热采集（后台跑，结果进缓存，首屏 IPC 立即可用）
      setTimeout(() => {
        runIngest().catch(() => {})
      }, 2000)
    }
    // 自检模式：跑一次采集，输出汇总后退出（CHRONICLE_DEBUG=1 electron .）
    if (process.env.CHRONICLE_DEBUG) {
      runIngest()
        .then((r) => {
          const byTool = {}
          for (const s of r.sessions) byTool[s.tool] = (byTool[s.tool] || 0) + 1
          console.log(
            'CHRONICLE_INGEST ' +
              JSON.stringify({
                total: r.sessions.length,
                byTool,
                sources: r.sources.map((s) => `${s.id}:${s.status}:${s.sessionCount}`),
              }),
          )
          app.exit(0)
        })
        .catch((err) => {
          console.error('CHRONICLE_INGEST_FAIL', err)
          app.exit(1)
        })
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

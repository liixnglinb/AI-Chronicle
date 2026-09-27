const { app, BrowserWindow, Menu, dialog, ipcMain, net, shell } = require('electron')
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

// ---------------- 更新源自动测速选优 ----------------
// GitHub 直连经常被墙或很慢；并发探测各通道取 latest.yml 的耗时，
// 选最快可达者作为 electron-updater 的 generic feed（latest.yml/exe/blockmap 同源）。
const RELEASE_BASE = 'https://github.com/liixnglinb/AI-Chronicle/releases/latest/download/'
const FEED_CANDIDATES = [
  { id: 'github', label: 'GitHub 直连', base: RELEASE_BASE },
  { id: 'gh-proxy', label: 'gh-proxy 镜像', base: `https://gh-proxy.com/${RELEASE_BASE}` },
  { id: 'ghfast', label: 'ghfast.top 镜像', base: `https://ghfast.top/${RELEASE_BASE}` },
]
// SSRF 防护：更新源只允许 https + 白名单 host
const FEED_ALLOWED_HOSTS = new Set(['github.com', 'gh-proxy.com', 'ghfast.top'])

function probeFeedUrl(rawUrl, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now()
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'https:' || !FEED_ALLOWED_HOSTS.has(parsed.hostname)) {
        done({ ok: false, ms: 0, reason: 'host 不在白名单' })
        return
      }
      const request = net.request({ method: 'GET', url: parsed.href })
      const timer = setTimeout(() => {
        done({ ok: false, ms: Date.now() - started, reason: '超时' })
        try {
          request.abort()
        } catch {
          // 忽略
        }
      }, timeoutMs)
      request.on('response', (response) => {
        clearTimeout(timer)
        const ok = response.statusCode >= 200 && response.statusCode < 400
        response.resume()
        done({ ok, ms: Date.now() - started, status: response.statusCode })
      })
      request.on('error', (err) => {
        clearTimeout(timer)
        done({ ok: false, ms: Date.now() - started, reason: String(err && err.message).slice(0, 60) })
      })
      request.end()
    } catch (err) {
      done({ ok: false, ms: 0, reason: String(err).slice(0, 60) })
    }
  })
}

async function pickUpdateFeed() {
  const probed = await Promise.all(
    FEED_CANDIDATES.map(async (candidate) => {
      const result = await probeFeedUrl(`${candidate.base}latest.yml`, 6000)
      return { ...candidate, ...result }
    }),
  )
  const reachable = probed.filter((r) => r.ok).sort((a, b) => a.ms - b.ms)
  return { probed, winner: reachable[0] || null }
}

let currentFeedLabel = 'GitHub 直连'

async function runUpdateCheck() {
  if (!app.isPackaged) {
    return {
      ok: false,
      state: 'unavailable',
      message: '开发模式不检查更新，安装版会自动连接 GitHub Releases。',
    }
  }
  const { probed, winner } = await pickUpdateFeed()
  if (!winner) {
    const detail = probed.map((p) => `${p.label} ${p.reason || p.status}`).join('；')
    return { ok: false, state: 'error', message: `所有更新源均不可达：${detail}`, probes: probed }
  }
  currentFeedLabel = winner.label
  // 统一走 generic feed（直连与镜像同一套 latest.yml 语义），下载与校验同源
  autoUpdater.setFeedURL({ provider: 'generic', url: winner.base })
  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo?.version
    const available = version && version !== app.getVersion()
    sendUpdateStatus({
      state: available ? 'available' : 'not-available',
      version,
      message: available
        ? `发现新版本 v${version}（更新源：${winner.label}，探测 ${winner.ms}ms），正在后台下载。`
        : '当前已经是最新版本。',
    })
    return {
      ok: true,
      state: available ? 'available' : 'not-available',
      version,
      source: `${winner.label}（${winner.ms}ms）`,
      probes: probed.map((p) => ({ id: p.id, label: p.label, ok: p.ok, ms: p.ms })),
      message: available
        ? `发现新版本 v${version}，正从「${winner.label}」下载。`
        : '当前已经是最新版本。',
    }
  } catch (err) {
    return {
      ok: false,
      state: 'error',
      source: winner.label,
      probes: probed.map((p) => ({ id: p.id, label: p.label, ok: p.ok, ms: p.ms })),
      message: `检查更新失败（更新源：${winner.label}）：${String(err && err.message).slice(0, 120)}`,
    }
  }
}

function configureUpdater() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () =>
    sendUpdateStatus({ state: 'checking', message: `正在检查 GitHub Releases（更新源：${currentFeedLabel}）。` }),
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

  // 启动 7 秒后自动检查（含测速选优）
  setTimeout(() => {
    runUpdateCheck().catch((error) => {
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
  try {
    return await runUpdateCheck()
  } catch (error) {
    return {
      ok: false,
      state: 'error',
      message: error?.message || '无法连接更新源。',
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

// 截图自检模式使用隔离的临时 userData：不与正式安装/开发实例抢锁，
// 也避免 GPU 缓存目录被残留句柄锁住导致启动失败
const isShotMode = !!process.env.CHRONICLE_SHOT && !isSmokeTest
if (isShotMode) {
  app.setPath('userData', path.join(os.tmpdir(), 'chronicle-shot-profile'))
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance && !isShotMode) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  // 截图自检模式：CHRONICLE_SHOT=<输出目录> 逐页渲染截图后退出（复核用）
  if (isShotMode) {
    const views = (process.env.CHRONICLE_VIEWS || 'today,timeline,history,projects,library,insights,sources,settings')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    const themes = ['dark', 'light']
    app.whenReady().then(async () => {
      try {
        await runIngest()
        fs.mkdirSync(process.env.CHRONICLE_SHOT, { recursive: true })
        const win = new BrowserWindow({
          width: 1440,
          height: 920,
          show: true,
          paintWhenInitiallyHidden: true,
          backgroundColor: '#131315',
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        })
        const baseUrl = require('node:url').pathToFileURL(
          path.join(__dirname, '..', 'dist', 'index.html'),
        ).href
        for (const theme of themes) {
          for (const view of views) {
            await win.loadURL(`${baseUrl}?view=${view}&theme=${theme}`)
            // 等待真实内容渲染完成（懒加载 chunk + 采集数据都就位）
            await win.webContents
              .executeJavaScript(
                `new Promise((resolve) => {
                  const start = Date.now()
                  const timer = setInterval(() => {
                    const ready = document.querySelector(
                      '.kpi-strip,.session-list,.empty-state,.insights-grid-real,' +
                      '.source-card-list,.project-list,.history-day-list,' +
                      '.settings-block,.hour-grid,.artifact-list',
                    )
                    const loading = document.querySelector('.page-loading,.page-loading > span')
                    if ((ready && !loading) || Date.now() - start > 20000) {
                      clearInterval(timer)
                      resolve(true)
                    }
                  }, 200)
                })`,
              )
              .catch(() => {})
            await new Promise((resolve) => setTimeout(resolve, 1200))
            const diag = await win.webContents
              .executeJavaScript(
                `JSON.stringify({
                  theme: document.documentElement.dataset.theme,
                  contentChildren: document.querySelector('.content')?.childElementCount ?? -1,
                  active: (() => {
                    const el = document.querySelector('.nav-item-active')
                    if (!el) return 'none'
                    const cs = getComputedStyle(el)
                    return JSON.stringify({
                      bg: cs.backgroundColor,
                      varOnEl: cs.getPropertyValue('--surface-raised').trim(),
                      cls: el.className,
                    })
                  })(),
                })`,
              )
              .catch(() => '"diag-fail"')
            console.log(`SHOT ${theme}/${view} ${diag}`)
            let image = null
            for (let attempt = 0; attempt < 4 && !image; attempt++) {
              try {
                image = await win.webContents.capturePage()
              } catch (err) {
                if (attempt === 3) throw err
                await new Promise((resolve) => setTimeout(resolve, 700))
              }
            }
            fs.writeFileSync(
              path.join(process.env.CHRONICLE_SHOT, `${view}-${theme}.png`),
              image.toPNG(),
            )
          }
        }
        win.destroy()
        console.log('CHRONICLE_SHOTS_DONE')
        app.exit(0)
      } catch (err) {
        console.error('CHRONICLE_SHOTS_FAIL', err)
        app.exit(1)
      }
    })
    return
  }

  app.whenReady().then(() => {
    app.setAppUserModelId('com.aichronicle.desktop')
    // 安装版隐藏默认菜单栏（File/Edit/View…），外观对齐现代桌面应用；开发模式保留菜单便于调试
    if (app.isPackaged) {
      Menu.setApplicationMenu(null)
    }
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

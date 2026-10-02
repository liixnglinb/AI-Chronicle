const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  net,
  Notification,
  safeStorage,
  screen,
  shell,
  Tray,
} = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { encryptBackup, decryptBackup } = require('./backup-crypto.cjs')
const { autoUpdater } = require('electron-updater')
const { collectAll } = require('./ingest.cjs')

const isDevelopment = !app.isPackaged
const devServerUrl = process.env.ELECTRON_START_URL
const isSmokeTest = process.argv.includes('--smoke-test')
// 启动耗时基线：用于 CHRONICLE_DEBUG 下输出到首帧的毫秒数
const bootAt = Date.now()

// ---------------------------------------------------------------- 日志
// 渲染进程与主进程的错误统一落到 userData/logs，便于事后排查。
// 日志写入失败绝不允许影响主流程，因此全程 try/catch 吞掉。
const MAX_LOG_BYTES = 1024 * 1024

function logDir() {
  return path.join(app.getPath('userData'), 'logs')
}

function appendLog(fileName, entry) {
  try {
    const dir = logDir()
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, fileName)
    // 简单轮转：超过 1MB 直接清空重写，避免日志无限增长
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) {
      fs.writeFileSync(file, '', 'utf8')
    }
    fs.appendFileSync(file, `${new Date().toISOString()} ${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    // 忽略
  }
}

function describeError(error) {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack }
  }
  return { message: typeof error === 'string' ? error : String(error) }
}

// 主进程兜底：记录但不退出，避免一次偶发异常直接关闭应用
process.on('uncaughtException', (error) => {
  appendLog('main.log', { scope: 'uncaughtException', ...describeError(error) })
  console.error('[AI 轨迹] 主进程未捕获异常', error)
})

process.on('unhandledRejection', (reason) => {
  appendLog('main.log', { scope: 'unhandledRejection', ...describeError(reason) })
  console.error('[AI 轨迹] 主进程未处理拒绝', reason)
})

// 子进程（GPU / 网络 / 工具进程）异常退出只记录，不打断用户操作
app.on('child-process-gone', (_event, details) => {
  appendLog('main.log', {
    scope: 'child-process-gone',
    type: details?.type,
    reason: details?.reason,
    exitCode: details?.exitCode,
  })
})

// ---------------------------------------------------------------- 窗口状态
// 记住窗口位置、尺寸、最大化与界面缩放，下次启动原样恢复。
// 位置会做「是否还落在某个显示器工作区内」的校验，防止外接屏拔掉后窗口跑到屏幕外。
const DEFAULT_WINDOW = { width: 1440, height: 960 }
const ZOOM_LEVELS = [0.9, 1, 1.1, 1.25]

function windowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function saveWindowState(state) {
  try {
    fs.writeFileSync(windowStateFile(), JSON.stringify(state), 'utf8')
  } catch {
    // 忽略写入失败
  }
}

function isVisibleOnSomeDisplay(bounds) {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return false
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x)
    const overlapY =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y)
    // 至少露出 80×40，否则认为显示器已移除
    return overlapX >= 80 && overlapY >= 40
  })
}

function normalizeZoom(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 1
  return ZOOM_LEVELS.reduce(
    (best, level) => (Math.abs(level - num) < Math.abs(best - num) ? level : best),
    1,
  )
}

// ---------------------------------------------------------------- 本地数据加密
// 采集缓存里含会话标题与项目路径，属于本机敏感数据：优先用系统钥匙串
// （safeStorage）加密后落盘。部分 Linux 环境没有可用的钥匙串，此时返回 null，
// 缓存退化为明文以保证功能可用。
function buildCacheCrypto() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
  } catch {
    return null
  }
  return {
    encrypt(text) {
      return safeStorage.encryptString(text).toString('base64')
    },
    decrypt(base64) {
      return safeStorage.decryptString(Buffer.from(base64, 'base64'))
    },
  }
}

// ---------------------------------------------------------------- 加密备份
// 加解密实现在 backup-crypto.cjs（纯 Node，可单元测试），这里只负责选文件与读写

// 当前界面缩放，供窗口状态持久化与设置页读取
let activeZoom = 1
let windowStateTimer = null

function persistWindowState(win) {
  if (!win || win.isDestroyed()) return
  const bounds = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds()
  saveWindowState({ ...bounds, maximized: win.isMaximized(), zoom: activeZoom })
}

function scheduleWindowStateSave(win) {
  if (windowStateTimer) clearTimeout(windowStateTimer)
  windowStateTimer = setTimeout(() => persistWindowState(win), 400)
}

// ---------------------------------------------------------------- 桌面集成偏好
// 关闭窗口是否最小化到托盘、是否开机自启、采集完成是否发系统通知。
// 默认全部关闭，保持「点关闭即退出」的常规桌面行为，由用户在设置里主动开启。
const DEFAULT_PREFS = { minimizeToTray: false, autoStart: false, notifyOnIngest: true }
let prefsCache = null
let isQuitting = false
let tray = null

function prefsFile() {
  return path.join(app.getPath('userData'), 'desktop-prefs.json')
}

function loadPrefs() {
  if (prefsCache) return prefsCache
  try {
    const parsed = JSON.parse(fs.readFileSync(prefsFile(), 'utf8'))
    prefsCache = { ...DEFAULT_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch {
    prefsCache = { ...DEFAULT_PREFS }
  }
  return prefsCache
}

function savePrefs(next) {
  prefsCache = { ...loadPrefs(), ...next }
  try {
    fs.writeFileSync(prefsFile(), JSON.stringify(prefsCache), 'utf8')
  } catch {
    // 忽略写入失败
  }
  return prefsCache
}

function applyAutoStart(enabled) {
  // 仅安装版支持开机自启；开发模式下设置会写到 electron.exe 的启动项，没有意义
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      args: enabled ? ['--hidden'] : [],
    })
  } catch (error) {
    appendLog('main.log', { scope: 'setLoginItemSettings', ...describeError(error) })
  }
}

function runtimeAssetPath(name) {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, name), path.join(__dirname, '..', 'build', name)]
    : [path.join(__dirname, '..', 'build', name)]
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
}

function mainWindow() {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function showMainWindow() {
  const win = mainWindow()
  if (!win) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function toggleMainWindow() {
  const win = mainWindow()
  if (win && win.isVisible() && !win.isMinimized()) {
    win.hide()
    return
  }
  showMainWindow()
}

/** 系统通知：用户正在看窗口时不打扰 */
function notify(title, body) {
  try {
    if (!Notification.isSupported()) return
    const win = mainWindow()
    if (win && win.isVisible() && win.isFocused()) return
    const iconPath = runtimeAssetPath('icon.ico')
    new Notification({
      title,
      body,
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
      silent: false,
    }).show()
  } catch (error) {
    appendLog('main.log', { scope: 'notify', ...describeError(error) })
  }
}

function createTray() {
  if (tray) return tray
  // 托盘使用专门的 32px PNG，确保 Windows「显示隐藏图标」区域在 DPI 缩放下
  // 不会从 ICO 随机挑错图层；没有 PNG 时回退到完整 ICO。
  const trayPath = runtimeAssetPath('tray.png')
  const iconPath = runtimeAssetPath('icon.ico')
  const trayIcon = fs.existsSync(trayPath) ? trayPath : iconPath
  if (!fs.existsSync(trayIcon)) return null

  tray = new Tray(trayIcon)
  tray.setToolTip('AI 轨迹 · 本地工作观测台')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => showMainWindow() },
      {
        label: '立即重新采集',
        click: () => {
          void runIngest(true)
            .then((result) => {
              notify('采集完成', `共 ${result.sessions.length} 个会话已更新。`)
            })
            .catch(() => {})
        },
      },
      { type: 'separator' },
      {
        label: '检查更新',
        click: () => {
          void runUpdateCheck({ force: true })
            .then((result) => {
              notify(
                result.state === 'available' ? `发现新版本 v${result.version}` : '更新检查完成',
                result.message ?? '',
              )
            })
            .catch(() => {})
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => toggleMainWindow())
  tray.on('double-click', () => showMainWindow())
  return tray
}

function createWindow() {
  const iconPath = runtimeAssetPath('icon.ico')
  const saved = loadWindowState()
  const restoreBounds = saved && isVisibleOnSomeDisplay(saved)
  const zoom = normalizeZoom(saved?.zoom)
  activeZoom = zoom

  const window = new BrowserWindow({
    width: restoreBounds ? saved.width : DEFAULT_WINDOW.width,
    height: restoreBounds ? saved.height : DEFAULT_WINDOW.height,
    ...(restoreBounds ? { x: saved.x, y: saved.y } : {}),
    minWidth: 960,
    minHeight: 680,
    show: false,
    backgroundColor: '#f5f6f7',
    title: 'AI 轨迹',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            // 与 CSS --chrome-bg 深色值一致；渲染层挂载后会按实际主题同步
            color: '#17191b',
            symbolColor: '#f1f3f4',
            height: 40,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (!isSmokeTest) {
    window.once('ready-to-show', () => {
      window.show()
      if (process.env.CHRONICLE_DEBUG) {
        console.log(`CHRONICLE_STARTUP ${JSON.stringify({ msToFirstPaint: Date.now() - bootAt })}`)
      }
    })
  }

  // 界面缩放：加载前先设一次，加载完成后再设一次，
  // 避免 Chromium 在导航时把缩放重置回 100% 导致闪一下。
  window.webContents.setZoomFactor(zoom)
  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomFactor(activeZoom)
  })

  if (saved?.maximized) window.maximize()

  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) {
    window.on(event, () => scheduleWindowStateSave(window))
  }
  window.on('close', (event) => {
    if (windowStateTimer) clearTimeout(windowStateTimer)
    persistWindowState(window)

    // 用户开启「最小化到托盘」时，点关闭只隐藏窗口，真正退出走托盘菜单
    if (!isQuitting && loadPrefs().minimizeToTray) {
      event.preventDefault()
      window.hide()
    }
  })

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
    window.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      clearTimeout(timeout)
      console.error(`SMOKE_FAILED: ${errorCode} ${errorDescription}`)
      app.exit(1)
    })
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

  // 界面进程崩溃 / 无响应：记录日志，并给用户一键恢复的入口
  const isAutomatedRun = isSmokeTest || !!process.env.CHRONICLE_SHOT

  window.webContents.on('render-process-gone', (_event, details) => {
    appendLog('main.log', {
      scope: 'render-process-gone',
      reason: details?.reason,
      exitCode: details?.exitCode,
    })
    console.error('[AI 轨迹] 界面渲染进程退出', details?.reason)
    if (isAutomatedRun) return
    if (details?.reason === 'clean-exit' || details?.reason === 'killed') return
    void dialog
      .showMessageBox({
        type: 'error',
        title: '界面进程已退出',
        message: '界面渲染进程异常退出。',
        detail: `原因：${details?.reason ?? '未知'}（退出码 ${details?.exitCode ?? '-'}）。本机数据未受影响。`,
        buttons: ['重新加载界面', '退出应用'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) window.reload()
        else app.quit()
      })
  })

  window.webContents.on('unresponsive', () => {
    appendLog('main.log', { scope: 'unresponsive' })
    console.warn('[AI 轨迹] 界面无响应')
  })

  window.webContents.on('responsive', () => {
    appendLog('main.log', { scope: 'responsive' })
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
  if (status?.state === 'downloaded') {
    notify('更新已就绪', `v${status.version ?? ''} 已下载完成，可在设置中心安装。`)
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
// SSRF 防护：更新相关请求只允许 https + host 白名单，
// 且 DNS 解析结果不得为环回/私有/保留地址（防重绑定到内网）
const FEED_ALLOWED_HOSTS = new Set(['github.com', 'gh-proxy.com', 'ghfast.top', 'api.github.com'])

function assertPublicHttpsHost(rawUrl) {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== 'https:') {
    throw new Error('仅允许 https')
  }
  if (!FEED_ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error('host 不在白名单')
  }
  return parsed
}

function isForbiddenAddress(address) {
  const v = String(address).toLowerCase()
  if (v.includes(':')) {
    return (
      v === '::1' ||
      v === '::' ||
      v.startsWith('fe80') ||
      v.startsWith('fc') ||
      v.startsWith('fd') ||
      v.startsWith('::ffff:127.')
    )
  }
  const parts = v.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

async function guardPublicHttps(rawUrl) {
  const parsed = assertPublicHttpsHost(rawUrl)
  const dns = require('node:dns').promises
  const addresses = await dns.lookup(parsed.hostname, { all: true })
  for (const { address } of addresses) {
    if (isForbiddenAddress(address)) {
      throw new Error(`解析到保留地址 ${address}，已拒绝`)
    }
  }
  return parsed
}

async function probeFeedUrl(rawUrl, timeoutMs) {
  let parsed
  try {
    parsed = await guardPublicHttps(rawUrl)
  } catch (err) {
    return { ok: false, ms: 0, reason: String(err && err.message).slice(0, 60) }
  }
  return new Promise((resolve) => {
    const started = Date.now()
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    try {
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
        done({
          ok: false,
          ms: Date.now() - started,
          reason: String(err && err.message).slice(0, 60),
        })
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

// ---------------------------------------------------------------- 更新状态
// 单一写入口：所有更新事件都必须走 setUpdateState，避免各事件各写各的导致界面不一致
let updateState = {
  state: 'idle',
  version: '',
  notes: '',
  percent: 0,
  message: '',
  source: '',
  skippedVersion: '',
}
let updateCheckInFlight = null
let lastUpdateCheckAt = 0
let lastUpdateCheckResult = null
let updaterConfigured = false
// 下载/校验失败时可切换的备用源（按测速顺序，索引 0 是当前使用的源）
let feedProbes = []
let feedFallbackIndex = 1

const UPDATE_CHECK_THROTTLE_MS = 10_000
const UPDATE_PAGE = 'https://github.com/liixnglinb/AI-Chronicle/releases/latest'

function updatePrefsFile() {
  return path.join(app.getPath('userData'), 'update-prefs.json')
}

function loadUpdatePrefs() {
  try {
    const parsed = JSON.parse(fs.readFileSync(updatePrefsFile(), 'utf8'))
    return { skippedVersion: '', ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch {
    return { skippedVersion: '' }
  }
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch }
  sendUpdateStatus({ ...updateState })
  return updateState
}

/**
 * 版本号比较：返回 1（a 更新）/ -1 / 0。
 * 不能用字符串不等判断 —— 线上若回退到旧版本，字符串比较也会误报「有新版本」。
 */
function compareVersions(a, b) {
  const parse = (value) =>
    String(value || '')
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l > r) return 1
    if (l < r) return -1
  }
  return 0
}

function fetchReleaseNotes() {
  // 更新内容从 GitHub API 取 Release 说明（api.github.com 在白名单内且国内可达）
  const url = 'https://api.github.com/repos/liixnglinb/AI-Chronicle/releases/latest'
  return guardPublicHttps(url)
    .then(
      (parsed) =>
        new Promise((resolve) => {
          const request = net.request({ method: 'GET', url: parsed.href })
          request.setHeader('Accept', 'application/vnd.github+json')
          const timer = setTimeout(() => {
            try {
              request.abort()
            } catch {
              /* 忽略 */
            }
            resolve('')
          }, 6000)
          let body = ''
          request.on('response', (response) => {
            response.setEncoding('utf8')
            response.on('data', (chunk) => {
              body += chunk
              if (body.length > 512 * 1024) {
                clearTimeout(timer)
                try {
                  request.abort()
                } catch {
                  /* 忽略 */
                }
                resolve('')
              }
            })
            response.on('end', () => {
              clearTimeout(timer)
              try {
                const info = JSON.parse(body)
                resolve(String(info.body || ''))
              } catch {
                resolve('')
              }
            })
          })
          request.on('error', () => {
            clearTimeout(timer)
            resolve('')
          })
          request.end()
        }),
    )
    .catch(() => '')
}

function markdownToPlain(md) {
  return String(md || '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]{3,}\s*$/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '· ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1200)
}

async function runUpdateCheck({ force = false } = {}) {
  if (!app.isPackaged) {
    setUpdateState({ state: 'unavailable', version: '', notes: '', percent: 0 })
    return {
      ok: false,
      state: 'unavailable',
      message: '开发模式不检查更新，安装版会自动连接 GitHub Releases。',
    }
  }
  // 防并发：启动自检与界面按钮可能同时触发，electron-updater 并发检查会报错
  if (updateCheckInFlight) return updateCheckInFlight
  // 节流：连点「检查更新」不应反复打网络（强制检查时忽略）
  if (
    !force &&
    lastUpdateCheckResult &&
    Date.now() - lastUpdateCheckAt < UPDATE_CHECK_THROTTLE_MS
  ) {
    return lastUpdateCheckResult
  }
  updateCheckInFlight = doUpdateCheck(force)
    .then((result) => {
      lastUpdateCheckAt = Date.now()
      lastUpdateCheckResult = result
      return result
    })
    .finally(() => {
      updateCheckInFlight = null
    })
  return updateCheckInFlight
}

function probeSummary(probed) {
  return probed.map((p) => ({ id: p.id, label: p.label, ok: p.ok, ms: p.ms }))
}

async function doUpdateCheck(force) {
  setUpdateState({ state: 'checking', message: '' })
  const { probed, winner } = await pickUpdateFeed()
  feedProbes = probed.filter((p) => p.ok).sort((a, b) => a.ms - b.ms)
  feedFallbackIndex = 1

  if (!winner) {
    const detail = probed.map((p) => `${p.label} ${p.reason || p.status}`).join('；')
    const message = `所有更新源均不可达：${detail}`
    setUpdateState({ state: 'error', message })
    return { ok: false, state: 'error', message, probes: probeSummary(probed) }
  }

  const skipped = loadUpdatePrefs().skippedVersion
  // 统一走 generic feed（直连与镜像同一套 latest.yml 语义），下载与校验同源
  autoUpdater.setFeedURL({ provider: 'generic', url: winner.base })
  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo?.version ? String(result.updateInfo.version) : ''
    const probes = probeSummary(probed)
    const source = `${winner.label}（${winner.ms}ms）`

    if (!version || compareVersions(version, app.getVersion()) <= 0) {
      setUpdateState({ state: 'not-available', version: '', notes: '', percent: 0, message: '' })
      return {
        ok: true,
        state: 'not-available',
        version,
        source,
        probes,
        message: '当前已经是最新版本。',
      }
    }

    // 用户跳过过的版本不再打扰；手动点「检查更新」（force）时忽略跳过
    if (!force && version === skipped) {
      setUpdateState({
        state: 'not-available',
        version,
        notes: '',
        percent: 0,
        skippedVersion: skipped,
        message: `已跳过 v${version}，需要时可在下方恢复。`,
      })
      return {
        ok: true,
        state: 'not-available',
        version,
        source,
        probes,
        skipped: true,
        message: `v${version} 已被你跳过。`,
      }
    }

    const notes = markdownToPlain(await fetchReleaseNotes())
    setUpdateState({
      state: 'available',
      version,
      notes,
      percent: 0,
      source: winner.label,
      skippedVersion: '',
    })
    return {
      ok: true,
      state: 'available',
      version,
      source,
      probes,
      notes,
      message: `发现新版本 v${version}，正从「${winner.label}」下载。`,
    }
  } catch (err) {
    const message = `检查更新失败（更新源：${winner.label}）：${String(err && err.message).slice(0, 120)}`
    setUpdateState({ state: 'error', message })
    return {
      ok: false,
      state: 'error',
      source: winner.label,
      probes: probeSummary(probed),
      message,
    }
  }
}

function configureUpdater() {
  // 幂等：托盘菜单与启动流程都会调用，重复注册会叠加事件监听与定时器
  if (updaterConfigured) return
  updaterConfigured = true
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  // 更新必须经用户在界面确认后才安装（合规要求），退出时不静默安装
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    const version = String(info.version)
    const skipped = loadUpdatePrefs().skippedVersion
    if (skipped === version) {
      setUpdateState({
        state: 'not-available',
        version,
        percent: 0,
        skippedVersion: skipped,
        message: `已跳过 v${version}。`,
      })
      return
    }
    setUpdateState({ state: 'available', version, percent: 0 })
  })
  autoUpdater.on('update-not-available', () => {
    setUpdateState({ state: 'not-available', version: '', notes: '', percent: 0 })
  })
  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({ state: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    const version = String(info.version)
    const skipped = loadUpdatePrefs().skippedVersion
    if (skipped === version) {
      setUpdateState({
        state: 'not-available',
        version,
        percent: 100,
        skippedVersion: skipped,
        message: `已跳过 v${version}，更新包已下载但不会打扰你。`,
      })
      return
    }
    setUpdateState({ state: 'downloaded', version, percent: 100 })
  })
  autoUpdater.on('error', (error) => {
    const message = String(error?.message ?? '更新失败').slice(0, 160)
    // 已经下载就绪后再报错不切换源，避免把装好的包覆盖掉
    if (updateState.state === 'downloaded') return
    const next = feedProbes[feedFallbackIndex]
    if (next) {
      feedFallbackIndex += 1
      setUpdateState({ state: 'checking', message: `已切换到「${next.label}」重试` })
      autoUpdater.setFeedURL({ provider: 'generic', url: next.base })
      autoUpdater.checkForUpdates().catch(() => {
        setUpdateState({ state: 'error', message })
      })
      return
    }
    setDownloadError(message)
  })

  // 启动 7 秒后自动检查（含测速选优）
  setTimeout(() => {
    runUpdateCheck().catch(() => {
      setUpdateState({ state: 'error', message: '更新检查异常终止。' })
    })
  }, 7000)
}

function setDownloadError(message) {
  setUpdateState({ state: 'error', message })
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
  logPath: logDir(),
  zoom: activeZoom,
  packaged: app.isPackaged,
}))

// 界面缩放（高分屏 / 无障碍）：由渲染层设置，主进程负责应用并持久化
ipcMain.handle('desktop:set-zoom', (event, level) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false, zoom: activeZoom }
  activeZoom = normalizeZoom(level)
  win.webContents.setZoomFactor(activeZoom)
  persistWindowState(win)
  return { ok: true, zoom: activeZoom }
})

// 桌面集成偏好（托盘 / 自启 / 通知）
ipcMain.handle('desktop:get-desktop-prefs', () => loadPrefs())
ipcMain.handle('desktop:set-desktop-prefs', (_event, patch) => {
  const next = savePrefs({
    minimizeToTray: !!patch?.minimizeToTray,
    autoStart: !!patch?.autoStart,
    notifyOnIngest: !!patch?.notifyOnIngest,
  })
  applyAutoStart(next.autoStart)
  return { ok: true, prefs: next }
})

// 加密备份：导出（密码加密）与打开（解密校验）
ipcMain.handle('desktop:export-encrypted-backup', async (event, payload) => {
  const password = String(payload?.password ?? '')
  if (password.length < 6) {
    return { ok: false, message: '备份密码至少 6 位。' }
  }
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
    title: '导出加密备份',
    defaultPath: String(payload?.defaultName ?? 'AI轨迹加密备份.json'),
    filters: [{ name: '加密备份', extensions: ['json'] }],
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try {
    fs.writeFileSync(filePath, encryptBackup(String(payload?.content ?? ''), password), 'utf8')
    return { ok: true, filePath }
  } catch (error) {
    return { ok: false, message: describeError(error).message }
  }
})

ipcMain.handle('desktop:open-encrypted-backup', async (event, password) => {
  const secret = String(password ?? '')
  if (!secret) return { ok: false, message: '请先输入备份密码。' }
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
    title: '打开加密备份',
    properties: ['openFile'],
    filters: [{ name: '加密备份', extensions: ['json'] }],
  })
  const target = filePaths?.[0]
  if (canceled || !target) return { ok: false, canceled: true }
  try {
    const content = decryptBackup(fs.readFileSync(target, 'utf8'), secret)
    return { ok: true, content, filePath: target }
  } catch (error) {
    return { ok: false, message: describeError(error).message }
  }
})

// 渲染进程错误上报（未捕获异常 / 未处理拒绝 / 组件渲染崩溃）
ipcMain.handle('desktop:report-error', (_event, payload) => {
  appendLog('renderer.log', {
    scope: payload?.scope ?? 'unknown',
    message: String(payload?.message ?? '').slice(0, 2000),
    stack: typeof payload?.stack === 'string' ? payload.stack.slice(0, 8000) : undefined,
    source: payload?.source,
  })
  return { ok: true }
})

// 窗口镶边跟随主题：Windows 下 titleBarOverlay 的颜色是主进程属性，
// 只有同步它，浅色主题才不会在顶部残留一条深色带。
const CHROME_COLORS = {
  light: { color: '#ffffff', symbolColor: '#15181a' },
  dark: { color: '#17191b', symbolColor: '#f1f3f4' },
}

ipcMain.handle('desktop:set-window-theme', (event, theme) => {
  if (process.platform !== 'win32') return { ok: false }
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || typeof win.setTitleBarOverlay !== 'function') return { ok: false }
  const palette = CHROME_COLORS[theme === 'dark' ? 'dark' : 'light']
  try {
    win.setTitleBarOverlay({ ...palette, height: 40 })
    return { ok: true }
  } catch {
    return { ok: false }
  }
})

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
    // 缓存内容含会话标题与项目路径，交给系统钥匙串加密后落盘
    crypto: buildCacheCrypto(),
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

ipcMain.handle('desktop:ingest', async (_event, force) => {
  const result = await runIngest(!!force)
  // 手动强制采集且窗口不在前台时，用系统通知告知结果，避免用户以为没反应
  if (force && loadPrefs().notifyOnIngest) {
    notify('采集完成', `已更新 ${result.sessions.length} 个会话。`)
  }
  return result
})

ipcMain.handle('desktop:check-for-updates', async () => {
  try {
    // 界面点按钮一律强制：忽略节流与「已跳过」
    return await runUpdateCheck({ force: true })
  } catch (error) {
    return { ok: false, state: 'error', message: error?.message || '无法连接更新源。' }
  }
})

ipcMain.handle('desktop:install-update', async () => {
  if (!app.isPackaged) {
    return { ok: false, message: '只有安装后的正式版本可以安装更新。' }
  }
  if (updateState.state !== 'downloaded') {
    return { ok: false, message: '更新尚未下载完成。' }
  }
  try {
    // 确认由界面用统一弹窗完成（合规要求），这里只负责执行，不再弹原生对话框
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error?.message || '安装更新失败。' }
  }
})

ipcMain.handle('desktop:set-skipped-update', (_event, version) => {
  const skippedVersion = version ? String(version) : ''
  try {
    fs.writeFileSync(updatePrefsFile(), JSON.stringify({ skippedVersion }), 'utf8')
  } catch {
    // 忽略写入失败
  }
  setUpdateState({
    skippedVersion,
    state: skippedVersion ? 'not-available' : 'idle',
    message: skippedVersion ? `已跳过 v${skippedVersion}。` : '已恢复更新提示。',
  })
  return { ok: true, skippedVersion }
})

ipcMain.handle('desktop:open-update-page', () => {
  // 兜底：所有更新源都不通时，让用户手动到 Release 页下载
  shell.openExternal(UPDATE_PAGE)
  return { ok: true }
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
    const views = (
      process.env.CHRONICLE_VIEWS ||
      'today,timeline,history,projects,library,insights,sources,settings'
    )
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
                      '.summary-strip,.session-list,.empty-state,.insights-grid-real,' +
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

    const startedHidden = process.argv.includes('--hidden')

    createWindow()
    createTray()
    applyAutoStart(loadPrefs().autoStart)

    if (startedHidden) {
      mainWindow()?.hide()
    }

    if (!isSmokeTest) {
      // 启动路径优化：自动更新初始化会发网络探测，推迟到首帧之后，
      // 避免和窗口创建 / 首屏渲染抢主线程。
      const mainWindow = BrowserWindow.getAllWindows()[0]
      const startUpdaterLater = () => {
        setTimeout(() => configureUpdater(), 0)
      }
      if (mainWindow) {
        if (mainWindow.isVisible()) startUpdaterLater()
        else mainWindow.once('ready-to-show', startUpdaterLater)
      } else {
        startUpdaterLater()
      }

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
      else showMainWindow()
    })
  })
}

// 真正的退出（菜单退出 / Cmd+Q / 托盘退出）要先解除「最小化到托盘」的拦截
app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

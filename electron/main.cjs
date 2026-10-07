const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  nativeTheme,
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
const { createAiConfigStore } = require('./ai-config.cjs')
const { buildChatRequest, requestChat, AI_TIMEOUT_MS } = require('./ai-client.cjs')
const { collectDayUserTexts, buildSummaryPrompt } = require('./day-prompts.cjs')

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
// 必须等于 CSS 的 --vr-titlebar-height（src/styles/voyra-tokens.css）。
// 原生 titleBarOverlay 是从窗口右上角往下画这么高，比标题栏矮一行就会压到下面那行的控件上。
const TITLEBAR_HEIGHT = 32
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
  const merged = { ...loadPrefs(), ...next }
  prefsCache = merged
  try {
    fs.writeFileSync(prefsFile(), JSON.stringify(merged), 'utf8')
  } catch (error) {
    appendLog('main.log', { scope: 'save-prefs', ...describeError(error) })
    // 内存里的偏好已经生效，但重启后读不回来 —— 必须告诉调用方，不能报"已保存"
    return {
      ok: false,
      prefs: merged,
      message: '偏好已即时生效，但写入本地文件失败，重启后会退回。',
    }
  }
  return { ok: true, prefs: merged }
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

// 托盘字形分深浅两套：深色任务栏用浅色字形（tray-on-dark），
// 浅色任务栏用深色字形（tray-on-light）。只跟随系统主题，
// 不跟随应用内主题——托盘长在系统任务栏上。
function resolveTrayIcon() {
  const base = nativeTheme.shouldUseDarkColors ? 'tray-on-dark' : 'tray-on-light'
  // Windows 优先用多尺寸 ICO，让系统按 DPI 直接取 16/20/24/32 图层；
  // 其它平台用 32px PNG。都缺时回退到应用图标，至少不是空白。
  const names =
    process.platform === 'win32'
      ? [`${base}.ico`, `${base}.png`, 'icon.ico']
      : [`${base}.png`, 'icon.ico']
  for (const name of names) {
    const resolved = runtimeAssetPath(name)
    if (fs.existsSync(resolved)) return resolved
  }
  return null
}

function createTray() {
  if (tray) return tray
  const trayIcon = resolveTrayIcon()
  if (!trayIcon) return null

  tray = new Tray(trayIcon)
  tray.setToolTip('AI 轨迹 · 本地工作观测台')
  // 系统在深浅色之间切换时同步换字形，避免浅色任务栏上白字压白底
  nativeTheme.on('updated', () => {
    const next = resolveTrayIcon()
    if (tray && next) tray.setImage(next)
  })

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
    backgroundColor: '#08090a',
    title: 'AI 轨迹',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            // 与 CSS --chrome-bg 暗色档一致；渲染层挂载后会按实际主题同步
            color: '#121315',
            symbolColor: '#f6f7f8',
            height: TITLEBAR_HEIGHT,
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
      // 与 setWindowOpenHandler 同一口径：只把 http(s) 交给系统浏览器。
      // 少了这个判断，slack:// 、steam:// 、ms-msdt: 这类协议处理器会被直接调用，
      // 等于给"注入脚本 → 本机执行程序"留了后半段。
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url)
      } else {
        appendLog('main.log', { scope: 'blocked-navigation', url: String(url).slice(0, 200) })
      }
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
  autoDownload: false,
}
let updateCheckInFlight = null
let lastUpdateCheckAt = 0
let lastUpdateCheckResult = null
let updaterConfigured = false
// 已确认可用的新版本号：换源重试时用它决定「只重下」还是「重新检查」
let pendingUpdateVersion = ''
// 下载/校验失败时可切换的备用源（按测速顺序，索引 0 是当前使用的源）
let feedProbes = []
let feedFallbackIndex = 1

const UPDATE_CHECK_THROTTLE_MS = 10_000
// 常驻托盘的应用不能只在启动时查一次：6 小时一轮，出错不打扰
const UPDATE_PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000
const UPDATE_PAGE = 'https://github.com/liixnglinb/AI-Chronicle/releases/latest'

function updatePrefsFile() {
  return path.join(app.getPath('userData'), 'update-prefs.json')
}

function loadUpdatePrefs() {
  let parsed = {}
  try {
    parsed = JSON.parse(fs.readFileSync(updatePrefsFile(), 'utf8'))
    if (!parsed || typeof parsed !== 'object') parsed = {}
  } catch {
    parsed = {}
  }
  return {
    skippedVersion: String(parsed.skippedVersion ?? ''),
    // 更新包 110MB 左右，默认不自动下载；需要用户点一下或在设置里打开自动下载
    autoDownload: parsed.autoDownload === true,
  }
}

function saveUpdatePrefs(patch) {
  const merged = { ...loadUpdatePrefs(), ...patch }
  try {
    fs.writeFileSync(updatePrefsFile(), JSON.stringify(merged), 'utf8')
  } catch {
    // 写入失败只影响偏好持久化，不阻断本次操作
  }
  return merged
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
  // CHRONICLE_DEV_UPDATE=1 让开发模式也走真实检查（electron-updater 读仓库根的
  // dev-app-update.yml，该文件已 gitignore），用于本机验证「检查 → 有新版 → 下载 → 就绪」整条链路。
  if (!app.isPackaged && !process.env.CHRONICLE_DEV_UPDATE) {
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

/** 有新版时的说明文案：自动下载与手动下载两种口径，检查与改偏好两处共用 */
function availableMessage(version, source, autoDownload) {
  return autoDownload
    ? `发现新版本 v${version}，正从「${source}」下载。`
    : `发现新版本 v${version}（安装包约 110 MB），点「下载更新包」后从「${source}」取。`
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
      pendingUpdateVersion = ''
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
    pendingUpdateVersion = version
    const { autoDownload } = loadUpdatePrefs()
    // 文案要一起进状态：面板的说明行读的是 update.message，不传就一直显示旧的通用提示
    const message = availableMessage(version, winner.label, autoDownload)
    setUpdateState({
      state: 'available',
      version,
      notes,
      percent: 0,
      source: winner.label,
      skippedVersion: '',
      autoDownload,
      message,
    })
    return {
      ok: true,
      state: 'available',
      version,
      source,
      probes,
      notes,
      message,
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
  if (!app.isPackaged && !process.env.CHRONICLE_DEV_UPDATE) return
  // 开发模式下的自检：feed 从仓库根的 dev-app-update.yml 读（已 gitignore，不入库不打包）
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true

  const initialPrefs = loadUpdatePrefs()
  // 安装包约 110 MB：默认等用户点「下载更新包」，或在设置中心打开自动下载
  autoUpdater.autoDownload = initialPrefs.autoDownload
  // 更新必须经用户在界面确认后才安装（合规要求），退出时不静默安装
  autoUpdater.autoInstallOnAppQuit = false
  setUpdateState({ autoDownload: initialPrefs.autoDownload })

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    const version = String(info.version)
    pendingUpdateVersion = version
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
    pendingUpdateVersion = ''
    setUpdateState({ state: 'not-available', version: '', notes: '', percent: 0 })
  })
  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({ state: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    const version = String(info.version)
    pendingUpdateVersion = ''
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
    setUpdateState({
      state: 'downloaded',
      version,
      percent: 100,
      // 就绪后不能再留着「点下载更新包」的旧说明
      message: `v${version} 安装包已下载并通过 sha512 校验，点「安装并重启」完成更新。`,
    })
  })
  autoUpdater.on('error', (error) => {
    const message = String(error?.message ?? '更新失败').slice(0, 160)
    // 已经下载就绪后再报错不切换源，避免把装好的包覆盖掉
    if (updateState.state === 'downloaded') return
    const next = feedProbes[feedFallbackIndex]
    if (next) {
      feedFallbackIndex += 1
      // 已经拿到 updateInfo 时只重试下载：换源后重跑 checkForUpdates 会把 110 MB 再下一遍
      const retryDownload = Boolean(pendingUpdateVersion)
      setUpdateState({
        state: 'checking',
        message: retryDownload
          ? `已切换到「${next.label}」继续下载 v${pendingUpdateVersion}`
          : `已切换到「${next.label}」重试`,
      })
      autoUpdater.setFeedURL({ provider: 'generic', url: next.base })
      const retry = retryDownload ? autoUpdater.downloadUpdate() : autoUpdater.checkForUpdates()
      Promise.resolve(retry).catch(() => setUpdateState({ state: 'error', message }))
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

  // 常驻托盘的应用不会自己重启，只在启动查一次等于几天都不知道有新版
  setInterval(() => {
    if (updateState.state === 'downloading' || updateState.state === 'downloaded') return
    runUpdateCheck().catch(() => {})
  }, UPDATE_PERIODIC_CHECK_MS)
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
  // 只覆盖本次真正传来的键。原来用 !!patch?.x 一次重建三个键，
  // 而渲染层每次只发一个键 —— 改「开机自启」会把「最小化到托盘」「采集通知」静默重置成 false。
  const next = {}
  for (const key of Object.keys(DEFAULT_PREFS)) {
    if (patch && typeof patch[key] === 'boolean') next[key] = patch[key]
  }
  const result = savePrefs(next)
  applyAutoStart(result.prefs.autoStart)
  return result
})

// 加密备份：导出（密码加密）与打开（解密校验）
ipcMain.handle('desktop:export-encrypted-backup', async (event, payload) => {
  const password = String(payload?.password ?? '')
  if (password.length < 6) {
    return { ok: false, message: '备份密码至少 6 位。' }
  }
  const win = BrowserWindow.fromWebContents(event.sender)
  // 与 save-text-file 同一口径：净化文件名并锚定到"文档"目录，
  // 否则渲染层传来的 defaultName 可以把保存框预置到任意目录。
  const rawName = String(payload?.defaultName ?? '')
  const safeName = rawName.trim()
    ? rawName.replace(/[<>:"/\\|?*]/g, '-')
    : 'AI轨迹加密备份.chronicle'
  const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
    title: '导出加密备份',
    defaultPath: path.join(app.getPath('documents'), safeName),
    // 渲染层建议的是 .chronicle；只列 json 会让用户导出的备份在"打开"框里被过滤掉
    filters: [{ name: '加密备份', extensions: ['chronicle', 'json'] }],
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
    filters: [{ name: '加密备份', extensions: ['chronicle', 'json'] }],
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
    // 每个字段都要限长并强制成字符串：渲染层（含被注入的脚本）能传任意对象，
    // 未截断的 source 会把日志撑爆，也可能把非预期内容写进本机日志文件。
    scope: String(payload?.scope ?? 'unknown').slice(0, 60),
    message: String(payload?.message ?? '').slice(0, 2000),
    stack: typeof payload?.stack === 'string' ? payload.stack.slice(0, 8000) : undefined,
    source: String(payload?.source ?? '').slice(0, 300),
  })
  return { ok: true }
})

// 窗口镶边跟随主题：Windows 下 titleBarOverlay 的颜色是主进程属性，
// 只有同步它，切换主题才不会在顶部残留一条异色带。
// dark 值必须与 CSS 的 --chrome-bg（暗色档 = --vr-surface 的 #121315）保持一致。
const CHROME_COLORS = {
  light: { color: '#ffffff', symbolColor: '#15181a' },
  dark: { color: '#121315', symbolColor: '#f6f7f8' },
}

ipcMain.handle('desktop:set-window-theme', (event, theme) => {
  if (process.platform !== 'win32') return { ok: false }
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || typeof win.setTitleBarOverlay !== 'function') return { ok: false }
  const palette = CHROME_COLORS[theme === 'dark' ? 'dark' : 'light']
  try {
    win.setTitleBarOverlay({ ...palette, height: TITLEBAR_HEIGHT })
    return { ok: true }
  } catch {
    return { ok: false }
  }
})

// shell.openPath 对可执行文件等于"双击运行"。成果集里的文件来自会话日志，
// 里面完全可能出现 setup.exe / 某个 .lnk，点一下就把程序跑起来了 —— 这里一律拒绝，
// 只允许打开目录和普通数据文件。
const NEVER_OPEN_EXTENSIONS = new Set([
  '.exe',
  '.com',
  '.bat',
  '.cmd',
  '.msi',
  '.msp',
  '.ps1',
  '.psm1',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.wsh',
  '.scr',
  '.lnk',
  '.hta',
  '.cpl',
  '.reg',
])

ipcMain.handle('desktop:open-path', async (_event, rawPath) => {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, message: '路径为空。' }
  }
  const target = path.resolve(expandPath(rawPath))
  if (!fs.existsSync(target)) {
    return { ok: false, message: `路径不存在：${target}` }
  }
  const ext = path.extname(target).toLowerCase()
  if (NEVER_OPEN_EXTENSIONS.has(ext)) {
    appendLog('main.log', { scope: 'blocked-open-path', ext })
    return { ok: false, message: `出于安全，本应用不打开 ${ext} 这类可执行文件。` }
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
    // 阶段感知：全量采集按文件量要几秒到几十秒，必须让渲染层知道当前卡在哪一步
    onProgress: (payload) => {
      const target = mainWindow()
      if (!target || target.isDestroyed()) return
      target.webContents.send('desktop:ingest-progress', payload)
    },
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

// ---------------------------------------------------------------- 模型辅助总结
// 这是本软件唯一会把内容发出去的代码。默认无通道、不联网；
// 只有用户在设置中心填好地址、并在当天面板上主动点「生成总结」时才请求那个地址。
// 密钥只在主进程内解密，绝不通过 IPC 回传，也不写进日志。

const AI_SQLITE_PATHS = {
  zcode: '~/.zcode/cli/db/db.sqlite',
  opencode: '~/.local/share/opencode/opencode.db',
  hermes: '~/.hermes/state.db',
  agnes: '~/.agnes/data/sessions/sessions.db',
}

let aiStore = null

function getAiStore() {
  if (!aiStore) {
    aiStore = createAiConfigStore({
      file: path.join(app.getPath('userData'), 'ai-config.json'),
      crypto: buildCacheCrypto(),
    })
  }
  return aiStore
}

function summariesFile() {
  return path.join(app.getPath('userData'), 'ai-summaries.json')
}

function loadSummaries() {
  try {
    const parsed = JSON.parse(fs.readFileSync(summariesFile(), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

function saveSummary(dayKey, entry) {
  const all = loadSummaries()
  all[dayKey] = entry
  try {
    fs.writeFileSync(summariesFile(), JSON.stringify(all, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

function removeSummary(dayKey) {
  const all = loadSummaries()
  if (!(dayKey in all)) return false
  delete all[dayKey]
  try {
    fs.writeFileSync(summariesFile(), JSON.stringify(all, null, 2), 'utf8')
  } catch {
    return false
  }
  return true
}

function dayBounds(dayKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ''))
  if (!m) return null
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return { start, end: start + 86_400_000 }
}

function dayStatsOf(sessions) {
  const tools = new Set()
  let turns = 0
  let minutes = 0
  let artifacts = 0
  for (const s of sessions) {
    turns += s.turns || 0
    if (s.start && s.end && s.end > s.start) minutes += Math.round((s.end - s.start) / 60_000)
    if (s.toolName) tools.add(s.toolName)
    artifacts += Array.isArray(s.artifacts) ? s.artifacts.length : 0
  }
  return { count: sessions.length, turns, minutes, tools: [...tools], artifacts }
}

/** 组装"这一天要发给模型的东西"。全程只读本机文件，不发任何请求。 */
async function composeDayPrompt(dayKey) {
  const bounds = dayBounds(dayKey)
  if (!bounds) return { ok: false, message: '日期格式不正确' }
  const data = ingestResult || (await runIngest(false))
  const sessions = (data?.sessions || []).filter(
    (s) => s.start && s.start >= bounds.start && s.start < bounds.end,
  )
  if (!sessions.length) return { ok: false, message: '这一天没有会话记录，无需总结' }
  const read = await collectDayUserTexts({
    sessions,
    cachePath: path.join(app.getPath('userData'), 'chronicle-ingest-cache.json'),
    crypto: buildCacheCrypto(),
    sqlitePaths: Object.fromEntries(
      Object.entries(AI_SQLITE_PATHS).map(([tool, spec]) => [tool, expandPath(spec)]),
    ),
  })
  const prompt = buildSummaryPrompt({
    dayKey,
    stats: dayStatsOf(sessions),
    items: read.items,
    unreadable: read.unreadable,
    truncated: read.truncated,
  })
  return { ok: true, prompt, sessions }
}

const aiInFlight = new Map()

ipcMain.handle('desktop:get-ai-config', () => {
  try {
    return getAiStore().state()
  } catch (error) {
    return { ok: false, message: String(error?.message || error).slice(0, 120) }
  }
})

ipcMain.handle('desktop:save-ai-channel', (_event, input) => {
  try {
    return getAiStore().upsert(input && typeof input === 'object' ? input : {})
  } catch (error) {
    return { ok: false, message: String(error?.message || error).slice(0, 120) }
  }
})

ipcMain.handle('desktop:delete-ai-channel', (_event, id) => {
  try {
    return getAiStore().remove(String(id || ''))
  } catch (error) {
    return { ok: false, message: String(error?.message || error).slice(0, 120) }
  }
})

ipcMain.handle('desktop:set-active-ai-channel', (_event, id) => {
  try {
    return getAiStore().setActive(String(id || ''))
  } catch (error) {
    return { ok: false, message: String(error?.message || error).slice(0, 120) }
  }
})

ipcMain.handle('desktop:test-ai-channel', async (_event, payload) => {
  const resolved = getAiStore().resolveForRequest(String(payload?.id || ''))
  if (!resolved.ok) return { ok: false, message: resolved.message }
  const request = buildChatRequest({
    protocol: resolved.channel.protocol,
    baseUrl: resolved.channel.baseUrl,
    key: resolved.channel.key,
    model: resolved.channel.model,
    prompt: { system: '连接测试。只回复两个字：正常', user: 'ping' },
    maxTokens: 16,
  })
  const started = Date.now()
  const result = await requestChat({
    netImpl: net,
    request,
    timeoutMs: Math.min(AI_TIMEOUT_MS, 15_000),
  })
  if (!result.ok) {
    return { ok: false, message: result.message, ms: Date.now() - started, endpoint: request.url }
  }
  return {
    ok: true,
    ms: Date.now() - started,
    endpoint: request.url,
    reply: String(result.text).slice(0, 60),
  }
})

ipcMain.handle('desktop:preview-day-payload', async (_event, payload) => {
  const composed = await composeDayPrompt(String(payload?.dayKey || ''))
  if (!composed.ok) return composed
  return {
    ok: true,
    text: composed.prompt.user,
    system: composed.prompt.system,
    meta: composed.prompt.meta,
  }
})

ipcMain.handle('desktop:summarize-day', async (_event, payload) => {
  const dayKey = String(payload?.dayKey || '')
  const requestId = String(payload?.requestId || `req_${Date.now()}`)
  // 「取消」可能在组装正文阶段就到达（读缓存 + 重读当天文件约 1 秒），那时请求还没发出。
  // 只注册 abort 会漏掉这一窗口的取消，所以先立 aborted 标记，请求发出时再补一刀。
  let aborted = false
  let abortLive = null
  aiInFlight.set(requestId, () => {
    aborted = true
    if (abortLive) abortLive()
  })
  try {
    const resolved = getAiStore().resolveForRequest(String(payload?.id || ''))
    if (!resolved.ok) return { ok: false, requestId, message: resolved.message }
    if (aborted) return { ok: false, canceled: true, requestId, message: '已取消' }
    const composed = await composeDayPrompt(dayKey)
    if (!composed.ok) return { ok: false, requestId, message: composed.message }
    if (aborted) return { ok: false, canceled: true, requestId, message: '已取消' }

    const request = buildChatRequest({
      protocol: resolved.channel.protocol,
      baseUrl: resolved.channel.baseUrl,
      key: resolved.channel.key,
      model: resolved.channel.model,
      prompt: composed.prompt,
    })
    const started = Date.now()
    const result = await requestChat({
      netImpl: net,
      request,
      timeoutMs: AI_TIMEOUT_MS,
      onAbortRegister: (abort) => {
        abortLive = abort
        if (aborted) abort()
      },
    })
    if (aborted) return { ok: false, canceled: true, requestId, message: '已取消' }
    if (!result.ok) {
      return {
        ok: false,
        canceled: !!result.canceled,
        requestId,
        message: result.message,
        ms: Date.now() - started,
      }
    }
    const entry = {
      text: result.text,
      model: resolved.channel.model,
      provider: resolved.channel.name,
      generatedAt: Date.now(),
      chars: composed.prompt.meta.chars,
      includedMessages: composed.prompt.meta.includedMessages,
    }
    const stored = saveSummary(dayKey, entry)
    return {
      ok: true,
      requestId,
      dayKey,
      summary: entry,
      meta: composed.prompt.meta,
      ms: Date.now() - started,
      stored,
      message: stored ? '' : '总结已生成，但写入本机失败（磁盘或权限），关掉这天就看不到。',
    }
  } finally {
    aiInFlight.delete(requestId)
  }
})

ipcMain.handle('desktop:cancel-summarize', (_event, requestId) => {
  const abort = aiInFlight.get(String(requestId || ''))
  if (!abort) return { ok: false, message: '没有在途请求' }
  abort()
  aiInFlight.delete(String(requestId))
  return { ok: true }
})

ipcMain.handle('desktop:get-day-summaries', () => ({ ok: true, summaries: loadSummaries() }))

ipcMain.handle('desktop:delete-day-summary', (_event, dayKey) => ({
  ok: removeSummary(String(dayKey || '')),
}))

// 渲染进程重载（崩溃后一键重新加载 / 手动刷新）时，主进程的更新状态还在，
// 但推送早就发完了 —— 必须给一个拉取入口，否则界面会退回「尚未检查」。
ipcMain.handle('desktop:get-update-state', () => ({ ...updateState }))

ipcMain.handle('desktop:check-for-updates', async () => {
  try {
    // 界面点按钮一律强制：忽略节流与「已跳过」
    return await runUpdateCheck({ force: true })
  } catch (error) {
    return { ok: false, state: 'error', message: error?.message || '无法连接更新源。' }
  }
})

ipcMain.handle('desktop:download-update', async () => {
  if (updateState.state !== 'available') {
    return { ok: false, message: '当前没有待下载的更新。' }
  }
  try {
    setUpdateState({ state: 'downloading', percent: 0 })
    await autoUpdater.downloadUpdate()
    return { ok: true, version: updateState.version }
  } catch (error) {
    const message = String(error?.message ?? '下载失败').slice(0, 160)
    appendLog('main.log', { scope: 'download-update', message })
    // 换源续传由 error 事件负责；这里只兜住「没有任何事件回来」时不要死在下载中
    if (updateState.state === 'downloading') setUpdateState({ state: 'available', percent: 0 })
    return { ok: false, message }
  }
})

ipcMain.handle('desktop:set-update-auto-download', (_event, enabled) => {
  const autoDownload = enabled === true
  const prefs = saveUpdatePrefs({ autoDownload })
  autoUpdater.autoDownload = autoDownload
  // 说明文案要跟着偏好走：切回手动时继续显示「正在下载」就是假信息
  const patch = { autoDownload }
  if (updateState.state === 'available' && updateState.version) {
    patch.message = availableMessage(updateState.version, updateState.source, autoDownload)
  }
  setUpdateState(patch)
  // 打开自动下载时，若已有待装的新版本就立刻补一次下载
  if (autoDownload && updateState.state === 'available') {
    setUpdateState({ state: 'downloading', percent: 0 })
    Promise.resolve(autoUpdater.downloadUpdate()).catch(() => {
      if (updateState.state === 'downloading') setUpdateState({ state: 'available', percent: 0 })
    })
  }
  return { ok: true, autoDownload: prefs.autoDownload }
})

ipcMain.handle('desktop:install-update', async () => {
  // 这里刻意不吃 CHRONICLE_DEV_UPDATE 这个口子：开发模式跑 quitAndInstall 会真的往本机装一份
  if (!app.isPackaged) {
    return { ok: false, message: '只有安装后的正式版本可以安装更新。' }
  }
  if (updateState.state !== 'downloaded') {
    return { ok: false, message: '更新尚未下载完成。' }
  }
  try {
    appendLog('main.log', { scope: 'install-update', version: updateState.version })
    setUpdateState({ message: `正在安装 v${updateState.version}，应用会自动重启。` })
    // isSilent 才会带 /S。oneClick:false 的向导式安装包不静默就会弹出「下一步」，
    // 与确认框里「安装过程会自动完成」的承诺相反（同款静默做法见磁盘清理助手 main.js:183）。
    // setImmediate 让本条 IPC 的回包先发出，再退出进程。
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error?.message || '安装更新失败。' }
  }
})

ipcMain.handle('desktop:set-skipped-update', (_event, version) => {
  const skippedVersion = version ? String(version) : ''
  // 必须整份合并写回：直接写 { skippedVersion } 会把 autoDownload 偏好清掉
  saveUpdatePrefs({ skippedVersion })
  if (skippedVersion) pendingUpdateVersion = ''
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

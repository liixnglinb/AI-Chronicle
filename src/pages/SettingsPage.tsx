import { useEffect, useState } from 'react'
import {
  Bell,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  LockKeyhole,
  Maximize2,
  Monitor,
  Moon,
  Palette,
  Power,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sun,
  Wrench,
} from 'lucide-react'
import { useChronicle, type AutoRefreshInterval } from '../lib/store'
import { saveText } from '../lib/desktop'
import { dayKeyOf } from '../lib/format'
import { APP_ENV, CHANNEL_LABEL } from '../lib/env'
import { PageHeader } from '../components/PageHeader'
import { Switch } from '../components/Switch'
import { Button } from '../components/Button'
import { Input } from '../components/Field'
import { classNames } from '../lib/utils'
import type { ToastMessage } from '../types'
import type { LucideIcon } from 'lucide-react'
import { ICON_SIZE } from '../lib/ui'
import { UpdatePanel } from '../components/UpdatePanel'

interface SettingsPageProps {
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

interface ScanSourceResult {
  id: string
  exists: boolean
  filesToday: number
  lastModified?: string
}

interface SectionDef {
  id: string
  label: string
  icon: LucideIcon
}

const SECTIONS: SectionDef[] = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'capture', label: '数据采集', icon: RefreshCw },
  { id: 'storage', label: '数据管理', icon: HardDrive },
  { id: 'desktop', label: '桌面集成', icon: Monitor },
  { id: 'update', label: '软件更新', icon: Download },
  { id: 'privacy', label: '隐私', icon: ShieldCheck },
  { id: 'diagnostics', label: '诊断', icon: Wrench },
  { id: 'about', label: '关于', icon: Info },
]

const AUTO_REFRESH_OPTIONS: Array<[AutoRefreshInterval, string]> = [
  [60, '1 分钟'],
  [300, '5 分钟'],
  [900, '15 分钟'],
  [0, '手动'],
]

const THEME_OPTIONS: Array<['light' | 'dark', string]> = [
  ['light', '浅色'],
  ['dark', '深色'],
]

/** 界面缩放档位：覆盖高分屏看不清 / 低分屏想多塞内容两种诉求 */
const ZOOM_OPTIONS: Array<[number, string]> = [
  [0.9, '90%'],
  [1, '100%'],
  [1.1, '110%'],
  [1.25, '125%'],
]

export function SettingsPage({ theme, onThemeChange, onToast }: SettingsPageProps) {
  const { data, refresh, isDesktop, settings, updateSettings } = useChronicle()
  const [runtime, setRuntime] = useState<{
    version: string
    platform: string
    arch: string
    dataPath: string
    logPath: string
    packaged: boolean
  } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanSourceResult[] | null>(null)
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id)
  const [zoom, setZoom] = useState(1)
  const [desktopPrefs, setDesktopPrefs] = useState<DesktopPrefs>({
    minimizeToTray: false,
    autoStart: false,
    notifyOnIngest: true,
  })
  const [backupPassword, setBackupPassword] = useState('')
  const [exportingBackup, setExportingBackup] = useState(false)
  const [importingBackup, setImportingBackup] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const [backupSummary, setBackupSummary] = useState<{
    filePath: string
    exportedAt?: string
    sessions: number
    sources: number
  } | null>(null)

  useEffect(() => {
    if (window.desktopAPI) {
      void window.desktopAPI.getRuntimeInfo().then((info) => {
        setRuntime(info)
        setZoom(info.zoom)
      })
      void window.desktopAPI.getDesktopPrefs().then(setDesktopPrefs)
    }
  }, [])

  // 滚动高亮：以页头高度为偏移，判断当前处于哪个分区
  useEffect(() => {
    const nodes = SECTIONS.map((section) =>
      document.getElementById(`settings-${section.id}`),
    ).filter((node): node is HTMLElement => node !== null)
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) {
          setActiveSection(visible[0].target.id.replace('settings-', ''))
        }
      },
      { rootMargin: '-150px 0px -55% 0px', threshold: 0 },
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  function jumpTo(id: string) {
    setActiveSection(id)
    document
      .getElementById(`settings-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function exportAllSessions() {
    if (!data) return
    const result = await saveText(`AI轨迹备份-${dayKeyOf(Date.now())}.json`, buildBackupContent())
    onToast({
      tone: result.ok ? 'success' : 'warning',
      title: result.ok ? '备份已导出' : '导出未完成',
      message: result.message ?? '',
    })
  }

  function buildBackupContent(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        sessions: data?.sessions ?? [],
        sources: data?.sources ?? [],
        cacheStats: data?.cacheStats,
      },
      null,
      2,
    )
  }

  async function exportEncryptedBackup() {
    if (!window.desktopAPI) {
      onToast({
        tone: 'warning',
        title: '仅桌面版支持加密备份',
        message: '浏览器预览环境无法写入本机文件。',
      })
      return
    }
    if (backupPassword.length < 6) {
      onToast({ tone: 'warning', title: '密码太短', message: '备份密码至少 6 位。' })
      return
    }
    setExportingBackup(true)
    try {
      const result = await window.desktopAPI.exportEncryptedBackup({
        content: buildBackupContent(),
        password: backupPassword,
        defaultName: `AI轨迹加密备份-${dayKeyOf(Date.now())}.json`,
      })
      if (result.canceled) return
      onToast({
        tone: result.ok ? 'success' : 'warning',
        title: result.ok ? '加密备份已导出' : '导出未完成',
        message: result.ok
          ? '文件已用 scrypt + AES-256-GCM 加密，需要密码才能打开。'
          : (result.message ?? ''),
      })
    } finally {
      setExportingBackup(false)
    }
  }

  async function openEncryptedBackup() {
    if (!window.desktopAPI) return
    if (!backupPassword) {
      onToast({
        tone: 'warning',
        title: '请先输入密码',
        message: '打开加密备份需要输入导出时设置的密码。',
      })
      return
    }
    setImportingBackup(true)
    try {
      const result = await window.desktopAPI.openEncryptedBackup(backupPassword)
      if (result.canceled) return
      if (!result.ok || !result.content) {
        setBackupSummary(null)
        onToast({
          tone: 'warning',
          title: '解密失败',
          message: result.message ?? '密码不正确，或文件已损坏。',
        })
        return
      }
      try {
        const parsed = JSON.parse(result.content) as {
          exportedAt?: string
          sessions?: unknown[]
          sources?: unknown[]
        }
        setBackupSummary({
          filePath: result.filePath ?? '',
          exportedAt: parsed.exportedAt,
          sessions: parsed.sessions?.length ?? 0,
          sources: parsed.sources?.length ?? 0,
        })
        onToast({
          tone: 'success',
          title: '备份解密成功',
          message: `包含 ${parsed.sessions?.length ?? 0} 个会话、${parsed.sources?.length ?? 0} 个来源。`,
        })
      } catch {
        setBackupSummary(null)
        onToast({
          tone: 'warning',
          title: '备份内容无法解析',
          message: '解密成功，但内容不是预期的备份结构。',
        })
      }
    } finally {
      setImportingBackup(false)
    }
  }

  async function openDataFolder() {
    if (!runtime) return
    const result = await window.desktopAPI?.openPath(runtime.dataPath)
    if (!result?.ok) {
      onToast({
        tone: 'warning',
        title: '无法打开数据目录',
        message: result?.message ?? '请确认目录是否存在。',
      })
    }
  }

  async function openLogFolder() {
    if (!runtime) return
    const result = await window.desktopAPI?.openPath(runtime.logPath)
    if (!result?.ok) {
      onToast({
        tone: 'info',
        title: '日志目录尚不存在',
        message: '应用出现异常后才会写入日志，目前还没有日志文件。',
      })
    }
  }

  async function changeZoom(level: number) {
    if (!window.desktopAPI) {
      onToast({
        tone: 'warning',
        title: '仅桌面版支持界面缩放',
        message: '浏览器预览环境无法调整窗口缩放。',
      })
      return
    }
    const result = await window.desktopAPI.setZoom(level)
    if (!result.ok) {
      onToast({ tone: 'warning', title: '缩放设置未生效', message: '请稍后重试。' })
      return
    }
    setZoom(result.zoom)
  }

  async function runRescan() {
    setRescanning(true)
    try {
      await refresh(true)
      onToast({
        tone: 'success',
        title: '已重新采集',
        message: '全部接入来源已按最新文件重新解析。',
      })
    } finally {
      setRescanning(false)
    }
  }

  async function updateDesktopPrefs(patch: Partial<DesktopPrefs>) {
    if (!window.desktopAPI) {
      onToast({
        tone: 'warning',
        title: '仅桌面版支持桌面集成',
        message: '浏览器预览环境无法设置托盘、自启与系统通知。',
      })
      return
    }
    const result = await window.desktopAPI.setDesktopPrefs(patch)
    if (result.ok) setDesktopPrefs(result.prefs)
  }

  async function scanSources() {
    if (!window.desktopAPI) return
    setScanning(true)
    try {
      const result = await window.desktopAPI.scanSources()
      setScanResult(result.sources)
      onToast({
        tone: 'success',
        title: '来源诊断完成',
        message: `已检查 ${result.sources.length} 个接入来源。`,
      })
    } finally {
      setScanning(false)
    }
  }

  async function copyDiagnostics() {
    const text = JSON.stringify(
      {
        runtime,
        env: APP_ENV,
        cacheStats: data?.cacheStats,
        sessions: data?.sessions.length,
        sources: data?.sources.map((source) => ({
          id: source.id,
          name: source.name,
          status: source.status,
          sessionCount: source.sessionCount,
        })),
        settings,
      },
      null,
      2,
    )
    try {
      await navigator.clipboard.writeText(text)
      onToast({
        tone: 'success',
        title: '诊断信息已复制',
        message: '可粘贴到反馈或本地记录中。',
      })
    } catch {
      onToast({
        tone: 'warning',
        title: '复制失败',
        message: '浏览器或系统拒绝了剪贴板访问。',
      })
    }
  }

  return (
    <div className="page">
      <PageHeader kicker="本地优先 · 全部数据保存在本机 · 每个设置项即时生效" title="设置中心" />

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分区">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const active = activeSection === section.id
            return (
              <button
                key={section.id}
                type="button"
                className={classNames(active && 'settings-nav-active')}
                onClick={() => jumpTo(section.id)}
                aria-current={active ? 'true' : undefined}
              >
                <Icon size={ICON_SIZE.sm} />
                {section.label}
              </button>
            )
          })}
        </nav>

        <div className="settings-content">
          <section className="settings-block" id="settings-appearance">
            <header>
              <span className="settings-block-icon">
                <Palette size={ICON_SIZE.sm} />
              </span>
              <div>
                <h2>外观</h2>
                <p>主题切换立即生效，并会在下次启动时保留。</p>
              </div>
            </header>
            <div className="settings-option">
              <span className="setting-icon">
                {theme === 'light' ? <Sun size={ICON_SIZE.sm} /> : <Moon size={ICON_SIZE.sm} />}
              </span>
              <div className="setting-copy">
                <strong>主题模式</strong>
                <small>浅色 / 深色两套中性配色，窗口镶边会同步跟随。</small>
              </div>
              <div className="segmented-control" aria-label="主题模式">
                {THEME_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={classNames(theme === value && 'segmented-active')}
                    onClick={() => onThemeChange(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-option">
              <span className="setting-icon">
                <Maximize2 size={ICON_SIZE.sm} />
              </span>
              <div className="setting-copy">
                <strong>界面缩放</strong>
                <small>高分屏看不清或想一屏显示更多内容时可调整，设置会保留到下次启动。</small>
              </div>
              <div className="segmented-control" aria-label="界面缩放">
                {ZOOM_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={classNames(Math.abs(zoom - value) < 0.001 && 'segmented-active')}
                    onClick={() => void changeZoom(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings-block" id="settings-capture">
            <header>
              <span className="settings-block-icon">
                <RefreshCw size={ICON_SIZE.sm} />
              </span>
              <div>
                <h2>数据采集</h2>
                <p>采集层带文件级缓存，未变化的日志直接复用，刷新成本很低。</p>
              </div>
            </header>
            <div className="settings-option">
              <span className="setting-icon">
                <RefreshCw size={ICON_SIZE.sm} />
              </span>
              <div className="setting-copy">
                <strong>自动刷新频率</strong>
                <small>间隔越小越实时；窗口重新聚焦时也会静默刷新。</small>
              </div>
              <div className="segmented-control" aria-label="自动刷新频率">
                {AUTO_REFRESH_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={classNames(
                      settings.autoRefreshSeconds === value && 'segmented-active',
                    )}
                    onClick={() => updateSettings({ autoRefreshSeconds: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="settings-row"
              type="button"
              onClick={() => void runRescan()}
              disabled={rescanning}
              aria-busy={rescanning || undefined}
            >
              <span className="setting-icon">
                {rescanning ? <span className="spinner" /> : <RefreshCw size={ICON_SIZE.sm} />}
              </span>
              <span className="setting-copy">
                <strong>立即重新采集</strong>
                <small>清除会话缓存并重新扫描全部接入来源（约 10–20 秒）。</small>
              </span>
              <span className="setting-value">
                {rescanning ? '采集中' : data ? `${data.sessions.length} 会话` : '—'}
              </span>
            </button>
          </section>

          <section className="settings-block" id="settings-storage">
            <header>
              <span className="settings-block-icon">
                <HardDrive size={ICON_SIZE.sm} />
              </span>
              <div>
                <h2>数据管理</h2>
                <p>导出当前会话与接入状态，或直接查看本机数据目录。</p>
              </div>
            </header>
            <button className="settings-row" type="button" onClick={() => void exportAllSessions()}>
              <span className="setting-icon">
                <Download size={ICON_SIZE.sm} />
              </span>
              <span className="setting-copy">
                <strong>导出完整备份</strong>
                <small>导出当前会话、接入状态和缓存统计为 JSON 文件。</small>
              </span>
              <span className="setting-value">{data ? 'JSON' : '—'}</span>
            </button>
            <button
              className="settings-row"
              type="button"
              onClick={() => void openDataFolder()}
              disabled={!runtime}
            >
              <span className="setting-icon">
                <FolderOpen size={ICON_SIZE.sm} />
              </span>
              <span className="setting-copy">
                <strong>打开数据目录</strong>
                <small>在资源管理器中查看应用数据文件。</small>
              </span>
              <span className="setting-value">{runtime ? '打开' : '—'}</span>
            </button>
            <div className="settings-subblock">
              <div className="backup-crypto">
                <div className="backup-crypto-head">
                  <span className="setting-icon">
                    <LockKeyhole size={ICON_SIZE.sm} />
                  </span>
                  <div className="setting-copy">
                    <strong>加密备份</strong>
                    <small>
                      用密码加密导出（scrypt 派生密钥 +
                      AES-256-GCM），换台电脑也能用同一密码解密查看。
                    </small>
                  </div>
                </div>
                <div className="backup-crypto-body">
                  <Input
                    type="password"
                    className="backup-password"
                    value={backupPassword}
                    onChange={(event) => setBackupPassword(event.target.value)}
                    placeholder="备份密码（至少 6 位）"
                    aria-label="备份密码"
                    autoComplete="new-password"
                    invalid={backupPassword.length > 0 && backupPassword.length < 6}
                  />
                  <Button
                    variant="secondary"
                    loading={exportingBackup}
                    onClick={() => void exportEncryptedBackup()}
                  >
                    导出加密备份
                  </Button>
                  <Button
                    variant="secondary"
                    loading={importingBackup}
                    onClick={() => void openEncryptedBackup()}
                  >
                    打开加密备份
                  </Button>
                </div>
                {backupSummary && (
                  <div className="backup-summary">
                    <strong>已解密：{backupSummary.sessions} 个会话</strong>
                    <small>
                      来源 {backupSummary.sources} 个
                      {backupSummary.exportedAt
                        ? ` · 导出于 ${new Date(backupSummary.exportedAt).toLocaleString('zh-CN')}`
                        : ''}
                    </small>
                    {backupSummary.filePath && (
                      <small className="setting-path">{backupSummary.filePath}</small>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="settings-block" id="settings-desktop">
            <header>
              <span className="settings-block-icon">
                <Monitor size={ICON_SIZE.sm} />
              </span>
              <div>
                <h2>桌面集成</h2>
                <p>托盘、开机自启与系统通知。默认全部关闭，保持常规桌面软件的行为。</p>
              </div>
            </header>
            <div className="settings-row">
              <span className="setting-icon">
                <Monitor size={ICON_SIZE.sm} />
              </span>
              <span className="setting-copy">
                <strong>关闭窗口时最小化到托盘</strong>
                <small>开启后点关闭只是隐藏窗口，应用继续在托盘常驻；退出请用托盘菜单。</small>
              </span>
              <Switch
                label="关闭窗口时最小化到托盘"
                checked={desktopPrefs.minimizeToTray}
                disabled={!isDesktop}
                onChange={(value) => void updateDesktopPrefs({ minimizeToTray: value })}
              />
            </div>
            <div className="settings-row">
              <span className="setting-icon">
                <Power size={ICON_SIZE.sm} />
              </span>
              <span className="setting-copy">
                <strong>开机自动启动</strong>
                <small>仅安装版生效；启动后默认隐藏到托盘，不打断你的开机流程。</small>
              </span>
              <Switch
                label="开机自动启动"
                checked={desktopPrefs.autoStart}
                disabled={!isDesktop}
                onChange={(value) => void updateDesktopPrefs({ autoStart: value })}
              />
            </div>
            <div className="settings-row">
              <span className="setting-icon">
                <Bell size={ICON_SIZE.sm} />
              </span>
              <span className="setting-copy">
                <strong>采集完成后发送系统通知</strong>
                <small>仅当窗口不在前台时提醒，避免打扰正在看的你。</small>
              </span>
              <Switch
                label="采集完成后发送系统通知"
                checked={desktopPrefs.notifyOnIngest}
                disabled={!isDesktop}
                onChange={(value) => void updateDesktopPrefs({ notifyOnIngest: value })}
              />
            </div>
          </section>

          <section className="settings-block" id="settings-update">
            <header>
              <span className="settings-block-icon">
                <Download size={ICON_SIZE.sm} />
              </span>
              <div>
                <h2>软件更新</h2>
                <p>自动测速 GitHub 直连与镜像，按最快通道下载。</p>
              </div>
            </header>
            <div className="settings-subblock">
              <UpdatePanel onToast={onToast} />
            </div>
          </section>

          <section className="settings-block" id="settings-privacy">
            <header>
              <span className="settings-block-icon">
                <ShieldCheck size={ICON_SIZE.sm} />
              </span>
              <div>
                <h2>隐私</h2>
                <p>日志读取为只读操作，软件不会上传任何会话内容。</p>
              </div>
            </header>
            <div className="settings-row static">
              <span className="setting-icon">
                <ShieldCheck size={ICON_SIZE.sm} />
              </span>
              <span className="setting-copy">
                <strong>本地优先</strong>
                <small>
                  会话内容、项目路径和产出文件都在本机解析与保存；软件不会上传会话内容。
                </small>
              </span>
            </div>
          </section>

          <section className="settings-block" id="settings-diagnostics">
            <header>
              <span className="settings-block-icon">
                <Wrench size={ICON_SIZE.sm} />
              </span>
              <div>
                <h2>诊断</h2>
                <p>逐个检查接入来源目录是否存在，以及今日是否有日志写入。</p>
              </div>
            </header>
            <button
              className="settings-row"
              type="button"
              onClick={() => void scanSources()}
              disabled={scanning}
            >
              <span className="setting-icon">
                <RefreshCw size={ICON_SIZE.sm} className={scanning ? 'spin' : undefined} />
              </span>
              <span className="setting-copy">
                <strong>诊断接入来源</strong>
                <small>检查目录可读性与今日日志写入情况。</small>
              </span>
              <span className="setting-value">{scanning ? '检查中' : '开始'}</span>
            </button>
            <button className="settings-row" type="button" onClick={() => void copyDiagnostics()}>
              <span className="setting-icon">
                <Copy size={ICON_SIZE.sm} />
              </span>
              <span className="setting-copy">
                <strong>复制诊断信息</strong>
                <small>复制运行环境、缓存统计和接入状态，便于排查问题。</small>
              </span>
              <span className="setting-value">复制</span>
            </button>
            <button
              className="settings-row"
              type="button"
              onClick={() => void openLogFolder()}
              disabled={!runtime}
            >
              <span className="setting-icon">
                <ScrollText size={ICON_SIZE.sm} />
              </span>
              <span className="setting-copy">
                <strong>打开日志目录</strong>
                <small>界面异常与主进程错误会记录在这里，便于定位问题。</small>
              </span>
              <span className="setting-value">{runtime ? '打开' : '—'}</span>
            </button>

            {scanResult && (
              <div className="settings-subblock">
                <div className="scan-result-list">
                  {scanResult.map((source) => {
                    const name =
                      data?.sources.find((item) => item.id === source.id)?.name ?? source.id
                    return (
                      <div className="scan-result-row" key={source.id}>
                        <strong>{name}</strong>
                        <span>{source.exists ? '目录存在' : '目录不存在'}</span>
                        <span>今日 {source.filesToday} 个文件</span>
                        {source.lastModified && <span>{source.lastModified}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="settings-block" id="settings-about">
            <header>
              <span className="settings-block-icon">
                <Info size={ICON_SIZE.sm} />
              </span>
              <div>
                <h2>关于</h2>
                <p>运行环境与数据存放位置。</p>
              </div>
            </header>
            <div className="settings-row static">
              <span className="setting-icon">
                <Info size={ICON_SIZE.sm} />
              </span>
              <span className="setting-copy">
                <strong>运行环境</strong>
                <small>
                  {runtime
                    ? `v${runtime.version} · ${runtime.platform} ${runtime.arch} · ${
                        runtime.packaged ? '安装版' : '开发模式'
                      } · ${CHANNEL_LABEL[APP_ENV.channel]}`
                    : isDesktop
                      ? '读取中…'
                      : '浏览器预览环境'}
                </small>
                {runtime && <small className="setting-path">{runtime.dataPath}</small>}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

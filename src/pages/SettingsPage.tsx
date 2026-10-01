import { useEffect, useState } from 'react'
import {
  Copy,
  Download,
  FolderOpen,
  Info,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { useChronicle, type AutoRefreshInterval } from '../lib/store'
import { saveText } from '../lib/desktop'
import { dayKeyOf } from '../lib/format'
import type { ToastMessage } from '../types'

interface SettingsPageProps {
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

interface UpdateCheckResult {
  ok: boolean
  state: string
  version?: string
  message?: string
  source?: string
  probes?: Array<{ id: string; label: string; ok: boolean; ms: number }>
}

interface ScanSourceResult {
  id: string
  exists: boolean
  filesToday: number
  lastModified?: string
}

interface UpdateStatusView {
  state: string
  version?: string
  message?: string
  source?: string
  percent?: number
  probes?: Array<{ id: string; label: string; ok: boolean; ms: number }>
}

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

export function SettingsPage({ theme, onThemeChange, onToast }: SettingsPageProps) {
  const { data, refresh, isDesktop, settings, updateSettings, update } = useChronicle()
  const [runtime, setRuntime] = useState<{
    version: string
    platform: string
    arch: string
    dataPath: string
    packaged: boolean
  } | null>(null)
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanSourceResult[] | null>(null)

  useEffect(() => {
    if (window.desktopAPI) {
      void window.desktopAPI.getRuntimeInfo().then(setRuntime)
    }
  }, [])

  const latestUpdate: UpdateStatusView | null = updateResult ?? update

  async function checkUpdate() {
    if (!window.desktopAPI) return
    setChecking(true)
    try {
      const result = await window.desktopAPI.checkForUpdates()
      setUpdateResult(result)
      onToast({
        tone: result.state === 'available' ? 'info' : result.ok ? 'success' : 'warning',
        title: result.state === 'available' ? `发现新版本 v${result.version}` : '更新检查完成',
        message: result.message ?? '',
      })
    } finally {
      setChecking(false)
    }
  }

  async function exportAllSessions() {
    if (!data) return
    const payload = {
      exportedAt: new Date().toISOString(),
      sessions: data.sessions,
      sources: data.sources,
      cacheStats: data.cacheStats,
    }
    const result = await saveText(
      `AI轨迹备份-${dayKeyOf(Date.now())}.json`,
      JSON.stringify(payload, null, 2),
    )
    onToast({
      tone: result.ok ? 'success' : 'warning',
      title: result.ok ? '备份已导出' : '导出未完成',
      message: result.message ?? '',
    })
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
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            本地优先 · 全部数据保存在本机 · 每个设置项即时生效
          </span>
          <strong>设置中心</strong>
        </div>
      </div>

      <section className="settings-block">
        <h3>外观</h3>
        <div className="settings-option">
          <span className="setting-icon">
            {theme === 'light' ? <Sun size={17} /> : <Moon size={17} />}
          </span>
          <div className="setting-copy">
            <strong>主题模式</strong>
            <small>切换后立即应用，并会在下次启动时保留。</small>
          </div>
          <div className="segmented-control" aria-label="主题模式">
            {THEME_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={theme === value ? 'segmented-active' : undefined}
                onClick={() => onThemeChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-block">
        <h3>数据采集</h3>
        <div className="settings-option">
          <span className="setting-icon">
            <RefreshCw size={17} />
          </span>
          <div className="setting-copy">
            <strong>自动刷新频率</strong>
            <small>间隔越小越实时；采集层有缓存，刷新成本很低。</small>
          </div>
          <div className="segmented-control" aria-label="自动刷新频率">
            {AUTO_REFRESH_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={settings.autoRefreshSeconds === value ? 'segmented-active' : undefined}
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
          onClick={() => {
            void refresh(true).then(() =>
              onToast({
                tone: 'success',
                title: '已重新采集',
                message: '全部接入来源已按最新文件重新解析。',
              }),
            )
          }}
        >
          <span className="setting-icon">
            <RefreshCw size={17} />
          </span>
          <span className="setting-copy">
            <strong>立即重新采集</strong>
            <small>清除会话缓存并重新扫描全部接入来源（约 10–20 秒）。</small>
          </span>
          <span className="setting-value">{data ? `${data.sessions.length} 会话` : '—'}</span>
        </button>
      </section>

      <section className="settings-block">
        <h3>数据管理</h3>
        <button className="settings-row" type="button" onClick={() => void exportAllSessions()}>
          <span className="setting-icon">
            <Download size={17} />
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
            <FolderOpen size={17} />
          </span>
          <span className="setting-copy">
            <strong>打开数据目录</strong>
            <small>在资源管理器中查看应用数据文件。</small>
          </span>
          <span className="setting-value">{runtime ? '打开' : '—'}</span>
        </button>
      </section>

      <section className="settings-block">
        <h3>软件更新</h3>
        <button
          className="settings-row"
          type="button"
          onClick={() => void checkUpdate()}
          disabled={checking}
        >
          <span className="setting-icon">
            <RefreshCw size={17} className={checking ? 'spin' : undefined} />
          </span>
          <span className="setting-copy">
            <strong>检查更新</strong>
            <small>自动测速 GitHub 直连与镜像，按最快通道下载。</small>
          </span>
          <span className="setting-value">
            {checking ? '检查中' : latestUpdate?.source ?? (runtime?.packaged ? '点按测速' : '开发模式')}
          </span>
        </button>

        {latestUpdate && (
          <div className="settings-row static">
            <span className="setting-icon">
              <Download size={17} />
            </span>
            <span className="setting-copy">
              <strong>
                {latestUpdate.state === 'available' && `v${latestUpdate.version} 可更新`}
                {latestUpdate.state === 'downloading' && `下载中 ${Math.round(latestUpdate.percent ?? 0)}%`}
                {latestUpdate.state === 'downloaded' && `v${latestUpdate.version} 已就绪`}
                {latestUpdate.state === 'not-available' && '已是最新版本'}
                {['error', 'unavailable'].includes(latestUpdate.state) && '更新不可用'}
              </strong>
              <small>{latestUpdate.message ?? '当前没有更新操作。'}</small>
              {latestUpdate.probes && (
                <small>
                  测速：
                  {latestUpdate.probes
                    .map((probe) => `${probe.label} ${probe.ok ? `${probe.ms}ms` : '不通'}`)
                    .join(' · ')}
                </small>
              )}
            </span>
          </div>
        )}

        {latestUpdate?.state === 'downloaded' && (
          <button
            className="settings-row"
            type="button"
            onClick={() => void window.desktopAPI?.installUpdate()}
          >
            <span className="setting-icon">
              <Download size={17} />
            </span>
            <span className="setting-copy">
              <strong>安装并重启</strong>
              <small>新版本已下载完成，确认后自动完成安装并重启。</small>
            </span>
          </button>
        )}
      </section>

      <section className="settings-block">
        <h3>隐私</h3>
        <div className="settings-row static">
          <span className="setting-icon">
            <ShieldCheck size={17} />
          </span>
          <span className="setting-copy">
            <strong>本地优先</strong>
            <small>
              会话内容、项目路径和产出文件都在本机解析与保存；软件不会上传会话内容。
            </small>
          </span>
        </div>
      </section>

      <section className="settings-block">
        <h3>诊断</h3>
        <button
          className="settings-row"
          type="button"
          onClick={() => void scanSources()}
          disabled={scanning}
        >
          <span className="setting-icon">
            <RefreshCw size={17} className={scanning ? 'spin' : undefined} />
          </span>
          <span className="setting-copy">
            <strong>诊断接入来源</strong>
            <small>逐个检查接入来源目录是否存在，以及今日是否有日志写入。</small>
          </span>
          <span className="setting-value">{scanning ? '检查中' : '开始'}</span>
        </button>
        <button className="settings-row" type="button" onClick={() => void copyDiagnostics()}>
          <span className="setting-icon">
            <Copy size={17} />
          </span>
          <span className="setting-copy">
            <strong>复制诊断信息</strong>
            <small>复制运行环境、缓存统计和接入状态，便于排查问题。</small>
          </span>
          <span className="setting-value">复制</span>
        </button>

        {scanResult && (
          <div className="scan-result-list">
            {scanResult.map((source) => {
              const name = data?.sources.find((item) => item.id === source.id)?.name ?? source.id
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
        )}
      </section>

      <section className="settings-block">
        <h3>关于</h3>
        <div className="settings-row static">
          <span className="setting-icon">
            <Info size={17} />
          </span>
          <span className="setting-copy">
            <strong>运行环境</strong>
            <small>
              {runtime
                ? `v${runtime.version} · ${runtime.platform} ${runtime.arch} · ${
                    runtime.packaged ? '安装版' : '开发模式'
                  }`
                : isDesktop
                  ? '读取中…'
                  : '浏览器预览环境'}
            </small>
          </span>
        </div>
      </section>
    </div>
  )
}

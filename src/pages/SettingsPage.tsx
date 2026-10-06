import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpCircle,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Lock,
  Monitor,
  Palette,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useChronicle, type AutoRefreshInterval } from '../lib/store'
import { openLocalWithToast, saveText } from '../lib/desktop'
import { callDesktop } from '../lib/main-call'
import { useSourceScan } from '../lib/useSourceScan'
import { dayKeyOf } from '../lib/format'
import { APP_ENV, CHANNEL_LABEL } from '../lib/env'
import { Switch } from '../components/Switch'
import { UpdatePanel } from '../components/UpdatePanel'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { classNames } from '../lib/utils'
import type { ToastMessage } from '../types'
import type { LucideIcon } from 'lucide-react'

interface SettingsPageProps {
  theme: 'light' | 'dark'
  searchQuery: string
  onThemeChange: (theme: 'light' | 'dark') => void
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

type SettingsSection = 'appearance' | 'ingest' | 'desktop' | 'backup' | 'update' | 'diag'

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: LucideIcon }> = [
  { id: 'appearance', label: '外观与显示', icon: Palette },
  { id: 'ingest', label: '数据采集', icon: RefreshCw },
  { id: 'desktop', label: '桌面集成', icon: Monitor },
  { id: 'backup', label: '安全备份', icon: ShieldCheck },
  { id: 'update', label: '软件更新', icon: ArrowUpCircle },
  { id: 'diag', label: '关于与诊断', icon: Cpu },
]

/**
 * 各分区参与搜索的关键词。
 * 顶栏搜索框在设置中心同样要有过滤效果 —— 输入「备份」应直接跳到安全备份分区，
 * 否则这个框在设置页就成了摆设（P0-1 的原始诉求）。
 */
const SECTION_KEYWORDS: Record<SettingsSection, string[]> = {
  appearance: [
    '外观',
    '主题',
    '深色',
    '浅色',
    '黑曜',
    '暖灰',
    '缩放',
    '高分屏',
    '字体',
    'theme',
    '目录',
    '路径',
    '工作目录',
    '项目集',
    '面包屑',
    '隐藏',
  ],
  ingest: ['采集', '刷新', '轮询', '静默', '重新采集', '缓存', 'ingest'],
  desktop: ['桌面', '托盘', '开机', '自启', '通知', '集成', 'desktop'],
  backup: ['备份', '加密', '解密', '密码', '导出', '导入', '校验', 'aes', 'gcm', 'backup'],
  update: ['更新', '版本', '升级', '下载', '安装', 'update'],
  diag: ['诊断', '关于', '日志', '目录', '平台', '版本', '复制', '校验接入', 'diag'],
}

const AUTO_REFRESH_OPTIONS: Array<[AutoRefreshInterval, string]> = [
  [60, '1 分钟'],
  [300, '5 分钟'],
  [900, '15 分钟'],
  [0, '不轮询'],
]

const ZOOM_OPTIONS = [90, 100, 110, 125]

/** 密码强度：长度 + 字符种类，够用且不引入额外依赖 */
function passwordStrength(pw: string): {
  level: 'weak' | 'fair' | 'good'
  percent: number
  label: string
} {
  if (!pw) return { level: 'weak', percent: 0, label: '未输入' }
  let score = 0
  if (pw.length >= 8) score += 1
  if (pw.length >= 12) score += 1
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1
  if (/\d/.test(pw)) score += 1
  if (/[^A-Za-z0-9]/.test(pw)) score += 1
  if (pw.length < 8) return { level: 'weak', percent: 15, label: '过短（至少 8 位）' }
  if (score <= 2) return { level: 'weak', percent: 35, label: '偏弱' }
  if (score <= 3) return { level: 'fair', percent: 62, label: '一般' }
  return { level: 'good', percent: 100, label: '强' }
}

/**
 * 设置中心：类 macOS 偏好设置的二级导航。
 * 左侧 6 个固定锚点，右侧渲染标准设置行（图标 + 标题 + 辅助说明 + 右侧控件），
 * 保证开关、按钮、分段控制器在任意缩放比下基线对齐。
 */
export function SettingsPage({ theme, searchQuery, onThemeChange, onToast }: SettingsPageProps) {
  const { data, refresh, isDesktop, settings, updateSettings } = useChronicle()
  const [manualSection, setManualSection] = useState<SettingsSection | null>(null)
  const [runtime, setRuntime] = useState<DesktopRuntimeInfo | null>(null)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [desktopPrefs, setDesktopPrefs] = useState<DesktopPrefs>({
    minimizeToTray: false,
    autoStart: false,
    notifyOnIngest: false,
  })
  const [backupPassword, setBackupPassword] = useState('')
  const [exportingBackup, setExportingBackup] = useState(false)
  const [importingBackup, setImportingBackup] = useState(false)
  const { scanResult, scanning, rescanning, runScan, runRescan } = useSourceScan(onToast, refresh)
  const [backupSummary, setBackupSummary] = useState<{
    filePath: string
    exportedAt?: string
    sessions: number
    sources: number
  } | null>(null)

  useEffect(() => {
    if (!window.desktopAPI) return
    // 诊断信息取不到时保持"读取中…"而不是空值，所以这里只兜住异常，不假装成功
    void callDesktop(onToast, '读取运行时信息', () => window.desktopAPI!.getRuntimeInfo()).then(
      (info) => {
        if (!info) return
        setRuntime(info)
        setZoomPercent(Math.round(info.zoom * 100))
      },
    )
    void callDesktop(onToast, '读取桌面集成偏好', () => window.desktopAPI!.getDesktopPrefs()).then(
      (prefs) => {
        if (prefs) setDesktopPrefs(prefs)
      },
    )
  }, [onToast])

  const strength = useMemo(() => passwordStrength(backupPassword), [backupPassword])

  // 搜索命中的分区集合。空搜索 = 全部可见（导航仍显示全部 6 项）。
  const matchedSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    return SECTIONS.filter((section) => {
      const keywords = SECTION_KEYWORDS[section.id]
      return section.label.toLowerCase().includes(q) || keywords.some((k) => k.includes(q))
    }).map((section) => section.id)
  }, [searchQuery])

  // 命中优先：搜索词生效时自动切到第一个命中分区，用户点导航可覆盖
  const activeSection: SettingsSection = useMemo(() => {
    if (manualSection) return manualSection
    if (matchedSections && matchedSections.length > 0) return matchedSections[0]
    return 'appearance'
  }, [manualSection, matchedSections])

  const isSectionVisible = (id: SettingsSection) => !matchedSections || matchedSections.includes(id)

  async function handleZoomChange(target: number) {
    const previous = zoomPercent
    setZoomPercent(target)
    if (!window.desktopAPI) return
    const result = await callDesktop(onToast, '应用界面缩放', () =>
      window.desktopAPI!.setZoom(target / 100),
    )
    if (!result || !result.ok) {
      setZoomPercent(previous)
      onToast({ tone: 'warning', title: '缩放设置未生效', message: '已退回原来的缩放比例。' })
    }
  }

  async function handlePrefChange(key: keyof DesktopPrefs, value: boolean) {
    const previous = desktopPrefs
    const next = { ...desktopPrefs, [key]: value }
    setDesktopPrefs(next)
    if (!window.desktopAPI) {
      onToast({
        tone: 'warning',
        title: '仅桌面版支持桌面集成',
        message: '浏览器预览环境无法设置托盘、自启与系统通知。',
      })
      return
    }
    const result = await callDesktop(onToast, '保存桌面集成偏好', () =>
      window.desktopAPI!.setDesktopPrefs({ [key]: value }),
    )
    if (!result) {
      setDesktopPrefs(previous)
      return
    }
    setDesktopPrefs(result.prefs)
    // ok=false 表示即时生效但没能写盘：保持开关为新状态（确实已生效），只把持久化风险说出来
    if (!result.ok) {
      onToast({
        tone: 'warning',
        title: '设置已生效，未能记住',
        message: result.message || '偏好无法写入本地文件，重启后会退回原状态。',
      })
      return
    }
    onToast({ tone: 'info', title: '配置已保存', message: '桌面集成偏好已立即生效' })
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

  async function handleExportPlain() {
    if (!data) return
    const result = await callDesktop(onToast, '导出备份', () =>
      saveText(`AI轨迹备份-${dayKeyOf(Date.now())}.json`, buildBackupContent()),
    )
    if (!result || result.canceled) return
    onToast({
      tone: result.ok ? 'success' : 'warning',
      title: result.ok ? '备份已导出' : '导出未完成',
      message: result.message ?? '',
    })
  }

  async function handleExportEncrypted() {
    if (!window.desktopAPI) {
      onToast({
        tone: 'warning',
        title: '仅桌面版支持加密备份',
        message: '浏览器预览环境无法写入本机文件。',
      })
      return
    }
    if (backupPassword.length < 8) {
      onToast({ tone: 'warning', title: '密码强度不足', message: '加密备份密码长度不得少于 8 位' })
      return
    }
    setExportingBackup(true)
    // 保存路径弹窗要等用户操作，不套超时：等 5 分钟挑目录不是卡死
    const result = await callDesktop(onToast, '导出加密备份', () =>
      window.desktopAPI!.exportEncryptedBackup({
        content: buildBackupContent(),
        password: backupPassword,
        defaultName: `AI轨迹加密备份-${dayKeyOf(Date.now())}.chronicle`,
      }),
    )
    setExportingBackup(false)
    if (!result || result.canceled) return
    onToast(
      result.ok
        ? {
            tone: 'success',
            title: '备份成功',
            message: `加密归档已写入：${result.filePath ?? ''}`,
          }
        : { tone: 'warning', title: '导出未完成', message: result.message ?? '' },
    )
  }

  async function handleRestoreBackup() {
    if (!window.desktopAPI) return
    if (!backupPassword) {
      onToast({ tone: 'warning', title: '需要密码', message: '请输入对应的解密密码后再打开归档' })
      return
    }
    setImportingBackup(true)
    // 选文件弹窗等用户操作，不套超时
    const result = await callDesktop(onToast, '打开加密备份', () =>
      window.desktopAPI!.openEncryptedBackup(backupPassword),
    )
    setImportingBackup(false)
    if (!result || result.canceled) return
    if (!result.ok || !result.content) {
      setBackupSummary(null)
      onToast({
        tone: 'danger',
        title: '解密失败',
        message: result.message || '密码错误或文件已损坏',
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
        title: '解密成功',
        message: `备份文件结构校验通过：${parsed.sessions?.length ?? 0} 个会话、${parsed.sources?.length ?? 0} 个来源。`,
      })
    } catch {
      setBackupSummary(null)
      onToast({
        tone: 'danger',
        title: '备份内容无法解析',
        message: '解密成功，但内容不是预期的备份结构。',
      })
    }
  }

  async function copyDiagnostics() {
    const payload = {
      runtime: runtime ?? APP_ENV,
      desktopPrefs,
      settings,
      cacheStats: data?.cacheStats,
      sessionCount: data?.sessions.length ?? 0,
      sources: (data?.sources ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        protocol: s.protocol,
        sessionCount: s.sessionCount,
      })),
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      onToast({
        tone: 'success',
        title: '已复制到剪贴板',
        message: '完整诊断快照已格式化就绪。',
      })
    } catch {
      onToast({ tone: 'danger', title: '复制失败', message: '浏览器或系统拒绝了剪贴板访问。' })
    }
  }

  if (!isDesktop) {
    return (
      <DesktopOnlyPage
        title="设置中心"
        description="设置项依赖本机文件系统与桌面集成能力，浏览器预览环境无法完整展示。"
      />
    )
  }

  return (
    <div className="desk-settings-shell">
      <nav className="desk-settings-nav" aria-label="设置导航">
        {SECTIONS.filter((section) => isSectionVisible(section.id)).map((section) => {
          const Icon = section.icon
          return (
            <button
              key={section.id}
              className={classNames('desk-set-tab', activeSection === section.id && 'active')}
              onClick={() => setManualSection(section.id)}
              aria-current={activeSection === section.id ? 'true' : undefined}
            >
              <Icon size={15} />
              <span>{section.label}</span>
            </button>
          )
        })}
      </nav>

      <section className="desk-settings-content">
        {matchedSections && matchedSections.length === 0 && (
          <div className="desk-set-card desk-enter">
            <EmptyState
              compact
              title="没有匹配的设置项"
              description={`过滤词「${searchQuery}」没有命中任何设置分区。试试「备份」「主题」「更新」等关键词。`}
            />
          </div>
        )}

        {/* ---------- 外观与显示 ---------- */}
        {activeSection === 'appearance' && isSectionVisible('appearance') && (
          <div className="desk-set-card desk-enter">
            <h3 className="desk-set-title">外观与界面缩放</h3>

            <div className="desk-set-row">
              <span className="desk-set-copy">
                <strong>主题模式</strong>
                <small>纯血黑曜深色档与暖灰浅色档，切换时窗口镶边实时联动</small>
              </span>
              <div className="desk-pill-group">
                <button
                  className={classNames('desk-pill-btn', theme === 'dark' && 'active')}
                  onClick={() => onThemeChange('dark')}
                  aria-pressed={theme === 'dark'}
                >
                  黑曜深色
                </button>
                <button
                  className={classNames('desk-pill-btn', theme === 'light' && 'active')}
                  onClick={() => onThemeChange('light')}
                  aria-pressed={theme === 'light'}
                >
                  暖灰浅色
                </button>
              </div>
            </div>

            <div className="desk-set-row">
              <span className="desk-set-copy">
                <strong>高分屏界面缩放</strong>
                <small>调整底层 Chromium WebContents 缩放系数，保持高密度排版</small>
              </span>
              <div className="desk-pill-group">
                {ZOOM_OPTIONS.map((scale) => (
                  <button
                    key={scale}
                    className={classNames('desk-pill-btn', zoomPercent === scale && 'active')}
                    onClick={() => void handleZoomChange(scale)}
                    aria-pressed={zoomPercent === scale}
                  >
                    {scale}%
                  </button>
                ))}
              </div>
            </div>

            <div className="desk-set-row">
              <span className="desk-set-copy">
                <strong>显示目录路径</strong>
                <small>
                  默认只显示「在哪个软件干了什么」。打开后恢复目录名、面包屑与完整路径，侧栏同时出现「项目集」视图
                </small>
              </span>
              <Switch
                label="显示目录路径"
                checked={settings.showProjectPaths}
                onChange={(checked) => updateSettings({ showProjectPaths: checked })}
              />
            </div>
          </div>
        )}

        {/* ---------- 数据采集 ---------- */}
        {activeSection === 'ingest' && isSectionVisible('ingest') && (
          <div className="desk-set-card desk-enter">
            <h3 className="desk-set-title">数据采集策略</h3>

            <div className="desk-set-row">
              <span className="desk-set-copy">
                <strong>自动静默轮询</strong>
                <small>
                  后台按文件元数据 mtime
                  增量探活，无文件变动时零开销；选「不轮询」后只在切回本窗口时补一次采集
                </small>
              </span>
              <div className="desk-pill-group">
                {AUTO_REFRESH_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    className={classNames(
                      'desk-pill-btn',
                      settings.autoRefreshSeconds === value && 'active',
                    )}
                    onClick={() => updateSettings({ autoRefreshSeconds: value })}
                    aria-pressed={settings.autoRefreshSeconds === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="desk-set-row is-clickable"
              onClick={() => void runRescan()}
              disabled={rescanning}
              aria-busy={rescanning}
            >
              <span className="desk-set-copy">
                <strong>{rescanning ? '正在采集…' : '立即重新采集'}</strong>
                <small>
                  清除会话缓存并重新扫描全部接入来源（首次按本机文件量而定、较慢，之后只重读有变化的文件；期间显示阶段进度）
                </small>
              </span>
              <span className="desk-meta-badge">
                {rescanning ? '采集中' : data ? `${data.sessions.length} 会话` : '—'}
              </span>
            </button>
          </div>
        )}

        {/* ---------- 桌面集成 ---------- */}
        {activeSection === 'desktop' && isSectionVisible('desktop') && (
          <div className="desk-set-card desk-enter">
            <h3 className="desk-set-title">操作系统级集成</h3>

            <div className="desk-set-row">
              <span className="desk-set-copy">
                <strong>关闭时最小化到托盘</strong>
                <small>点击窗口关闭按钮时不终止应用，继续保持后台低功耗监听</small>
              </span>
              <Switch
                label="最小化到托盘"
                checked={desktopPrefs.minimizeToTray}
                onChange={(c) => void handlePrefChange('minimizeToTray', c)}
              />
            </div>

            <div className="desk-set-row">
              <span className="desk-set-copy">
                <strong>开机自动启动</strong>
                <small>随系统自启时将静默进入托盘（仅安装版生效）</small>
              </span>
              <Switch
                label="开机启动"
                checked={desktopPrefs.autoStart}
                onChange={(c) => void handlePrefChange('autoStart', c)}
              />
            </div>

            <div className="desk-set-row">
              <span className="desk-set-copy">
                <strong>采集完成系统通知</strong>
                <small>仅在窗口未处于前台活动状态时发送桌面通知，避免干扰工作</small>
              </span>
              <Switch
                label="系统通知"
                checked={desktopPrefs.notifyOnIngest}
                onChange={(c) => void handlePrefChange('notifyOnIngest', c)}
              />
            </div>
          </div>
        )}

        {/* ---------- 安全备份 ---------- */}
        {activeSection === 'backup' && isSectionVisible('backup') && (
          <div className="desk-set-card desk-enter">
            <h3 className="desk-set-title">安全加密与本地备份</h3>
            <p className="desk-source-detail">
              采用 scrypt 派生密钥与 AES-256-GCM 认证加密信封，可安全存放于非受信任介质中。
              会话内容、项目路径与产出文件全部留在本机。
            </p>

            <div className="desk-backup-form">
              <div className="desk-field-input-wrap">
                <Lock size={13} className="desk-field-ico" />
                <input
                  type="password"
                  placeholder="请输入用于备份加密 / 解密的密码（至少 8 位）"
                  aria-label="备份密码"
                  autoComplete="new-password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  className="desk-field-input"
                />
              </div>

              <div className="desk-password-meter">
                <span>密码强度</span>
                <span className="desk-password-meter-bar">
                  <span
                    className="desk-password-meter-fill"
                    data-level={strength.level}
                    style={{ width: `${strength.percent}%` }}
                  />
                </span>
                <span>{strength.label}</span>
              </div>

              <div className="desk-backup-actions">
                <button
                  onClick={() => void handleExportEncrypted()}
                  disabled={exportingBackup}
                  className="desk-btn-primary"
                >
                  <Download size={13} />
                  <span>{exportingBackup ? '加密中…' : '导出加密备份'}</span>
                </button>
                <button
                  onClick={() => void handleRestoreBackup()}
                  disabled={importingBackup}
                  className="desk-btn-secondary"
                >
                  <Upload size={13} />
                  <span>{importingBackup ? '校验中…' : '打开并校验备份'}</span>
                </button>
                <button onClick={() => void handleExportPlain()} className="desk-btn-ghost">
                  <Download size={13} />
                  <span>导出明文 JSON</span>
                </button>
              </div>

              {backupSummary && (
                <div className="desk-backup-result">
                  <strong>
                    校验通过：{backupSummary.sessions} 个会话 · {backupSummary.sources} 个来源
                  </strong>
                  {backupSummary.exportedAt && (
                    <span>导出于 {new Date(backupSummary.exportedAt).toLocaleString('zh-CN')}</span>
                  )}
                  {backupSummary.filePath && <code>{backupSummary.filePath}</code>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- 软件更新 ---------- */}
        {activeSection === 'update' && isSectionVisible('update') && (
          <div className="desk-set-card desk-enter">
            <h3 className="desk-set-title">软件版本更新</h3>
            <UpdatePanel onToast={onToast} />
          </div>
        )}

        {/* ---------- 关于与诊断 ---------- */}
        {activeSection === 'diag' && isSectionVisible('diag') && (
          <div className="desk-set-card desk-enter">
            <h3 className="desk-set-title">环境诊断与运行时详情</h3>

            <div className="desk-diag-grid">
              <div className="desk-diag-item">
                <small>平台架构</small>
                <strong>
                  {runtime
                    ? `${runtime.platform}-${runtime.arch}`
                    : `${navigator.platform}-browser`}
                </strong>
              </div>
              <div className="desk-diag-item">
                <small>客户端版本</small>
                <strong>
                  v{runtime?.version ?? '0.0.0'} · {CHANNEL_LABEL[APP_ENV.channel]}
                </strong>
              </div>
              <div className="desk-diag-item">
                <small>数据目录</small>
                {runtime ? (
                  <button
                    className="desk-diag-link"
                    onClick={() => void openLocalWithToast(onToast, runtime.dataPath)}
                  >
                    打开 Local 目录 <ExternalLink size={10} />
                  </button>
                ) : (
                  <span>读取中…</span>
                )}
              </div>
              <div className="desk-diag-item">
                <small>错误日志</small>
                {runtime ? (
                  <button
                    className="desk-diag-link"
                    onClick={() => void openLocalWithToast(onToast, runtime.logPath)}
                  >
                    打开 Logs 目录 <ExternalLink size={10} />
                  </button>
                ) : (
                  <span>读取中…</span>
                )}
              </div>
            </div>

            <div className="desk-set-actions-right">
              <button
                onClick={() => void runScan()}
                disabled={scanning}
                className="desk-btn-secondary"
              >
                <RefreshCw size={13} className={scanning ? 'desk-spinning' : ''} />
                <span>{scanning ? '校验中…' : '校验接入来源'}</span>
              </button>
              <button onClick={() => void copyDiagnostics()} className="desk-btn-primary">
                <Copy size={13} />
                <span>复制完整诊断快照</span>
              </button>
            </div>

            {scanResult && (
              <div className="desk-scan-list">
                {scanResult.map((item) => {
                  const meta = data?.sources.find(
                    (s) => `source-${s.id}` === item.id || s.id === item.id,
                  )
                  return (
                    <div className="desk-scan-row" key={item.id}>
                      <strong>{meta?.name ?? item.id}</strong>
                      <span>{item.exists ? '目录存在' : '目录不存在'}</span>
                      <span>今日 {item.filesToday} 个文件</span>
                      {item.lastModified && <span>{item.lastModified}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

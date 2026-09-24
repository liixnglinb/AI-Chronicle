import { useState } from 'react'
import {
  CalendarClock,
  Check,
  Database,
  EyeOff,
  FileArchive,
  FolderLock,
  HardDrive,
  KeyRound,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  SunMoon,
  Trash2,
} from 'lucide-react'
import type { ToastMessage } from '../types'
import { classNames } from '../lib/utils'
import { saveText } from '../lib/desktop'

interface SettingsPageProps {
  theme: 'light' | 'dark'
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
  onThemeToggle: () => void
}

export function SettingsPage({ theme, onToast, onThemeToggle }: SettingsPageProps) {
  const storedSettings = (() => {
    try {
      return JSON.parse(
        window.localStorage.getItem('ai-chronicle-settings') ?? '{}',
      ) as Record<string, unknown>
    } catch {
      return {}
    }
  })()
  const [activeSection, setActiveSection] = useState('capture')
  const [captureEnabled, setCaptureEnabled] = useState(
    storedSettings.captureEnabled !== false,
  )
  const [cloudSummary, setCloudSummary] = useState(
    storedSettings.cloudSummary === true,
  )
  const [privateRedaction, setPrivateRedaction] = useState(
    storedSettings.privateRedaction !== false,
  )
  const [artifactWatch, setArtifactWatch] = useState(
    storedSettings.artifactWatch !== false,
  )
  const [retention, setRetention] = useState(
    typeof storedSettings.retention === 'string' ? storedSettings.retention : '90',
  )
  const [schedule, setSchedule] = useState(
    typeof storedSettings.schedule === 'string' ? storedSettings.schedule : '23:00',
  )
  const [exclusions, setExclusions] = useState<string[]>([
    'C:\\Windows',
    'C:\\Program Files',
    '浏览器隐私窗口',
  ])

  function goToSection(sectionId: string) {
    setActiveSection(sectionId)
    document.getElementById(`settings-${sectionId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function saveSettings() {
    window.localStorage.setItem(
      'ai-chronicle-settings',
      JSON.stringify({
        captureEnabled,
        cloudSummary,
        privateRedaction,
        artifactWatch,
        retention,
        schedule,
      }),
    )
    onToast({
      tone: 'success',
      title: '设置已保存',
      message: '新配置已写入本机，下一轮扫描会立即使用。',
    })
  }

  async function createBackup() {
    const result = await saveText(
      `AI轨迹备份-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          settings: {
            captureEnabled,
            cloudSummary,
            privateRedaction,
            artifactWatch,
            retention,
            schedule,
          },
          exclusions,
          note: '这是本地配置备份，不包含未开启的原始会话内容。',
        },
        null,
        2,
      ),
    )
    onToast({
      tone: 'success',
      title: '备份已生成',
      message: result.message ?? '本地配置备份已经保存。',
    })
  }

  return (
    <div className="page settings-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            <ShieldCheck size={14} />
            本地优先
          </span>
          <h1>设置</h1>
          <p>控制采集范围、隐私边界、摘要模型与本地数据保留周期。</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={saveSettings}
        >
          <Save size={15} />
          保存设置
        </button>
      </section>

      <div className="settings-layout">
        <section className="settings-nav">
          <button
            className={classNames(activeSection === 'capture' && 'settings-nav-active')}
            type="button"
            onClick={() => goToSection('capture')}
          >
            <CalendarClock size={16} />
            采集与自动化
          </button>
          <button
            className={classNames(activeSection === 'privacy' && 'settings-nav-active')}
            type="button"
            onClick={() => goToSection('privacy')}
          >
            <KeyRound size={16} />
            隐私与模型
          </button>
          <button
            className={classNames(activeSection === 'storage' && 'settings-nav-active')}
            type="button"
            onClick={() => goToSection('storage')}
          >
            <HardDrive size={16} />
            存储与备份
          </button>
          <button
            className={classNames(activeSection === 'exclusions' && 'settings-nav-active')}
            type="button"
            onClick={() => goToSection('exclusions')}
          >
            <FolderLock size={16} />
            排除规则
          </button>
          <button
            className={classNames(activeSection === 'appearance' && 'settings-nav-active')}
            type="button"
            onClick={() => goToSection('appearance')}
          >
            <SunMoon size={16} />
            外观与密度
          </button>
        </section>

        <section className="settings-content">
          <div className="settings-section" id="settings-capture">
            <header>
              <div>
                <h2>采集与自动化</h2>
                <p>控制后台采样、文件监听和每日日报生成。</p>
              </div>
              <span className="settings-section-icon">
                <CalendarClock size={18} />
              </span>
            </header>
            <div className="setting-list">
              <SettingToggle
                title="启用后台采集"
                description="每 5 秒检查前台应用，用户空闲时不累计有效时长。"
                checked={captureEnabled}
                onChange={setCaptureEnabled}
              />
              <SettingToggle
                title="监听 AI 产物"
                description="仅监听配置过的项目、文档、图片和视频目录。"
                checked={artifactWatch}
                onChange={setArtifactWatch}
              />
              <div className="setting-row">
                <span className="setting-icon">
                  <CalendarClock size={16} />
                </span>
                <span className="setting-copy">
                  <strong>每日生成时间</strong>
                  <small>电脑关机或休眠时，下次开机自动补跑。</small>
                </span>
                <select value={schedule} onChange={(event) => setSchedule(event.target.value)}>
                  <option value="22:30">22:30</option>
                  <option value="23:00">23:00</option>
                  <option value="23:30">23:30</option>
                  <option value="00:10">次日 00:10</option>
                </select>
              </div>
            </div>
          </div>

          <div className="settings-section" id="settings-privacy">
            <header>
              <div>
                <h2>隐私与模型</h2>
                <p>原文默认只留本机，摘要模型可以单独关闭。</p>
              </div>
              <span className="settings-section-icon">
                <EyeOff size={18} />
              </span>
            </header>
            <div className="setting-list">
              <SettingToggle
                title="敏感信息自动脱敏"
                description="发送摘要前移除密钥、邮箱、手机号和访问令牌。"
                checked={privateRedaction}
                onChange={setPrivateRedaction}
              />
              <SettingToggle
                title="允许云端模型生成摘要"
                description="默认关闭。关闭时使用本地统计模板生成日报。"
                checked={cloudSummary}
                onChange={setCloudSummary}
              />
              <div className="setting-row">
                <span className="setting-icon">
                  <Sparkles size={16} />
                </span>
                <span className="setting-copy">
                  <strong>首选摘要模型</strong>
                  <small>优先使用本机已登录的 Codex CLI。</small>
                </span>
                <span className="setting-value">Codex / local</span>
              </div>
            </div>
          </div>

          <div className="settings-section" id="settings-storage">
            <header>
              <div>
                <h2>存储与保留</h2>
                <p>控制原始事件、摘要和附件缩略图的保留周期。</p>
              </div>
              <span className="settings-section-icon">
                <Database size={18} />
              </span>
            </header>
            <div className="storage-visual">
              <div className="storage-ring">
                <strong>286 MB</strong>
                <span>本地数据</span>
              </div>
              <div className="storage-breakdown">
                <span>
                  <i className="storage-session" />
                  标准化事件 <strong>122 MB</strong>
                </span>
                <span>
                  <i className="storage-artifact" />
                  缩略图 <strong>96 MB</strong>
                </span>
                <span>
                  <i className="storage-report" />
                  日报与索引 <strong>68 MB</strong>
                </span>
              </div>
            </div>
            <div className="setting-list">
              <div className="setting-row">
                <span className="setting-icon">
                  <HardDrive size={16} />
                </span>
                <span className="setting-copy">
                  <strong>原始事件保留周期</strong>
                  <small>日报本身永久保留，原始证据可按周期清理。</small>
                </span>
                <select value={retention} onChange={(event) => setRetention(event.target.value)}>
                  <option value="30">30 天</option>
                  <option value="90">90 天</option>
                  <option value="365">1 年</option>
                  <option value="forever">永久</option>
                </select>
              </div>
              <div className="setting-row">
                <span className="setting-icon">
                  <FileArchive size={16} />
                </span>
                <span className="setting-copy">
                  <strong>每周自动备份</strong>
                  <small>备份 SQLite、配置与过去七天的日报。</small>
                </span>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={createBackup}
                >
                  立即备份
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section" id="settings-exclusions">
            <header>
              <div>
                <h2>排除规则</h2>
                <p>排除路径不会被采集，也不会参与日报摘要。</p>
              </div>
              <span className="settings-section-icon">
                <FolderLock size={18} />
              </span>
            </header>
            <div className="setting-list">
              {exclusions.map((exclusion) => (
                <div className="setting-row" key={exclusion}>
                  <span className="setting-icon">
                    <FolderLock size={16} />
                  </span>
                  <span className="setting-copy">
                    <strong>{exclusion}</strong>
                    <small>当前规则已启用</small>
                  </span>
                  <button
                    className="icon-button"
                    type="button"
                    title="移除排除规则"
                    aria-label={`移除 ${exclusion}`}
                    onClick={() =>
                      setExclusions((current) =>
                        current.filter((item) => item !== exclusion),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <div className="setting-row">
                <span className="setting-icon">
                  <Plus size={16} />
                </span>
                <span className="setting-copy">
                  <strong>添加排除目录</strong>
                  <small>桌面版将打开系统目录选择器。</small>
                </span>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    const value = window.prompt('输入需要排除的目录路径')
                    if (value?.trim()) {
                      setExclusions((current) => [
                        ...new Set([...current, value.trim()]),
                      ])
                    }
                  }}
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section" id="settings-appearance">
            <header>
              <div>
                <h2>外观与密度</h2>
                <p>界面会与 Windows 主题保持同步，也可以手动覆盖。</p>
              </div>
              <span className="settings-section-icon">
                <SunMoon size={18} />
              </span>
            </header>
            <div className="theme-options">
              <button
                className={classNames(theme === 'light' && 'theme-option-selected')}
                type="button"
                onClick={() => {
                  if (theme !== 'light') onThemeToggle()
                }}
              >
                <span className="theme-preview theme-preview-light">
                  <i />
                  <b />
                </span>
                <span>
                  <strong>浅色</strong>
                  <small>适合白天与高环境光</small>
                </span>
                {theme === 'light' && <Check size={16} />}
              </button>
              <button
                className={classNames(theme === 'dark' && 'theme-option-selected')}
                type="button"
                onClick={() => {
                  if (theme !== 'dark') onThemeToggle()
                }}
              >
                <span className="theme-preview theme-preview-dark">
                  <i />
                  <b />
                </span>
                <span>
                  <strong>深色</strong>
                  <small>适合夜间和低光环境</small>
                </span>
                {theme === 'dark' && <Check size={16} />}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

interface SettingToggleProps {
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}

function SettingToggle({
  title,
  description,
  checked,
  onChange,
}: SettingToggleProps) {
  return (
    <div className="setting-row">
      <span className={classNames('setting-check', checked && 'setting-check-active')}>
        {checked && <Check size={13} />}
      </span>
      <span className="setting-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <button
        className={classNames('toggle', checked && 'toggle-on')}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  )
}

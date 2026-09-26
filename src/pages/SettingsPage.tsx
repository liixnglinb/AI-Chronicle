import { useEffect, useState } from 'react'
import { Info, Moon, RefreshCw, Sun } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { saveText } from '../lib/desktop'
import { dayKeyOf } from '../lib/format'
import type { ToastMessage } from '../types'

interface SettingsPageProps {
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

export function SettingsPage({ theme, onThemeToggle, onToast }: SettingsPageProps) {
  const { data, refresh, isDesktop } = useChronicle()
  const [runtime, setRuntime] = useState<{
    version: string
    platform: string
    arch: string
    dataPath: string
    packaged: boolean
  } | null>(null)

  useEffect(() => {
    if (window.desktopAPI) {
      void window.desktopAPI.getRuntimeInfo().then(setRuntime)
    }
  }, [])

  async function exportAllSessions() {
    if (!data) return
    const payload = {
      exportedAt: new Date().toISOString(),
      sessions: data.sessions,
      sources: data.sources,
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

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">本地优先 · 数据不出本机</span>
          <strong>设置</strong>
        </div>
      </div>

      <section className="settings-block">
        <h3>外观</h3>
        <button className="settings-row" type="button" onClick={onThemeToggle}>
          <span className="setting-icon">{theme === 'light' ? <Sun size={17} /> : <Moon size={17} />}</span>
          <span className="setting-copy">
            <strong>主题</strong>
            <small>当前使用{theme === 'light' ? '浅色' : '深色'}模式，点击切换</small>
          </span>
          <span className="setting-value">{theme === 'light' ? '浅色' : '深色'}</span>
        </button>
      </section>

      <section className="settings-block">
        <h3>数据采集</h3>
        <button
          className="settings-row"
          type="button"
          onClick={() => {
            void refresh(true).then(() =>
              onToast({
                tone: 'success',
                title: '已重新采集',
                message: '全部数据源已按最新文件重新解析。',
              }),
            )
          }}
        >
          <span className="setting-icon">
            <RefreshCw size={17} />
          </span>
          <span className="setting-copy">
            <strong>重新采集</strong>
            <small>清除会话缓存，重新扫描全部数据源（约 10–20 秒）</small>
          </span>
          <span className="setting-value">{data ? `${data.sessions.length} 会话` : '—'}</span>
        </button>
        <button className="settings-row" type="button" onClick={exportAllSessions}>
          <span className="setting-icon">
            <Info size={17} />
          </span>
          <span className="setting-copy">
            <strong>导出全部会话（JSON 备份）</strong>
            <small>把当前采集到的会话与数据源状态存为 JSON 文件</small>
          </span>
          <span className="setting-value">{data ? '导出' : '—'}</span>
        </button>
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
                ? `v${runtime.version} · ${runtime.platform} ${runtime.arch} · ${runtime.packaged ? '安装版' : '开发模式'}`
                : isDesktop
                  ? '读取中…'
                  : '浏览器预览环境'}
            </small>
          </span>
          <span className="setting-value">{runtime?.dataPath ? '本地数据' : ''}</span>
        </div>
        <div className="settings-row static">
          <span className="setting-icon">
            <Info size={17} />
          </span>
          <span className="setting-copy">
            <strong>隐私说明</strong>
            <small>全部数据在本机解析与保存，不联网上传任何会话内容</small>
          </span>
        </div>
      </section>
    </div>
  )
}

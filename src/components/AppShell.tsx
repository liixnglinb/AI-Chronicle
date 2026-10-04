import { useEffect, useRef, useState } from 'react'
import { Activity, Command, Moon, RefreshCw, Search, ShieldCheck, Sun, X } from 'lucide-react'
import { navItems } from '../data/nav'
import { useChronicle } from '../lib/store'
import { formatClock } from '../lib/format'
import { classNames } from '../lib/utils'
import type { ToastMessage, ViewId } from '../types'

interface AppShellProps {
  activeView: ViewId
  children: React.ReactNode
  searchQuery: string
  theme: 'light' | 'dark'
  onNavigate: (view: ViewId) => void
  onOpenCommand: () => void
  onSearchChange: (value: string) => void
  onClearSearch: () => void
  onThemeToggle: () => void
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

export function AppShell({
  activeView,
  children,
  searchQuery,
  theme,
  onNavigate,
  onOpenCommand,
  onSearchChange,
  onClearSearch,
  onThemeToggle,
  onToast,
}: AppShellProps) {
  const { data, loading, error, refresh, progress } = useChronicle()
  const [refreshing, setRefreshing] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const currentNav = navItems.find((n) => n.id === activeView)
  const connectedCount = data?.sources.filter((s) => s.status === 'connected').length ?? 0
  const failedCount = data?.sources.filter((s) => s.status === 'error').length ?? 0

  // 心跳状态：采集出错 > 采集中 > 就绪
  const heartbeat = error ? 'error' : loading ? 'busy' : 'live'

  async function handleManualRefresh() {
    setRefreshing(true)
    try {
      const ok = await refresh(true)
      if (ok) {
        onToast({ tone: 'success', title: '采集同步完毕', message: '已同步本机所有会话与产出' })
      }
    } finally {
      setRefreshing(false)
    }
  }

  // 「/」直达当前视图的过滤框。与常见工具型软件一致：正在输入时不拦截。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true
      if (event.key !== '/' || typing || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="desk-app">
      <a className="skip-link" href="#desk-viewport">
        跳到主要内容
      </a>

      <div className="desk-titlebar">
        <div className="desk-brand-badge">
          <Activity size={13} />
          <span>AI 轨迹 · 观测台</span>
        </div>
        <div className="desk-window-status">
          <span
            className={classNames(
              'desk-pulse-indicator',
              heartbeat === 'busy' && 'is-busy',
              heartbeat === 'error' && 'is-error',
            )}
          />
          <span>
            {loading
              ? (progress?.detail ?? '正在读取本地会话…')
              : error
                ? '采集异常'
                : data
                  ? `就绪 · ${data.sessions.length} 会话 · ${connectedCount} 源 · ${formatClock(
                      data.generatedAt,
                    )} 刷新`
                  : '等待首次采集'}
          </span>
        </div>
      </div>

      <div className="desk-body">
        <aside className="desk-sidebar">
          <nav className="desk-nav-list" aria-label="核心导航">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = item.id === activeView
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={classNames('desk-nav-btn', active && 'active')}
                  title={item.description}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={16} className="desk-nav-icon" />
                  <span className="desk-nav-label">{item.label}</span>
                  {item.id === 'sources' && failedCount > 0 && (
                    <span className="desk-nav-count">{failedCount}</span>
                  )}
                  {item.id === 'sources' && failedCount === 0 && connectedCount > 0 && (
                    <span className="desk-nav-count">{connectedCount}</span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="desk-sidebar-footer">
            <button
              onClick={() => void handleManualRefresh()}
              disabled={loading || refreshing}
              className="desk-tool-btn"
              title="重新扫描本机数据源"
            >
              <RefreshCw size={14} className={refreshing ? 'desk-spinning' : ''} />
              <span>{refreshing ? '采集中' : '重新采集'}</span>
            </button>
            <p className="desk-privacy-note">
              <ShieldCheck size={10} /> 只读本机日志，不上传任何会话内容
            </p>
          </div>
        </aside>

        <main className="desk-stage">
          <header className="desk-stage-bar">
            <div className="desk-stage-ctx">
              <span className="desk-ctx-lead">观测</span>
              <span className="desk-ctx-sep">/</span>
              <h1 className="desk-ctx-current">{currentNav?.label}</h1>
            </div>

            <div className="desk-stage-actions">
              <div className="desk-search-input-wrap">
                <Search size={13} className="desk-search-ico" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder={`在 ${currentNav?.label} 中过滤 (按 / 聚焦)`}
                  aria-label={`在 ${currentNav?.label} 中过滤`}
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      if (searchQuery) onClearSearch()
                      else e.currentTarget.blur()
                    }
                  }}
                  className="desk-stage-search"
                />
                {searchQuery && (
                  <button
                    className="desk-search-clear"
                    onClick={onClearSearch}
                    aria-label="清空过滤条件"
                    title="清空过滤条件"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              <button onClick={onOpenCommand} className="desk-shortcut-pill" title="呼出命令面板">
                <Command size={11} />
                <span>K</span>
              </button>

              <button onClick={onThemeToggle} className="desk-icon-btn" aria-label="切换主题">
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            </div>
          </header>

          <section className="desk-stage-viewport" id="desk-viewport" tabIndex={-1}>
            {children}
          </section>
        </main>
      </div>
    </div>
  )
}

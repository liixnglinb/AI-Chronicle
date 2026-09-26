import { useState } from 'react'
import {
  ChevronDown,
  Command,
  Info,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { navItems } from '../data/nav'
import { classNames } from '../lib/utils'
import { useChronicle } from '../lib/store'
import type { ToastMessage, ViewId } from '../types'

interface AppShellProps {
  activeView: ViewId
  children: React.ReactNode
  searchQuery: string
  theme: 'light' | 'dark'
  onNavigate: (view: ViewId) => void
  onOpenCommand: () => void
  onSearchChange: (value: string) => void
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
  onThemeToggle,
  onToast,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { data, loading } = useChronicle()
  const activeItem = navItems.find((item) => item.id === activeView) ?? navItems[0]
  const connectedCount = data?.sources.filter((s) => s.status === 'connected').length ?? 0

  return (
    <div className={classNames('app-shell', collapsed && 'sidebar-collapsed')}>
      <aside className={classNames('sidebar', mobileOpen && 'sidebar-mobile-open')}>
        <div className="brand-row">
          <button
            className="brand"
            type="button"
            onClick={() => onNavigate('today')}
            aria-label="返回今天"
          >
            <span className="brand-mark">
              <Sparkles size={17} strokeWidth={2.2} />
            </span>
            <span className="brand-copy">
              <strong>AI 轨迹</strong>
              <small>LOCAL ACTIVITY OS</small>
            </span>
          </button>
          <button
            className="icon-button desktop-only"
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? '展开导航' : '收起导航'}
            aria-label={collapsed ? '展开导航' : '收起导航'}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button
            className="icon-button mobile-only"
            type="button"
            onClick={() => setMobileOpen(false)}
            title="关闭导航"
            aria-label="关闭导航"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="primary-nav" aria-label="主要导航">
          <span className="nav-eyebrow">工作区</span>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeView === item.id
            return (
              <button
                key={item.id}
                className={classNames('nav-item', active && 'nav-item-active')}
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  onNavigate(item.id)
                }}
                title={collapsed ? item.label : undefined}
              >
                <span className="nav-icon">
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <span className="nav-copy">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                {item.id === 'sources' && connectedCount > 0 && (
                  <span className="nav-count">{connectedCount}</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <button className="privacy-card" type="button" onClick={() => onNavigate('settings')}>
            <span className="privacy-icon">
              <Sparkles size={18} />
            </span>
            <span className="privacy-copy">
              <strong>数据留在本机</strong>
              <small>全部在本机解析，不上传</small>
            </span>
            <ChevronDown size={15} />
          </button>
          <div className="capture-health">
            <span className={classNames('pulse-dot', !loading && 'pulse-dot-live')} />
            <span>
              <strong>{loading ? '正在采集…' : data ? '真实数据就绪' : '等待采集'}</strong>
              <small>
                {data ? `${data.sessions.length} 个会话 · ${connectedCount} 个软件` : '首次约 10–20 秒'}
              </small>
            </span>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="关闭导航"
        />
      )}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-only"
              type="button"
              onClick={() => setMobileOpen(true)}
              title="打开导航"
              aria-label="打开导航"
            >
              <Menu size={19} />
            </button>
            <div className="page-identity">
              <span className="page-kicker">{activeItem.description}</span>
              <strong>{activeItem.label}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <label
              className="global-search"
              onClick={() => {
                if (window.innerWidth <= 780) onOpenCommand()
              }}
            >
              <Search size={16} />
              <input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="搜索会话、项目"
                aria-label="搜索"
              />
              <button className="search-shortcut" type="button" onClick={onOpenCommand}>
                <Command size={12} /> K
              </button>
            </label>
            <button
              className="icon-button"
              type="button"
              onClick={onThemeToggle}
              title={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
              aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button
              className="profile-button"
              type="button"
              aria-label="应用信息"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((open) => !open)}
            >
              <Info size={16} />
              <ChevronDown size={13} />
            </button>

            {profileOpen && (
              <div className="topbar-popover profile-popover">
                <div className="profile-summary">
                  <span>AI</span>
                  <span>
                    <strong>AI 轨迹</strong>
                    <small>本地优先 · {data ? `${data.sessions.length} 会话` : '采集中'}</small>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false)
                    onNavigate('settings')
                  }}
                >
                  <Settings2 size={15} />
                  设置
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const runtime = window.desktopAPI
                      ? await window.desktopAPI.getRuntimeInfo()
                      : {
                          version: 'web-preview',
                          platform: navigator.platform,
                          arch: 'browser',
                          dataPath: '浏览器本地存储',
                          packaged: false,
                        }
                    await navigator.clipboard.writeText(JSON.stringify(runtime, null, 2))
                    onToast({
                      tone: 'info',
                      title: '应用信息已复制',
                      message: `版本 ${runtime.version} · ${runtime.platform} ${runtime.arch}`,
                    })
                    setProfileOpen(false)
                  }}
                >
                  <Info size={15} />
                  复制应用信息
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="content">{children}</main>

        <nav className="mobile-nav" aria-label="移动端导航">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={classNames(activeView === item.id && 'mobile-nav-active')}
                onClick={() => {
                  setMobileOpen(false)
                  onNavigate(item.id)
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

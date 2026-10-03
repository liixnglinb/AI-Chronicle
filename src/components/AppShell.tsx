import { useEffect, useRef, useState } from 'react'
import {
  Command,
  Info,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react'
import { navItems } from '../data/nav'
import { Badge } from './Badge'
import { classNames } from '../lib/utils'
import { useChronicle } from '../lib/store'
import { formatClock } from '../lib/format'
import type { ToastMessage, ViewId } from '../types'
import { ICON_SIZE } from '../lib/ui'
import { DataStateBanner } from './DataStateBanner'

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
  const [updateChecking, setUpdateChecking] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const { data, loading, isDesktop, update } = useChronicle()

  const connectedCount = data?.sources.filter((s) => s.status === 'connected').length ?? 0
  const isLive = !!data && !loading

  const updateStatus =
    update?.state === 'downloading'
      ? `下载中 ${Math.round(update.percent ?? 0)}%`
      : update?.state === 'downloaded'
        ? '待安装'
        : updateChecking
          ? '检查中'
          : '检查新版本'

  // 打开移动端抽屉时同步展开侧栏，避免出现「收起的抽屉」这种矛盾状态
  function openMobileNav() {
    setCollapsed(false)
    setMobileOpen(true)
  }

  function navigate(view: ViewId) {
    setMobileOpen(false)
    setProfileOpen(false)
    onNavigate(view)
  }

  // 顶栏信息浮层：支持点击外部与 Esc 关闭
  useEffect(() => {
    if (!profileOpen) return undefined
    function onPointerDown(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [profileOpen])

  async function runSidebarUpdate() {
    if (!window.desktopAPI) {
      onToast({
        tone: 'warning',
        title: '仅桌面版支持更新',
        message: '请在安装版应用中检查软件更新。',
      })
      return
    }

    if (update?.state === 'downloaded') {
      await window.desktopAPI.installUpdate()
      return
    }

    setUpdateChecking(true)
    try {
      const result = await window.desktopAPI.checkForUpdates()
      onToast({
        tone: result.state === 'available' ? 'info' : result.ok ? 'success' : 'warning',
        title: result.state === 'available' ? `发现新版本 v${result.version}` : '更新检查完成',
        message: result.message ?? '',
      })
    } catch {
      onToast({
        tone: 'warning',
        title: '更新检查失败',
        message: '请稍后重试，或到设置页查看更新通道。',
      })
    } finally {
      setUpdateChecking(false)
    }
  }

  async function copyRuntimeInfo() {
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
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>

      <header className="titlebar-strip" aria-hidden />

      <div className={classNames('app-shell', collapsed && 'sidebar-collapsed')}>
        <aside className={classNames('sidebar', mobileOpen && 'sidebar-mobile-open')}>
          <div className="brand-row">
            {collapsed ? (
              <button
                className="brand"
                type="button"
                onClick={() => setCollapsed(false)}
                title="展开导航"
                aria-label="展开导航"
              >
                <span className="brand-expand-icon">
                  <PanelLeftOpen size={ICON_SIZE.sm} />
                </span>
              </button>
            ) : (
              <>
                <div className="brand">
                  <span className="brand-copy">
                    <strong>AI 轨迹</strong>
                    <small>LOCAL ACTIVITY OS</small>
                  </span>
                </div>
                <button
                  className="icon-button brand-toggle desktop-only"
                  type="button"
                  onClick={() => setCollapsed(true)}
                  title="收起导航"
                  aria-label="收起导航"
                >
                  <PanelLeftClose size={ICON_SIZE.sm} />
                </button>
              </>
            )}
            {mobileOpen && (
              <button
                className="icon-button mobile-only"
                type="button"
                onClick={() => setMobileOpen(false)}
                title="关闭导航"
                aria-label="关闭导航"
              >
                <X size={ICON_SIZE.md} />
              </button>
            )}
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
                  onClick={() => navigate(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="nav-icon">
                    <Icon size={ICON_SIZE.md} strokeWidth={2} />
                  </span>
                  <span className="nav-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {item.id === 'sources' && connectedCount > 0 && (
                    <Badge tone="primary">{connectedCount}</Badge>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="sidebar-bottom">
            <div className="sidebar-actions">
              <button
                className="privacy-card"
                type="button"
                onClick={() => navigate('settings')}
                title="数据留在本机"
              >
                <span className="privacy-icon">
                  <ShieldCheck size={ICON_SIZE.sm} />
                </span>
                <span className="privacy-copy">
                  <strong>数据留在本机</strong>
                  <small>不上传</small>
                </span>
              </button>
              <button
                className="privacy-card update-card"
                type="button"
                onClick={() => void runSidebarUpdate()}
                disabled={updateChecking || update?.state === 'downloading'}
                aria-busy={updateChecking || update?.state === 'downloading'}
                title={`软件自动更新 · ${updateStatus}`}
              >
                <span className="privacy-icon update-icon">
                  <RefreshCw size={ICON_SIZE.sm} className={updateChecking ? 'spin' : undefined} />
                </span>
                <span className="privacy-copy">
                  <strong>软件自动更新</strong>
                  <small>{updateStatus}</small>
                </span>
              </button>
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
                onClick={openMobileNav}
                title="打开导航"
                aria-label="打开导航"
              >
                <Menu size={ICON_SIZE.md} />
              </button>
              <div className="topbar-status">
                <span className={classNames('pulse-dot', isLive && 'pulse-dot-live')} />
                {data ? (
                  <>
                    <span>
                      采集于 <strong>{formatClock(data.generatedAt)}</strong>
                    </span>
                    <span className="topbar-status-sep" />
                    <span className="topbar-status-detail">
                      <strong>{data.sessions.length}</strong> 会话 ·{' '}
                      <strong>{connectedCount}</strong> 个软件
                    </span>
                  </>
                ) : (
                  <span>
                    {loading
                      ? '正在采集本机会话日志…'
                      : isDesktop
                        ? '等待首次采集'
                        : '浏览器预览 · 无文件访问权限'}
                  </span>
                )}
              </div>
            </div>

            <div className="topbar-actions">
              <label
                className="global-search"
                onClick={() => {
                  if (window.innerWidth <= 780) onOpenCommand()
                }}
              >
                <Search size={ICON_SIZE.sm} />
                <input
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="搜索会话、项目、文件"
                  aria-label="搜索会话、项目、文件"
                />
                <button
                  className="search-shortcut"
                  type="button"
                  onClick={onOpenCommand}
                  aria-label="打开命令面板"
                >
                  <Command size={ICON_SIZE.xs} /> K
                </button>
              </label>

              <button
                className="icon-button"
                type="button"
                onClick={onThemeToggle}
                title={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
                aria-label={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
              >
                {theme === 'light' ? <Moon size={ICON_SIZE.sm} /> : <Sun size={ICON_SIZE.sm} />}
              </button>

              <div className="topbar-profile" ref={profileRef}>
                <button
                  className="profile-button"
                  type="button"
                  aria-label="应用信息"
                  aria-haspopup="dialog"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((open) => !open)}
                >
                  <Info size={ICON_SIZE.sm} />
                </button>

                {profileOpen && (
                  <div
                    className="topbar-popover profile-popover"
                    role="dialog"
                    aria-label="应用信息"
                  >
                    <div className="profile-summary">
                      <span>AI</span>
                      <span>
                        <strong>AI 轨迹</strong>
                        <small>
                          本地优先 · {data ? `${data.sessions.length} 个会话` : '采集中'}
                        </small>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false)
                        navigate('settings')
                      }}
                    >
                      <Settings2 size={ICON_SIZE.sm} />
                      设置中心
                    </button>
                    <button type="button" onClick={() => void copyRuntimeInfo()}>
                      <Info size={ICON_SIZE.sm} />
                      复制应用信息
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="content" id="main-content" tabIndex={-1}>
            <DataStateBanner onSources={() => navigate('sources')} />
            {children}
          </main>

          <nav className="mobile-nav" aria-label="移动端导航">
            {navItems.slice(0, 5).map((item) => {
              const Icon = item.icon
              const active = activeView === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  className={classNames(active && 'mobile-nav-active')}
                  onClick={() => navigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={ICON_SIZE.md} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </>
  )
}

import { useState } from 'react'
import {
  Bell,
  CheckCheck,
  ChevronDown,
  Command,
  FileDown,
  Info,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { navItems } from '../data/mockData'
import { classNames } from '../lib/utils'
import type { ToastMessage, ViewId } from '../types'

interface AppShellProps {
  activeView: ViewId
  children: React.ReactNode
  searchQuery: string
  theme: 'light' | 'dark'
  captureActive: boolean
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
  captureActive,
  onNavigate,
  onOpenCommand,
  onSearchChange,
  onThemeToggle,
  onToast,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(true)
  const activeItem = navItems.find((item) => item.id === activeView) ?? navItems[0]

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
                {item.id === 'sources' && <span className="nav-count">7</span>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <button className="privacy-card" type="button" onClick={() => onNavigate('settings')}>
            <span className="privacy-icon">
              <ShieldCheck size={18} />
            </span>
            <span className="privacy-copy">
              <strong>数据留在本机</strong>
              <small>摘要外发默认关闭</small>
            </span>
            <ChevronDown size={15} />
          </button>
          <div className="capture-health">
            <span className={classNames('pulse-dot', captureActive && 'pulse-dot-live')} />
            <span>
              <strong>{captureActive ? '采集正常' : '采集暂停'}</strong>
              <small>最后同步 13:28</small>
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
              <span className="page-kicker">2026 年 9 月 24 日 · 星期四</span>
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
                placeholder="搜索会话、项目或成果"
                aria-label="搜索"
              />
              <button className="search-shortcut" type="button" onClick={onOpenCommand}>
                <Command size={12} /> K
              </button>
            </label>
            <button
              className="icon-button"
              type="button"
              title="通知"
              aria-label="通知"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen((open) => !open)
                setProfileOpen(false)
              }}
            >
              <Bell size={17} />
              {hasUnread && <span className="notification-dot" />}
            </button>
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
              aria-label="个人账户"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((open) => !open)
                setNotificationsOpen(false)
              }}
            >
              <span>李</span>
              <ChevronDown size={13} />
            </button>

            {notificationsOpen && (
              <div className="topbar-popover notification-popover">
                <div className="popover-header">
                  <div>
                    <strong>通知</strong>
                    <small>本地系统消息与采集状态</small>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setHasUnread(false)
                      onToast({
                        tone: 'success',
                        title: '通知已清空',
                        message: '所有未读状态已标记为已读。',
                      })
                    }}
                  >
                    <CheckCheck size={13} />
                    全部已读
                  </button>
                </div>
                <div className="notification-list">
                  <button
                    type="button"
                    onClick={() =>
                      onToast({
                        tone: 'warning',
                        title: '有三个适配器需要关注',
                        message: 'TRAE、豆包和 Kimi Code 当前只能提供行为级记录。',
                      })
                    }
                  >
                    <span className="notice-mark notice-warning" />
                    <span>
                      <strong>数据源覆盖度变化</strong>
                      <small>3 个适配器需要复核，刚刚</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onToast({
                        tone: 'success',
                        title: '今日日报已生成',
                        message: '共整理 4 条工作线程和 7 项任务。',
                      })
                    }
                  >
                    <span className="notice-mark notice-success" />
                    <span>
                      <strong>今日日报已准备就绪</strong>
                      <small>13:28 完成本日增量汇总</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onToast({
                        tone: 'info',
                        title: '每周备份提醒',
                        message: '下一次自动备份将在周日 20:00 执行。',
                      })
                    }
                  >
                    <span className="notice-mark notice-info" />
                    <span>
                      <strong>每周备份计划正常</strong>
                      <small>上次备份 9 月 21 日</small>
                    </span>
                  </button>
                </div>
              </div>
            )}

            {profileOpen && (
              <div className="topbar-popover profile-popover">
                <div className="profile-summary">
                  <span>李</span>
                  <span>
                    <strong>本地用户</strong>
                    <small>数据仅保存在此设备</small>
                  </span>
                </div>
                <button type="button" onClick={() => onNavigate('settings')}>
                  <Settings2 size={15} />
                  偏好设置
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
                    await navigator.clipboard.writeText(
                      JSON.stringify(runtime, null, 2),
                    )
                    onToast({
                      tone: 'info',
                      title: '应用信息已复制',
                      message: `版本 ${runtime.version} · ${runtime.platform} ${runtime.arch}`,
                    })
                    setProfileOpen(false)
                  }}
                >
                  <Info size={15} />
                  应用信息
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false)
                    onNavigate('settings')
                    window.setTimeout(
                      () =>
                        onToast({
                          tone: 'info',
                          title: '备份入口已打开',
                          message: '在“存储与保留”中点击立即备份即可导出。',
                        }),
                      250,
                    )
                  }}
                >
                  <FileDown size={15} />
                  导出备份
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

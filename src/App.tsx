import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { CommandPalette } from './components/CommandPalette'
import { ToastStack } from './components/ToastStack'
import { UpdateBadge } from './components/UpdateBadge'
import { ChronicleProvider } from './lib/store'
import { applyTheme, getInitialTheme, type ThemeName } from './lib/theme'
import { navItems } from './data/nav'
import type { ToastMessage, ViewId } from './types'
import './App.css'
import './styles/voyra-ui.css'

const TodayPage = lazy(() =>
  import('./pages/TodayPage').then((module) => ({ default: module.TodayPage })),
)
const TimelinePage = lazy(() =>
  import('./pages/TimelinePage').then((module) => ({ default: module.TimelinePage })),
)
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })),
)
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage').then((module) => ({ default: module.ProjectsPage })),
)
const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((module) => ({ default: module.LibraryPage })),
)
const InsightsPage = lazy(() =>
  import('./pages/InsightsPage').then((module) => ({ default: module.InsightsPage })),
)
const SourcesPage = lazy(() =>
  import('./pages/SourcesPage').then((module) => ({ default: module.SourcesPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

function getInitialView(): ViewId {
  const param = new URLSearchParams(window.location.search).get('view')
  if (param && navItems.some((item) => item.id === param)) {
    return param as ViewId
  }
  return 'today'
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>(getInitialView)
  const [theme, setTheme] = useState<ThemeName>(getInitialTheme)
  const [commandOpen, setCommandOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const viewSearches = useRef<Partial<Record<ViewId, string>>>({})
  const viewScroll = useRef<Partial<Record<ViewId, number>>>({})
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current.slice(-2), { ...toast, id }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4200)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true

      // ⌘/Ctrl + K：命令面板（可搜全部会话）
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
        return
      }

      // 「/」：把焦点送到顶栏搜索框，与常见工具型软件一致。
      // 正在输入时不拦截，否则无法在输入框里打斜杠。
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const search = document.querySelector<HTMLInputElement>('.global-search input')
        if (search) {
          event.preventDefault()
          search.focus()
          search.select()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const titles: Record<ViewId, string> = {
      today: '今日工作台',
      history: '会话档案',
      timeline: '时间轴',
      projects: '项目集',
      library: '成果集',
      insights: '分析',
      sources: '接入中心',
      settings: '设置中心',
    }
    document.title = `${titles[activeView]} · AI 轨迹`
  }, [activeView])

  useEffect(() => {
    if (!window.desktopAPI) return undefined
    return window.desktopAPI.onUpdateStatus((status) => {
      if (status.state === 'available') {
        pushToast({
          tone: 'info',
          title: `发现 AI 轨迹 v${status.version}`,
          message: '更新正在后台下载，完成后可在设置中安装。',
        })
      }
      if (status.state === 'downloaded') {
        pushToast({
          tone: 'success',
          title: '更新已下载',
          message: `v${status.version} 已准备完成，点击右下角更新框即可安装。`,
        })
      }
      if (status.state === 'error') {
        pushToast({
          tone: 'warning',
          title: '更新检查失败',
          message: status.message ?? '请检查网络后重试。',
        })
      }
    })
  }, [pushToast])

  function navigate(view: ViewId, search?: string) {
    viewSearches.current[activeView] = searchQuery
    viewScroll.current[activeView] = document.getElementById('main-content')?.scrollTop || 0
    if (search !== undefined) {
      try {
        sessionStorage.setItem('voyra-view-history-range', '0')
        sessionStorage.setItem('voyra-view-history-tool', JSON.stringify('all'))
      } catch {
        /* private browsing */
      }
    }
    setActiveView(view)
    const nextSearch = search ?? viewSearches.current[view] ?? ''
    setSearchQuery(nextSearch)
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    window.history[view === activeView ? 'replaceState' : 'pushState'](
      { ...window.history.state, uiSearch: nextSearch },
      '',
      url,
    )
  }

  useEffect(() => {
    const restore = () => {
      const view = getInitialView()
      setActiveView(view)
      setSearchQuery(window.history.state?.uiSearch || viewSearches.current[view] || '')
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  useEffect(() => {
    const container = document.getElementById('main-content')
    if (!container) return
    const target = viewScroll.current[activeView] || 0
    const restore = () => {
      if (container.scrollHeight >= target + container.clientHeight) container.scrollTop = target
    }
    restore()
    const observer = new MutationObserver(restore)
    observer.observe(container, { childList: true, subtree: true })
    const stop = () => observer.disconnect()
    container.addEventListener('wheel', stop, { once: true, passive: true })
    container.addEventListener('touchstart', stop, { once: true, passive: true })
    const timer = window.setTimeout(stop, 800)
    return () => {
      stop()
      clearTimeout(timer)
      container.removeEventListener('wheel', stop)
      container.removeEventListener('touchstart', stop)
    }
  }, [activeView])

  function clearSearch() {
    setSearchQuery('')
    viewSearches.current[activeView] = ''
  }

  function renderPage() {
    switch (activeView) {
      case 'timeline':
        return <TimelinePage searchQuery={searchQuery} />
      case 'history':
        return <HistoryPage searchQuery={searchQuery} onClearSearch={clearSearch} />
      case 'projects':
        return (
          <ProjectsPage searchQuery={searchQuery} onClearSearch={clearSearch} onToast={pushToast} />
        )
      case 'library':
        return <LibraryPage searchQuery={searchQuery} onClearSearch={clearSearch} />
      case 'insights':
        return <InsightsPage onToast={pushToast} />
      case 'sources':
        return <SourcesPage onToast={pushToast} />
      case 'settings':
        return <SettingsPage theme={theme} onThemeChange={setTheme} onToast={pushToast} />
      case 'today':
      default:
        return <TodayPage searchQuery={searchQuery} onToast={pushToast} />
    }
  }

  return (
    <ChronicleProvider>
      <AppShell
        activeView={activeView}
        searchQuery={searchQuery}
        theme={theme}
        onNavigate={navigate}
        onOpenCommand={() => setCommandOpen(true)}
        onSearchChange={setSearchQuery}
        onThemeToggle={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        onToast={pushToast}
      >
        <Suspense
          fallback={
            <div className="page-loading" role="status">
              <span className="spinner" />
              正在准备本地视图
            </div>
          }
        >
          <div className="page-transition" key={activeView}>
            {renderPage()}
          </div>
        </Suspense>
      </AppShell>
      {commandOpen && (
        <CommandPalette
          onClose={() => setCommandOpen(false)}
          onNavigate={navigate}
          onThemeToggle={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          onAction={pushToast}
        />
      )}
      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
      <UpdateBadge onNavigate={navigate} />
    </ChronicleProvider>
  )
}

export default App

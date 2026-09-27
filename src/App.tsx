import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { CommandPalette } from './components/CommandPalette'
import { ToastStack } from './components/ToastStack'
import { UpdateBadge } from './components/UpdateBadge'
import { ChronicleProvider } from './lib/store'
import { navItems } from './data/nav'
import type { ToastMessage, ViewId } from './types'
import './App.css'

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

function getInitialTheme(): 'light' | 'dark' {
  const param = new URLSearchParams(window.location.search).get('theme')
  if (param === 'light' || param === 'dark') return param
  const stored = window.localStorage.getItem('ai-chronicle-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// 支持 ?view=xxx 直达某个页面（截图自检 / 深链）
function getInitialView(): ViewId {
  const param = new URLSearchParams(window.location.search).get('view')
  if (param && navItems.some((item) => item.id === param)) {
    return param as ViewId
  }
  return 'today'
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>(getInitialView)
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [commandOpen, setCommandOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current.slice(-2), { ...toast, id }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4200)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('ai-chronicle-theme', theme)
  }, [theme])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const titles: Record<ViewId, string> = {
      today: '今天',
      history: '历史',
      timeline: '时间线',
      projects: '项目',
      library: '成果库',
      insights: '洞察',
      sources: '数据源',
      settings: '设置',
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

  function navigate(view: ViewId) {
    setActiveView(view)
    setSearchQuery('')
    window.scrollTo(0, 0)
  }

  function renderPage() {
    switch (activeView) {
      case 'timeline':
        return <TimelinePage searchQuery={searchQuery} />
      case 'history':
        return <HistoryPage />
      case 'projects':
        return <ProjectsPage searchQuery={searchQuery} />
      case 'library':
        return <LibraryPage searchQuery={searchQuery} />
      case 'insights':
        return <InsightsPage />
      case 'sources':
        return <SourcesPage />
      case 'settings':
        return (
          <SettingsPage
            theme={theme}
            onToast={pushToast}
            onThemeToggle={() =>
              setTheme((current) => (current === 'light' ? 'dark' : 'light'))
            }
          />
        )
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
        onThemeToggle={() =>
          setTheme((current) => (current === 'light' ? 'dark' : 'light'))
        }
        onToast={pushToast}
      >
        <Suspense
          fallback={
            <div className="page-loading">
              <span />
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
          onThemeToggle={() =>
            setTheme((current) => (current === 'light' ? 'dark' : 'light'))
          }
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

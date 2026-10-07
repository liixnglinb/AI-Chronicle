import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { EmptyState } from './components/EmptyState'
import { CommandPalette } from './components/CommandPalette'
import { DataStateBanner } from './components/DataStateBanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastStack } from './components/ToastStack'
import { UpdateBadge } from './components/UpdateBadge'
import { ChronicleProvider, useChronicle } from './lib/store'
import { applyTheme, getInitialTheme, type ThemeName } from './lib/theme'
import { navItems } from './data/nav'
import { dayKeyOf } from './lib/format'
import { buildDailyReport } from './lib/summary'
import { saveText } from './lib/desktop'
import { callDesktop } from './lib/main-call'
import type { ToastMessage, ViewId } from './types'

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

const VIEW_TITLES: Record<ViewId, string> = {
  today: '今日工作台',
  history: '会话档案',
  timeline: '时间轴',
  projects: '项目集',
  library: '成果集',
  insights: '分析',
  sources: '接入中心',
  settings: '设置中心',
}

function getInitialView(): ViewId {
  const param = new URLSearchParams(window.location.search).get('view')
  if (param && navItems.some((item) => item.id === param)) {
    return param as ViewId
  }
  return 'today'
}

/**
 * 导出今日日报。
 * 命令面板与今日工作台共用同一个实现，保证两处文案与落盘文件名完全一致。
 */
function useDailyReportExport(pushToast: (toast: Omit<ToastMessage, 'id'>) => void) {
  const { data, settings } = useChronicle()
  return useCallback(async () => {
    if (!data) return
    const todayKey = dayKeyOf(Date.now())
    const sessions = data.sessions.filter((s) => s.start && dayKeyOf(s.start) === todayKey)
    if (sessions.length === 0) {
      pushToast({
        tone: 'warning',
        title: '今日暂无会话',
        message: '没有可写入日报的今日会话记录。',
      })
      return
    }
    // 日报的归组主键与界面一致：目录关着时不要导出一份满是目录的报告
    const md = buildDailyReport(
      [...sessions].reverse(),
      Date.now(),
      settings.showProjectPaths ? 'path' : 'tool',
    )
    const fileName = `AI工作日报-${todayKey}.md`
    const result = await callDesktop(pushToast, '导出日报', () => saveText(fileName, md))
    if (!result || result.canceled) return
    pushToast(
      result.ok
        ? { tone: 'success', title: '日报导出成功', message: `文件已写入：${fileName}` }
        : { tone: 'warning', title: '导出未完成', message: result.message ?? '请重试' },
    )
  }, [data, settings.showProjectPaths, pushToast])
}

function Workspace() {
  const [activeView, setActiveView] = useState<ViewId>(getInitialView)
  const { settings, update } = useChronicle()
  const [theme, setTheme] = useState<ThemeName>(getInitialTheme)
  const [commandOpen, setCommandOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const viewSearches = useRef<Partial<Record<ViewId, string>>>({})
  const viewScroll = useRef<Partial<Record<ViewId, number>>>({})
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current.slice(-2), { ...toast, id }])
    // 统一停留 4 秒：短于 4 秒读不完，长于 6 秒开始挡路
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4000)
  }, [])

  const exportDailyReport = useDailyReportExport(pushToast)

  // 更新包就绪：主进程的 notify() 在窗口聚焦时主动不打扰，于是「下载完成」在前台完全无声，
  // 这里补一条应用内提示，保证两条路径下用户都知道包已就绪。
  const lastUpdateState = useRef('')
  useEffect(() => {
    const state = update?.state ?? ''
    const previous = lastUpdateState.current
    lastUpdateState.current = state
    if (state === 'downloaded' && previous !== 'downloaded' && update?.version) {
      pushToast({
        tone: 'success',
        title: `v${update.version} 已下载完成`,
        message: '点右下角的更新胶囊，或在设置中心安装并重启。',
      })
    }
  }, [update, pushToast])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // ⌘/Ctrl+K：命令面板。「/」由 AppShell 内部处理（需要当前视图的输入框引用）。
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
    document.title = `${VIEW_TITLES[activeView]} · AI 轨迹`
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
          message: `v${status.version} 已准备完成，点击右下角提示条即可安装。`,
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
    // 离开当前视图前记录它的过滤词与滚动位置，切回来时原样恢复
    viewSearches.current[activeView] = searchQuery
    viewScroll.current[activeView] = document.getElementById('desk-viewport')?.scrollTop ?? 0
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

  // 视图切换后恢复滚动位置（等 DOM 高度稳定后再设，避免被 clamp 回顶部）
  useEffect(() => {
    const container = document.getElementById('desk-viewport')
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
        return (
          <HistoryPage
            searchQuery={searchQuery}
            onClearSearch={clearSearch}
            onToast={pushToast}
            onNavigate={navigate}
          />
        )
      case 'projects':
        // 侧栏在关闭目录时不列这一项，深链 ?view=projects 仍可能进来，给出去处而不是空页
        if (!settings.showProjectPaths) {
          return (
            <EmptyState
              title="项目集按工作目录归组，当前已隐藏"
              description="界面默认只显示「在哪个软件干了什么」。需要按目录查看时，在设置中心打开「显示目录路径」。"
              actions={
                <button onClick={() => navigate('settings')} className="desk-btn-secondary">
                  前往设置中心
                </button>
              }
            />
          )
        }
        return (
          <ProjectsPage searchQuery={searchQuery} onClearSearch={clearSearch} onToast={pushToast} />
        )
      case 'library':
        return (
          <LibraryPage searchQuery={searchQuery} onClearSearch={clearSearch} onToast={pushToast} />
        )
      case 'insights':
        return <InsightsPage searchQuery={searchQuery} onToast={pushToast} />
      case 'sources':
        return <SourcesPage searchQuery={searchQuery} onToast={pushToast} />
      case 'settings':
        return (
          <SettingsPage
            theme={theme}
            searchQuery={searchQuery}
            onThemeChange={setTheme}
            onToast={pushToast}
          />
        )
      case 'today':
      default:
        return <TodayPage searchQuery={searchQuery} onToast={pushToast} />
    }
  }

  return (
    <>
      <AppShell
        activeView={activeView}
        searchQuery={searchQuery}
        theme={theme}
        onNavigate={(view) => navigate(view)}
        onOpenCommand={() => setCommandOpen(true)}
        onSearchChange={setSearchQuery}
        onClearSearch={clearSearch}
        onThemeToggle={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        onToast={pushToast}
      >
        <DataStateBanner onGoToSources={() => navigate('sources')} />
        <Suspense
          fallback={
            <div className="desk-page-loading" role="status">
              <span className="spinner" />
              正在准备本地视图
            </div>
          }
        >
          <div className="desk-view-enter" key={activeView}>
            {/* 页级边界：外层 div 以 activeView 为 key，切到别的页面就等于自动重置这个边界。
                只有根边界时，任一页面 render 抛错会把导航栏、状态条、toast 一起换成整屏错误卡片。 */}
            <ErrorBoundary>{renderPage()}</ErrorBoundary>
          </div>
        </Suspense>
      </AppShell>

      {commandOpen && (
        <CommandPalette
          theme={theme}
          onClose={() => setCommandOpen(false)}
          onNavigate={navigate}
          onThemeToggle={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          onAction={pushToast}
          onExportDaily={() => void exportDailyReport()}
        />
      )}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
      <UpdateBadge onNavigate={(view) => navigate(view)} onToast={pushToast} />
    </>
  )
}

function App() {
  return (
    <ChronicleProvider>
      <Workspace />
    </ChronicleProvider>
  )
}

export default App

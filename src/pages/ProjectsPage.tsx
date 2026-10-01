import { useMemo, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatDayLabel, formatTimeRange } from '../lib/format'
import { SessionRow } from '../components/SessionRow'
import { ToolDot } from '../components/ToolDot'
import type { SessionRecord, ToastMessage } from '../types'

interface ProjectsPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

type ProjectRange = 0 | 7 | 30
type ProjectSort = 'recent' | 'sessions' | 'artifacts'

interface ProjectGroup {
  key: string
  name: string
  path: string
  sessions: SessionRecord[]
  turns: number
  artifacts: number
  lastActive: number
  tools: { name: string; color: string }[]
}

export function ProjectsPage({ searchQuery, onToast }: ProjectsPageProps) {
  const { data, loading, isDesktop } = useChronicle()
  const [openProject, setOpenProject] = useState<string | null>(null)
  const [range, setRange] = useState<ProjectRange>(0)
  const [toolFilter, setToolFilter] = useState('all')
  const [sort, setSort] = useState<ProjectSort>('recent')

  const tools = useMemo(() => {
    const map = new Map<string, { name: string; color: string; count: number }>()
    for (const s of data?.sessions ?? []) {
      const item = map.get(s.tool) || { name: s.toolName, color: s.toolColor, count: 0 }
      item.count += 1
      map.set(s.tool, item)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [data])

  const projects = useMemo<ProjectGroup[]>(() => {
    const query = searchQuery.trim().toLowerCase()
    const minTime = range ? Date.now() - range * 86_400_000 : 0
    const map = new Map<string, ProjectGroup>()

    for (const s of data?.sessions ?? []) {
      if (minTime && (s.start || 0) < minTime) continue
      if (toolFilter !== 'all' && s.tool !== toolFilter) continue
      if (
        query &&
        !s.title.toLowerCase().includes(query) &&
        !s.project.toLowerCase().includes(query) &&
        !s.projectPath.toLowerCase().includes(query) &&
        !(s.artifacts ?? []).some((a) => a.name.toLowerCase().includes(query))
      ) {
        continue
      }

      const key = s.projectPath || s.project || '(未知位置)'
      let group = map.get(key)
      if (!group) {
        group = {
          key,
          name: s.project || '(未知位置)',
          path: key,
          sessions: [],
          turns: 0,
          artifacts: 0,
          lastActive: 0,
          tools: [],
        }
        map.set(key, group)
      }
      group.sessions.push(s)
      group.turns += s.turns
      group.artifacts += (s.artifacts ?? []).length
      const end = s.end || s.start || 0
      if (end > group.lastActive) group.lastActive = end
      if (!group.tools.some((t) => t.name === s.toolName)) {
        group.tools.push({ name: s.toolName, color: s.toolColor })
      }
    }

    return [...map.values()].sort((a, b) => {
      if (sort === 'sessions') return b.sessions.length - a.sessions.length
      if (sort === 'artifacts') return b.artifacts - a.artifacts
      return b.lastActive - a.lastActive
    })
  }, [data, searchQuery, range, toolFilter, sort])

  const totalArtifacts = projects.reduce((sum, p) => sum + p.artifacts, 0)
  const totalTurns = projects.reduce((sum, p) => sum + p.turns, 0)

  async function openProjectFolder(path: string) {
    if (path === '(未知位置)') return
    const result = await window.desktopAPI?.openPath(path)
    if (result && !result.ok) {
      onToast({
        tone: 'warning',
        title: '无法打开项目目录',
        message: result.message ?? '目录可能已被移动或删除。',
      })
    }
  }

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>需要桌面版</strong>
          <span>项目集按本机会话日志中的工作目录聚合。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            {projects.length
              ? `${projects.length} 个项目 · ${totalTurns} 轮协作 · ${totalArtifacts} 个产出`
              : '项目来自会话日志中的真实工作目录'}
          </span>
          <strong>项目集</strong>
        </div>
      </div>

      <div className="collection-toolbar">
        <div className="filter-chip-scroll">
          {([
            ['all', '全部时间'],
            ['30', '近 30 天'],
            ['7', '近 7 天'],
          ] as Array<[string, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={range.toString() === value ? 'filter-chip filter-chip-active' : 'filter-chip'}
              onClick={() => setRange(value === 'all' ? 0 : (Number(value) as ProjectRange))}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="filter-chip-scroll">
          <button
            type="button"
            className={toolFilter === 'all' ? 'filter-chip filter-chip-active' : 'filter-chip'}
            onClick={() => setToolFilter('all')}
          >
            全部软件
          </button>
          {tools.map((tool) => (
            <button
              key={tool.name}
              type="button"
              className={toolFilter === tool.name ? 'filter-chip filter-chip-active' : 'filter-chip'}
              onClick={() => setToolFilter(tool.name)}
            >
              <span className="tool-dot" style={{ ['--tool-color' as string]: tool.color }} />
              {tool.name} · {tool.count}
            </button>
          ))}
        </div>
        <div className="segmented-control" aria-label="排序方式">
          {([
            ['recent', '最近'],
            ['sessions', '会话'],
            ['artifacts', '产出'],
          ] as Array<[ProjectSort, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={sort === value ? 'segmented-active' : undefined}
              onClick={() => setSort(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && (
        <div className="page-loading">
          <span />
          正在读取本机 AI 会话日志…
        </div>
      )}

      {data && projects.length === 0 && (
        <div className="empty-state">
          <strong>没有匹配的项目</strong>
          <span>调整时间范围、软件筛选或顶部搜索词后重试。</span>
        </div>
      )}

      <div className="project-list">
        {projects.map((project) => {
          const open = openProject === project.key
          const todayKey = dayKeyOf(Date.now())
          const todayCount = project.sessions.filter(
            (s) => s.start && dayKeyOf(s.start) === todayKey,
          ).length

          return (
            <div className={open ? 'project-card open' : 'project-card'} key={project.key}>
              <div className="project-card-head">
                <button
                  type="button"
                  className="project-card-main"
                  onClick={() => setOpenProject(open ? null : project.key)}
                >
                  <strong>{project.name}</strong>
                  <span className="project-card-path">{project.path}</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void openProjectFolder(project.path)}
                  title="打开项目目录"
                  aria-label={`打开项目目录：${project.name}`}
                >
                  <FolderOpen size={16} />
                </button>
              </div>
              <div className="project-card-meta">
                <span>{project.sessions.length} 会话</span>
                <span>{project.turns} 轮</span>
                {project.artifacts > 0 && <span>{project.artifacts} 产出</span>}
                {todayCount > 0 && <span className="project-today">今天 {todayCount}</span>}
                <span className="project-last">
                  最近 {formatDayLabel(dayKeyOf(project.lastActive))}
                </span>
              </div>
              <div className="project-card-tools">
                {project.tools.slice(0, 4).map((tool) => (
                  <ToolDot key={tool.name} color={tool.color} name={tool.name} />
                ))}
              </div>
              {open && (
                <div className="project-sessions">
                  {[...project.sessions]
                    .sort((a, b) => (b.start || 0) - (a.start || 0))
                    .slice(0, 40)
                    .map((session) => (
                      <div key={session.id}>
                        <div className="session-inline-time">
                          {formatTimeRange(session.start, session.end)}
                        </div>
                        <SessionRow session={session} compact />
                      </div>
                    ))}
                  {project.sessions.length > 40 && (
                    <div className="session-more-hint">
                      仅显示最近 40 条，共 {project.sessions.length} 条
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

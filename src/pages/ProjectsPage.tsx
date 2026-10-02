import { useMemo, useState } from 'react'
import { ChevronDown, FileText, FolderKanban, FolderOpen, Layers, Repeat } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatDayLabelShort, formatTimeRange } from '../lib/format'
import { useIncrementalList } from '../lib/useIncrementalList'
import { SessionRow } from '../components/SessionRow'
import { ToolDot } from '../components/ToolDot'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SummaryStrip } from '../components/SummaryStrip'
import { LoadMore } from '../components/Progress'
import { SkeletonPage } from '../components/Skeleton'
import { classNames } from '../lib/utils'
import type { SessionRecord, ToastMessage } from '../types'
import { ICON_SIZE } from '../lib/ui'

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
  todayCount: number
  tools: { name: string; color: string }[]
}

const RANGE_OPTIONS: Array<[string, string]> = [
  ['0', '全部时间'],
  ['30', '近 30 天'],
  ['7', '近 7 天'],
]

const SORT_OPTIONS: Array<[ProjectSort, string]> = [
  ['recent', '最近'],
  ['sessions', '会话'],
  ['artifacts', '产出'],
]

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
    const todayKey = dayKeyOf(Date.now())
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
          todayCount: 0,
          tools: [],
        }
        map.set(key, group)
      }
      group.sessions.push(s)
      group.turns += s.turns
      group.artifacts += (s.artifacts ?? []).length
      if (s.start && dayKeyOf(s.start) === todayKey) group.todayCount += 1
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
  const activeToday = projects.filter((p) => p.todayCount > 0).length

  // 项目集可能有上百个卡片，首屏只渲染前 30 个，其余按需追加
  const {
    visibleItems: visibleProjects,
    hasMore,
    remaining,
    loadMore,
  } = useIncrementalList(projects, {
    pageSize: 30,
    resetKey: `${range}|${toolFilter}|${sort}|${searchQuery}`,
  })

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
    return <DesktopOnlyPage title="项目集" description="项目集按本机会话日志中的工作目录聚合。" />
  }

  return (
    <div className="page">
      <PageHeader
        kicker={
          projects.length
            ? `${projects.length} 个项目 · ${totalTurns} 轮协作 · ${totalArtifacts} 个产出`
            : '项目来自会话日志中的真实工作目录'
        }
        title="项目集"
      />

      {data && projects.length > 0 && (
        <SummaryStrip
          items={[
            {
              key: 'projects',
              label: '项目总数',
              value: projects.length,
              icon: <FolderKanban size={ICON_SIZE.sm} />,
              tone: 'primary',
            },
            {
              key: 'today',
              label: '今日有活动',
              value: activeToday,
              icon: <Layers size={ICON_SIZE.sm} />,
              tone: activeToday > 0 ? 'positive' : 'default',
            },
            {
              key: 'turns',
              label: '协作轮次',
              value: totalTurns,
              icon: <Repeat size={ICON_SIZE.sm} />,
            },
            {
              key: 'artifacts',
              label: '产出文件',
              value: totalArtifacts,
              icon: <FileText size={ICON_SIZE.sm} />,
            },
          ]}
        />
      )}

      <div className="collection-toolbar">
        <div className="filter-chip-scroll">
          {RANGE_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={classNames(
                'filter-chip',
                range.toString() === value && 'filter-chip-active',
              )}
              onClick={() => setRange((value === '0' ? 0 : Number(value)) as ProjectRange)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="filter-chip-scroll">
          <button
            type="button"
            className={classNames('filter-chip', toolFilter === 'all' && 'filter-chip-active')}
            onClick={() => setToolFilter('all')}
          >
            全部软件
          </button>
          {tools.map((tool) => (
            <button
              key={tool.name}
              type="button"
              className={classNames(
                'filter-chip',
                toolFilter === tool.name && 'filter-chip-active',
              )}
              onClick={() => setToolFilter(tool.name)}
            >
              <span className="tool-dot" style={{ ['--tool-color' as string]: tool.color }} />
              {tool.name} · {tool.count}
            </button>
          ))}
        </div>
        <div className="segmented-control" aria-label="排序方式">
          {SORT_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={classNames(sort === value && 'segmented-active')}
              onClick={() => setSort(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <SkeletonPage cells={4} rows={5} />}

      {data && projects.length === 0 && (
        <EmptyState
          title="没有匹配的项目"
          description="调整时间范围、软件筛选或顶部搜索词后重试。"
        />
      )}

      <div className="project-list">
        {visibleProjects.map((project) => {
          const open = openProject === project.key
          return (
            <div
              className={classNames('project-card', 'list-item-enter', open && 'open')}
              key={project.key}
            >
              <div className="project-card-head">
                <button
                  type="button"
                  className="project-card-main"
                  onClick={() => setOpenProject(open ? null : project.key)}
                  aria-expanded={open}
                >
                  <strong>{project.name}</strong>
                  <span className="project-card-path" title={project.path}>
                    {project.path}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void openProjectFolder(project.path)}
                  title="打开项目目录"
                  aria-label={`打开项目目录：${project.name}`}
                >
                  <FolderOpen size={ICON_SIZE.sm} />
                </button>
                <button
                  type="button"
                  className="icon-button project-card-chevron"
                  onClick={() => setOpenProject(open ? null : project.key)}
                  title={open ? '收起会话' : '展开会话'}
                  aria-label={open ? `收起 ${project.name} 的会话` : `展开 ${project.name} 的会话`}
                >
                  <ChevronDown size={ICON_SIZE.sm} className={classNames(open && 'chevron-open')} />
                </button>
              </div>
              <div className="project-card-meta">
                <span>{project.sessions.length} 会话</span>
                <span>{project.turns} 轮</span>
                {project.artifacts > 0 && <span>{project.artifacts} 产出</span>}
                {project.todayCount > 0 && (
                  <span className="project-today">今天 {project.todayCount}</span>
                )}
                <span className="project-last">
                  最近 {formatDayLabelShort(dayKeyOf(project.lastActive))}
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

      {hasMore && <LoadMore noun="项目" remaining={remaining} onClick={loadMore} />}
    </div>
  )
}

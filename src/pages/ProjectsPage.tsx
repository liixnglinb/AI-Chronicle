import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FolderKanban, FolderOpen } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatDayLabelShort, formatTimeRange } from '../lib/format'
import { toCrumbs } from '../lib/paths'
import { useIncrementalList } from '../lib/useIncrementalList'
import { openLocalWithToast } from '../lib/desktop'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SkeletonPage } from '../components/Skeleton'
import type { SessionRecord, ToastMessage } from '../types'

interface ProjectsPageProps {
  searchQuery: string
  onClearSearch: () => void
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

interface ProjectGroup {
  key: string
  path: string
  sessions: SessionRecord[]
  turns: number
  artifactsCount: number
  lastActive: number
  todayCount: number
  tools: Array<{ name: string; color: string }>
}

/**
 * 项目集：按工作目录归组 + 结构化面包屑 + 聚合透视。
 * 面包屑用「同组唯一后缀」消歧，避免 packages/core 与 apps/core 显示成同一个 core。
 */
export function ProjectsPage({ searchQuery, onClearSearch, onToast }: ProjectsPageProps) {
  const { data, loading, isDesktop } = useChronicle()
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})

  const allSessions = useMemo(() => data?.sessions ?? [], [data])

  const projectGroups = useMemo<ProjectGroup[]>(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0)
    const map = new Map<string, ProjectGroup>()

    for (const s of allSessions) {
      const path = s.projectPath || s.project
      if (!path) continue
      let group = map.get(path)
      if (!group) {
        group = {
          key: path,
          path,
          sessions: [],
          turns: 0,
          artifactsCount: 0,
          lastActive: 0,
          todayCount: 0,
          tools: [],
        }
        map.set(path, group)
      }
      group.sessions.push(s)
      group.turns += s.turns
      group.artifactsCount += s.artifacts?.length ?? 0
      const end = s.end || s.start || 0
      if (end > group.lastActive) group.lastActive = end
      if (s.start && s.start >= todayStart) group.todayCount += 1
      if (!group.tools.some((t) => t.name === s.toolName)) {
        group.tools.push({ name: s.toolName, color: s.toolColor })
      }
    }
    return [...map.values()].sort((a, b) => b.lastActive - a.lastActive)
  }, [allSessions])

  const allPaths = useMemo(() => projectGroups.map((g) => g.path), [projectGroups])

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return projectGroups
    return projectGroups.filter(
      (g) =>
        g.path.toLowerCase().includes(q) ||
        g.tools.some((t) => t.name.toLowerCase().includes(q)) ||
        g.sessions.some(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.model.toLowerCase().includes(q) ||
            (s.artifacts ?? []).some((a) => a.name.toLowerCase().includes(q)),
        ),
    )
  }, [projectGroups, searchQuery])

  const { visibleItems, hasMore, loadMore, remaining } = useIncrementalList(filteredProjects, {
    pageSize: 24,
    resetKey: searchQuery,
  })

  function toggleExpand(key: string) {
    setExpandedProjects((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleOpenFolder(path: string) {
    await openLocalWithToast(onToast, path)
  }

  if (!isDesktop) {
    return <DesktopOnlyPage title="项目集" description="项目集按本机会话日志中的工作目录聚合。" />
  }

  if (loading && !data) return <SkeletonPage cards={4} rows={4} banner={false} />

  if (projectGroups.length === 0) {
    return (
      <EmptyState
        title="暂无聚合工作项目"
        description="会话中包含的当前工作目录（CWD）将被提取并归类于此。"
      />
    )
  }

  return (
    <div className="desk-projects-shell">
      <div className="desk-section-head">
        <span className="desk-projects-count">
          <strong>{filteredProjects.length}</strong> 个受监控工作目录
          {searchQuery.trim() && ` （共 ${projectGroups.length} 个，已过滤）`}
        </span>
        {searchQuery.trim() && (
          <button onClick={onClearSearch} className="desk-btn-ghost-sm">
            清除过滤
          </button>
        )}
      </div>

      <div className="desk-project-card-grid">
        {visibleItems.map((grp) => {
          const isExpanded = !!expandedProjects[grp.key]
          const crumbs = toCrumbs(grp.path, allPaths)

          return (
            <div key={grp.key} className="desk-panel desk-project-card desk-enter">
              <div className="desk-proj-card-head">
                <div className="desk-proj-title-row">
                  <FolderKanban size={16} className="desk-proj-ico" />
                  <span className="desk-proj-name" title={grp.path}>
                    {crumbs.leaf}
                  </span>
                  {grp.todayCount > 0 && (
                    <span className="desk-proj-today-pill">今日 +{grp.todayCount}</span>
                  )}
                </div>

                <button
                  onClick={() => void handleOpenFolder(grp.path)}
                  className="desk-icon-btn-ghost"
                  title={`在文件资源管理器中打开：${grp.path}`}
                  aria-label={`打开项目目录 ${grp.path}`}
                >
                  <FolderOpen size={14} />
                </button>
              </div>

              {/* 面包屑：祖先置灰、终端名高亮；完整路径由 title 兜底 */}
              <div className="desk-proj-breadcrumb" title={grp.path}>
                {crumbs.ancestors.map((seg, i) => (
                  <span key={`${seg}-${i}`} style={{ display: 'contents' }}>
                    <span className="desk-crumb">{seg}</span>
                    <span className="desk-crumb-sep">/</span>
                  </span>
                ))}
                <span className="desk-crumb is-leaf">{crumbs.leaf}</span>
              </div>

              <div className="desk-proj-metric-grid">
                <div className="desk-proj-metric-item">
                  <small>累计会话</small>
                  <strong>{grp.sessions.length}</strong>
                </div>
                <div className="desk-proj-metric-item">
                  <small>交互轮次</small>
                  <strong>{grp.turns}</strong>
                </div>
                <div className="desk-proj-metric-item">
                  <small>产出文件</small>
                  <strong>{grp.artifactsCount}</strong>
                </div>
                <div className="desk-proj-metric-item">
                  <small>最近活动</small>
                  <strong>
                    {grp.lastActive ? formatDayLabelShort(dayKeyOf(grp.lastActive)) : '—'}
                  </strong>
                </div>
              </div>

              <div className="desk-proj-tools-footer">
                <span className="desk-proj-tool-dots">
                  {grp.tools.map((t) => (
                    <span
                      key={t.name}
                      className="desk-proj-tool-dot"
                      style={{ backgroundColor: t.color }}
                      title={t.name}
                    />
                  ))}
                </span>

                <button onClick={() => toggleExpand(grp.key)} className="desk-proj-expand-btn">
                  <span>会话明细 ({grp.sessions.length})</span>
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              </div>

              {isExpanded && (
                <div className="desk-proj-sessions-drawer">
                  {[...grp.sessions]
                    .sort((a, b) => (b.start || 0) - (a.start || 0))
                    .slice(0, 10)
                    .map((s) => (
                      <div key={s.id} className="desk-proj-session-item">
                        <span className="desk-ps-dot" style={{ backgroundColor: s.toolColor }} />
                        <span className="desk-ps-title" title={s.title}>
                          {s.title || '（未命名会话）'}
                        </span>
                        <small className="desk-ps-time">{formatTimeRange(s.start, s.end)}</small>
                      </div>
                    ))}
                  {grp.sessions.length > 10 && (
                    <div className="desk-ps-more">仅展示最近 10 条会话，完整记录见「会话档案」</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filteredProjects.length === 0 && (
        <EmptyState
          title="没有匹配的项目"
          description="当前过滤词没有命中任何工作目录或会话标题。"
          actions={
            <button onClick={onClearSearch} className="desk-btn-secondary">
              清除过滤
            </button>
          }
        />
      )}

      {hasMore && (
        <div className="desk-load-more-wrap">
          <button onClick={loadMore} className="desk-btn-ghost">
            加载更多项目（还有 {remaining} 个）
          </button>
        </div>
      )}
    </div>
  )
}

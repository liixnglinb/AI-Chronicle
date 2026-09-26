import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useChronicle } from '../lib/store'
import {
  dayKeyOf,
  formatDayLabel,
  formatTokens,
  formatTimeRange,
  totalTokens,
} from '../lib/format'
import { SessionRow } from '../components/SessionRow'
import { ToolDot } from '../components/ToolDot'
import type { SessionRecord } from '../types'

interface ProjectsPageProps {
  searchQuery: string
}

interface ProjectGroup {
  key: string
  name: string
  path: string
  sessions: SessionRecord[]
  tokens: number
  turns: number
  lastActive: number
  tools: { name: string; color: string }[]
}

export function ProjectsPage({ searchQuery }: ProjectsPageProps) {
  const { data, loading, isDesktop } = useChronicle()
  const [openProject, setOpenProject] = useState<string | null>(null)

  const projects = useMemo<ProjectGroup[]>(() => {
    const map = new Map<string, ProjectGroup>()
    for (const s of data?.sessions ?? []) {
      const key = s.projectPath || s.project || '(未知位置)'
      let group = map.get(key)
      if (!group) {
        group = {
          key,
          name: s.project || '(未知位置)',
          path: key,
          sessions: [],
          tokens: 0,
          turns: 0,
          lastActive: 0,
          tools: [],
        }
        map.set(key, group)
      }
      group.sessions.push(s)
      group.tokens += totalTokens(s)
      group.turns += s.turns
      const end = s.end || s.start || 0
      if (end > group.lastActive) group.lastActive = end
      if (!group.tools.some((t) => t.name === s.toolName)) {
        group.tools.push({ name: s.toolName, color: s.toolColor })
      }
    }
    return [...map.values()].sort((a, b) => b.lastActive - a.lastActive)
  }, [data])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q) ||
        p.sessions.some((s) => s.title.toLowerCase().includes(q)),
    )
  }, [projects, searchQuery])

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>需要桌面版</strong>
          <span>项目聚合读取的是本机真实会话日志。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">按工作目录聚合 · {filtered.length} 个</span>
          <strong>项目</strong>
        </div>
      </div>

      {loading && !data && (
        <div className="page-loading">
          <span />
          正在读取本机 AI 会话日志…
        </div>
      )}

      {data && filtered.length === 0 && (
        <div className="empty-state">
          <strong>没有匹配的项目</strong>
          <span>项目来自会话日志里的工作目录，会话越多聚合越准。</span>
        </div>
      )}

      <div className="project-list">
        {filtered.map((p) => {
          const open = openProject === p.key
          const todayKey = dayKeyOf(Date.now())
          const todayCount = p.sessions.filter(
            (s) => s.start && dayKeyOf(s.start) === todayKey,
          ).length
          return (
            <div className={open ? 'project-card open' : 'project-card'} key={p.key}>
              <button
                type="button"
                className="project-card-head"
                onClick={() => setOpenProject(open ? null : p.key)}
              >
                <div className="project-card-main">
                  <strong>{p.name}</strong>
                  <span className="project-card-path">{p.path}</span>
                </div>
                <div className="project-card-meta">
                  <span>{p.sessions.length} 会话</span>
                  <span>{p.turns} 轮</span>
                  {p.tokens > 0 && <span>{formatTokens(p.tokens)} tokens</span>}
                  {todayCount > 0 && <span className="project-today">今天 {todayCount}</span>}
                  <span className="project-last">最近 {formatDayLabel(dayKeyOf(p.lastActive))}</span>
                </div>
                <div className="project-card-tools">
                  {p.tools.slice(0, 4).map((t) => (
                    <ToolDot key={t.name} color={t.color} name={t.name} />
                  ))}
                </div>
                <ChevronDown size={16} className={open ? 'chev chev-up' : 'chev'} />
              </button>
              {open && (
                <div className="project-sessions">
                  {[...p.sessions]
                    .sort((a, b) => (b.start || 0) - (a.start || 0))
                    .slice(0, 40)
                    .map((s) => (
                      <div key={s.id}>
                        <div className="session-inline-time">{formatTimeRange(s.start, s.end)}</div>
                        <SessionRow session={s} compact />
                      </div>
                    ))}
                  {p.sessions.length > 40 && (
                    <div className="session-more-hint">仅显示最近 40 条，共 {p.sessions.length} 条</div>
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

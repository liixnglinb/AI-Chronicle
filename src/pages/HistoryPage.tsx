import { useMemo, useState } from 'react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatDayLabel, formatDuration, sessionDurationMinutes } from '../lib/format'
import { SessionRow } from '../components/SessionRow'
import { ToolDot } from '../components/ToolDot'
import type { SessionRecord } from '../types'

interface HistoryPageProps {
  searchQuery: string
}

type DateRange = 7 | 30 | 0

const PAGE_SIZE = 10

export function HistoryPage({ searchQuery }: HistoryPageProps) {
  const { data, loading, isDesktop } = useChronicle()
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [range, setRange] = useState<DateRange>(0)
  const [toolFilter, setToolFilter] = useState('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const tools = useMemo(() => {
    const map = new Map<string, { name: string; color: string; count: number }>()
    for (const s of data?.sessions ?? []) {
      const item = map.get(s.tool) || { name: s.toolName, color: s.toolColor, count: 0 }
      item.count += 1
      map.set(s.tool, item)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [data])

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const minTime = range ? Date.now() - range * 86_400_000 : 0
    return (data?.sessions ?? [])
      .filter((s) => {
        if (toolFilter !== 'all' && s.tool !== toolFilter) return false
        if (minTime && (s.start || 0) < minTime) return false
        if (!query) return true
        return (
          s.title.toLowerCase().includes(query) ||
          s.project.toLowerCase().includes(query) ||
          s.toolName.toLowerCase().includes(query) ||
          (s.artifacts ?? []).some((a) => a.name.toLowerCase().includes(query))
        )
      })
      .sort((a, b) => (b.start || 0) - (a.start || 0))
  }, [data, searchQuery, range, toolFilter])

  const days = useMemo(() => {
    const map = new Map<
      string,
      { sessions: SessionRecord[]; tools: Map<string, { name: string; color: string }> }
    >()
    for (const s of filteredSessions) {
      if (!s.start) continue
      const key = dayKeyOf(s.start)
      let day = map.get(key)
      if (!day) {
        day = { sessions: [], tools: new Map() }
        map.set(key, day)
      }
      day.sessions.push(s)
      if (!day.tools.has(s.tool)) {
        day.tools.set(s.tool, { name: s.toolName, color: s.toolColor })
      }
    }
    const keys = [...map.keys()]
      .sort((a, b) => (a < b ? 1 : -1))
      .slice(0, visibleCount)
    return keys.map((key) => {
      const day = map.get(key)!
      const sessions = [...day.sessions].sort((a, b) => (b.start || 0) - (a.start || 0))
      const minutes = sessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0)
      return { key, sessions, tools: [...day.tools.values()], minutes }
    })
  }, [filteredSessions, visibleCount])

  const totalMinutes = filteredSessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0)
  const totalArtifacts = filteredSessions.reduce((sum, s) => sum + (s.artifacts ?? []).length, 0)

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>需要桌面版</strong>
          <span>会话档案读取的是本机真实会话日志。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            {days.length
              ? `${filteredSessions.length} 条会话 · ${totalArtifacts} 个产出 · 跨度 ${formatDuration(totalMinutes)}`
              : '全部真实会话都保存在本机'}
          </span>
          <strong>会话档案</strong>
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
              onClick={() => {
                setRange(value === 'all' ? 0 : Number(value) as DateRange)
                setVisibleCount(PAGE_SIZE)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="filter-chip-scroll">
          <button
            type="button"
            className={toolFilter === 'all' ? 'filter-chip filter-chip-active' : 'filter-chip'}
            onClick={() => {
              setToolFilter('all')
              setVisibleCount(PAGE_SIZE)
            }}
          >
            全部软件
          </button>
          {tools.map((tool) => (
            <button
              key={tool.name}
              type="button"
              className={toolFilter === tool.name ? 'filter-chip filter-chip-active' : 'filter-chip'}
              onClick={() => {
                setToolFilter(tool.name)
                setVisibleCount(PAGE_SIZE)
              }}
            >
              <span className="tool-dot" style={{ ['--tool-color' as string]: tool.color }} />
              {tool.name} · {tool.count}
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

      {data && days.length === 0 && (
        <div className="empty-state">
          <strong>没有匹配的会话档案</strong>
          <span>调整时间范围、软件筛选或顶部搜索词后重试。</span>
        </div>
      )}

      <div className="history-day-list">
        {days.map((day) => {
          const open = openDay === day.key
          return (
            <div className={open ? 'history-day-card open' : 'history-day-card'} key={day.key}>
              <button
                type="button"
                className="history-day-head"
                onClick={() => setOpenDay(open ? null : day.key)}
              >
                <div className="history-day-title">
                  <strong>{formatDayLabel(day.key)}</strong>
                  <span className="history-day-meta">
                    {day.sessions.length} 会话
                    {day.minutes > 0 && ` · 跨度 ${formatDuration(day.minutes)}`}
                  </span>
                </div>
                <div className="history-day-tools">
                  {day.tools.slice(0, 5).map((t) => (
                    <span key={t.name} className="history-day-tool">
                      <ToolDot color={t.color} name={t.name} />
                    </span>
                  ))}
                </div>
              </button>
              {open && (
                <div className="history-day-sessions">
                  {day.sessions.map((s) => (
                    <SessionRow key={s.id} session={s} compact />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filteredSessions.length > visibleCount * 2 && (
        <div className="collection-more">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            继续加载更早日志
          </button>
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatDayLabel, formatDuration, sessionDurationMinutes } from '../lib/format'
import { SessionRow } from '../components/SessionRow'
import { ToolDot } from '../components/ToolDot'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { LoadMore } from '../components/Progress'
import { SkeletonPage } from '../components/Skeleton'
import { classNames } from '../lib/utils'
import type { SessionRecord } from '../types'
import { ICON_SIZE } from '../lib/ui'

interface HistoryPageProps {
  searchQuery: string
}

type DateRange = 7 | 30 | 0

const PAGE_SIZE = 10

const RANGE_OPTIONS: Array<[string, string]> = [
  ['0', '全部时间'],
  ['30', '近 30 天'],
  ['7', '近 7 天'],
]

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
    const keys = [...map.keys()].sort((a, b) => (a < b ? 1 : -1)).slice(0, visibleCount)
    return keys.map((key) => {
      const day = map.get(key)!
      const sessions = [...day.sessions].sort((a, b) => (b.start || 0) - (a.start || 0))
      const minutes = sessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0)
      return { key, sessions, tools: [...day.tools.values()], minutes }
    })
  }, [filteredSessions, visibleCount])

  const totalMinutes = filteredSessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0)
  const totalArtifacts = filteredSessions.reduce((sum, s) => sum + (s.artifacts ?? []).length, 0)
  const totalSpan = formatDuration(totalMinutes)

  // 有记录的天数（用于「继续加载」的剩余计数）
  const totalDays = useMemo(
    () =>
      new Set(filteredSessions.filter((s) => s.start).map((s) => dayKeyOf(s.start as number))).size,
    [filteredSessions],
  )
  const remainingDays = Math.max(0, totalDays - days.length)
  const hasMoreDays = remainingDays > 0

  if (!isDesktop) {
    return <DesktopOnlyPage title="会话档案" description="会话档案读取的是本机真实会话日志。" />
  }

  const kicker = filteredSessions.length
    ? [
        `${filteredSessions.length} 条会话`,
        `${totalArtifacts} 个产出`,
        totalSpan ? `累计时长 ${totalSpan}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '全部真实会话都保存在本机'

  return (
    <div className="page">
      <PageHeader kicker={kicker} title="会话档案" />

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
              onClick={() => {
                setRange((value === '0' ? 0 : Number(value)) as DateRange)
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
            className={classNames('filter-chip', toolFilter === 'all' && 'filter-chip-active')}
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
              className={classNames(
                'filter-chip',
                toolFilter === tool.name && 'filter-chip-active',
              )}
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

      {loading && !data && <SkeletonPage cells={0} rows={6} />}

      {data && days.length === 0 && (
        <EmptyState
          title="没有匹配的会话档案"
          description="调整时间范围、软件筛选或顶部搜索词后重试。"
        />
      )}

      <div className="history-day-list">
        {days.map((day) => {
          const open = openDay === day.key
          return (
            <div
              className={classNames('history-day-card', 'list-item-enter', open && 'open')}
              key={day.key}
            >
              <button
                type="button"
                className="history-day-head"
                onClick={() => setOpenDay(open ? null : day.key)}
                aria-expanded={open}
              >
                <div className="history-day-title">
                  <strong>{formatDayLabel(day.key)}</strong>
                  <span className="history-day-meta">
                    {day.sessions.length} 会话
                    {day.minutes > 0 && ` · 累计 ${formatDuration(day.minutes)}`}
                  </span>
                </div>
                <div className="history-day-tools">
                  {day.tools.slice(0, 4).map((t) => (
                    <ToolDot key={t.name} color={t.color} name={t.name} />
                  ))}
                  {day.tools.length > 4 && (
                    <span className="result-count">+{day.tools.length - 4}</span>
                  )}
                </div>
                <ChevronDown
                  size={ICON_SIZE.sm}
                  className={classNames('history-day-chevron', open && 'history-day-chevron-open')}
                  aria-hidden
                />
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

      {hasMoreDays && (
        <LoadMore
          noun="天日志"
          remaining={remainingDays}
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        />
      )}
    </div>
  )
}

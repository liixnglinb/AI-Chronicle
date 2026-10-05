import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { useChronicle } from '../lib/store'
import {
  dayKeyOf,
  formatDayLabel,
  formatDuration,
  formatTimeRange,
  sessionDurationMinutes,
} from '../lib/format'
import { projectDisplayName } from '../lib/paths'
import { useIncrementalList } from '../lib/useIncrementalList'
import { useViewState, isFilter } from '../lib/useViewState'
import { openLocalPath } from '../lib/desktop'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SkeletonPage } from '../components/Skeleton'
import { classNames } from '../lib/utils'
import type { SessionRecord } from '../types'

interface HistoryPageProps {
  searchQuery: string
  onClearSearch: () => void
}

type RangeOption = 7 | 30 | 0

const RANGE_OPTIONS: Array<[RangeOption, string]> = [
  [7, '近 7 天'],
  [30, '近 30 天'],
  [0, '全量档案'],
]

/**
 * 会话档案：分日折叠清单 + 时间跨度/工具来源复合过滤。
 * 默认展开最近 3 个活动日，其余折叠 —— 历史动辄数百条会话，
 * 全量铺开既慢又让人找不到东西。
 */
export function HistoryPage({ searchQuery, onClearSearch }: HistoryPageProps) {
  const { data, loading, isDesktop, settings } = useChronicle()
  // 目录名默认不显示（搜索仍能命中目录），行内以「软件徽标 + 会话标题」为主
  const showPaths = settings.showProjectPaths
  const [rangeFilter, setRangeFilter] = useViewState<RangeOption>(
    'history-range',
    7,
    (v): v is RangeOption => v === 7 || v === 30 || v === 0,
  )
  const [toolFilter, setToolFilter] = useViewState('history-tool', 'all', isFilter)
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})

  const allSessions = useMemo(() => data?.sessions ?? [], [data])

  const allProjectPaths = useMemo(
    () => allSessions.map((s) => s.projectPath || s.project).filter(Boolean),
    [allSessions],
  )

  // 1. 可用工具列表（含各自会话数）
  const availableTools = useMemo(() => {
    const map = new Map<string, { name: string; color: string; count: number }>()
    for (const s of allSessions) {
      const item = map.get(s.tool) || { name: s.toolName, color: s.toolColor, count: 0 }
      item.count += 1
      map.set(s.tool, item)
    }
    return [...map.entries()]
      .map(([id, meta]) => ({ id, ...meta }))
      .sort((a, b) => b.count - a.count)
  }, [allSessions])

  // 2. 复合过滤：时间跨度 ∩ 工具来源 ∩ 搜索词
  const filteredSessions = useMemo(() => {
    const cutoff = rangeFilter === 0 ? 0 : Date.now() - rangeFilter * 86_400_000
    const q = searchQuery.trim().toLowerCase()

    return allSessions.filter((s) => {
      if (cutoff && (s.start || 0) < cutoff) return false
      if (toolFilter !== 'all' && s.tool !== toolFilter) return false
      if (!q) return true
      return (
        s.title.toLowerCase().includes(q) ||
        s.project.toLowerCase().includes(q) ||
        s.projectPath.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
        s.toolName.toLowerCase().includes(q) ||
        // 产出文件名也要能搜到：用户记得「改过哪个文件」时往往不记得会话标题
        (s.artifacts ?? []).some((a) => a.name.toLowerCase().includes(q))
      )
    })
  }, [allSessions, rangeFilter, toolFilter, searchQuery])

  // 3. 按日分组（新的在前）
  const dayGroups = useMemo(() => {
    const map = new Map<string, SessionRecord[]>()
    for (const s of filteredSessions) {
      const key = s.start ? dayKeyOf(s.start) : 'unknown'
      const bucket = map.get(key)
      if (bucket) bucket.push(s)
      else map.set(key, [s])
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === 'unknown' ? 1 : b[0] === 'unknown' ? -1 : b[0].localeCompare(a[0])))
      .map(([dayKey, sessions]) => ({
        dayKey,
        sessions: [...sessions].sort((a, b) => (b.start || 0) - (a.start || 0)),
      }))
  }, [filteredSessions])

  const {
    visibleItems: visibleDayGroups,
    hasMore,
    loadMore,
    remaining,
  } = useIncrementalList(dayGroups, {
    pageSize: 10,
    resetKey: `${rangeFilter}_${toolFilter}_${searchQuery}`,
  })

  function toggleDay(dayKey: string) {
    setExpandedDays((prev) => ({ ...prev, [dayKey]: !(prev[dayKey] ?? false) }))
  }

  // 默认展开最近 3 个活动日，其余折叠
  function isDayExpanded(dayKey: string, index: number): boolean {
    if (expandedDays[dayKey] !== undefined) return expandedDays[dayKey]
    return index < 3
  }

  function resetFilters() {
    setRangeFilter(7)
    setToolFilter('all')
    onClearSearch()
  }

  if (!isDesktop) {
    return <DesktopOnlyPage title="会话档案" description="会话档案读取的是本机真实会话日志。" />
  }

  if (loading && !data) return <SkeletonPage cards={0} rows={6} banner={false} />

  if (dayGroups.length === 0) {
    return (
      <EmptyState
        title="未匹配到历史会话记录"
        description="请尝试调整时间范围、工具筛选条件，或清空当前搜索关键词。"
        actions={
          <button onClick={resetFilters} className="desk-btn-secondary">
            重置全部筛选
          </button>
        }
      />
    )
  }

  return (
    <div className="desk-history-shell">
      {/* 复合控制工具条 */}
      <div className="desk-filter-bar">
        <div className="desk-filter-group">
          <span className="desk-filter-label">时间范围</span>
          <div className="desk-pill-group">
            {RANGE_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                className={classNames('desk-pill-btn', rangeFilter === value && 'active')}
                onClick={() => setRangeFilter(value)}
                aria-pressed={rangeFilter === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="desk-filter-group">
          <span className="desk-filter-label">数据源</span>
          <div className="desk-tool-filter-scroll">
            <button
              className={classNames('desk-tool-chip', toolFilter === 'all' && 'active')}
              onClick={() => setToolFilter('all')}
              aria-pressed={toolFilter === 'all'}
            >
              全部 ({allSessions.length})
            </button>
            {availableTools.map((t) => (
              <button
                key={t.id}
                className={classNames('desk-tool-chip', toolFilter === t.id && 'active')}
                onClick={() => setToolFilter(t.id)}
                aria-pressed={toolFilter === t.id}
              >
                <span className="desk-tool-chip-dot" style={{ backgroundColor: t.color }} />
                <span>{t.name}</span>
                <small className="desk-tool-chip-num">{t.count}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 分日折叠清单 */}
      <div className="desk-day-group-list">
        {visibleDayGroups.map((group, groupIdx) => {
          const expanded = isDayExpanded(group.dayKey, groupIdx)
          const totalTurns = group.sessions.reduce((acc, s) => acc + s.turns, 0)
          const totalMinutes = group.sessions.reduce((acc, s) => acc + sessionDurationMinutes(s), 0)
          const toolsInDay = new Map<string, string>()
          for (const s of group.sessions) toolsInDay.set(s.tool, s.toolColor)

          return (
            <div key={group.dayKey} className="desk-panel desk-day-block desk-enter">
              <button
                className="desk-day-head"
                onClick={() => toggleDay(group.dayKey)}
                aria-expanded={expanded}
              >
                <span className="desk-day-title-area">
                  <span className="desk-day-chevron">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <span className="desk-day-date-text">
                    {group.dayKey === 'unknown' ? '时间未记载' : formatDayLabel(group.dayKey)}
                  </span>
                  <span className="desk-day-tool-dots">
                    {[...toolsInDay.values()].map((color, i) => (
                      <span key={i} className="desk-day-dot" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                </span>
                <span className="desk-day-stats-area">
                  <span className="desk-day-stat-pill">{group.sessions.length} 会话</span>
                  <span className="desk-day-stat-pill">{totalTurns} 轮</span>
                  {totalMinutes > 0 && (
                    <span className="desk-day-stat-pill">{formatDuration(totalMinutes)}</span>
                  )}
                </span>
              </button>

              {expanded && (
                <div className="desk-session-rows">
                  {group.sessions.map((s) => (
                    <div key={s.id} className="desk-session-row">
                      <span className="desk-row-time" title="会话起止时间">
                        <Clock size={12} className="desk-time-ico" />
                        {formatTimeRange(s.start, s.end)}
                      </span>

                      <span className="desk-row-tool">
                        <span className="desk-tool-badge" style={{ borderColor: s.toolColor }}>
                          <span
                            className="desk-tool-badge-dot"
                            style={{ backgroundColor: s.toolColor }}
                          />
                          <span>{s.toolName}</span>
                        </span>
                      </span>

                      <span className="desk-row-main">
                        <span className="desk-row-title" title={s.title}>
                          {s.title || '（空白会话标题）'}
                        </span>
                        <span className="desk-row-meta">
                          {showPaths && (
                            <span
                              className="desk-meta-proj"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (s.projectPath) void openLocalPath(s.projectPath)
                              }}
                              title={`在工作目录中打开：${s.projectPath}`}
                            >
                              {projectDisplayName(s.projectPath || s.project, allProjectPaths)}
                            </span>
                          )}
                          {s.model && <span className="desk-meta-model">{s.model}</span>}
                          <span className="desk-meta-turns">{s.turns} 轮</span>
                          {s.artifacts.length > 0 && (
                            <span className="desk-meta-art-count">
                              产出 {s.artifacts.length} 个文件
                            </span>
                          )}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {hasMore && (
          <div className="desk-load-more-wrap">
            <button onClick={loadMore} className="desk-btn-ghost">
              加载更多历史日记（还有 {remaining} 个活动日）
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

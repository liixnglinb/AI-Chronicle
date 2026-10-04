import { useMemo } from 'react'
import { Clock, Cpu, FolderOpen } from 'lucide-react'
import { useChronicle } from '../lib/store'
import {
  dayKeyOf,
  formatDayLabelShort,
  formatDuration,
  sessionDurationMinutes,
} from '../lib/format'
import { projectDisplayName } from '../lib/paths'
import { useViewState } from '../lib/useViewState'
import { TrendBarChart, type DailyPoint } from '../components/charts/TrendBarChart'
import { ToolSplitTrack, type ToolRatio } from '../components/charts/ToolSplitTrack'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SkeletonPage } from '../components/Skeleton'
import { openLocalPath } from '../lib/desktop'
import { classNames } from '../lib/utils'
import type { ToastMessage } from '../types'

interface InsightsPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

type InsightRange = 7 | 14 | 30

const RANGE_OPTIONS: InsightRange[] = [7, 14, 30]

/**
 * 分析页：完全自绘 SVG，零外部图表依赖。
 *
 * 为什么不用图表库：打包体积多出 300KB+，而离线工具只需要两种图；
 * 更要紧的是第三方库的浮层与坐标轴样式无法跟随黑曜石主题，
 * 深色模式下会弹出固定白底的方块。这里全部改为内联 SVG，
 * 颜色与 CSS 令牌同源，切换主题立即生效。
 */
export function InsightsPage({ searchQuery, onToast }: InsightsPageProps) {
  const { data, loading, isDesktop } = useChronicle()
  const [dayRange, setDayRange] = useViewState<InsightRange>(
    'insights-range',
    14,
    (v): v is InsightRange => v === 7 || v === 14 || v === 30,
  )

  const allSessions = useMemo(() => data?.sessions ?? [], [data])

  const allProjectPaths = useMemo(
    () => allSessions.map((s) => s.projectPath || s.project).filter(Boolean),
    [allSessions],
  )

  const sessions = useMemo(() => {
    const minTime = Date.now() - dayRange * 86_400_000
    const q = searchQuery.trim().toLowerCase()
    return allSessions
      .filter((s) => (s.start || 0) >= minTime)
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.project.toLowerCase().includes(q) ||
          s.toolName.toLowerCase().includes(q),
      )
      .sort((a, b) => (b.start || 0) - (a.start || 0))
  }, [allSessions, dayRange, searchQuery])

  // 每日活跃时长趋势
  const dailyPoints = useMemo<DailyPoint[]>(() => {
    const map = new Map<string, number>()
    for (let i = dayRange - 1; i >= 0; i--) {
      map.set(dayKeyOf(Date.now() - i * 86_400_000), 0)
    }
    for (const s of sessions) {
      if (!s.start) continue
      const key = dayKeyOf(s.start)
      if (!map.has(key)) continue
      map.set(key, (map.get(key) || 0) + sessionDurationMinutes(s))
    }
    return [...map.entries()].map(([day, minutes]) => ({
      day: day.slice(5), // MM-DD
      minutes,
      hours: Number((minutes / 60).toFixed(1)),
    }))
  }, [sessions, dayRange])

  // 工具会话占比
  const toolSplit = useMemo<ToolRatio[]>(() => {
    const map = new Map<string, { count: number; color: string }>()
    for (const s of sessions) {
      const cur = map.get(s.tool) || { count: 0, color: s.toolColor }
      cur.count += 1
      map.set(s.tool, cur)
    }
    const total = sessions.length || 1
    return [...map.entries()]
      .map(([name, val]) => ({
        name,
        count: val.count,
        color: val.color,
        pct: Number(((val.count / total) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.count - a.count)
  }, [sessions])

  // 项目透视：会话数 / 轮次 / 产出 / 时长
  const projectStats = useMemo(() => {
    const map = new Map<
      string,
      { turns: number; artifacts: number; minutes: number; last: number }
    >()
    for (const s of sessions) {
      const key = s.projectPath || s.project
      if (!key) continue
      const item = map.get(key) || { turns: 0, artifacts: 0, minutes: 0, last: 0 }
      item.turns += s.turns
      item.artifacts += s.artifacts?.length ?? 0
      item.minutes += sessionDurationMinutes(s)
      const end = s.end || s.start || 0
      if (end > item.last) item.last = end
      map.set(key, item)
    }
    return [...map.entries()]
      .map(([path, v]) => ({ path, ...v }))
      .sort((a, b) => b.turns - a.turns)
      .slice(0, 12)
  }, [sessions])

  const totals = useMemo(() => {
    const turns = sessions.reduce((sum, s) => sum + s.turns, 0)
    const artifacts = sessions.reduce((sum, s) => sum + (s.artifacts?.length ?? 0), 0)
    const minutes = sessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0)
    const days = new Set(sessions.map((s) => (s.start ? dayKeyOf(s.start) : '')).filter(Boolean))
    return { turns, artifacts, minutes, days: days.size }
  }, [sessions])

  const busiestDay = useMemo(() => {
    let best: { day: string; minutes: number } | null = null
    for (const point of dailyPoints) {
      if (!best || point.minutes > best.minutes) best = { day: point.day, minutes: point.minutes }
    }
    return best
  }, [dailyPoints])

  /** dailyPoints 的 day 是 MM-DD，补齐年份后交给 formatDayLabelShort */
  const busiestDayLabel = useMemo(() => {
    if (!busiestDay) return ''
    const [m, d] = busiestDay.day.split('-')
    return formatDayLabelShort(`${new Date().getFullYear()}-${m}-${d}`)
  }, [busiestDay])

  async function openFolder(path: string) {
    const result = await openLocalPath(path)
    if (!result.ok) {
      onToast({
        tone: 'warning',
        title: '无法打开项目目录',
        message: result.message || '目录可能已被移动或删除。',
      })
    }
  }

  if (!isDesktop) {
    return (
      <DesktopOnlyPage
        title="分析"
        description="分析基于本机真实会话日志计算，浏览器预览无法读取。"
      />
    )
  }

  if (loading && !data) return <SkeletonPage cards={3} rows={4} banner={false} />

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="所选周期没有会话"
        description="切换到 30 天，或产生新会话后重新采集。清空顶部过滤条件可查看全量。"
      />
    )
  }

  return (
    <div className="desk-insights-shell">
      <div className="desk-insights-ctrl">
        <span className="desk-ctrl-title">分析周期</span>
        <div className="desk-pill-group">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              className={classNames('desk-pill-btn', dayRange === r && 'active')}
              onClick={() => setDayRange(r)}
              aria-pressed={dayRange === r}
            >
              近 {r} 天
            </button>
          ))}
        </div>
        <span className="desk-chart-note">
          {totals.days} 个活跃日 · {totals.turns} 轮 · {totals.artifacts} 个产出 ·{' '}
          {formatDuration(totals.minutes) || '跨度不足 1 分钟'}
          {busiestDay && busiestDay.minutes > 0 && <> · 最忙 {busiestDayLabel}</>}
        </span>
      </div>

      {/* 活跃投入柱状图（自绘 SVG） */}
      <div className="desk-panel desk-chart-card desk-enter">
        <div className="desk-panel-title">
          <Clock size={14} />
          <span>投入活跃时长趋势</span>
          <small>单位：小时 / 天 · 悬停柱体查看精确值</small>
        </div>
        <TrendBarChart data={dailyPoints} />
      </div>

      {/* 工具分布比例带 */}
      <div className="desk-panel desk-tool-split-card desk-enter">
        <div className="desk-panel-title">
          <Cpu size={14} />
          <span>各 AI Agent 会话贡献分布</span>
          <small>按会话数占比</small>
        </div>
        <ToolSplitTrack ratios={toolSplit} />
      </div>

      {/* 重点项目透视 */}
      <div className="desk-panel desk-chart-card desk-enter">
        <div className="desk-panel-title">
          <FolderOpen size={14} />
          <span>重点项目投入透视</span>
          <small>按交互轮次排序 · 可直接打开目录</small>
        </div>
        <div className="desk-scan-list">
          {projectStats.map((project) => (
            <div className="desk-scan-row" key={project.path}>
              <strong title={project.path}>
                {projectDisplayName(project.path, allProjectPaths)}
              </strong>
              <span>{project.turns} 轮</span>
              <span>{project.artifacts} 产出</span>
              <span>{formatDuration(project.minutes) || '跨度不足 1 分钟'}</span>
              <button
                onClick={() => void openFolder(project.path)}
                className="desk-icon-btn-ghost"
                title={`打开：${project.path}`}
                aria-label={`打开项目目录 ${project.path}`}
              >
                <FolderOpen size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

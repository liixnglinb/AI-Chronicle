import { useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatDuration, formatTimeRange, sessionTouchesDay } from '../lib/format'
import { projectDisplayName } from '../lib/paths'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SkeletonPage } from '../components/Skeleton'
import { ToolMark } from '../components/ToolMark'
import { classNames } from '../lib/utils'

interface TimelinePageProps {
  searchQuery: string
}

const SLOTS_PER_DAY = 96 // 24 小时 × 4 格（15 分钟一格）
const SLOT_MINUTES = 15

/** 会话是否覆盖指定小时。跨零点的长会话两端都要能命中，不能只看开始时间。 */
function hourOfSession(
  session: { start: number | null; end: number | null },
  hour: number,
): boolean {
  if (!session.start) return false
  const start = new Date(session.start)
  const end = new Date(session.end || session.start)
  const slotStart = new Date(start)
  slotStart.setHours(hour, 0, 0, 0)
  const slotEnd = new Date(slotStart)
  slotEnd.setHours(hour + 1, 0, 0, 0)
  return start < slotEnd && end > slotStart
}

/**
 * 时间轴：24 小时 15 分钟级连续标尺 + 时间流动日志。
 *
 * 为什么不用 24 个离散柱：那样看不出「几点到几点」是连续工作、
 * 也看不出跨小时的会话和空闲带。96 格连续标尺把一天切成真实的时间片，
 * 点击任一小时可联动筛选下方流水。
 */
export function TimelinePage({ searchQuery }: TimelinePageProps) {
  const { data, loading, isDesktop, settings } = useChronicle()
  // 目录标签默认不渲染（设置中心可打开）；卡片头本来就有软件名，隐藏后仍看得出是谁干的
  const showPaths = settings.showProjectPaths
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  /** 悬停小时：仅高亮联动，不改变过滤，避免鼠标扫过标尺时下方流水剧烈跳动 */
  const [hoverHour, setHoverHour] = useState<number | null>(null)

  const todayKey = useMemo(() => dayKeyOf(Date.now()), [])

  const todaySessions = useMemo(() => {
    return (data?.sessions ?? [])
      .filter((s) => sessionTouchesDay(s, todayKey))
      .sort((a, b) => (b.start || 0) - (a.start || 0))
  }, [data, todayKey])

  const allProjectPaths = useMemo(
    () => (data?.sessions ?? []).map((s) => s.projectPath || s.project).filter(Boolean),
    [data],
  )

  // 96 格活跃度：按会话与每个时间片的真实交集累加
  const slots = useMemo(() => {
    const buckets = Array.from({ length: SLOTS_PER_DAY }, () => ({
      minutes: 0,
      sessions: 0,
      tools: new Set<string>(),
    }))
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const base = dayStart.getTime()

    for (const s of todaySessions) {
      const start = s.start
      const end = s.end || start
      if (!start) continue
      // 跨零点的会话只取今日部分
      const from = Math.max(start, base)
      const to = Math.min(end || start, base + 86_400_000)
      if (to <= from) continue
      const firstSlot = Math.max(0, Math.floor((from - base) / 60_000 / SLOT_MINUTES))
      const lastSlot = Math.min(
        SLOTS_PER_DAY - 1,
        Math.floor((to - 1 - base) / 60_000 / SLOT_MINUTES),
      )
      for (let i = firstSlot; i <= lastSlot; i++) {
        const slotStart = base + i * SLOT_MINUTES * 60_000
        const slotEnd = slotStart + SLOT_MINUTES * 60_000
        const overlap = Math.min(to, slotEnd) - Math.max(from, slotStart)
        if (overlap > 0) {
          buckets[i].minutes += overlap / 60_000
          buckets[i].sessions += 1
          buckets[i].tools.add(s.toolColor)
        }
      }
    }
    return buckets
  }, [todaySessions])

  const maxSlotMinutes = Math.max(...slots.map((s) => s.minutes), SLOT_MINUTES)

  const totals = useMemo(() => {
    const activeSlots = slots.filter((s) => s.minutes > 0).length
    const minutes = slots.reduce((sum, s) => sum + s.minutes, 0)
    let peakSlot = -1
    slots.forEach((s, i) => {
      if (peakSlot < 0 || s.minutes > slots[peakSlot].minutes) peakSlot = i
    })
    // 找最长连续活跃段，反映「真正的连续工作窗口」
    let longestRun = 0
    let run = 0
    for (const s of slots) {
      if (s.minutes > 0) {
        run += 1
        longestRun = Math.max(longestRun, run)
      } else {
        run = 0
      }
    }
    return { activeSlots, minutes, peakSlot, longestRun }
  }, [slots])

  const displayedSessions = useMemo(() => {
    let list = todaySessions
    if (selectedHour !== null) {
      list = list.filter((s) => hourOfSession(s, selectedHour))
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.project.toLowerCase().includes(q) ||
        s.projectPath.toLowerCase().includes(q) ||
        s.toolName.toLowerCase().includes(q),
    )
  }, [todaySessions, selectedHour, searchQuery])

  const highlightedIds = useMemo(() => {
    if (hoverHour === null || selectedHour !== null) return null
    const ids = new Set<string>()
    for (const s of todaySessions) {
      if (hourOfSession(s, hoverHour)) ids.add(s.id)
    }
    return ids
  }, [hoverHour, selectedHour, todaySessions])

  if (!isDesktop) {
    return <DesktopOnlyPage title="时间轴" description="时间轴读取的是本机真实会话日志。" />
  }

  if (loading && !data) return <SkeletonPage cards={0} rows={5} banner={false} />

  if (todaySessions.length === 0) {
    return (
      <EmptyState
        title="今日尚无活跃时间轨迹"
        description="系统正在后台监听本地会话，产生对话交互后时间标尺将自动亮起。"
      />
    )
  }

  return (
    <div className="desk-timeline-shell">
      {/* 24 小时微观标尺 */}
      <div className="desk-panel desk-ruler-panel desk-enter">
        <div className="desk-ruler-header">
          <span className="desk-ruler-title">
            <Clock size={14} />
            <span>今日工作节奏热力标尺</span>
            <small className="desk-ruler-sub">
              24 小时 × 15 分钟 · 活跃 {formatDuration(Math.round(totals.minutes))} · 最长连续{' '}
              {Math.round(((totals.longestRun * SLOT_MINUTES) / 60) * 10) / 10} 小时
            </small>
          </span>
          {selectedHour !== null && (
            <button
              onClick={() => setSelectedHour(null)}
              className="desk-btn-ghost-sm"
              title="取消时段筛选"
            >
              重置选中（正在聚焦 {String(selectedHour).padStart(2, '0')}:00 时段）
            </button>
          )}
        </div>

        <div className="desk-ruler-track" role="img" aria-label="今日 24 小时活跃度标尺">
          {slots.map((slot, idx) => {
            const hour = Math.floor(idx / 4)
            const isSelected = selectedHour === hour
            const level =
              slot.minutes >= SLOT_MINUTES * 0.75 ? 'peak' : slot.minutes > 0 ? 'active' : 'idle'
            return (
              <button
                key={idx}
                className={classNames(
                  'desk-ruler-slot',
                  idx % 4 === 0 && 'hour-start',
                  isSelected && 'selected',
                )}
                data-level={level}
                onClick={() => setSelectedHour(isSelected ? null : hour)}
                onMouseEnter={() => setHoverHour(hour)}
                onMouseLeave={() => setHoverHour((h) => (h === hour ? null : h))}
                title={`${String(hour).padStart(2, '0')}:${String((idx % 4) * SLOT_MINUTES).padStart(2, '0')} · 活跃 ${Math.round(slot.minutes)} 分钟 · ${slot.sessions} 场会话覆盖`}
                aria-label={`${hour} 时 ${(idx % 4) * SLOT_MINUTES} 分，活跃 ${Math.round(slot.minutes)} 分钟`}
              >
                <span
                  className="desk-ruler-slot-bar"
                  style={{
                    height: `${Math.max((slot.minutes / maxSlotMinutes) * 100, slot.minutes > 0 ? 12 : 4)}%`,
                  }}
                />
              </button>
            )
          })}
          {/* 整点刻度 */}
          {Array.from({ length: 9 }, (_, i) => i * 3).map((hour) => (
            <span
              key={hour}
              className="desk-ruler-hour-mark"
              style={{ left: `calc(${(hour * 4 * 100) / SLOTS_PER_DAY}% + 6px)` }}
            >
              {String(hour).padStart(2, '0')}
            </span>
          ))}
        </div>

        <div className="desk-ruler-legend">
          <span>
            <i className="desk-ruler-legend-idle" />
            空闲时段
          </span>
          <span>
            <i className="desk-ruler-legend-active" />
            有活动
          </span>
          <span>
            <i className="desk-ruler-legend-peak" />
            高强度（≥11 分钟）
          </span>
          {totals.peakSlot >= 0 && (
            <span className="desk-faint">
              峰值 {String(Math.floor(totals.peakSlot / 4)).padStart(2, '0')}:
              {String((totals.peakSlot % 4) * SLOT_MINUTES).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>

      {/* 时间流动日志 */}
      <div className="desk-flow-stream">
        <div className="desk-flow-lead">
          <span>
            {selectedHour !== null
              ? `${String(selectedHour).padStart(2, '0')}:00 – ${String(selectedHour).padStart(2, '0')}:59 时段内的会话`
              : '今日全天完整工作流水'}
          </span>
          <small>共 {displayedSessions.length} 条记录</small>
        </div>

        <div className="desk-flow-list">
          {displayedSessions.map((s, idx) => (
            <div key={s.id} className="desk-flow-item">
              <span className="desk-flow-axis">
                <span className="desk-axis-node" style={{ backgroundColor: s.toolColor }} />
                {idx !== displayedSessions.length - 1 && <span className="desk-axis-line" />}
              </span>

              <div
                className={classNames(
                  'desk-panel desk-flow-card desk-enter',
                  highlightedIds && !highlightedIds.has(s.id) && 'is-dim',
                )}
              >
                <div className="desk-flow-card-head">
                  <span className="desk-flow-head-left">
                    <span className="desk-flow-tool-name" style={{ color: s.toolColor }}>
                      <ToolMark tool={s.tool} name={s.toolName} color={s.toolColor} size={16} />
                    </span>
                    <span className="desk-flow-time-range">{formatTimeRange(s.start, s.end)}</span>
                  </span>
                  {showPaths && (
                    <span className="desk-flow-proj-tag" title={s.projectPath}>
                      {projectDisplayName(s.projectPath || s.project, allProjectPaths)}
                    </span>
                  )}
                </div>

                <h4 className="desk-flow-title" title={`会话首条指令：${s.title}`}>
                  {s.title || '（无交互意图记录）'}
                </h4>

                <div className="desk-flow-foot-meta">
                  <span>轮次 {s.turns}</span>
                  {s.model && <span>模型 {s.model}</span>}
                  {s.artifacts.length > 0 && <span>改动文件 {s.artifacts.length}</span>}
                </div>

                {s.artifacts.length > 0 && (
                  <div className="desk-flow-art-list">
                    {s.artifacts.slice(0, 5).map((a) => (
                      <span key={a.path} className="desk-flow-art" title={a.path}>
                        {a.name}
                      </span>
                    ))}
                    {s.artifacts.length > 5 && (
                      <span className="desk-flow-art">+{s.artifacts.length - 5}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {displayedSessions.length === 0 && (
          <EmptyState
            compact
            title="该条件下没有会话"
            description="调整时段筛选或清空搜索关键词后重试。"
          />
        )}
      </div>
    </div>
  )
}

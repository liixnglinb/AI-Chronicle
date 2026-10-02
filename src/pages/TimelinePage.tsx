import { useMemo } from 'react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatDuration, sessionTouchesDay } from '../lib/format'
import { SessionRow } from '../components/SessionRow'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SkeletonPage } from '../components/Skeleton'
import { classNames } from '../lib/utils'

interface TimelinePageProps {
  searchQuery: string
}

export function TimelinePage({ searchQuery }: TimelinePageProps) {
  const { data, loading, isDesktop } = useChronicle()

  const today = useMemo(() => {
    const key = dayKeyOf(Date.now())
    return (data?.sessions ?? [])
      .filter((s) => sessionTouchesDay(s, key))
      .sort((a, b) => (a.start || 0) - (b.start || 0))
  }, [data])

  const hours = useMemo(() => {
    // 每小时活跃分钟数（按会话与该小时的交集计算）
    const buckets = Array.from({ length: 24 }, () => ({ active: 0, sessions: 0 }))
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    for (const s of today) {
      const start = s.start || 0
      const end = s.end || start
      for (let h = 0; h < 24; h++) {
        const hStart = dayStart.getTime() + h * 3_600_000
        const hEnd = hStart + 3_600_000
        const overlap = Math.min(end, hEnd) - Math.max(start, hStart)
        if (overlap > 0) {
          buckets[h].active += Math.min(overlap, 3_600_000) / 60_000
          buckets[h].sessions += 1
        }
      }
    }
    return buckets
  }, [today])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return today
    return today.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.project.toLowerCase().includes(q) ||
        s.toolName.toLowerCase().includes(q),
    )
  }, [today, searchQuery])

  const maxActive = Math.max(1, ...hours.map((h) => h.active))
  const peakHour = useMemo(() => {
    let index = -1
    let max = 0
    hours.forEach((h, i) => {
      if (h.active > max) {
        max = h.active
        index = i
      }
    })
    return index
  }, [hours])

  const activeMinutes = useMemo(() => hours.reduce((sum, h) => sum + h.active, 0), [hours])

  if (!isDesktop) {
    return <DesktopOnlyPage title="时间轴" description="时间轴读取的是本机真实会话日志。" />
  }

  const kicker = today.length
    ? [
        `${today.length} 个会话`,
        activeMinutes > 0 ? `活跃 ${formatDuration(Math.round(activeMinutes))}` : '',
        peakHour >= 0 ? `峰值 ${String(peakHour).padStart(2, '0')}:00` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '今天 · 分时分布'

  return (
    <div className="page">
      <PageHeader kicker={kicker} title="活动时间线" />

      {loading && !data && <SkeletonPage cells={0} rows={5} />}

      {data && (
        <section className="session-section">
          <div className="hour-grid">
            {hours.map((h, i) => (
              <div
                className={classNames('hour-cell', h.active > 0 && 'hour-cell-active')}
                key={i}
                title={`${String(i).padStart(2, '0')}:00 – ${String(i + 1).padStart(2, '0')}:00 · ${Math.round(h.active)} 分钟活跃 · ${h.sessions} 个会话`}
              >
                <div className="hour-bar-wrap">
                  <div
                    className={classNames(
                      'hour-bar',
                      h.active <= 0 && 'hour-bar-idle',
                      i === peakHour && 'hour-bar-peak',
                    )}
                    style={{ height: `${Math.round((h.active / maxActive) * 100)}%` }}
                  />
                </div>
                <span className="hour-label">{String(i).padStart(2, '0')}</span>
              </div>
            ))}
          </div>
          <div className="hour-legend">
            <span>
              <i className="hour-legend-idle" />
              无活动
            </span>
            <span>
              <i className="hour-legend-active" />
              有活动
            </span>
            <span>
              <i className="hour-legend-peak" />
              峰值时段（{String(Math.max(peakHour, 0)).padStart(2, '0')}:00）
            </span>
          </div>
        </section>
      )}

      {data && today.length > 0 && (
        <section className="session-section">
          <div className="section-title-row">
            <span className="eyebrow">今天的时间顺序</span>
            <span className="result-count">{filtered.length} 个会话 · 最早在前</span>
          </div>
          <div className="session-list">
            {filtered.map((s) => (
              <SessionRow key={s.id} session={s} compact />
            ))}
          </div>
        </section>
      )}

      {data && !loading && today.length === 0 && (
        <EmptyState
          title="今天还没有会话"
          description="数据按小时分布展示，有会话后这里会出现柱状分布。"
        />
      )}
    </div>
  )
}

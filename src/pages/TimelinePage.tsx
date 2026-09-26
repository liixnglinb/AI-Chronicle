import { useMemo } from 'react'
import { useChronicle } from '../lib/store'
import { dayKeyOf } from '../lib/format'
import { SessionRow } from '../components/SessionRow'

interface TimelinePageProps {
  searchQuery: string
}

export function TimelinePage({ searchQuery }: TimelinePageProps) {
  const { data, loading, isDesktop } = useChronicle()

  const today = useMemo(() => {
    const key = dayKeyOf(Date.now())
    return (data?.sessions ?? [])
      .filter((s) => s.start && dayKeyOf(s.start) === key)
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

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>需要桌面版</strong>
          <span>时间线读取的是本机真实会话日志。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">今天 · 分时分布</span>
          <strong>活动时间线</strong>
        </div>
      </div>

      {loading && !data && (
        <div className="page-loading">
          <span />
          正在读取本机 AI 会话日志…
        </div>
      )}

      {data && (
        <div className="hour-grid">
          {hours.map((h, i) => (
            <div className="hour-cell" key={i} title={`${i}:00 – ${i + 1}:00 · ${Math.round(h.active)} 分钟活跃`}>
              <div className="hour-bar-wrap">
                <div
                  className="hour-bar"
                  style={{ height: `${Math.round((h.active / maxActive) * 100)}%` }}
                />
              </div>
              <span className="hour-label">{String(i).padStart(2, '0')}</span>
            </div>
          ))}
        </div>
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
        <div className="empty-state">
          <strong>今天还没有会话</strong>
          <span>数据按小时分布展示，有会话后这里会出现柱状分布。</span>
        </div>
      )}
    </div>
  )
}

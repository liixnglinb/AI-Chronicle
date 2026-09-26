import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useChronicle } from '../lib/store'
import {
  dayKeyOf,
  formatDayLabel,
  formatDuration,
  formatTokens,
  sessionDurationMinutes,
  totalTokens,
} from '../lib/format'
import { SessionRow } from '../components/SessionRow'
import { ToolDot } from '../components/ToolDot'
import type { SessionRecord } from '../types'

const VISIBLE_DAYS = 14

export function HistoryPage() {
  const { data, loading, isDesktop } = useChronicle()
  const [openDay, setOpenDay] = useState<string | null>(null)

  const days = useMemo(() => {
    const map = new Map<
      string,
      { sessions: SessionRecord[]; tokens: number; tools: Map<string, { name: string; color: string }> }
    >()
    for (const s of data?.sessions ?? []) {
      if (!s.start) continue
      const key = dayKeyOf(s.start)
      let day = map.get(key)
      if (!day) {
        day = { sessions: [], tokens: 0, tools: new Map() }
        map.set(key, day)
      }
      day.sessions.push(s)
      day.tokens += totalTokens(s)
      if (!day.tools.has(s.tool)) {
        day.tools.set(s.tool, { name: s.toolName, color: s.toolColor })
      }
    }
    const keys = [...map.keys()].sort((a, b) => (a < b ? 1 : -1)).slice(0, VISIBLE_DAYS)
    return keys.map((key) => {
      const day = map.get(key)!
      const sessions = [...day.sessions].sort((a, b) => (b.start || 0) - (a.start || 0))
      const minutes = sessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0)
      return { key, sessions, tokens: day.tokens, tools: [...day.tools.values()], minutes }
    })
  }, [data])

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>需要桌面版</strong>
          <span>历史回看读取的是本机真实会话日志。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">最近 {VISIBLE_DAYS} 个有记录的日期</span>
          <strong>历史回看</strong>
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
          <strong>还没有任何会话记录</strong>
          <span>接入的软件产生会话后，这里会按天展示。</span>
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
                    {day.tokens > 0 && ` · ${formatTokens(day.tokens)} tokens`}
                  </span>
                </div>
                <div className="history-day-tools">
                  {day.tools.slice(0, 5).map((t) => (
                    <span key={t.name} className="history-day-tool">
                      <ToolDot color={t.color} name={t.name} />
                    </span>
                  ))}
                </div>
                <ChevronDown size={16} className={open ? 'chev chev-up' : 'chev'} />
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
    </div>
  )
}

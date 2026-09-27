import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useChronicle } from '../lib/store'
import { dayKeyOf, sessionTouchesDay } from '../lib/format'

const DAYS_WINDOW = 14

export function InsightsPage() {
  const { data, loading, isDesktop } = useChronicle()

  const byTool = useMemo(() => {
    const map = new Map<string, {
      name: string; color: string; sessions: number; turns: number; artifacts: number
    }>()
    for (const s of data?.sessions ?? []) {
      const cur = map.get(s.tool) || {
        name: s.toolName,
        color: s.toolColor,
        sessions: 0,
        turns: 0,
        artifacts: 0,
      }
      cur.sessions += 1
      cur.turns += s.turns
      cur.artifacts += (s.artifacts ?? []).length
      map.set(s.tool, cur)
    }
    return [...map.values()].sort((a, b) => b.sessions - a.sessions)
  }, [data])

  const byDay = useMemo(() => {
    const map = new Map<string, { sessions: number; turns: number; artifacts: number }>()
    for (const s of data?.sessions ?? []) {
      if (!s.start) continue
      const key = dayKeyOf(s.start)
      const cur = map.get(key) || { sessions: 0, turns: 0, artifacts: 0 }
      cur.sessions += 1
      cur.turns += s.turns
      cur.artifacts += (s.artifacts ?? []).length
      map.set(key, cur)
    }
    const out: {
      day: string; label: string; sessions: number; turns: number; artifacts: number
    }[] = []
    for (let i = DAYS_WINDOW - 1; i >= 0; i--) {
      const key = dayKeyOf(Date.now() - i * 86_400_000)
      const cur = map.get(key)
      const d = new Date(key.replace(/-/g, '/'))
      out.push({
        day: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        sessions: cur?.sessions ?? 0,
        turns: cur?.turns ?? 0,
        artifacts: cur?.artifacts ?? 0,
      })
    }
    return out
  }, [data])

  const todayCount = useMemo(() => {
    const key = dayKeyOf(Date.now())
    return (data?.sessions ?? []).filter((s) => sessionTouchesDay(s, key)).length
  }, [data])

  const grandSessions = byTool.reduce((sum, t) => sum + t.sessions, 0)
  const grandArtifacts = byTool.reduce((sum, t) => sum + t.artifacts, 0)

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>需要桌面版</strong>
          <span>洞察统计读取的是本机真实会话日志。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            全部记录 {grandSessions} 个会话 · {grandArtifacts} 个产出文件 · 今天 {todayCount} 个
          </span>
          <strong>洞察</strong>
        </div>
      </div>

      {loading && !data && (
        <div className="page-loading">
          <span />
          正在读取本机 AI 会话日志…
        </div>
      )}

      {data && byTool.length === 0 && (
        <div className="empty-state">
          <strong>还没有数据</strong>
          <span>产生会话后这里会出现软件投入与节奏图。</span>
        </div>
      )}

      {data && byTool.length > 0 && (
        <div className="insights-grid-real">
          <section className="chart-panel">
            <div className="section-title-row">
              <span className="eyebrow">各软件投入（会话数）</span>
              <span className="result-count">全部记录</span>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byTool.slice(0, 10)} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-subtle)" />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={92}
                    fontSize={11}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [`${v} 个会话`, '投入'] as [string, string]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="sessions" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="chart-panel">
            <div className="section-title-row">
              <span className="eyebrow">近 {DAYS_WINDOW} 天节奏（每日会话数）</span>
              <span className="result-count">含空缺日补零</span>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byDay} margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                  <XAxis dataKey="label" fontSize={10} tickLine={false} />
                  <YAxis allowDecimals={false} fontSize={11} width={32} />
                  <Tooltip
                    formatter={(v, _n, entry) => {
                      const payload = (entry as { payload?: { turns?: number; artifacts?: number } })?.payload
                      return [
                        `${v} 个会话 · ${payload?.turns ?? 0} 轮 · 产出 ${payload?.artifacts ?? 0}`,
                        '',
                      ] as [string, string]
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="sessions" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="chart-panel">
            <div className="section-title-row">
              <span className="eyebrow">软件贡献排行</span>
              <span className="result-count">会话 / 轮次 / 产出文件</span>
            </div>
            <div className="tool-contribution-list">
              {byTool.map((t) => (
                <div className="tool-contribution-row" key={t.name}>
                  <div className="tool-contribution-name">
                    <span className="tool-chip-dot" style={{ background: t.color }} />
                    {t.name}
                  </div>
                  <div className="tool-contribution-nums">
                    <span>{t.sessions} 会话</span>
                    <span>{t.turns} 轮</span>
                    {t.artifacts > 0 && <span>产出 {t.artifacts}</span>}
                    <strong>{grandSessions ? Math.round((t.sessions / grandSessions) * 100) : 0}%</strong>
                  </div>
                  <div className="tool-contribution-track">
                    <div
                      className="tool-contribution-bar"
                      style={{
                        width: `${grandSessions ? Math.max(2, Math.round((t.sessions / grandSessions) * 100)) : 0}%`,
                        background: t.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

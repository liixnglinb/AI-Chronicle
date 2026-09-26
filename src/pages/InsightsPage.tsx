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
import { dayKeyOf, formatTokens, totalTokens } from '../lib/format'

const DAYS_WINDOW = 14

export function InsightsPage() {
  const { data, loading, isDesktop } = useChronicle()

  const byTool = useMemo(() => {
    const map = new Map<string, { name: string; color: string; tokens: number; sessions: number; turns: number }>()
    for (const s of data?.sessions ?? []) {
      const cur = map.get(s.tool) || {
        name: s.toolName,
        color: s.toolColor,
        tokens: 0,
        sessions: 0,
        turns: 0,
      }
      cur.tokens += totalTokens(s)
      cur.sessions += 1
      cur.turns += s.turns
      map.set(s.tool, cur)
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens)
  }, [data])

  const byDay = useMemo(() => {
    const map = new Map<string, { tokens: number; sessions: number }>()
    for (const s of data?.sessions ?? []) {
      if (!s.start) continue
      const key = dayKeyOf(s.start)
      const cur = map.get(key) || { tokens: 0, sessions: 0 }
      cur.tokens += totalTokens(s)
      cur.sessions += 1
      map.set(key, cur)
    }
    // 最近 N 天（含空缺日补零）
    const out: { day: string; label: string; tokens: number; sessions: number }[] = []
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    for (let i = DAYS_WINDOW - 1; i >= 0; i--) {
      const key = dayKeyOf(Date.now() - i * 86_400_000)
      const cur = map.get(key)
      const d = new Date(key.replace(/-/g, '/'))
      out.push({
        day: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        tokens: cur?.tokens ?? 0,
        sessions: cur?.sessions ?? 0,
      })
    }
    // 周末标记
    return out.map((x) => {
      const d = new Date(x.day.replace(/-/g, '/'))
      return { ...x, weekend: weekdays[d.getDay()] === '六' || weekdays[d.getDay()] === '日' }
    })
  }, [data])

  const grandTokens = byTool.reduce((sum, t) => sum + t.tokens, 0)

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
            全部记录 {formatTokens(grandTokens)} tokens · 最近 {DAYS_WINDOW} 天趋势
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
          <span>产生会话后这里会出现软件贡献与趋势图。</span>
        </div>
      )}

      {data && byTool.length > 0 && (
        <div className="insights-grid-real">
          <section className="chart-panel">
            <div className="section-title-row">
              <span className="eyebrow">各软件 token 消耗</span>
              <span className="result-count">全部记录 · 含缓存上下文</span>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byTool.slice(0, 10)} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-subtle)" />
                  <XAxis type="number" tickFormatter={(v: number) => formatTokens(v)} fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={92}
                    fontSize={11}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [`${formatTokens(Number(v))} tokens`, '消耗'] as [string, string]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="tokens" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="chart-panel">
            <div className="section-title-row">
              <span className="eyebrow">近 {DAYS_WINDOW} 天每日 tokens</span>
              <span className="result-count">含空缺日补零</span>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byDay} margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                  <XAxis dataKey="label" fontSize={10} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => formatTokens(v)} fontSize={11} width={56} />
                  <Tooltip
                    formatter={(v, _n, entry) => {
                      const payload = (entry as { payload?: { sessions?: number } })?.payload
                      return [
                        `${formatTokens(Number(v))} tokens`,
                        `${payload?.sessions ?? 0} 会话`,
                      ] as [string, string]
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="tokens" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="chart-panel">
            <div className="section-title-row">
              <span className="eyebrow">软件贡献排行</span>
              <span className="result-count">会话 / 轮次 / tokens</span>
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
                    <strong>{formatTokens(t.tokens)}</strong>
                  </div>
                  <div className="tool-contribution-track">
                    <div
                      className="tool-contribution-bar"
                      style={{
                        width: `${grandTokens ? Math.max(2, Math.round((t.tokens / grandTokens) * 100)) : 0}%`,
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

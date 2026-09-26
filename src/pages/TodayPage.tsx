import { useMemo } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { useChronicle } from '../lib/store'
import {
  dayKeyOf,
  formatClock,
  formatTokens,
  formatTimeRange,
  totalTokens,
} from '../lib/format'
import { saveText } from '../lib/desktop'
import { SessionRow } from '../components/SessionRow'
import type { SessionRecord, ToastMessage } from '../types'

interface TodayPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

function buildDailyReport(sessions: SessionRecord[]): string {
  const lines: string[] = []
  const key = dayKeyOf(Date.now())
  lines.push(`# AI 工作日报 · ${key}`)
  lines.push('')
  const tokens = sessions.reduce((sum, s) => sum + totalTokens(s), 0)
  const tools = new Set(sessions.map((s) => s.toolName))
  lines.push(
    `今日共 ${sessions.length} 个会话，涉及 ${tools.size} 个软件，累计 ${formatTokens(tokens)} tokens。`,
  )
  lines.push('')
  lines.push('| 时间 | 软件 | 项目 | 做了什么 | 轮次 |')
  lines.push('|---|---|---|---|---|')
  for (const s of sessions) {
    lines.push(
      `| ${formatTimeRange(s.start, s.end)} | ${s.toolName} | ${s.project} | ${s.title.replace(/\|/g, '｜')} | ${s.turns} |`,
    )
  }
  return lines.join('\n')
}

export function TodayPage({ searchQuery, onToast }: TodayPageProps) {
  const { data, loading, error, isDesktop, refresh } = useChronicle()

  const today = useMemo(() => {
    const key = dayKeyOf(Date.now())
    const all = data?.sessions ?? []
    return all
      .filter((s) => s.start && dayKeyOf(s.start) === key)
      .sort((a, b) => (b.start || 0) - (a.start || 0))
  }, [data])

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

  const toolSummary = useMemo(() => {
    const map = new Map<string, { name: string; color: string; count: number }>()
    for (const s of today) {
      const cur = map.get(s.tool) || { name: s.toolName, color: s.toolColor, count: 0 }
      cur.count += 1
      map.set(s.tool, cur)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [today])

  const kpis = useMemo(() => {
    if (!today.length) return null
    const tokens = today.reduce((sum, s) => sum + totalTokens(s), 0)
    const turns = today.reduce((sum, s) => sum + s.turns, 0)
    const starts = today.map((s) => s.start as number)
    const ends = today.map((s) => (s.end || s.start) as number)
    return {
      tokens,
      turns,
      first: formatClock(Math.min(...starts)),
      last: formatClock(Math.max(...ends)),
      tools: toolSummary.length,
    }
  }, [today, toolSummary])

  async function exportReport() {
    const md = buildDailyReport([...today].reverse())
    const result = await saveText(`AI工作日报-${dayKeyOf(Date.now())}.md`, md)
    onToast({
      tone: result.ok ? 'success' : 'warning',
      title: result.ok ? '日报已导出' : '导出未完成',
      message: result.message ?? '',
    })
  }

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="page-heading">
          <div>
            <span className="page-kicker">今天</span>
            <strong>需要桌面版</strong>
          </div>
        </div>
        <div className="empty-state">
          <strong>真实数据只在桌面版中读取</strong>
          <span>
            AI 轨迹直接解析本机各 AI 软件的会话日志，浏览器预览环境没有文件访问权限。
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </span>
          <strong>今天用 AI 做了什么</strong>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" type="button" onClick={() => refresh(true)}>
            <RefreshCw size={15} />
            重新采集
          </button>
          {today.length > 0 && (
            <button className="button button-primary" type="button" onClick={exportReport}>
              <Download size={15} />
              导出日报
            </button>
          )}
        </div>
      </div>

      {loading && !data && (
        <div className="page-loading">
          <span />
          正在读取本机 AI 会话日志（首次约 10–20 秒）…
        </div>
      )}

      {error && (
        <div className="empty-state empty-state-error">
          <strong>采集失败</strong>
          <span>{error}</span>
        </div>
      )}

      {data && kpis && (
        <div className="kpi-strip">
          <div className="kpi-card">
            <small>今日会话</small>
            <strong>{today.length}</strong>
          </div>
          <div className="kpi-card">
            <small>使用软件</small>
            <strong>{kpis.tools}</strong>
          </div>
          <div className="kpi-card">
            <small>对话轮次</small>
            <strong>{kpis.turns}</strong>
          </div>
          <div className="kpi-card">
            <small>Tokens（含缓存）</small>
            <strong>{formatTokens(kpis.tokens)}</strong>
          </div>
          <div className="kpi-card">
            <small>活跃时段</small>
            <strong>
              {kpis.first} – {kpis.last}
            </strong>
          </div>
        </div>
      )}

      {data && toolSummary.length > 0 && (
        <div className="tool-summary-row">
          {toolSummary.map((t) => (
            <span className="tool-summary-chip" key={t.name}>
              <span className="tool-chip-dot" style={{ background: t.color }} />
              {t.name} · {t.count} 会话
            </span>
          ))}
        </div>
      )}

      {data && filtered.length > 0 && (
        <section className="session-section">
          <div className="section-title-row">
            <span className="eyebrow">会话明细</span>
            <span className="result-count">
              {filtered.length === today.length
                ? `${today.length} 个会话 · 按时间倒序`
                : `匹配 ${filtered.length} / ${today.length} 个会话`}
            </span>
          </div>
          <div className="session-list">
            {filtered.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        </section>
      )}

      {data && !loading && today.length === 0 && (
        <div className="empty-state">
          <strong>今天还没有会话记录</strong>
          <span>
            去 Codex、Claude Code、ZCode、WorkBuddy 等已接入的软件里干点活，
            回来点「重新采集」就能看到。已接入 {data.sources.filter((x) => x.status === 'connected').length} 个软件。
          </span>
        </div>
      )}

      {data && searchQuery && filtered.length === 0 && today.length > 0 && (
        <div className="empty-state">
          <strong>没有匹配的会话</strong>
          <span>换个关键词试试。</span>
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import {
  Clock,
  Download,
  FileText,
  LayoutGrid,
  MessageSquare,
  RefreshCw,
  Repeat,
} from 'lucide-react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatClock, formatTimeRange, sessionTouchesDay } from '../lib/format'
import { buildDailyReport, buildWorkSummary } from '../lib/summary'
import { saveText } from '../lib/desktop'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SummaryStrip } from '../components/SummaryStrip'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { SkeletonPage } from '../components/Skeleton'
import type { ToastMessage } from '../types'
import { ICON_SIZE } from '../lib/ui'

interface TodayPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

export function TodayPage({ searchQuery, onToast }: TodayPageProps) {
  const { data, loading, isDesktop, refresh } = useChronicle()
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const today = useMemo(() => {
    const key = dayKeyOf(Date.now())
    const all = data?.sessions ?? []
    return all
      .filter((s) => sessionTouchesDay(s, key))
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

  const workSummary = useMemo(() => buildWorkSummary(filtered), [filtered])

  const kpis = useMemo(() => {
    if (!today.length) return null
    const turns = today.reduce((sum, s) => sum + s.turns, 0)
    const artifacts = new Set<string>()
    for (const s of today) {
      for (const a of s.artifacts ?? []) artifacts.add(a.path)
    }
    const starts = today.map((s) => s.start as number)
    const ends = today.map((s) => (s.end || s.start) as number)
    return {
      artifacts: artifacts.size,
      turns,
      first: formatClock(Math.min(...starts)),
      last: formatClock(Math.max(...ends)),
      tools: toolSummary.length,
    }
  }, [today, toolSummary])

  const dateLabel = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  async function runRefresh() {
    setRefreshing(true)
    try {
      await refresh(true)
    } finally {
      setRefreshing(false)
    }
  }

  async function exportReport() {
    setExporting(true)
    try {
      const md = buildDailyReport([...today].reverse())
      const result = await saveText(`AI工作日报-${dayKeyOf(Date.now())}.md`, md)
      onToast({
        tone: result.ok ? 'success' : 'warning',
        title: result.ok ? '日报已导出' : '导出未完成',
        message: result.message ?? '',
      })
    } finally {
      setExporting(false)
    }
  }

  if (!isDesktop) {
    return (
      <DesktopOnlyPage
        title="今日工作台"
        description="AI 轨迹直接解析本机各 AI 软件的会话日志，浏览器预览环境没有文件访问权限。"
      />
    )
  }

  return (
    <div className="page">
      <PageHeader
        kicker={dateLabel}
        title="今日工作台"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={ICON_SIZE.sm} />}
              loading={refreshing}
              onClick={() => void runRefresh()}
            >
              重新采集
            </Button>
            {today.length > 0 && (
              <Button
                variant="primary"
                icon={<Download size={ICON_SIZE.sm} />}
                loading={exporting}
                onClick={() => void exportReport()}
              >
                导出日报
              </Button>
            )}
          </>
        }
      />

      {loading && !data && <SkeletonPage cells={5} rows={4} />}

      {data && kpis && (
        <SummaryStrip
          items={[
            {
              key: 'sessions',
              label: '今日会话',
              value: today.length,
              icon: <MessageSquare size={ICON_SIZE.sm} />,
              tone: 'primary',
            },
            {
              key: 'tools',
              label: '使用软件',
              value: kpis.tools,
              icon: <LayoutGrid size={ICON_SIZE.sm} />,
            },
            {
              key: 'turns',
              label: '对话轮次',
              value: kpis.turns,
              icon: <Repeat size={ICON_SIZE.sm} />,
            },
            {
              key: 'artifacts',
              label: '产出文件',
              value: kpis.artifacts,
              icon: <FileText size={ICON_SIZE.sm} />,
            },
            {
              key: 'span',
              label: '活跃时段',
              value: `${kpis.first} – ${kpis.last}`,
              icon: <Clock size={ICON_SIZE.sm} />,
              compact: true,
            },
          ]}
        />
      )}

      {data && toolSummary.length > 0 && (
        <div className="tool-summary-row">
          {toolSummary.map((t) => (
            <Badge key={t.name} title={`${t.name} · ${t.count} 会话`}>
              <span className="tool-chip-dot" style={{ background: t.color }} />
              {t.name} · {t.count} 会话
            </Badge>
          ))}
        </div>
      )}

      {data && workSummary.length > 0 && (
        <section className="session-section">
          <div className="section-title-row">
            <span className="eyebrow">今天做了什么</span>
            <span className="result-count">按工作目录归组 · 只显示工作结论与产出</span>
          </div>
          <div className="work-summary">
            {workSummary.map((item) => (
              <article className="summary-tool" key={item.key}>
                <div className="summary-tool-head">
                  <strong>{item.project}</strong>
                  <small>{item.focus}</small>
                </div>
                <div className="summary-folder">
                  <div className="summary-folder-path">
                    <strong>
                      {item.count} 个会话 · {item.turns} 轮
                    </strong>
                    <span>{item.tools.join(' / ')}</span>
                    <small>
                      {item.first && item.last ? formatTimeRange(item.first, item.last) : ''}
                    </small>
                  </div>
                  <p className="summary-conclusion">
                    在 <strong>{item.project}</strong> 中推进{item.focus}
                    {item.artifactCount > 0
                      ? `，累计处理 ${item.artifactCount} 个产出文件。`
                      : '。'}
                  </p>
                  {item.artifactNames.length > 0 && (
                    <ul className="summary-points">
                      {item.artifactNames.slice(0, 4).map((name) => (
                        <li key={name} title={name}>
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {data && !loading && today.length === 0 && (
        <EmptyState
          title="今天还没有会话记录"
          description={`去 Codex、Claude Code、ZCode、WorkBuddy 等已接入的软件里干点活，回来点「重新采集」就能看到。当前已接入 ${data.sources.filter((x) => x.status === 'connected').length} 个软件。`}
        />
      )}

      {data && searchQuery && filtered.length === 0 && today.length > 0 && (
        <EmptyState title="没有匹配的会话" description="换个关键词，或清空顶部搜索框。" />
      )}
    </div>
  )
}

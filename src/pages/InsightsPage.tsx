import { useMemo, useState } from 'react'
import { FolderOpen } from 'lucide-react'
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
import { dayKeyOf, formatDayLabel, formatDuration, sessionDurationMinutes } from '../lib/format'
import { ToolDot } from '../components/ToolDot'
import type { SessionRecord, ToastMessage } from '../types'

interface InsightsPageProps {
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

type InsightRange = 7 | 14 | 30

interface MetricGroup {
  key: string
  name: string
  color?: string
  path?: string
  sessions: number
  turns: number
  artifacts: number
  minutes: number
  lastActive: number
}

export function InsightsPage({ onToast }: InsightsPageProps) {
  const { data, loading, isDesktop } = useChronicle()
  const [range, setRange] = useState<InsightRange>(14)

  const sessions = useMemo(() => {
    const minTime = Date.now() - range * 86_400_000
    return (data?.sessions ?? [])
      .filter((session) => (session.start || 0) >= minTime)
      .sort((a, b) => (b.start || 0) - (a.start || 0))
  }, [data, range])

  const totals = useMemo(() => {
    const days = new Set<string>()
    let turns = 0
    let artifacts = 0
    let minutes = 0
    for (const session of sessions) {
      if (session.start) days.add(dayKeyOf(session.start))
      turns += session.turns
      artifacts += (session.artifacts ?? []).length
      minutes += sessionDurationMinutes(session)
    }
    return { days: days.size, turns, artifacts, minutes }
  }, [sessions])

  const groups = useMemo(() => {
    function groupBy(getKey: (session: SessionRecord) => string): MetricGroup[] {
      const map = new Map<string, MetricGroup>()
      for (const session of sessions) {
        const key = getKey(session)
        const item = map.get(key) || {
          key,
          name: key,
          color: session.toolColor,
          path: session.projectPath,
          sessions: 0,
          turns: 0,
          artifacts: 0,
          minutes: 0,
          lastActive: 0,
        }
        item.sessions += 1
        item.turns += session.turns
        item.artifacts += (session.artifacts ?? []).length
        item.minutes += sessionDurationMinutes(session)
        item.lastActive = Math.max(item.lastActive, session.end || session.start || 0)
        map.set(key, item)
      }
      return [...map.values()].sort((a, b) => b.turns - a.turns || b.artifacts - a.artifacts)
    }

    return {
      tools: groupBy((session) => session.tool),
      projects: groupBy((session) => session.projectPath || session.project || '(未知位置)'),
    }
  }, [sessions])

  const daily = useMemo(() => {
    const map = new Map<string, { sessions: number; turns: number; artifacts: number }>()
    for (const session of sessions) {
      if (!session.start) continue
      const key = dayKeyOf(session.start)
      const item = map.get(key) || { sessions: 0, turns: 0, artifacts: 0 }
      item.sessions += 1
      item.turns += session.turns
      item.artifacts += (session.artifacts ?? []).length
      map.set(key, item)
    }

    const output: {
      day: string
      label: string
      sessions: number
      turns: number
      artifacts: number
    }[] = []
    for (let index = range - 1; index >= 0; index--) {
      const day = dayKeyOf(Date.now() - index * 86_400_000)
      const value = map.get(day)
      const date = new Date(day.replace(/-/g, '/'))
      output.push({
        day,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        sessions: value?.sessions ?? 0,
        turns: value?.turns ?? 0,
        artifacts: value?.artifacts ?? 0,
      })
    }
    return output
  }, [sessions, range])

  const busiestDay = [...daily].sort((a, b) => b.turns - a.turns)[0]
  const topProject = groups.projects[0]
  const topTool = groups.tools[0]
  const topToolColor = topTool?.color ?? 'var(--primary)'

  async function openFolder(path?: string) {
    if (!path || path === '(未知位置)') return
    const result = await window.desktopAPI?.openPath(path)
    if (result && !result.ok) {
      onToast({
        tone: 'warning',
        title: '无法打开项目目录',
        message: result.message ?? '目录可能已被移动或删除。',
      })
    }
  }

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>需要桌面版</strong>
          <span>分析基于本机真实会话日志计算，浏览器预览无法读取。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            {sessions.length
              ? `近 ${range} 天 · ${totals.days} 个活跃日 · ${totals.turns} 轮 · ${totals.artifacts} 个产出`
              : '选择周期查看真实工作投入'}
          </span>
          <strong>分析</strong>
        </div>
        <div className="heading-actions">
          <div className="segmented-control" aria-label="分析周期">
            {([7, 14, 30] as InsightRange[]).map((value) => (
              <button
                key={value}
                type="button"
                className={range === value ? 'segmented-active' : undefined}
                onClick={() => setRange(value)}
              >
                {value} 天
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !data && (
        <div className="page-loading">
          <span />
          正在读取本机 AI 会话日志…
        </div>
      )}

      {data && sessions.length === 0 && (
        <div className="empty-state">
          <strong>所选周期没有会话</strong>
          <span>切换到 30 天，或产生新会话后重新采集。</span>
        </div>
      )}

      {sessions.length > 0 && (
        <>
          <div className="insight-summary">
            <article>
              <span className="insight-icon insight-icon-green">
                <ToolDot color={topToolColor} name={topTool?.name ?? ''} />
              </span>
              <div>
                <small>主力软件</small>
                <strong>{topTool?.name ?? '—'}</strong>
              </div>
            </article>
            <article>
              <span className="insight-icon insight-icon-blue">
                <span className="tool-dot" style={{ ['--tool-color' as string]: 'var(--primary)' }} />
              </span>
              <div>
                <small>重点投入</small>
                <strong>{topProject?.name ?? '—'}</strong>
              </div>
            </article>
            <article>
              <span className="insight-icon insight-icon-amber">
                <span className="tool-dot" style={{ ['--tool-color' as string]: 'var(--amber)' }} />
              </span>
              <div>
                <small>最忙一天</small>
                <strong>{busiestDay ? formatDayLabel(busiestDay.day) : '—'}</strong>
              </div>
            </article>
            <article>
              <span className="insight-icon insight-icon-coral">
                <span className="tool-dot" style={{ ['--tool-color' as string]: 'var(--coral)' }} />
              </span>
              <div>
                <small>总工作跨度</small>
                <strong>{formatDuration(totals.minutes) || '—'}</strong>
              </div>
            </article>
          </div>

          <div className="insights-grid-real">
            <section className="chart-panel">
              <div className="section-title-row">
                <span className="eyebrow">每日节奏</span>
                <span className="result-count">会话 / 轮次 / 产出</span>
              </div>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={daily} margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                    <XAxis dataKey="label" fontSize={10} tickLine={false} />
                    <YAxis allowDecimals={false} fontSize={11} width={32} />
                    <Tooltip
                      formatter={(value, _name, entry) => {
                        const payload = (entry as { payload?: { turns?: number; artifacts?: number } })?.payload
                        return [
                          `${value} 个会话 · ${payload?.turns ?? 0} 轮 · 产出 ${payload?.artifacts ?? 0}`,
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
                <span className="eyebrow">软件投入</span>
                <span className="result-count">按轮次排序</span>
              </div>
              <div className="contribution-list">
                {groups.tools.map((tool) => {
                  const percent = totals.turns ? Math.round((tool.turns / totals.turns) * 100) : 0
                  return (
                    <div className="contribution-row" key={tool.key}>
                      <div className="contribution-name">
                        <ToolDot color={tool.color ?? 'var(--primary)'} name={tool.name} />
                        <span>{tool.name}</span>
                      </div>
                      <div className="contribution-value">
                        <span>{tool.sessions} 会话</span>
                        <strong>{percent}%</strong>
                      </div>
                      <div className="contribution-track">
                        <span style={{ width: `${Math.max(2, percent)}%`, background: tool.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="chart-panel">
              <div className="section-title-row">
                <span className="eyebrow">重点项目</span>
                <span className="result-count">可打开目录继续工作</span>
              </div>
              <div className="collection-list">
                {groups.projects.slice(0, 12).map((project, index) => (
                  <div className="collection-row" key={project.key}>
                    <span className="collection-index">{index + 1}</span>
                    <div className="collection-copy">
                      <strong>{project.name}</strong>
                      <small>
                        {project.sessions} 会话 · {project.turns} 轮 · {project.artifacts} 产出 ·{' '}
                        {formatDuration(project.minutes)}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => void openFolder(project.path)}
                      title="打开项目目录"
                      aria-label={`打开项目目录：${project.name}`}
                    >
                      <FolderOpen size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
